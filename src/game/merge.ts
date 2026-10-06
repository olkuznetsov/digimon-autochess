import type { PendingEvolution, Unit } from "./types";
import { FORMS, isTerminal, mergeParts } from "./creatures";
import { MAX_ITEMS } from "./items";

/**
 * Resolve digivolutions after a unit changes. Auto-evolves any 3-of-a-kind whose
 * form has a single branch (looping), and stops at the first 3-of-a-kind that has
 * multiple branches — returning a PendingEvolution for the player to choose.
 * Items of the merged copies carry over: MAX_ITEMS on the evolved unit, the rest come
 * back in `spill` (for the item tray).
 */
export function resolveEvolutions(units: Unit[]): {
  units: Unit[];
  pending: PendingEvolution | null;
  evolved: { from: string; to: string; uid: string; star?: number }[];
  spill: string[];
} {
  let current = units;
  const evolved: { from: string; to: string; uid: string; star?: number }[] = [];
  const spill: string[] = [];
  // guard against pathological loops
  for (let guard = 0; guard < 64; guard++) {
    const groups = new Map<string, Unit[]>();
    for (const u of current) {
      const form = FORMS[u.formId];
      if (!form.evolvesTo || form.evolvesTo.length === 0) continue;
      const arr = groups.get(u.formId) ?? [];
      arr.push(u);
      groups.set(u.formId, arr);
    }

    let acted = false;
    for (const [formId, arr] of groups) {
      if (arr.length < 3) continue;
      const form = FORMS[formId];
      const onBoard = arr.find((u) => u.placement.kind === "board");
      const keep = onBoard ?? arr[0];
      const others = arr.filter((u) => u.uid !== keep.uid).slice(0, 2);

      if (form.evolvesTo!.length === 1) {
        const consumed = new Set(others.map((u) => u.uid));
        const items = [...(keep.items ?? []), ...others.flatMap((u) => u.items ?? [])];
        spill.push(...items.slice(MAX_ITEMS));
        const parts = mergeParts([keep, ...others]);
        current = current
          .filter((u) => !consumed.has(u.uid))
          .map((u) => (u.uid === keep.uid ? { ...u, formId: form.evolvesTo![0], items: items.slice(0, MAX_ITEMS), parts } : u));
        evolved.push({ from: formId, to: form.evolvesTo![0], uid: keep.uid });
        acted = true;
        break; // re-scan from the top
      }

      // multiple branches → ask the player
      return {
        units: current,
        pending: {
          fromFormId: formId,
          consume: [keep.uid, ...others.map((u) => u.uid)],
          options: form.evolvesTo!,
          placement: keep.placement,
        },
        evolved,
        spill,
      };
    }
    if (!acted) {
      // a Mega has nowhere to digivolve: three of the same star level star it up (★★, ★★★)
      const stars = new Map<string, Unit[]>();
      for (const u of current) {
        if (!isTerminal(u.formId) || (u.star ?? 1) >= 3) continue;
        const key = `${u.formId}|${u.star ?? 1}`;
        stars.set(key, [...(stars.get(key) ?? []), u]);
      }
      for (const arr of stars.values()) {
        if (arr.length < 3) continue;
        const keep = arr.find((u) => u.placement.kind === "board") ?? arr[0];
        const others = arr.filter((u) => u.uid !== keep.uid).slice(0, 2);
        const consumed = new Set(others.map((u) => u.uid));
        const items = [...(keep.items ?? []), ...others.flatMap((u) => u.items ?? [])];
        spill.push(...items.slice(MAX_ITEMS));
        const star = ((keep.star ?? 1) + 1) as 2 | 3;
        const parts = mergeParts([keep, ...others]);
        current = current
          .filter((u) => !consumed.has(u.uid))
          .map((u) => (u.uid === keep.uid ? { ...u, star, items: items.slice(0, MAX_ITEMS), parts } : u));
        evolved.push({ from: keep.formId, to: keep.formId, uid: keep.uid, star });
        acted = true;
        break;
      }
    }
    if (!acted) break;
  }
  return { units: current, pending: null, evolved, spill };
}
