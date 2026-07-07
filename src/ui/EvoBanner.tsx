import { useEffect } from "react";
import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR } from "../game/creatures";

/** The digivolution moment: a big announcement banner whenever a unit evolves. */
export function EvoBanner() {
  const flash = useGame((s) => s.evoFlash);
  const clear = useGame((s) => s.clearEvoFlash);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(clear, 2400);
    return () => clearTimeout(t);
  }, [flash, clear]);

  if (!flash) return null;
  const from = FORMS[flash.from];
  const to = FORMS[flash.to];
  if (!from || !to) return null;

  return (
    <div className="evo-banner" key={flash.key}>
      <div className="evo-banner-label">DIGIVOLVING</div>
      <div className="evo-banner-text">
        <span>{from.name}</span>
        <span className="evo-banner-arrow">▸</span>
        <span style={{ color: ATTR_COLOR[to.attribute] }}>{to.name}</span>
      </div>
    </div>
  );
}
