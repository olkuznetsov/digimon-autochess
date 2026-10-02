// XP needed to advance FROM a given level to the next. Single source of truth
// shared by the store (leveling logic) and the HUD (xp bar). Levels 1–10, like TFT:
// the level is also how many Digimon fit on the board, and it sets the shop odds.
export const XP_TO_NEXT: Record<number, number> = { 1: 2, 2: 2, 3: 6, 4: 10, 5: 18, 6: 30, 7: 44, 8: 60, 9: 76 };
export const MAX_LEVEL = 10;
