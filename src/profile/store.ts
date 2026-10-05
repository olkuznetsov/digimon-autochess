import { create } from "zustand";
import { FORMS } from "../game/creatures";
import {
  CRESTS,
  MAX_PARTNERS,
  bondGain,
  bondLevel,
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
        out.others = Array.isArray(p.others) ? p.others : [];
        out.avatar = typeof p.avatar === "string" && FORMS[p.avatar] ? p.avatar : null;
        // a partner from before bonds grew with the tamer: its bond is the tamer's XP
        if (out.partner && out.partner.xp === undefined) out.partner = { ...out.partner, xp: out.xp };
        return out;
      }
    }
  } catch {
    /* a private window or a broken save: start fresh */
  }
  return newProfile();
}

const hatch = (formId: string, xp: number): Partner => ({ formId, star: 1, since: Date.now(), history: [formId], xp, runs: 0, best: 0, bosses: 0 });

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
  setAvatar: (formId: string | null) => void;
  /** the partner at the tamer's side: its own records */
  recordPartner: (fn: (p: Partner) => void) => void;
  /** the next forms on offer, if the tamer's level lets the partner grow */
  evolutionOptions: () => string[];
  evolvePartner: (formId: string) => void;
  starUpPartner: () => void;
  /** `quiet`: no toast (the run report shows it) */
  gainXp: (amount: number, reason: string, quiet?: boolean) => void;
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
      set({ partner: next, others: [...(partner ? [partner] : []), ...others.filter((_, j) => j !== i)] });
    },
    setAvatar: (formId) => set({ avatar: formId && FORMS[formId] ? formId : null }),
    recordPartner: (fn) => {
      const { partner } = get();
      if (!partner) return;
      const next = { ...partner };
      fn(next);
      set({ partner: next });
    },
    evolutionOptions: () => {
      const { partner, stats } = get();
      if (!partner) return [];
      const stage = FORMS[partner.formId]?.stage ?? 1;
      if (stage >= partnerStageCap(bondLevel(partner))) return [];
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
      if (!partner || (FORMS[partner.formId]?.stage ?? 1) < 5 || partner.star >= partnerStarCap(bondLevel(partner))) return;
      const star = partner.star + 1;
      set({ partner: { ...partner, star }, grew: { from: partner.formId, to: partner.formId, star, key: Date.now() } });
    },
    gainXp: (amount, reason, quiet = false) => {
      if (amount <= 0) return;
      const { partner } = get();
      const before = levelFor(get().xp).level;
      const xp = get().xp + amount;
      const after = levelFor(xp).level;
      set({
        xp,
        // the partner at the tamer's side grows with them
        partner: partner ? { ...partner, xp: (partner.xp ?? 0) + bondGain(partner, get().xp, amount) } : null,
        ...(quiet ? {} : { gain: { amount, reason, levelUp: after > before ? after : null, key: Date.now() } }),
      });
      checkCrests();
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

// saved whenever the profile itself changes (not the screen or the toasts)
let saved = "";
useProfile.subscribe((s) => {
  const p: Profile = { v: 1, xp: s.xp, partner: s.partner, others: s.others, avatar: s.avatar, stats: s.stats, crests: s.crests };
  const json = JSON.stringify(p);
  if (json === saved) return;
  saved = json;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* storage full or blocked: the profile lives for this visit */
  }
});
