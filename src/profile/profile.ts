import { FORMS, isPlayable } from "../game/creatures";
import type { Element } from "../game/types";
import { CARE, type Care } from "./care";

/**
 * The tamer's profile: a level earned by playing, and a partner Digimon raised from a Fresh
 * baby (Digimon began as a V-Pet in 1997 — raising one is the brand's DNA). Cosmetic and
 * progression only: nothing here touches a fight, so it lives outside src/game (whose hash
 * is the VS rules version).
 */

/** The five Fresh a new tamer picks a partner from. */
export const PARTNER_STARTERS = ["botamon", "kuramon", "pabumon", "poyomon", "punimon"];
/** How many partners the Digivice holds (the one at the tamer's side and the rest). */
export const MAX_PARTNERS = 6;

/** Tamer XP from level L to L + 1: 100, 150, 200… (level 3 in a run or two, Mega at 20). */
export const xpToNext = (level: number) => 100 + 50 * (level - 1);

export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, need: xpToNext(level) };
}

/** Tamer levels where the partner may reach In-Training, Rookie, Champion and Mega. */
export const STAGE_LEVELS = [3, 6, 12, 20];
/** Tamer levels where a Mega partner stars up (★★, ★★★). */
export const STAR_LEVELS = [30, 40];

export const partnerStageCap = (level: number) => 1 + STAGE_LEVELS.filter((l) => level >= l).length;
export const partnerStarCap = (level: number) => 1 + STAR_LEVELS.filter((l) => level >= l).length;

/** The tamer level of the partner's next digivolution (or star), if any is left. */
export function nextGrowthLevel(stage: number, star: number): number | null {
  if (stage < 5) return STAGE_LEVELS[stage - 1];
  return STAR_LEVELS[star - 1] ?? null;
}

export interface TamerStats {
  /** solo runs started, won (round 15 beaten), the furthest round */
  runs: number;
  runsWon: number;
  bestRound: number;
  /** every battle: played, won, bosses beaten */
  battles: number;
  battlesWon: number;
  bosses: number;
  vsMatches: number;
  vsWins: number;
  ghostWins: number;
  /** how often each element / attribute / form stood on the board when a battle began */
  elements: Partial<Record<Element, number>>;
  attributes: Record<string, number>;
  fielded: Record<string, number>;
  /** every form the tamer has raised by merging */
  raised: string[];
}

export interface Partner {
  formId: string;
  star: number;
  /** when it hatched (ms) */
  since: number;
  /** the forms it has been, oldest first */
  history: string[];
  /** the XP it has earned at the tamer's side — its level gates its growth (a save from
   *  before the Digivice held more partners: the tamer's XP) */
  xp?: number;
  /** its needs: fullness, mood and the bond (./care.ts) */
  care?: Care;
}

/** A partner's own level, from its XP. */
export const partnerLevel = (p: Partner) => levelFor(p.xp ?? 0).level;

export interface Profile {
  v: 1;
  xp: number;
  /** the partner at the tamer's side */
  partner: Partner | null;
  /** the others, resting in the Digivice */
  others: Partner[];
  /** meat for the partner, earned in battles */
  meat: number;
  stats: TamerStats;
  /** crest ids earned */
  crests: string[];
}

export function newProfile(): Profile {
  return {
    v: 1,
    xp: 0,
    partner: null,
    others: [],
    meat: CARE.startMeat,
    stats: {
      runs: 0,
      runsWon: 0,
      bestRound: 0,
      battles: 0,
      battlesWon: 0,
      bosses: 0,
      vsMatches: 0,
      vsWins: 0,
      ghostWins: 0,
      elements: {},
      attributes: {},
      fielded: {},
      raised: [],
    },
    crests: [],
  };
}

/** The partner's next forms, ranked by how the tamer plays: the elements and attributes they
 *  field most. Up to three are offered (a V-Pet's care decided its path); the first is the one
 *  their style points to. */
export function offerBranches(formId: string, stats: TamerStats): string[] {
  const next = (FORMS[formId]?.evolvesTo ?? []).filter((id) => isPlayable(FORMS[id]));
  const total = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0) || 1;
  const el = stats.elements as Record<string, number>;
  const eTotal = total(el);
  const aTotal = total(stats.attributes);
  const score = (id: string) => (el[FORMS[id].element] ?? 0) / eTotal + 0.5 * ((stats.attributes[FORMS[id].attribute] ?? 0) / aTotal);
  return [...next].sort((a, b) => score(b) - score(a) || next.indexOf(a) - next.indexOf(b)).slice(0, 3);
}

/** The element the tamer fields most, if they've played. */
export function favoriteElement(stats: TamerStats): Element | null {
  const e = Object.entries(stats.elements).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  return e ? (e[0] as Element) : null;
}

/** The form the tamer fields most, if they've played. */
export function favoriteForm(stats: TamerStats): string | null {
  const f = Object.entries(stats.fielded).sort((a, b) => b[1] - a[1])[0];
  return f && FORMS[f[0]] ? f[0] : null;
}

/** Adventure's crests as achievements. */
export interface CrestDef {
  id: string;
  name: string;
  color: string;
  desc: string;
  earned: (p: Profile) => boolean;
}
/** the most grown of the tamer's partners */
const partnerStage = (p: Profile) => Math.max(0, ...[p.partner, ...p.others].map((x) => (x ? FORMS[x.formId]?.stage ?? 1 : 0)));
export const CRESTS: CrestDef[] = [
  { id: "courage", name: "Courage", color: "#ff9b3d", desc: "Win a solo run", earned: (p) => p.stats.runsWon >= 1 },
  { id: "friendship", name: "Friendship", color: "#4da6ff", desc: "Finish a VS match", earned: (p) => p.stats.vsMatches >= 1 },
  { id: "love", name: "Love", color: "#ff5c8a", desc: "Raise your partner to a Rookie", earned: (p) => partnerStage(p) >= 3 },
  { id: "sincerity", name: "Sincerity", color: "#6fdc5a", desc: "Play 10 solo runs", earned: (p) => p.stats.runs >= 10 },
  { id: "knowledge", name: "Knowledge", color: "#b07cff", desc: "Raise 50 different Digimon", earned: (p) => p.stats.raised.length >= 50 },
  { id: "reliability", name: "Reliability", color: "#9aa8c0", desc: "Beat 20 bosses", earned: (p) => p.stats.bosses >= 20 },
  { id: "hope", name: "Hope", color: "#ffd84d", desc: "Reach round 25", earned: (p) => p.stats.bestRound >= 25 },
  { id: "light", name: "Light", color: "#ffb3e6", desc: "Win a VS match", earned: (p) => p.stats.vsWins >= 1 },
  { id: "kindness", name: "Kindness", color: "#7fe9ff", desc: "Raise your partner to a Mega", earned: (p) => partnerStage(p) >= 5 },
];

/** Tamer XP for what happens in a game. */
export const XP = {
  battleWon: 10,
  battleLost: 5,
  boss: 25,
  runWon: 100,
  ghostWon: 3,
  /** VS: a base, and more for every player finished above */
  vsBase: 30,
  vsPerPlace: 15,
};
