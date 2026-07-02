/**
 * Headless balance simulator. Runs thousands of auto-battles on the pure game
 * logic (no renderer) and reports:
 *   1. role-vs-role win matrix (synthetic, attribute-neutral)
 *   2. attribute triangle magnitude
 *   3. stage value (3 rookies vs 1 champion, 2 vs 1)
 *   4. per-form win rates from random scrims (with synergies)
 *   5. battle pacing (how long fights last)
 *
 * Run: npm run balance
 */
import type { Attribute, Fighter, Form, Role, Unit } from "../src/game/types";
import { FORMS, ALL_FORM_IDS, statsFor } from "../src/game/creatures";
import { applySynergies } from "../src/game/synergies";
import { makeFighter, stepCombat } from "../src/game/battle";

const DT = 0.05;
const MAX_TICKS = 2400; // 120s cap → draw

// ---------- seeded rng (reproducible runs) ----------
let seed = 20260628;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 2 ** 32);
const shuffled = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = <T,>(arr: T[], n: number): T[] => shuffled(arr).slice(0, n);

// ---------- battle harness ----------
function place(formIds: string[], team: "player" | "enemy"): { fighters: Fighter[]; units: Unit[] } {
  const front = team === "player" ? 2 : 3;
  const back = team === "player" ? 1 : 4;
  const frontCols = shuffled([0, 1, 2, 3, 4, 5]);
  const backCols = shuffled([0, 1, 2, 3, 4, 5]);
  let fi = 0;
  let bi = 0;
  const fighters: Fighter[] = [];
  const units: Unit[] = [];
  formIds.forEach((id, i) => {
    const melee = statsFor(FORMS[id]).range <= 1;
    const row = melee ? front : back;
    const col = melee ? frontCols[fi++] : backCols[bi++];
    fighters.push(makeFighter(id, `${team}${i}`, team, col, row));
    units.push({ uid: `${team}${i}`, formId: id, placement: { kind: "board", col, row } });
  });
  return { fighters, units };
}

function fight(fighters: Fighter[]): { result: "a" | "b" | "draw"; ticks: number } {
  for (let t = 1; t <= MAX_TICKS; t++) {
    stepCombat(fighters, DT);
    const pa = fighters.some((f) => f.team === "player" && f.hp > 0);
    const pb = fighters.some((f) => f.team === "enemy" && f.hp > 0);
    if (!pa || !pb) return { result: pa ? "a" : pb ? "b" : "draw", ticks: t };
  }
  return { result: "draw", ticks: MAX_TICKS };
}

function runForms(a: string[], b: string[], synergies: boolean): { result: "a" | "b" | "draw"; ticks: number } {
  const A = place(a, "player");
  const B = place(b, "enemy");
  if (synergies) {
    applySynergies(A.fighters, A.units);
    applySynergies(B.fighters, B.units);
  }
  return fight([...A.fighters, ...B.fighters]);
}

