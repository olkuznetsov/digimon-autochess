import { useEffect, useState } from "react";
import { useGame } from "../game/store";

const KEY = "dac-onboarded";

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

/** First-run coach marks: buy → place on the board → start the battle. */
export function Onboarding() {
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const pvp = useGame((s) => s.pvp);
  const owned = useGame((s) => s.units.length);
  const onBoard = useGame((s) => s.units.filter((u) => u.placement.kind === "board").length);
  const [done, setDone] = useState(seen);

  // the first battle (or any run past round 1) means the basics are known
  useEffect(() => {
    if (!done && (phase === "battle" || round > 1)) {
      markSeen();
      setDone(true);
    }
  }, [done, phase, round]);

  if (done || pvp || phase !== "prep" || round !== 1) return null;
  const step = owned === 0 ? 1 : onBoard === 0 ? 2 : 3;
  const text =
    step === 1
      ? "Buy a Digimon from the shop — tap a card"
      : step === 2
        ? "Drag it from your bench onto the blue half of the board"
        : "Ready? Start the battle — your team fights on its own";

  return (
    <div className={`coach step${step}`}>
      <span className="coach-step">{step}/3</span>
      <span className="coach-text">{text}</span>
      <button
        className="coach-skip"
        onClick={() => {
          markSeen();
          setDone(true);
        }}
      >
        Skip
      </button>
    </div>
  );
}
