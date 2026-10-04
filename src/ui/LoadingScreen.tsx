import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { preloadRemainingModels } from "../three/models";

const TIPS = [
  "Three copies of a Digimon digivolve into its next form.",
  "A Digimon's price is its stage: ⛂1 Fresh, ⛂2 In-Training, ⛂3 Rookie, ⛂4 Champion, ⛂5 Mega.",
  "Raise a Champion or Mega once, and the shop starts offering it.",
  "Botamon → Koromon → Agumon, Guilmon or Dracomon: know who digivolves into whom.",
  "At some digivolutions you choose the branch — it changes your synergies.",
  "Vaccine beats Virus, Virus beats Data, Data beats Vaccine.",
  "Every 5th round a boss appears — beat it for a guaranteed item.",
  "Click any Digimon to inspect its stats, ultimate and items.",
  "Play a friend: ⚔ VS, share the 4-letter room code.",
];

/** First-visit splash: real model-loading progress (the babies a run starts with), then
 *  fades out and starts the on-demand background preload (see models.ts). */
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
      <div className="loading-title">
        DIGIMON <span>AUTO CHESS</span>
      </div>
      <div className="loading-bar">
        <span className="loading-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="loading-status">
        {ready ? "Entering the Digital World…" : `Loading Digimon… ${pct}%${total ? ` (${loaded}/${total})` : ""}`}
      </div>
      <div className="loading-tip">💡 {tip}</div>
    </div>
  );
}
