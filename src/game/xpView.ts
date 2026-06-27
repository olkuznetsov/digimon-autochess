// XP needed to advance FROM a given level to the next. Single source of truth
// shared by the store (leveling logic) and the HUD (xp bar).
export const XP_TO_NEXT: Record<number, number> = { 3: 6, 4: 10, 5: 18, 6: 30, 7: 48 };
export const MAX_LEVEL = 8;
