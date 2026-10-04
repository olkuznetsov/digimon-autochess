import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { preloadRemainingModels } from "../three/models";
import { ICON, Icon } from "./kit";

const TIPS = [
  "Three copies of a Digimon digivolve into its next form.",
  "A Digimon's price is its stage: 1 Fresh, 2 In-Training, 3 Rookie, 4 Champion, 5 Mega.",
  "Raise a Champion or Mega once, and the shop starts offering it.",
  "Botamon → Koromon → Agumon, Guilmon or Dracomon: know who digivolves into whom.",
  "At some digivolutions you choose the branch — it changes your synergies.",
  "Vaccine beats Virus, Virus beats Data, Data beats Vaccine.",
  "Every 5th round a boss appears — beat it for a guaranteed item.",
  "Click any Digimon to inspect its stats, ultimate and items.",
  "Two Fire Digimon on the board give every Fire unit +12% attack.",
  "Play a friend: VS, then share the 4-letter room code.",
];

/** First-visit splash over the summer camp where it all began (snow in August, an aurora,
 *  lights falling): real model-loading progress (the babies a run starts with), then fades
 *  out and starts the on-demand background preload (see models.ts). */
export function LoadingScreen() {
  const { active, progress, loaded, total } = useProgress();
  const [phase, setPhase] = useState<"loading" | "fading" | "gone">("loading");
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

  const ready = total > 0 && !active && progress >= 100;

  useEffect(() => {
    if (phase !== "loading") return;
    // safety net: never trap the player behind the splash
    const bail = setTimeout(() => setPhase("fading"), 25000);
    if (ready) setPhase("fading");
    return () => clearTimeout(bail);
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== "fading") return;
    preloadRemainingModels();
    const t = setTimeout(() => setPhase("gone"), 600);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  const pct = Math.round(Math.min(100, progress));
  return (
    <div className={`loading-screen${phase === "fading" ? " fading" : ""}`}>
      <div className="game-logo ls-logo">
        <span className="jp">デジモン オートチェス</span>
        <b className="gl-top">DIGIMON</b>
        <b className="gl-main">AUTO CHESS</b>
      </div>
      <div className="ls-bottom">
        <div className="ls-row">
          <span className="ls-status">
            <Icon d={ICON.digivice} size={20} className="ls-digivice" />
            {ready ? "ENTERING THE DIGITAL WORLD…" : "OPENING THE DIGITAL WORLD…"}
            <span className="jp">データ読み込み中</span>
          </span>
          <b>
            {pct}%{total ? <small> {loaded}/{total}</small> : null}
          </b>
        </div>
        <div className="loading-bar">
          <span className="loading-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ls-tip">
          <span className="tip-tag">TIP · ヒント</span>
          {tip}
        </div>
      </div>
    </div>
  );
}
