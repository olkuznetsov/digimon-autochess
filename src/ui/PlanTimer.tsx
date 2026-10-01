import { useEffect, useState } from "react";
import { useGame } from "../game/store";

/** VS planning countdown; at zero it settles open choices and readies the board. */
export function PlanTimer() {
  const endsAt = useGame((s) => (s.phase === "prep" && s.pvp && !s.pvp.myReady && s.pvp.oppOnline ? s.pvp.prepEndsAt : 0));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= endsAt) useGame.getState().pvpAutoReady();
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className={`plan-timer${left <= 10 ? " urgent" : ""}`}>⏱ {left}</span>;
}
