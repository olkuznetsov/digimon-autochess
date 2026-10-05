import type { Fighter, Stage } from "./types";
import { FORMS, PLAYABLE_IDS, WILD_IDS } from "./creatures";
import { makeFighter } from "./battle";
import { COLS, ROWS } from "./board";

/**
 * Solo-run difficulty and economy knobs in one place. Tuned with the full-run bot
 * simulator (`npm run runsim`), which plays complete runs through the real store.
 */
/** Since the roster grew to 24 lines (Oct 2026) the copies of any one line turn up about
 *  half as often; more gold and 1-gold rerolls keep evolutions coming (600-run sims:
 *  each boss beaten by about half the runs, as before) and let fans dig for favourites. */
export const ECONOMY = {
  /** gold at the start of a run or match (12 since set 11: every new line thins the shop) */
  startGold: 12,
  baseIncome: 7,
  /** extra gold for winning a round */
  winGold: 1,
  /** free XP every round */
  passiveXp: 2,
  xpCost: 4,
  xpPerBuy: 4,
  /** a fresh shop */
  rerollCost: 1,
};

/** Shop odds by player level: the chance of each tier — the stage, Fresh 1 … Mega 5 —
 *  like TFT's level-based odds. Tiers 4 and 5 only ever offer what the player has
 *  raised this game (discovery); with nothing discovered there, the slot rolls again. */
export const SHOP_ODDS: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [65, 35, 0, 0, 0],
  3: [35, 45, 20, 0, 0],
  4: [15, 40, 45, 0, 0],
  5: [5, 30, 65, 0, 0],
  6: [0, 20, 70, 10, 0],
  7: [0, 15, 65, 19, 1],
  8: [0, 10, 58, 27, 5],
  9: [0, 5, 50, 33, 12],
  10: [0, 0, 40, 38, 22],
};

/** Each boss round's minions, pinned: drawn from the roster by index, they changed whenever
 *  a new set landed — and the boss round's difficulty with them (set 8 turned VS R10 from 62%
 *  to 49% on the same boards). These are the ones the curves were tuned on (Oct 2026). */
const MINIONS = {
  solo5: ["yokomon", "tsunomon"],
  solo10: ["armadillomon", "agumon"],
  solo15: ["infermon", "paildramon"],
  vs10: ["armadillomon", "agumon"],
  vs20: ["andromon", "belzemon"],
  vs30: ["ravemon", "magnagarurumon"],
  vs40: ["zudomon", "cresgarurumon", "diaboromon"],
  /** the final boss, Lucemon, between the roads he could take: Angemon and Devimon; at VS
   *  R40+ between the angels and demons they became */
  lucemon15: ["angemon", "devimon"],
  lucemon40: ["seraphimon", "ladydevimon", "myotismon"],
  /** Piedmon brings his own: Dark champions at R15, the other Dark Masters at VS R40+ */
  piedmon15: ["devimon", "bakemon"],
  darkMasters: ["puppetmon", "metalseadramon", "machinedramon"],
};

export const WAVES = {
  /** enemy HP +x per round (rounds 1..15), then +endlessRamp per round beyond 15 */
  hpRamp: 0.02,
  endlessRamp: 0.06,
  /** non-boss rounds: how many of each stage [Fresh, In-Training, Rookie, Champion, Mega]
   *  — mixes follow what a player can field on the economy, endless ramps into all-Mega
   *  waves */
  table: {
    1: [2, 0, 0, 0, 0],
    2: [1, 2, 0, 0, 0],
    3: [0, 3, 1, 0, 0],
    4: [0, 2, 2, 0, 0],
    6: [0, 1, 3, 0, 0],
    7: [0, 0, 4, 0, 0],
    8: [0, 1, 4, 0, 0],
    9: [0, 0, 4, 1, 0],
    11: [0, 0, 3, 2, 0],
    12: [0, 0, 2, 4, 0],
    13: [0, 0, 1, 3, 1],
    14: [0, 0, 1, 4, 1],
    16: [0, 0, 0, 5, 3],
    17: [0, 0, 0, 4, 4],
    18: [0, 0, 0, 3, 5],
    19: [0, 0, 0, 2, 6],
  } as Record<number, Mix>,
  endless: [0, 0, 0, 0, 7] as Mix,
  /** bosses of rounds 5, 10 and 15 (multipliers and the stage of the adds): a run meets
   *  one candidate per round, picked by its seed. Candidates are tuned to the same pass
   *  rate on the same 600 bot boards (`npm run runsim` prints "boss candidates"). */
  bosses: [
    [{ id: "skullsatamon", hp: 1.65, atk: 1.02, adds: 2, minions: MINIONS.solo5 }],
    [
      { id: "machinedramon", hp: 1.14, atk: 0.8, adds: 3, minions: MINIONS.solo10 },
      { id: "mitamamon", hp: 1.04, atk: 0.58, adds: 3, minions: MINIONS.solo10 },
      { id: "eater", hp: 0.9, atk: 0.53, adds: 3, minions: ["eaterbit"] },
    ],
    // (the Eater, an R10 candidate: it devours the weakest of your team — battle.ts)
  // the final boss of every run: Lucemon Falldown Mode, and when he falls, Satan Mode
    // (Diaboromon, Apollomon and Piedmon, R15's old candidates, wait in endless mode and VS)
    [
      {
        id: "lucemonfm",
        hp: 1.45,
        atk: 1.02,
        adds: 4,
        minions: MINIONS.lucemon15,
        phase2: { id: "lucemonsm", hp: 1.25, atk: 0.92 },
      },
    ],
  ] as Omit<BossSpec, "addCount">[][],
  /** endless mode: every 5th round the next of these, all with the same multipliers */
  // (endless round R brings entry R/5 mod the list: the Eater at 20, the Mother Eater at 25)
  endlessBosses: ["gankoomon", "zeed", "apollomon", "imperialdramon", "eater", "mothereater", "gracenovamon", "mitamamon", "alphamon", "machinedramon", "diaboromon", "piedmon"],
  endlessBoss: { hp: 4.2, atk: 1.6, adds: 5 } as { hp: number; atk: number; adds: Stage },
};

