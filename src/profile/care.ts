import { create } from "zustand";

/**
 * Caring for the partner — the V-Pet half of the game. Three needs, kept per partner:
 * - fullness: drops through the day, meat fills it (meat is earned in battles);
 * - mood: drops slowly (faster when hungry); feeding, petting, training and winning lift it;
 * - bond: the long friendship (five hearts) — it grows from care, and only fades when the
 *   partner is left starving.
 * Nothing dies and nothing touches a fight; a happy partner (or a best friend) earns the
 * tamer more XP, which is cosmetic too. Needs are stored with the time they were settled
 * and decay lazily, so the profile only changes when the tamer does something; a partner
 * resting in the Digivice waits as it was left.
 */
export interface Care {
  /** 0–100 */
  fed: number;
  mood: number;
  bond: number;
  /** when these values were settled (ms) */
  at: number;
  /** the last pet that counted, the last that grew the bond, the last training */
  petAt?: number;
  petBondAt?: number;
  trainAt?: number;
}

export const CARE = {
  /** fullness lost per hour: a full partner is hungry the next day */
  fedPerHour: 4,
  moodPerHour: 3,
  /** extra mood lost per hour while hungry */
  hungryMoodPerHour: 3,
  hungryBelow: 25,
  /** bond lost per hour while starving (fullness 0) */
  starvingBondPerHour: 1 / 12,
  meatFill: 35,
  meatMood: 8,
  /** feeding a hungry partner grows the bond more */
  meatBondHungry: 3,
  meatBond: 1,
  fullAt: 95,
  petMood: 5,
  petGapMs: 6000,
  petBond: 1,
  petBondGapMs: 3 * 3600e3,
  trainFed: 15,
  trainMood: 12,
  trainBond: 2,
  /** partner XP from a training session */
  trainXp: 20,
  trainGapMs: 3600e3,
  trainMinFed: 20,
  winMood: 2,
  maxMeat: 20,
  startMeat: 5,
  /** mood at or above this is "happy" */
  happyAt: 90,
  /** XP bonus for a happy partner, and again for a best friend (bond 100) */
  bonus: 0.2,
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const newCare = (at = Date.now(), bond = 0): Care => ({ fed: 80, mood: 70, bond, at });

/** The needs as they are now: what time has done since they were settled. */
export function careNow(c: Care, now = Date.now()): Care {
  const h = Math.max(0, now - c.at) / 3600e3;
  const fed = clamp(c.fed - CARE.fedPerHour * h);
  // hunger sets in once fullness drops below the line; starving once it hits 0
  const hungryFor = Math.max(0, h - Math.max(0, (c.fed - CARE.hungryBelow) / CARE.fedPerHour));
  const starvingFor = Math.max(0, h - c.fed / CARE.fedPerHour);
  return {
    ...c,
    fed,
    mood: clamp(c.mood - CARE.moodPerHour * h - CARE.hungryMoodPerHour * hungryFor),
    bond: clamp(c.bond - CARE.starvingBondPerHour * starvingFor),
    at: now,
  };
}

export const hearts = (c: Care) => Math.floor(Math.round(c.bond) / 20);
export const isHungry = (c: Care) => c.fed < CARE.hungryBelow;

/** The XP bonus a partner gives right now: happy, best friends, or both. */
export function careBonus(c: Care | null | undefined): { happy: boolean; friends: boolean; mult: number } {
  if (!c) return { happy: false, friends: false, mult: 1 };
  const now = careNow(c);
  // whole points, as the meters show them (a minute's decay mustn't hide a full meter)
  const happy = Math.round(now.mood) >= CARE.happyAt;
  const friends = Math.round(now.bond) >= 100;
  return { happy, friends, mult: 1 + (happy ? CARE.bonus : 0) + (friends ? CARE.bonus : 0) };
}

/** What the partner says and does on the menu (feeding, training, petting, a refusal). */
export interface CareFx {
  kind: "feed" | "train" | "pet" | "full" | "hungry" | "tired" | "nomeat";
  key: number;
}
export const useCareFx = create<{ fx: CareFx | null }>(() => ({ fx: null }));
export const careFx = (kind: CareFx["kind"]) => useCareFx.setState({ fx: { kind, key: Date.now() } });
