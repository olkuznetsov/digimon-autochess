import { create } from "zustand";
import { WORKER_HTTP } from "../channel";

/**
 * Google accounts — optional sign-in that keeps a tamer on every device. Google Identity
 * Services hands the browser an ID token; the worker checks it and answers with its own
 * session token, kept here and sent as a Bearer header (the site and the worker are
 * different sites: a cookie would be a third-party one). The account carries what the
 * game already keeps in localStorage — the profile, the run, the name — and syncs it:
 * on start the newer copy wins, then changes go up every few seconds. Signing in happens
 * on the title screen, before the game's stores read localStorage, so the right partner
 * and records are there from the first frame (signing in later, from the menu, reloads).
 */
export const GOOGLE_CLIENT_ID = "629270363914-ud33joi20b3f33iinhh4c9nan03hamig.apps.googleusercontent.com";

const BASE = WORKER_HTTP;
const SESSION_KEY = "dac-session";
/** the account version this device last matched */
const SYNC_KEY = "dac-sync-at";
/** the layout of what's synced: the worker refuses saves from a game older than the last
 *  one to save (2: partners in the Digivice joined the profile; 3: their care and the meat) */
const DATA_SCHEMA = 3;
/** what travels with the account (device preferences, like graphics quality, stay put) */
const SYNCED = ["dac-profile-v1", "dac-save-v3", "dac-run-v1", "dac-name", "dac-best-round", "dac-onboarded"];

type Data = Record<string, string>;
export interface Session {
  token: string;
  /** the account's public id (the leaderboard keys entries by it) */
  id: string;
  googleName: string;
}

export function session(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const syncedAt = () => Number(localStorage.getItem(SYNC_KEY) ?? 0) || 0;

function snapshot(): Data {
  const out: Data = {};
  for (const k of SYNCED) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

const xpIn = (d: Data | null) => {
  try {
    return Number(JSON.parse(d?.["dac-profile-v1"] ?? "null")?.xp ?? 0) || 0;
  } catch {
    return 0;
  }
};
const same = (a: Data, b: Data) => SYNCED.every((k) => (a[k] ?? null) === (b[k] ?? null));

export const useAccount = create<{ status: "guest" | "busy" | "signed"; name: string; error: string | null }>(() => {
  const s = session();
  return { status: s ? "signed" : "guest", name: s?.googleName ?? "", error: null };
});

/** A request to the worker as the signed-in tamer. */
export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const s = session();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(s ? { authorization: `Bearer ${s.token}` } : {}) },
  });
}

/** the game is running: its stores have read localStorage, so taking over needs a reload */
let appRunning = false;
/** the title screen already settled this device with the account */
let checked = false;

/** Take the account's copy over this device's (and restart if the game already read it). */
function adopt(data: Data | null, updatedAt: number) {
  localStorage.setItem(SYNC_KEY, String(updatedAt));
  if (!data || same(data, snapshot())) return;
  for (const k of SYNCED) {
    if (k in data) localStorage.setItem(k, data[k]);
    else localStorage.removeItem(k);
  }
  if (appRunning) location.reload();
}

let lastSent = "";
/** Send this device's data up if it changed (or `force`: overwrite whatever is there). */
async function upload(force = false, keepalive = false): Promise<void> {
  if (!session()) return;
  const data = snapshot();
  const text = JSON.stringify(data);
  if (!force && text === lastSent) return;
  const res = await api("/account/data", { method: "PUT", body: JSON.stringify({ data, base: syncedAt(), force, schema: DATA_SCHEMA }), keepalive });
  if (res.ok) {
    lastSent = text;
    localStorage.setItem(SYNC_KEY, String(((await res.json()) as { updatedAt: number }).updatedAt));
  } else if (res.status === 409) {
    // another device saved since this one last synced: its copy is the newer one
    const r = (await res.json()) as { data: Data | null; updatedAt: number };
    adopt(r.data, r.updatedAt);
  } else if (res.status === 401) {
    signOut();
  } else if (res.status === 426) {
    // a newer game saved this tamer: this tab is out of date
    useAccount.setState({ error: "A newer version of the game is out — reload to keep syncing" });
  }
}

