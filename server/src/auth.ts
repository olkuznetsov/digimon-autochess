/**
 * Google sign-in for the game's accounts, with nothing but WebCrypto: the ID token Google
 * Identity Services hands the browser is an RS256 JWT, checked against Google's published
 * keys; the session the worker answers with is its own HMAC-signed token. No cookie: the
 * site (pages.dev / the workers.dev mirror) and this worker are different sites, so the
 * browser sends it as a Bearer header.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Jwk = JsonWebKey & { kid?: string };
/** where the signing keys come from (Google's, or a test's) */
export type KeySource = () => Promise<{ keys: Jwk[]; maxAge: number }>;

export const googleCerts: KeySource = async () => {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error(`google certs ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  return { keys: ((await res.json()) as { keys: Jwk[] }).keys, maxAge };
};

// the keys rotate every few days; an isolate keeps them for as long as Google says
let cache: { source: KeySource; keys: Map<string, CryptoKey>; until: number } | null = null;

async function keyFor(kid: string, source: KeySource): Promise<CryptoKey | undefined> {
  if (!cache || cache.source !== source || Date.now() > cache.until || !cache.keys.has(kid)) {
    const { keys, maxAge } = await source();
    const map = new Map<string, CryptoKey>();
    for (const k of keys) {
      if (!k.kid) continue;
      map.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    }
    cache = { source, keys: map, until: Date.now() + Math.min(maxAge, 86400) * 1000 };
  }
  return cache.keys.get(kid);
}

export interface GoogleUser {
  sub: string;
  /** the given name, offered as the tamer's name */
  name: string;
}

/** Google's subject and first name, or null for anything that isn't a fresh token minted
 *  by Google for this app. */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  source: KeySource = googleCerts,
  now = Date.now(),
): Promise<GoogleUser | null> {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(dec.decode(b64urlToBytes(parts[0])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const key = await keyFor(header.kid, source);
    if (!key) return null;
    const signed = enc.encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed))) return null;
    const c = JSON.parse(dec.decode(b64urlToBytes(parts[1])));
    if (c.aud !== clientId) return null;
    if (c.iss !== "accounts.google.com" && c.iss !== "https://accounts.google.com") return null;
    if (typeof c.exp !== "number" || c.exp * 1000 < now - 60_000) return null;
    if (typeof c.sub !== "string" || !c.sub) return null;
    return { sub: c.sub, name: String(c.given_name || c.name || "") };
  } catch {
    return null;
  }
}

/** The account's id: a hash of Google's subject — Google's own id never leaves the worker. */
export async function accountIdFor(sub: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`google:${sub}`)));
  return [...h.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hmacKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** A session for an account: `body.signature`, valid for `days`. */
export async function issueSession(secret: string, id: string, days = 180, now = Date.now()): Promise<string> {
  const body = bytesToB64url(enc.encode(JSON.stringify({ id, exp: now + days * 86_400_000 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body)));
  return `${body}.${bytesToB64url(sig)}`;
}

/** The account a session token belongs to, or null (forged, garbled or expired). */
export async function readSession(secret: string, token: string | null, now = Date.now()): Promise<string | null> {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig || !secret) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), b64urlToBytes(sig), enc.encode(body)))) return null;
    const p = JSON.parse(dec.decode(b64urlToBytes(body)));
    return typeof p.id === "string" && typeof p.exp === "number" && p.exp > now ? p.id : null;
  } catch {
    return null;
  }
}
