import { create } from "zustand";
import { useGame } from "../game/store";
import { useProfile } from "../profile/store";
import { api, session, useAccount } from "./account";
import { playerName } from "./leaderboard";
import { lobbyConnect, randomCode } from "./lobby";

/**
 * Friends (M11.5): a signed-in tamer checks in with the worker every half a minute while the
 * game is open — where they are (the menu, a solo run's round, a VS lobby, a match) — and
 * gets back their tamer code, their friends with what each is up to, and invites to a VS
 * room. Guests have no friends list: it needs the account to know who's who.
 */
export interface Friend {
  code: string;
  name: string;
  partner: string | null;
  /** "menu", "solo:12", "lobby:ABCD", "vs", "ghost" */
  status: string;
  seen: number;
  online: boolean;
}
export interface Invite {
  id: number;
  from: { code: string; name: string; partner: string | null };
  room: string;
  at: number;
}

interface SocialState {
  /** this tamer's code (null until the first check-in) */
  code: string | null;
  friends: Friend[];
  invites: Invite[];
  /** invites already answered here (the server forgets them on the next check-in) */
  dismissed: number[];
  error: string | null;
}
export const useSocial = create<SocialState>(() => ({ code: null, friends: [], invites: [], dismissed: [], error: null }));

/** What this tamer is doing, as friends see it. */
function statusNow(): string {
  if (useProfile.getState().screen === "menu") return "menu";
  const g = useGame.getState();
  if (g.pvp) return g.pvp.snap.stage === "lobby" ? `lobby:${g.pvp.code}` : "vs";
  if (g.ghost) return "ghost";
  return `solo:${g.round}`;
}

let inFlight = false;
/** Check in now: where we are; back come the code, friends and invites. */
export async function beat(): Promise<void> {
  if (!session() || inFlight) return;
  inFlight = true;
  try {
    const res = await api("/social/beat", {
      method: "POST",
      body: JSON.stringify({ name: playerName(), partner: useProfile.getState().partner?.formId ?? null, status: statusNow() }),
    });
    if (!res.ok) return;
    const r = (await res.json()) as { code: string; friends: Friend[]; invites: Invite[] };
    const gone = useSocial.getState().dismissed;
    useSocial.setState({ code: r.code, friends: r.friends, invites: r.invites.filter((i) => !gone.includes(i.id)), error: null });
  } catch {
    /* offline: try again on the next beat */
  } finally {
    inFlight = false;
  }
}

/** Befriend a tamer by their code. Resolves to an error message, or null when it worked. */
export async function addFriend(code: string): Promise<string | null> {
  try {
    const res = await api("/social/friends", { method: "POST", body: JSON.stringify({ code: code.trim().toUpperCase() }) });
    const r = (await res.json()) as { ok: boolean; error?: string; friends?: Friend[] };
    if (!r.ok) return r.error ?? "Couldn't add them";
    useSocial.setState({ friends: r.friends ?? [] });
    return null;
  } catch {
    return "Offline — try again";
  }
}

export async function removeFriend(code: string): Promise<void> {
  try {
    const res = await api(`/social/friends/${encodeURIComponent(code)}`, { method: "DELETE" });
    const r = (await res.json()) as { friends: Friend[] };
    useSocial.setState({ friends: r.friends });
  } catch {
    /* offline */
  }
}

/** Into a VS room: from the menu or a solo run (which waits behind it), never out of a match. */
export function joinRoom(room: string): boolean {
  const g = useGame.getState();
  if (g.pvp && g.pvp.snap.stage !== "lobby") return false;
  if (g.pvp?.code === room) return true;
  useProfile.getState().setScreen("game");
  lobbyConnect(room, playerName());
  return true;
}

/** Invite a friend to VS: to the lobby we're in, or to a new one we open now. */
export async function inviteFriend(code: string): Promise<string | null> {
  const g = useGame.getState();
  if (g.pvp && g.pvp.snap.stage !== "lobby") return "Finish your match first";
  const room = g.pvp?.code ?? randomCode();
  if (!g.pvp) joinRoom(room);
  try {
    const res = await api("/social/invite", { method: "POST", body: JSON.stringify({ code, room }) });
    const r = (await res.json()) as { ok: boolean; error?: string };
    return r.ok ? null : (r.error ?? "Couldn't invite them");
  } catch {
    return "Offline — try again";
  }
}

/** An invite answered (joined) or waved away. */
export function dismissInvite(id: number) {
  useSocial.setState((s) => ({ dismissed: [...s.dismissed, id], invites: s.invites.filter((i) => i.id !== id) }));
  void api("/social/dismiss", { method: "POST", body: JSON.stringify({ id }) }).catch(() => {});
}

let started = false;
/** Check in every half a minute while the game is visible, and at once when we move about. */
export function startSocial() {
  if (started) return;
  started = true;
  const tick = () => {
    if (document.visibilityState === "visible") void beat();
  };
  tick();
  setInterval(tick, 30_000);
  document.addEventListener("visibilitychange", tick);
  let soon: ReturnType<typeof setTimeout> | null = null;
  const moved = () => {
    if (soon) clearTimeout(soon);
    soon = setTimeout(tick, 800);
  };
  useProfile.subscribe((s, prev) => {
    if (s.screen !== prev.screen || s.partner?.formId !== prev.partner?.formId) moved();
  });
  useGame.subscribe((s, prev) => {
    if (s.pvp?.code !== prev.pvp?.code || s.pvp?.snap.stage !== prev.pvp?.snap.stage || (!s.pvp && s.round !== prev.round)) moved();
  });
  // signing in (or out) mid-visit
  useAccount.subscribe((s, prev) => {
    if (s.status !== prev.status) {
      if (s.status === "signed") tick();
      else useSocial.setState({ code: null, friends: [], invites: [] });
    }
  });
}

/** "In a solo run · round 12" and the like. */
export function describeStatus(f: Friend): string {
  if (!f.online) return lastSeen(f.seen);
  if (f.status === "menu") return "Online · in the menu";
  if (f.status === "vs") return "In a VS match";
  if (f.status === "ghost") return "In a ghost battle";
  if (f.status.startsWith("solo:")) return `Solo run · round ${f.status.slice(5)}`;
  if (f.status.startsWith("lobby:")) return `In VS lobby ${f.status.slice(6)}`;
  return "Online";
}

function lastSeen(at: number): string {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 60) return `Seen ${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `Seen ${h} h ago`;
  return `Seen ${Math.round(h / 24)} days ago`;
}
