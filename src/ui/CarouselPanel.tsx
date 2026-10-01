import { useEffect, useState } from "react";
import { useGame, pvpMe, pvpName } from "../game/store";
import { carouselEnd, carouselPick, carouselTurn, CAROUSEL_STEP_MS } from "../game/lobby";
import { ITEMS } from "../game/items";

/** VS carousel (3rd round of every stage): one shared item offer, lowest HP picks
 *  first, released in pairs. Sits over the board while it runs — the board stays
 *  playable underneath. */
export function CarouselPanel() {
  const pvp = useGame((s) => s.pvp);
  const phase = useGame((s) => s.phase);
  const round = useGame((s) => s.round);
  const pick = useGame((s) => s.pvpPick);
  const c = pvp?.snap.carousel;
  const live = !!c && c.round === round && phase === "prep" && !c.done;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [live]);

  if (!pvp || !c || !live) return null;
  const me = pvpMe(pvp);
  const mine = carouselPick(c, pvp.seat);
  const turnAt = carouselTurn(c, pvp.seat);
  const myTurn = !!me?.alive && !mine && now >= turnAt;
  // the group released most recently (it picks now; earlier groups may still pick too)
  const picking =
    c.groups.find((_, g) => c.opensAt + g * CAROUSEL_STEP_MS <= now && c.opensAt + (g + 1) * CAROUSEL_STEP_MS > now) ?? [];

  const status = !c.opensAt
    ? "Waiting for every tamer to finish their fight…"
    : mine
      ? `You took ${ITEMS[mine]?.emoji} ${ITEMS[mine]?.name}`
      : !me?.alive
        ? "The tamers still standing pick, lowest HP first"
        : myTurn
          ? "Your turn — take one!"
          : `Your turn in ${Math.max(1, Math.ceil((turnAt - now) / 1000))} s`;

  return (
    <div className={`carousel${myTurn ? " my-turn" : ""}`}>
      <div className="carousel-head">
        <span className="carousel-title">🎠 Carousel</span>
        <span className="carousel-status">{status}</span>
        {c.opensAt > 0 && (
          <span className="carousel-clock">⏱ {Math.max(0, Math.ceil((carouselEnd(c) - now) / 1000))}</span>
        )}
      </div>
      <div className="carousel-items">
        {c.items.map((id, i) => {
          const def = ITEMS[id];
          const by = c.taken[i];
          return (
            <button
              key={i}
              className={`carousel-item${def?.from ? " fused" : ""}${by !== undefined ? " taken" : ""}`}
              disabled={!myTurn || by !== undefined}
              title={def ? `${def.name} — ${def.desc}` : id}
              onClick={() => pick(i)}
            >
              <span className="ci-emoji">{def?.emoji}</span>
              <span className="ci-name">{def?.name}</span>
              <span className="ci-desc">{by !== undefined ? `→ ${pvpName(pvp, by)}` : def?.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="carousel-order">
        {c.groups.map((g, gi) => (
          <span key={gi} className={`co-group${g.some((s) => picking.includes(s)) ? " now" : ""}`}>
            {g.map((s) => (
              <span key={s} className={`co-seat${s === pvp.seat ? " me" : ""}${carouselPick(c, s) ? " done" : ""}`}>
                {pvpName(pvp, s)}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
