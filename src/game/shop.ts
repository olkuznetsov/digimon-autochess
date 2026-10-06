import type { Unit } from "./types";
import { FORMS, PLAYABLE_IDS } from "./creatures";
import { SHOP_ODDS } from "./tuning";
import { XP_TO_NEXT, MAX_LEVEL } from "./xpView";
import type { PvpState } from "./storeTypes";

/** The shop and the run's economy: offers, discovery, XP, interest, streaks. */

export const SHOP_SIZE = 5;

/**
 * Five offers for the shop: a tier — the stage, Fresh 1 … Mega 5 — by the player's
 * level, then a form of that tier. Fresh, In-Training and Rookies are always on offer;
 * a Champion or Mega only once raised this game (`discovered`). In a VS lobby the
 * shared pool weighs the draw — every copy left is a ticket, and a form that has run
 * out can't show up (a tier with nothing on offer is skipped).
 */
export function rollShop(level: number, discovered: string[], pool?: Record<string, number>): string[] {
  const odds = SHOP_ODDS[Math.max(1, Math.min(MAX_LEVEL, level))];
  const left = (id: string) => (pool ? (pool[id] ?? 0) : 1);
  const open = new Set(discovered);
  const inTier = (tier: number) =>
    PLAYABLE_IDS.filter((id) => FORMS[id].stage === tier && (tier <= 3 || open.has(id)) && left(id) > 0);
  const weights = odds.map((w, t) => (inTier(t + 1).length > 0 ? w : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  return Array.from({ length: SHOP_SIZE }, () => {
    if (total === 0) return "";
    let r = Math.random() * total;
    let tier = 1;
    for (let t = 0; t < weights.length; t++) {
      r -= weights[t];
      if (r < 0) {
        tier = t + 1;
        break;
      }
    }
    const cands = inTier(tier);
    let x = Math.random() * cands.reduce((a, id) => a + left(id), 0);
    for (const id of cands) {
      x -= left(id);
      if (x < 0) return id;
    }
    return cands[cands.length - 1];
  });
}

/** Champions and Megas the player now has join the discovered list: from now on they
 *  can show up in the shop (Fresh, In-Training and Rookies always can). */
export function discover(discovered: string[], units: Unit[]): string[] {
  const add = [...new Set(units.map((u) => u.formId))].filter((id) => FORMS[id].stage >= 4 && !discovered.includes(id));
  return add.length ? [...discovered, ...add] : discovered;
}

/** discover() plus the toast for whatever is new (spread into a store update). */
export function discovery(prev: string[], units: Unit[]) {
  const next = discover(prev, units);
  return next === prev ? {} : { discovered: next, discoveryFlash: { ids: next.slice(prev.length), key: Date.now() } };
}

/** The shared pool shops roll from — only during a VS match. */
export const shopPool = (s: { pvp: PvpState | null }) => (s.pvp?.snap.stage === "match" ? s.pvp.snap.pool : undefined);

export function gainXp(level: number, xp: number, amount: number): { level: number; xp: number } {
  let L = level;
  let X = xp + amount;
  while (L < MAX_LEVEL && X >= (XP_TO_NEXT[L] ?? Infinity)) {
    X -= XP_TO_NEXT[L];
    L++;
  }
  if (L >= MAX_LEVEL) X = 0;
  return { level: L, xp: X };
}

export const interest = (gold: number, cap = 5) => Math.min(Math.floor(gold / 10), cap);
export const streakBonus = (streak: number) => {
  const a = Math.abs(streak);
  return a >= 4 ? 3 : a >= 3 ? 2 : a >= 2 ? 1 : 0;
};