export const isBossRound = (round: number) => round % 5 === 0;

/** how many of each stage a wave fields: [Fresh, In-Training, Rookie, Champion, Mega] */
type Mix = [number, number, number, number, number];
/** `adds`: the stage of the minions flanking the boss; `minions`: which ones (pinned — else
 *  picked from the roster by the round, as endless bosses still are) */
type BossSpec = {
  id: string;
  hp: number;
  atk: number;
  adds: Stage;
  addCount: number;
  minions?: string[];
  /** a second phase that rises when the boss falls (its own multipliers) */
  phase2?: { id: string; hp: number; atk: number };
};

/** One of a boss round's candidates: the first for seed 0 (saves and rooms from before
 *  there was a choice), otherwise spread by the seed — per round, so a run's bosses vary
 *  independently. */
function pickBoss<T>(candidates: T[], seed: number, round: number): T {
  if (!seed || candidates.length === 1) return candidates[0];
  let h = (seed ^ Math.imul(round, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return candidates[((h ^ (h >>> 16)) >>> 0) % candidates.length];
}

const STAGES = [1, 2, 3, 4, 5] as const;
const byStage = (ids: string[]) => STAGES.map((stage) => ids.filter((id) => FORMS[id].stage === stage));
/** Bosses bring their minions from the roster — the data-eaters their own. */
const ROSTER = byStage(PLAYABLE_IDS);
const OWN_MINIONS: Record<string, string[]> = { eater: ["eaterbit"], mothereater: ["eaterbit", "eaterlegion"] };
/** An endless boss: the shared multipliers — the Mother Eater's own (her brood guards her). */
function endlessBoss(id: string): BossSpec {
  const own = id === "mothereater" ? { hp: 2.4, atk: 1.25 } : null;
  return { id, ...WAVES.endlessBoss, ...own, addCount: 3 };
}

/** the bosses with a mechanic of their own (battle.ts), and when it first comes round */
const MECHANICS: Record<string, { mech: "devour" | "brood"; first: number }> = {
  eater: { mech: "devour", first: 3 },
  mothereater: { mech: "brood", first: 2 },
};
/** Waves draw from the roster plus the wild Digimon — twice, so they turn up often
 *  (a wild pack can bring two of a kind). */
const WAVE_POOL = ROSTER.map((roster, i) => [...roster, ...byStage(WILD_IDS)[i], ...byStage(WILD_IDS)[i]]);
/** the stride between a wave's picks: coprime with the pool, so a wave doesn't repeat
 *  the same few forms */
const WAVE_STEP = WAVE_POOL.map((pool) => [5, 7, 11, 13].find((k) => pool.length % k !== 0) ?? 1);

/** Deterministic wave from a round number: the same round always fields the same
 *  forms in the same cells (both VS clients rely on this). `prefix` keeps uids apart. */
function buildWave(round: number, hpScale: number, boss: BossSpec | null, mix: Mix, prefix = "e"): Fighter[] {
  const pick = (stage: Stage, i: number) => {
    const pool = WAVE_POOL[stage - 1];
    return pool[(round * 3 + i * WAVE_STEP[stage - 1]) % pool.length];
  };
  const minion = (stage: Stage, i: number) => ROSTER[stage - 1][(round * 3 + i * 5) % ROSTER[stage - 1].length];
  const at = (i: number) => ({ col: i % COLS, row: ROWS - 1 - Math.floor(i / COLS) });

  if (boss) {
    // the boss stands mid-board on the enemy's second row
    const b = makeFighter(boss.id, prefix === "e" ? "boss" : `${prefix}boss`, "enemy", Math.floor(COLS / 2), ROWS / 2 + 1, hpScale);
    // one huge focused threat instead of a wall: big HP, harder hits, boss flag
    b.hp = Math.round(b.hp * boss.hp);
    b.maxHp = b.hp;
    b.attack = Math.round(b.attack * boss.atk);
    b.boss = true;
    const mech = MECHANICS[boss.id];
    if (mech) {
      b.mech = mech.mech;
      b.mechT = mech.first;
      b.mechN = 0;
      b.mechScale = hpScale * 0.9;
    }
    if (boss.phase2) {
      const p2 = makeFighter(boss.phase2.id, "phase2", "enemy", 0, 0, hpScale);
      b.rebirth = { formId: boss.phase2.id, maxHp: Math.round(p2.hp * boss.phase2.hp), attack: Math.round(p2.attack * boss.phase2.atk) };
    }
    const adds = Array.from({ length: boss.addCount }, (_, i) => {
      const p = at(i * 2 + 1); // flank the boss
      const own = boss.minions?.length ? boss.minions : OWN_MINIONS[boss.id];
      const id = own?.length ? own[i % own.length] : minion(boss.adds, i);
      return makeFighter(id, `${prefix}${i}`, "enemy", p.col, p.row, hpScale * 0.9);
    });
    return [b, ...adds];
  }

  // megas first (front-left), then champions, rookies and the babies
  const stages = [...STAGES].reverse().flatMap((stage) => Array<Stage>(mix[stage - 1]).fill(stage));
  return stages.map((stage, i) => {
    const p = at(i);
    return makeFighter(pick(stage, i), `${prefix}${i}`, "enemy", p.col, p.row, hpScale);
  });
}

/** A solo run's difficulty, chosen when it starts: how strong the enemies are, what a lost
 *  round costs the tamer, and the tamer XP the run pays (an easy run stays off the
 *  leaderboard). */
export type Difficulty = "easy" | "normal" | "hard";
export const DIFFICULTY: Record<Difficulty, { hp: number; atk: number; damage: number; xp: number }> = {
  easy: { hp: 0.8, atk: 0.85, damage: 0.75, xp: 0.75 },
  normal: { hp: 1, atk: 1, damage: 1, xp: 1 },
  hard: { hp: 1.15, atk: 1.08, damage: 1.25, xp: 1.5 },
};
export const isDifficulty = (d: unknown): d is Difficulty => d === "easy" || d === "normal" || d === "hard";

/** A solo round's enemies at a difficulty. `seed` is the run's: it picks the bosses (0 = the
 *  classic ones); the difficulty only scales their health and attack (a boss's second phase
 *  too), never who comes. */
export function makeEnemyWave(round: number, seed = 0, difficulty: Difficulty = "normal"): Fighter[] {
  const wave = baseWave(round, seed);
  const d = DIFFICULTY[difficulty];
  if (d.hp === 1 && d.atk === 1) return wave;
  for (const f of wave) {
    f.maxHp = Math.round(f.maxHp * d.hp);
    f.hp = f.maxHp;
    f.attack = Math.round(f.attack * d.atk);
    if (f.rebirth) f.rebirth = { ...f.rebirth, maxHp: Math.round(f.rebirth.maxHp * d.hp), attack: Math.round(f.rebirth.attack * d.atk) };
  }
  return wave;
}

function baseWave(round: number, seed: number): Fighter[] {
  const hpScale = 1 + (round - 1) * WAVES.hpRamp + (round > 15 ? (round - 15) * WAVES.endlessRamp : 0);
  if (isBossRound(round)) {
    const boss =
      round <= 15
        ? { ...pickBoss(WAVES.bosses[round / 5 - 1], seed, round), addCount: 2 }
        : endlessBoss(WAVES.endlessBosses[(round / 5) % WAVES.endlessBosses.length]);
    return buildWave(round, hpScale, boss, [0, 0, 0, 0, 0]);
  }
  return buildWave(round, hpScale, null, WAVES.table[round] ?? WAVES.endless);
}

// ---------- VS (1v1): Teamfight Tactics' round rhythm ----------
// Stages of 5 rounds: fights against other players, an item draft (the carousel)
// on the 3rd round of every stage, wild Digimon on the 5th and a boss on every
// 10th; the first two rounds are easy wild fights so everyone starts with loot.

export type VsRound = "pvp" | "pve" | "boss";

export const VS = {
  stageLength: 5,
  /** damage for losing a round, by stage (then +8 per stage), plus 1 per surviving enemy */
  stageDamage: [2, 5, 9, 14, 20, 28],
  /** planning time before an automatic ready */
  planSeconds: 40,
  planSecondsTouch: 50,
  /** wild-Digimon rounds: [Fresh, In-Training, Rookie, Champion, Mega]; later stages repeat the last.
   *  Tuned on 600 bot runs' boards (`npm run runsim -- maxRound=45 dumpBoards=…`): a typical board
   *  wins ~86–93% — loot rounds, but a weak board can trip. */
  wild: {
    1: [2, 0, 0, 0, 0],
    2: [1, 2, 0, 0, 0],
    5: [0, 1, 2, 0, 0],
    15: [0, 0, 1, 5, 0],
    25: [0, 0, 0, 3, 4],
    35: [0, 0, 0, 0, 9],
    45: [0, 0, 0, 0, 14],
  } as Record<number, Mix>,
  /** bosses of rounds 10, 20, 30, 40+ — a real check: a typical board beats them ~69% /
   *  38% / 50% / 69% of the time (600 bot boards on the tier rules, the 7 × 4 board,
   *  starred Megas, the element synergies, 38 lines and the anime's finals, Oct 2026). A match meets one candidate per
   *  round, picked by the room's variant; candidates match. */
  bosses: [
    [{ id: "skullsatamon", hp: 2.3, atk: 1.26, adds: 3, addCount: 2, minions: MINIONS.vs10 }],
    [
      { id: "machinedramon", hp: 3.6, atk: 1.7, adds: 5, addCount: 2, minions: MINIONS.vs20 },
      { id: "mitamamon", hp: 3.55, atk: 1.42, adds: 5, addCount: 2, minions: MINIONS.vs20 },
    ],
    [
      { id: "zeed", hp: 6.2, atk: 2.25, adds: 5, addCount: 2, minions: MINIONS.vs30 },
      { id: "apollomon", hp: 6.3, atk: 2.5, adds: 5, addCount: 2, minions: MINIONS.vs30 },
    ],
    [
      { id: "gracenovamon", hp: 9.5, atk: 3.0, adds: 5, addCount: 3, minions: MINIONS.vs40 },
      { id: "piedmon", hp: 10.0, atk: 3.2, adds: 5, addCount: 3, minions: MINIONS.darkMasters },
      {
        id: "lucemonfm",
        hp: 5.5,
        atk: 2.6,
        adds: 5,
        addCount: 3,
        minions: MINIONS.lucemon40,
        phase2: { id: "lucemonsm", hp: 4.5, atk: 2.3 },
      },
    ],
  ] as BossSpec[][],
};

export function vsRoundKind(round: number): VsRound {
  if (round <= 2) return "pve";
  if (round % (VS.stageLength * 2) === 0) return "boss";
  if (round % VS.stageLength === 0) return "pve";
  return "pvp";
}

/** The 3rd round of every stage opens with the carousel (an item draft, lowest HP first). */
export const isCarouselRound = (round: number) => round % VS.stageLength === 3;

export function vsStageDamage(round: number): number {
  const stage = Math.ceil(round / VS.stageLength);
  const t = VS.stageDamage;
  return stage <= t.length ? t[stage - 1] : t[t.length - 1] + (stage - t.length) * 8;
}

/** The wild / boss wave of a VS PvE round — identical on every client. `variant` is the
 *  room's per-match number: it picks the bosses (0 = the classic ones). */
export function makeVsWave(round: number, prefix = "W", variant = 0): Fighter[] {
  const hpScale = round <= 2 ? 0.75 + round * 0.05 : 1 + (round - 1) * WAVES.hpRamp;
  if (vsRoundKind(round) === "boss") {
    const tier = Math.min(VS.bosses.length - 1, round / (VS.stageLength * 2) - 1);
    return buildWave(round, hpScale, pickBoss(VS.bosses[tier], variant, round), [0, 0, 0, 0, 0], prefix);
  }
  const keys = Object.keys(VS.wild).map(Number).sort((a, b) => a - b);
  const key = [...keys].reverse().find((k) => k <= round) ?? keys[0];
  return buildWave(round, hpScale, null, VS.wild[key], prefix);
}
