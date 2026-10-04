import type { Attribute, Element } from "../game/types";

/**
 * The anime UI kit (after Digimon Adventure): stroke icons instead of emoji, emblems for
 * the crests and the elements, and the Japanese the menus wear.
 */

/** 24×24 stroke paths (the play triangle is filled). */
export const ICON = {
  home: "M3.5 11.5L12 4l8.5 7.5 M6 10v9.5h12V10 M10 19.5v-5h4v5",
  trophy: "M7 4h10v4.5a5 5 0 0 1-10 0z M7 6.5H4.5a3 3 0 0 0 3 3.5 M17 6.5h2.5a3 3 0 0 1-3 3.5 M12 13.5V17 M8.5 20h7",
  book: "M12 6.5c-2-1.6-4.8-2.2-8.5-2v13c3.7-.2 6.5.4 8.5 2 2-1.6 4.8-2.2 8.5-2v-13c-3.7-.2-6.5.4-8.5 2z M12 6.5v13",
  sliders:
    "M3.5 7h8.3 M16.2 7h4.3 M3.5 17h2.3 M10.2 17h10.3 M14 4.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z M8 14.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z",
  swords: "M4 4l10.5 10.5 M20 4L9.5 14.5 M6.5 15.5l-2.5 2.5 2 2 2.5-2.5 M17.5 15.5l2.5 2.5-2 2-2.5-2.5",
  play: "M8 5.5v13l10.5-6.5z",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z",
  pencil: "M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4",
  digivice:
    "M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5z M8 7h8v6H8z M9 16.5h.01 M12 16.5h.01 M15 16.5h.01",
  sparkle: "M12 1.5c.9 6.1 4.4 9.6 10.5 10.5-6.1.9-9.6 4.4-10.5 10.5-.9-6.1-4.4-9.6-10.5-10.5 6.1-.9 9.6-4.4 10.5-10.5z",
} as const;

/** The crests' emblems: drawn in their spirit, not copies of the show's symbols. */
export const CREST_ICON: Record<string, string> = {
  courage:
    "M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 1 0 0-8.8z M12 1.8v3 M12 19.2v3 M1.8 12h3 M19.2 12h3 M4.8 4.8l2.1 2.1 M17.1 17.1l2.1 2.1 M4.8 19.2l2.1-2.1 M17.1 6.9l2.1-2.1",
  friendship: "M14.2 12a5.2 5.2 0 1 1-10.4 0 5.2 5.2 0 1 1 10.4 0z M20.2 12a5.2 5.2 0 1 1-10.4 0 5.2 5.2 0 1 1 10.4 0z",
  love: "M12 20.5s-7.6-4.6-7.6-10.1A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.7c0 5.5-7.6 10.1-7.6 10.1z",
  sincerity: "M12 3.2c3.2 4.3 5.9 7.7 5.9 10.8a5.9 5.9 0 0 1-11.8 0c0-3.1 2.7-6.5 5.9-10.8z",
  knowledge: "M12 6.5c-2-1.6-4.8-2.2-8.5-2v13c3.7-.2 6.5.4 8.5 2 2-1.6 4.8-2.2 8.5-2v-13c-3.7-.2-6.5.4-8.5 2z M12 6.5v13",
  reliability: "M12 3l7 2.6v5.6c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V5.6z M8.7 12.2l2.3 2.3 4.3-4.5",
  hope: "M19 4c-7.5.6-12 5.8-13 15l1.4-.2c6.9-1.2 11.5-6.2 11.6-14.8z M6 19l8.5-8.5",
  light: ICON.sparkle,
  kindness: "M12 21v-8 M12 13c0-4.4-3-7-7-7 0 4.4 3 7 7 7z M12 11c0-3.6 2.4-6 6-6 0 3.6-2.4 6-6 6z",
};

export const ELEMENT_PATH: Record<Element, string> = {
  Fire: "M12 21.5c-3.9 0-6.6-2.7-6.6-6.3 0-3.6 2.6-5.6 3.8-8.7 1 2 2 2.8 3.1 3.1-.2-2.8 1-5.2 3-6.8.2 4.1 3.4 6.4 3.4 11 0 4.3-2.7 7.7-6.7 7.7z",
  Water: "M3 9c2.2 0 2.2-2 4.5-2s2.3 2 4.5 2 2.3-2 4.5-2 2.3 2 4.5 2 M3 15c2.2 0 2.2-2 4.5-2s2.3 2 4.5 2 2.3-2 4.5-2 2.3 2 4.5 2",
  Plant: "M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z M5 19l7.5-7.5",
  Electric: "M13.5 2.5L5.5 13.5h6l-1 8 8-11h-6z",
  Earth: "M2.5 19.5l6.5-11 4 6.5 2.5-3.5 6 8z",
  Wind: "M3 8.5h10.5a3 3 0 1 0-3-3 M3 12.5h15a3 3 0 1 1-3 3 M3 16.5h6",
  Light: ICON.sparkle,
  Dark: "M15.5 3.2a8.8 8.8 0 1 0 5.3 13.9A7.2 7.2 0 0 1 15.5 3.2z",
  Neutral: "M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z",
};

export const ATTR_PATH: Record<Attribute, string> = {
  Vaccine: "M12 3l7 2.6v5.6c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V5.6z M12 8.5v7 M8.5 12h7",
  Data: "M5 5h14v14H5z M5 12h14 M12 5v14",
  Virus:
    "M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10z M12 2.5V7 M12 17v4.5 M2.5 12H7 M17 12h4.5 M5.3 5.3l3.2 3.2 M15.5 15.5l3.2 3.2 M5.3 18.7l3.2-3.2 M15.5 8.5l3.2-3.2",
  Free: "M12 3l9 9-9 9-9-9z",
};

/** The stages as the Japanese show names them. */
export const STAGE_JP = ["", "幼年期I", "幼年期II", "成長期", "成熟期", "究極体"] as const;

export function Icon({
  d,
  size = 22,
  width = 2.2,
  fill,
  className = "",
}: {
  d: string;
  size?: number;
  width?: number;
  fill?: string;
  className?: string;
}) {
  return (
    <svg className={`ki ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill={fill ?? "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One of Devimon's Black Gears: the mark of a boss. */
export function BlackGear({ size = 22, hole = "#3a1530", className = "" }: { size?: number; hole?: string; className?: string }) {
  return (
    <svg className={`black-gear ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill="none" stroke="#07070d" strokeWidth="9" strokeDasharray="6.2 7.15" />
      <circle cx="24" cy="24" r="14" fill="#07070d" />
      <circle cx="24" cy="24" r="6" fill={hole} />
    </svg>
  );
}

/** "A", "A or B", "A, B or C" */
export function orList(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