let looping = false;
function startLoop() {
  if (looping) return;
  looping = true;
  setInterval(() => void upload().catch(() => {}), 15000);
  // a closing tab or a phone going to the background: send what's new right away
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void upload(false, true).catch(() => {});
  });
}

/** After Google's button: sign in, then settle this device and the account — the copy with
 *  the more experienced tamer wins (a new account simply takes this device's). */
export async function signInWithGoogle(credential: string): Promise<void> {
  useAccount.setState({ status: "busy", error: null });
  try {
    const res = await fetch(`${BASE}/account/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? "Google sign-in didn't go through" : `The server said ${res.status}`);
    const r = (await res.json()) as { token: string; id: string; googleName: string; data: Data | null; updatedAt: number };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: r.token, id: r.id, googleName: r.googleName }));
    // a tamer still under the default name takes their Google first name
    const name = localStorage.getItem("dac-name");
    if (!name || name === "Tamer") localStorage.setItem("dac-name", r.googleName);
    useAccount.setState({ status: "signed", name: r.googleName });
    startLoop();
    if (r.data && xpIn(r.data) >= xpIn(snapshot())) adopt(r.data, r.updatedAt);
    else {
      localStorage.setItem(SYNC_KEY, String(r.updatedAt));
      await upload(true);
    }
  } catch (e) {
    localStorage.removeItem(SESSION_KEY);
    useAccount.setState({ status: "guest", error: (e as Error).message || "Sign-in failed" });
  }
}

/** Signs this device out; what it has stays here. */
export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SYNC_KEY);
  lastSent = "";
  useAccount.setState({ status: "guest", name: "", error: null });
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {
    /* Google's script isn't loaded: nothing to forget */
  }
}

/** Erases the account on the server (the privacy page promises it), then signs out. */
export async function deleteAccount(): Promise<void> {
  try {
    await api("/account", { method: "DELETE" });
  } finally {
    signOut();
  }
}

/** The title screen, signed in already: take a copy another device saved since (before the
 *  game reads anything). False when the session is gone; offline counts as signed in. */
export async function prepareAccount(timeoutMs = 6000): Promise<boolean> {
  if (!session()) return false;
  checked = true;
  try {
    const res = await Promise.race([
      api("/account/me"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!res) return true; // slow or away: play on with what's here, sync later
    if (res.status === 401) {
      signOut();
      return false;
    }
    if (!res.ok) return true;
    const r = (await res.json()) as { googleName: string; data: Data | null; updatedAt: number };
    useAccount.setState({ status: "signed", name: r.googleName });
    if (r.updatedAt > syncedAt()) adopt(r.data, r.updatedAt);
    return true;
  } catch {
    return true;
  }
}

let started = false;
/** The game is starting: keep syncing (and, if the title screen didn't, take a newer copy). */
export function startAccountSync() {
  appRunning = true;
  if (started || !session()) return;
  started = true;
  startLoop();
  if (checked) return;
  void (async () => {
    try {
      const res = await api("/account/me");
      if (res.status === 401) return signOut();
      if (!res.ok) return; // the server's away: play on, sync later
      const r = (await res.json()) as { googleName: string; data: Data | null; updatedAt: number };
      useAccount.setState({ status: "signed", name: r.googleName });
      if (r.updatedAt > syncedAt()) adopt(r.data, r.updatedAt);
    } catch {
      /* offline: play on, sync later */
    }
  })();
}

/* Google Identity Services, loaded only where its button shows */
interface Gis {
  accounts: {
    id: {
      initialize(o: object): void;
      renderButton(el: HTMLElement, o: object): void;
      disableAutoSelect(): void;
    };
  };
}
declare global {
  interface Window {
    google?: Gis;
  }
}

let gis: Promise<Gis> | null = null;
export function loadGis(): Promise<Gis> {
  gis ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      const g = window.google;
      if (!g) return reject(new Error("Google sign-in didn't load"));
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r: { credential: string }) => void signInWithGoogle(r.credential),
        ux_mode: "popup",
        auto_select: false,
        itp_support: true,
      });
      resolve(g);
    };
    s.onerror = () => {
      gis = null;
      reject(new Error("Google sign-in didn't load"));
    };
    document.head.appendChild(s);
  });
  return gis;
}
