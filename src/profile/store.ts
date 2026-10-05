import { create } from "zustand";
import { FORMS } from "../game/creatures";
import { CARE, careBonus, careFx, careNow, newCare, type Care } from "./care";
import {
  CRESTS,
  MAX_PARTNERS,
  partnerLevel,
  levelFor,
  newProfile,
  offerBranches,
  partnerStageCap,
  partnerStarCap,
  type Partner,
  type Profile,
  type TamerStats,
} from "./profile";

const KEY = "dac-profile-v1";

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p?.v === 1) {
        const out: Profile = { ...newProfile(), ...p, stats: { ...newProfile().stats, ...p.stats } };
        // a partner is just its forms and its bond (a save from 05.10 also held an avatar and
        // per-partner records: dropped)
        // a partner from before care began: fairly fed and glad, two hearts of friendship already
        const clean = (x: Partner): Partner => ({
          formId: x.formId,
          star: x.star,
          since: x.since,
          history: x.history,
          xp: x.xp,
          care: x.care ?? newCare(Date.now(), 40),
        });
        out.others = Array.isArray(p.others) ? p.others.filter((x) => FORMS[x?.formId]).map(clean) : [];
        // a partner from before partners had their own XP: theirs is the tamer's
        if (out.partner) out.partner = clean({ ...out.partner, xp: out.partner.xp ?? out.xp });
        out.meat = Number.isFinite(p.meat) ? Math.max(0, Math.min(CARE.maxMeat, p.meat)) : CARE.startMeat;
        delete (out as Partial<Profile> & { avatar?: unknown }).avatar;
        return out;
      }
    }
  } catch {
    /* a private window or a broken save: start fresh */
  }
  return newProfile();
}

const hatch = (formId: string, xp: number): Partner => ({ formId, star: 1, since: Date.now(), history: [formId], xp, care: newCare() });

/** a partner's needs as they are now (a resting partner's clock starts again when it's called) */
const careOf = (p: Partner, now = Date.now()): Care => careNow(p.care ?? newCare(now, 40), now);
const bump = (c: Care, d: Partial<Record<"fed" | "mood" | "bond", number>>): Care => ({
  ...c,
  fed: Math.max(0, Math.min(100, c.fed + (d.fed ?? 0))),
  mood: Math.max(0, Math.min(100, c.mood + (d.mood ?? 0))),
  bond: Math.max(0, Math.min(100, c.bond + (d.bond ?? 0))),
});

export type Screen = "menu" | "game";

interface ProfileState extends Profile {
  /** the main menu or the board (not saved: a visit starts at the menu, an invite link in the game) */
  screen: Screen;
  /** the last XP gain, for the toast */
  gain: { amount: number; reason: string; levelUp: number | null; key: number } | null;
  /** a crest just earned, for the toast */
  newCrest: string | null;
  /** the partner's last digivolution (or star), for the ceremony */
  grew: { from: string; to: string; star: number; key: number } | null;
  /** a panel to open once the board shows (the menu's VS button opens the lobby) */
  openOnGame: "vs" | null;
  setScreen: (s: Screen) => void;
  /** the first partner (its bond starts at the tamer's XP) */
  choosePartner: (formId: string) => void;
  /** another egg: the new partner takes the tamer's side, the old one rests in the Digivice */
  hatchPartner: (formId: string) => void;
  /** call a resting partner (`others[i]`) to the tamer's side */
  switchPartner: (i: number) => void;
  /** the next forms on offer, if the tamer's level lets the partner grow */
  evolutionOptions: () => string[];
  evolvePartner: (formId: string) => void;
  starUpPartner: () => void;
  /** XP for the tamer and the partner at their side, with the partner's bonus (a happy
   *  partner, a best friend) unless `bonus` is false; `quiet`: no toast (the run report shows
   *  it). Returns what was given. */
  gainXp: (amount: number, reason: string, quiet?: boolean, bonus?: boolean) => number;
  /** feed the partner a piece of meat */
  feed: () => void;
  /** a tap on the partner */
  pet: () => void;
  /** a training session: an hour's rest after it */
  train: () => void;
  /** meat earned in a battle (capped) */
  earnMeat: (n: number) => void;
  /** a battle won with the partner at the tamer's side: it's glad */
  cheer: () => void;
  record: (fn: (s: TamerStats) => void) => void;
  clearToasts: () => void;
}

const hasJoinLink = () => {
  try {
    return new URLSearchParams(location.search).has("join");
  } catch {
    return false;
  }
};

