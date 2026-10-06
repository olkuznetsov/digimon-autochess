import { create } from "zustand";
import { WORKER_HTTP } from "../channel";
import { useGame, wireBoard, type PvpBoardUnit } from "../game/store";
import { useProfile } from "../profile/store";
import { partnerForm, playerId, playerName } from "./leaderboard";

/**
 * The ghost ladder (M11.6): the board of your solo run fights a ghost — another tamer's board
 * from the same round (or, until there are enough tamers, the bot's) — with no risk to the
 * run. Win and your ladder rating climbs (Elo against the ghost's); your board joins the
 * ghosts for others to meet. Keyed like the leaderboard: the device, or the account.
 */
const BASE = WORKER_HTTP;

export interface LadderMe {
  lp: number;
  wins: number;
  losses: number;
  peak: number;
}
export interface LadderTop extends LadderMe {
  /** the tamer's public handle (see leaderboard.ts myPublicKey) */
  key: string;
  name: string;
  partner: string | null;
}
interface Ghost {
  gid: number;
  name: string;
  partner: string | null;
  round: number;
  lp: number;
  board: PvpBoardUnit[];
}

/** The leagues, after the stages a Digimon grows through. */
export const LEAGUES = [
  { name: "IN-TRAINING", jp: "幼年期", from: 0, color: "#9aa8c0" },
  { name: "ROOKIE", jp: "成長期", from: 1050, color: "#4da6ff" },
  { name: "CHAMPION", jp: "成熟期", from: 1150, color: "#ff9b3d" },
  { name: "MEGA", jp: "究極体", from: 1300, color: "#ffd84d" },
] as const;
export function leagueOf(lp: number) {
  let i = 0;
  while (i + 1 < LEAGUES.length && lp >= LEAGUES[i + 1].from) i++;
  return { ...LEAGUES[i], index: i, next: LEAGUES[i + 1] ?? null };
}

interface LadderState {
  me: LadderMe | null;
  /** the ghost being fought now (its result goes to the ladder) */
  fight: { gid: number; name: string; lp: number; round: number; board: PvpBoardUnit[] } | null;
  /** the last ladder fight's outcome, for the result banner (`delta` null while it's rated;
   *  0 when the fight went unrated) */
  last: { delta: number | null; lp: number; win: boolean; key: number } | null;
  busy: boolean;
  error: string | null;
}
export const useLadder = create<LadderState>(() => ({ me: null, fight: null, last: null, busy: false, error: null }));

export async function loadLadderMe(): Promise<void> {
  try {
    const r = await fetch(`${BASE}/lb/ladder/me?id=${encodeURIComponent(playerId())}`);
    if (r.ok) useLadder.setState({ me: await r.json() });
  } catch {
    /* offline */
  }
}

export async function fetchLadderTop(): Promise<LadderTop[]> {
  const r = await fetch(`${BASE}/lb/ladder/top`);
  if (!r.ok) throw new Error("ladder unavailable");
  return r.json();
}

/** Can the run's board take on a ghost now? (a solo run, planning, Digimon on the board) */
export function ladderReady(): string | null {
  const s = useGame.getState();
  if (s.pvp) return "Not during VS";
  if (s.gameOver) return "Start a new run first";
  if (s.phase !== "prep" || s.pendingEvolution) return "Finish the round first";
  if (!s.units.some((u) => u.placement.kind === "board")) return "Put Digimon on your board first";
  return null;
}

/** Find a ghost for the run's round and fight it (on the board screen). */
export async function fightGhost(): Promise<void> {
  const why = ladderReady();
  if (why) return void useLadder.setState({ error: why });
  useLadder.setState({ busy: true, error: null });
  try {
    const round = useGame.getState().round;
    const r = await fetch(`${BASE}/lb/ladder/find`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: playerId(), round }),
    });
    if (!r.ok) throw new Error(r.status === 404 ? "No ghosts yet" : "The ladder is unavailable");
    const g = (await r.json()) as Ghost;
    const mine = wireBoard(useGame.getState().units);
    useLadder.setState({ fight: { gid: g.gid, name: g.name, lp: g.lp, round, board: mine }, busy: false });
    useProfile.getState().setScreen("game");
    useGame.getState().ghostFight(g.board, g.name, g.partner);
    // the fight didn't start (the board changed meanwhile): nothing to report
    if (useGame.getState().phase !== "battle") useLadder.setState({ fight: null });
  } catch (e) {
    useLadder.setState({ busy: false, error: (e as Error).message || "The ladder is unavailable" });
  }
}

let started = false;
/** Reports a ladder fight's outcome when its result shows. */
export function startLadder() {
  if (started) return;
  started = true;
  void loadLadderMe();
  useGame.subscribe((s, prev) => {
    const fight = useLadder.getState().fight;
    if (!fight || !s.ghost) return;
    if (prev.phase === "battle" && s.phase === "result") {
      const win = s.result === "win";
      const key = Date.now();
      useLadder.setState({ fight: null, last: { delta: null, lp: useLadder.getState().me?.lp ?? 1000, win, key } });
      // the dev server shares the live ladder: test fights stay unrated (unless a local worker
      // answers, or localStorage "dac-dev-submit" asks for it)
      if (import.meta.env.DEV && BASE.startsWith("https:") && !localStorage.getItem("dac-dev-submit")) {
        useLadder.setState({ last: { delta: 0, lp: useLadder.getState().me?.lp ?? 1000, win, key } });
        return;
      }
      void (async () => {
        try {
          const r = await fetch(`${BASE}/lb/ladder/result`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            // the worker plays the fight itself: no word of who won is sent, only the boards
            body: JSON.stringify({ id: playerId(), name: playerName(), partner: partnerForm(), gid: fight.gid, round: fight.round, board: fight.board }),
          });
          if (!r.ok) throw new Error("unrated");
          const out = (await r.json()) as LadderMe & { delta: number; win: boolean };
          useLadder.setState({ me: { lp: out.lp, wins: out.wins, losses: out.losses, peak: out.peak }, last: { delta: out.delta, lp: out.lp, win: out.win, key } });
        } catch {
          // offline (or too fast): this one goes unrated
          useLadder.setState({ last: { delta: 0, lp: useLadder.getState().me?.lp ?? 1000, win, key } });
        }
      })();
    }
  });
}