function syntheticTeam(role: Role, stage: 1 | 2 | 3, attribute: Attribute, team: "player" | "enemy", n = 4): Fighter[] {
  const front = team === "player" ? 2 : 3;
  const back = team === "player" ? 1 : 4;
  const s = statsFor({ role, stage } as Form);
  return sample([0, 1, 2, 3, 4, 5], n).map((col, i) => ({
    uid: `${team}s${i}`,
    formId: `syn-${role}`,
    team,
    attribute,
    hp: s.hp,
    maxHp: s.hp,
    attack: s.attack,
    attackSpeed: s.attackSpeed,
    range: s.range,
    col,
    row: s.range <= 1 ? front : back,
    cooldown: 0,
    moving: false,
    targetUid: null,
  }));
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

// ---------- 1. role matrix ----------
const ROLES: Role[] = ["tank", "bruiser", "assassin", "ranged", "caster"];
const ROLE_RUNS = 100;
console.log("\n=== 1. ROLE vs ROLE (row's win rate, stage 2, attribute-neutral, 4v4) ===");
console.log("".padEnd(10) + ROLES.map((r) => r.padStart(9)).join(""));
const roleAvg: Record<string, number> = {};
for (const a of ROLES) {
  const cells: string[] = [];
  let sum = 0;
  for (const b of ROLES) {
    let score = 0;
    for (let i = 0; i < ROLE_RUNS; i++) {
      // alternate sides to cancel any first-mover bias
      const flip = i % 2 === 1;
      const fighters = flip
        ? [...syntheticTeam(b, 2, "Data", "player"), ...syntheticTeam(a, 2, "Data", "enemy")]
        : [...syntheticTeam(a, 2, "Data", "player"), ...syntheticTeam(b, 2, "Data", "enemy")];
      const r = fight(fighters).result;
      if (r === "draw") score += 0.5;
      else if ((r === "a") !== flip) score += 1;
    }
    const wr = score / ROLE_RUNS;
    sum += wr;
    cells.push(pct(wr).padStart(9));
  }
  roleAvg[a] = sum / ROLES.length;
  console.log(a.padEnd(10) + cells.join(""));
}
console.log("overall:  " + ROLES.map((r) => pct(roleAvg[r]).padStart(9)).join(""));

// ---------- 2. attribute triangle ----------
console.log("\n=== 2. ATTRIBUTE TRIANGLE (bruiser mirror, counter-side win rate) ===");
const TRI: [Attribute, Attribute][] = [
  ["Vaccine", "Virus"],
  ["Virus", "Data"],
  ["Data", "Vaccine"],
];
for (const [atkr, dfdr] of TRI) {
  let score = 0;
  for (let i = 0; i < ROLE_RUNS; i++) {
    const flip = i % 2 === 1;
    const fighters = flip
      ? [...syntheticTeam("bruiser", 2, dfdr, "player"), ...syntheticTeam("bruiser", 2, atkr, "enemy")]
      : [...syntheticTeam("bruiser", 2, atkr, "player"), ...syntheticTeam("bruiser", 2, dfdr, "enemy")];
    const r = fight(fighters).result;
    if (r === "draw") score += 0.5;
    else if ((r === "a") !== flip) score += 1;
  }
  console.log(`${atkr} vs ${dfdr}: ${pct(score / ROLE_RUNS)}`);
}

// ---------- 3. stage value ----------
console.log("\n=== 3. STAGE VALUE (rookies vs their own champion, no synergies) ===");
const rookies = ALL_FORM_IDS.filter((id) => FORMS[id].stage === 1);
let w3 = 0;
let w2 = 0;
for (const r of rookies) {
  const champ = FORMS[r].evolvesTo![0];
  let s3 = 0;
  let s2 = 0;
  for (let i = 0; i < 30; i++) {
    const a = runForms([r, r, r], [champ], false).result;
    s3 += a === "a" ? 1 : a === "draw" ? 0.5 : 0;
    const b = runForms([r, r], [champ], false).result;
    s2 += b === "a" ? 1 : b === "draw" ? 0.5 : 0;
  }
  w3 += s3 / 30;
  w2 += s2 / 30;
}
console.log(`3x rookie beats 1x champion: ${pct(w3 / rookies.length)} (want: >50%, rookies favored)`);
console.log(`2x rookie beats 1x champion: ${pct(w2 / rookies.length)} (want: <50%, champion favored)`);

// ---------- 4. per-form scrims ----------
console.log("\n=== 4. FORM WIN RATES (random 4v4 scrims with synergies) ===");
const SCRIMS = 2500;
for (const stage of [1, 2, 3] as const) {
  const pool = ALL_FORM_IDS.filter((id) => FORMS[id].stage === stage);
  const games = new Map<string, number>();
  const wins = new Map<string, number>();
  let totalTicks = 0;
  let draws = 0;
  for (let i = 0; i < SCRIMS; i++) {
    const a = sample(pool, 4);
    const rest = pool.filter((x) => !a.includes(x));
    const b = sample(rest.length >= 4 ? rest : pool, 4);
    const { result, ticks } = runForms(a, b, true);
    totalTicks += ticks;
    if (result === "draw") draws++;
    for (const id of a) {
      games.set(id, (games.get(id) ?? 0) + 1);
      wins.set(id, (wins.get(id) ?? 0) + (result === "a" ? 1 : result === "draw" ? 0.5 : 0));
    }
    for (const id of b) {
      games.set(id, (games.get(id) ?? 0) + 1);
      wins.set(id, (wins.get(id) ?? 0) + (result === "b" ? 1 : result === "draw" ? 0.5 : 0));
    }
  }
  const rows = [...games.keys()]
    .map((id) => ({ id, wr: (wins.get(id) ?? 0) / (games.get(id) ?? 1), n: games.get(id) ?? 0 }))
    .sort((x, y) => y.wr - x.wr);
  const meanSec = ((totalTicks / SCRIMS) * DT).toFixed(1);
  console.log(`\n-- stage ${stage} (${pool.length} forms, ${SCRIMS} battles, mean ${meanSec}s, draws ${draws}) --`);
  const fmt = (r: { id: string; wr: number }) =>
    `${FORMS[r.id].name.padEnd(17)}${pct(r.wr)} (${FORMS[r.id].role}/${FORMS[r.id].attribute})`;
  console.log("top:    " + rows.slice(0, 4).map(fmt).join("  |  "));
  console.log("bottom: " + rows.slice(-4).map(fmt).join("  |  "));
  const outliers = rows.filter((r) => r.wr > 0.58 || r.wr < 0.42);
  console.log(outliers.length ? "⚠ outliers: " + outliers.map(fmt).join("  |  ") : "✓ all forms within 42–58%");
}

console.log("\ndone.");
