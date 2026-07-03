import type { Role } from "./types";

/** Display info for the role abilities implemented in battle.ts (castAbility).
 *  Keep the numbers in sync with the combat code. */
export const ROLE_ABILITIES: Record<Role, { name: string; icon: string; desc: string }> = {
  tank: { name: "Iron Guard", icon: "🛡️", desc: "Shields itself for 30% of its max HP" },
  bruiser: { name: "Power Strike", icon: "💥", desc: "A crushing blow for 250% attack damage" },
  assassin: { name: "Triple Slash", icon: "🗡️", desc: "Slashes its target 3× for 115% attack each" },
  ranged: { name: "Multishot", icon: "🎯", desc: "Hits the 3 nearest enemies for 130% attack" },
  caster: { name: "Data Burst", icon: "🌀", desc: "Damages all enemies around its target for 145% attack" },
};
