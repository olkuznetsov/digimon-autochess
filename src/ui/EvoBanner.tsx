import { useEffect } from "react";
import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import { Portrait } from "./Portrait";

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

  if (flash.star)
    return (
      <div className="evo-banner" key={flash.key}>
        <div className="evo-banner-label">STAR UP</div>
        <div className="evo-banner-text">
          <span className="evo-banner-side" style={{ color: ATTR_COLOR[to.attribute] }}>
            <Portrait formId={flash.to} className="evo-banner-portrait to" />
            {to.name} {"★".repeat(flash.star)}
          </span>
        </div>
      </div>
    );

  return (
    <div className="evo-banner" key={flash.key}>
      <div className="evo-banner-label">DIGIVOLVING</div>
      <div className="evo-banner-text">
        <span className="evo-banner-side">
          <Portrait formId={flash.from} className="evo-banner-portrait" />
          {from.name}
        </span>
        <span className="evo-banner-arrow">▸</span>
        <span className="evo-banner-side" style={{ color: ATTR_COLOR[to.attribute] }}>
          <Portrait formId={flash.to} className="evo-banner-portrait to" />
          {to.name}
        </span>
      </div>
    </div>
  );
}