export const useProfile = create<ProfileState>()((set, get) => {
  /** award crests whose condition now holds */
  const checkCrests = () => {
    const p = get();
    const fresh = CRESTS.filter((c) => !p.crests.includes(c.id) && c.earned(p)).map((c) => c.id);
    if (fresh.length) set({ crests: [...p.crests, ...fresh], newCrest: fresh[0] });
  };
  return {
    ...load(),
    screen: hasJoinLink() ? "game" : "menu",
    gain: null,
    newCrest: null,
    grew: null,
    openOnGame: null,
    setScreen: (screen) => set({ screen }),
    choosePartner: (formId) => {
      if (get().partner || !FORMS[formId]) return;
      set({ partner: hatch(formId, get().xp) });
    },
    hatchPartner: (formId) => {
      const { partner, others } = get();
      if (!partner) return get().choosePartner(formId);
      if (!FORMS[formId] || 1 + others.length >= MAX_PARTNERS) return;
      set({ partner: hatch(formId, 0), others: [partner, ...others] });
    },
    switchPartner: (i) => {
      const { partner, others } = get();
      const next = others[i];
      if (!next) return;
      const now = Date.now();
      // the one going to rest keeps its needs as they are now; the one called back picks up
      // where it was left (its clock didn't run in the Digivice)
      const resting = partner ? { ...partner, care: careOf(partner, now) } : null;
      const called = { ...next, care: { ...(next.care ?? newCare(now, 40)), at: now } };
      set({ partner: called, others: [...(resting ? [resting] : []), ...others.filter((_, j) => j !== i)] });
    },
    evolutionOptions: () => {
      const { partner, stats } = get();
      if (!partner) return [];
      const stage = FORMS[partner.formId]?.stage ?? 1;
      if (stage >= partnerStageCap(partnerLevel(partner))) return [];
      return offerBranches(partner.formId, stats);
    },
    evolvePartner: (to) => {
      const { partner } = get();
      if (!partner || !get().evolutionOptions().includes(to)) return;
      set({
        partner: { ...partner, formId: to, history: [...partner.history, to] },
        grew: { from: partner.formId, to, star: 1, key: Date.now() },
      });
      checkCrests();
    },
    starUpPartner: () => {
      const { partner } = get();
      if (!partner || (FORMS[partner.formId]?.stage ?? 1) < 5 || partner.star >= partnerStarCap(partnerLevel(partner))) return;
      const star = partner.star + 1;
      set({ partner: { ...partner, star }, grew: { from: partner.formId, to: partner.formId, star, key: Date.now() } });
    },
    gainXp: (base, reason, quiet = false, bonus = true) => {
      if (base <= 0) return 0;
      const { partner } = get();
      const b = bonus ? careBonus(partner?.care) : { mult: 1, happy: false, friends: false };
      // each bonus is its own share of the base (the run report lists them that way)
      const amount = base + (b.happy ? Math.round(base * CARE.bonus) : 0) + (b.friends ? Math.round(base * CARE.bonus) : 0);
      const before = levelFor(get().xp).level;
      const xp = get().xp + amount;
      const after = levelFor(xp).level;
      const why = b.mult > 1 ? `${reason} (${[b.happy && "happy partner", b.friends && "best friends"].filter(Boolean).join(", ")} +${Math.round((b.mult - 1) * 100)}%)` : reason;
      set({
        xp,
        // the partner at the tamer's side grows with them (every partner at the same pace)
        partner: partner ? { ...partner, xp: (partner.xp ?? 0) + amount } : null,
        ...(quiet ? {} : { gain: { amount, reason: why, levelUp: after > before ? after : null, key: Date.now() } }),
      });
      checkCrests();
      return amount;
    },
    feed: () => {
      const { partner, meat } = get();
      if (!partner) return;
      const c = careOf(partner);
      if (meat <= 0) return careFx("nomeat");
      if (c.fed >= CARE.fullAt) return careFx("full");
      const care = bump(c, { fed: CARE.meatFill, mood: CARE.meatMood, bond: c.fed < 50 ? CARE.meatBondHungry : CARE.meatBond });
      set({ partner: { ...partner, care }, meat: meat - 1 });
      careFx("feed");
    },
    pet: () => {
      const { partner } = get();
      if (!partner) return;
      const now = Date.now();
      const c = careOf(partner, now);
      // a run of taps counts as one pet; the bond grows from a pet every few hours
      if (now - (c.petAt ?? 0) < CARE.petGapMs) return careFx("pet");
      const bond = now - (c.petBondAt ?? 0) >= CARE.petBondGapMs;
      const care = { ...bump(c, { mood: CARE.petMood, bond: bond ? CARE.petBond : 0 }), petAt: now, ...(bond ? { petBondAt: now } : {}) };
      set({ partner: { ...partner, care } });
      careFx("pet");
    },
    train: () => {
      const { partner } = get();
      if (!partner) return;
      const now = Date.now();
      const c = careOf(partner, now);
      if (c.fed < CARE.trainMinFed) return careFx("hungry");
      if (now - (c.trainAt ?? 0) < CARE.trainGapMs) return careFx("tired");
      const care = { ...bump(c, { fed: -CARE.trainFed, mood: CARE.trainMood, bond: CARE.trainBond }), trainAt: now };
      set({ partner: { ...partner, care, xp: (partner.xp ?? 0) + CARE.trainXp } });
      careFx("train");
    },
    earnMeat: (n) => set({ meat: Math.min(CARE.maxMeat, get().meat + n) }),
    cheer: () => {
      const { partner } = get();
      if (partner) set({ partner: { ...partner, care: bump(careOf(partner), { mood: CARE.winMood }) } });
    },
    record: (fn) => {
      const stats = structuredClone(get().stats);
      fn(stats);
      set({ stats });
      checkCrests();
    },
    clearToasts: () => set({ gain: null, newCrest: null }),
  };
});

// saved whenever the profile itself changes (not the screen or the toasts) — and once at
// start, so a save in an older layout is stored (and synced) in the current one
let saved = "";
function persist(s: ProfileState) {
  const p: Profile = { v: 1, xp: s.xp, partner: s.partner, others: s.others, meat: s.meat, stats: s.stats, crests: s.crests };
  const json = JSON.stringify(p);
  if (json === saved) return;
  saved = json;
  try {
    if (localStorage.getItem(KEY) !== json) localStorage.setItem(KEY, json);
  } catch {
    /* storage full or blocked: the profile lives for this visit */
  }
}
useProfile.subscribe(persist);
persist(useProfile.getState());
