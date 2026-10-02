import { useEffect, useState } from "react";
import { useGame } from "../game/store";
import { FORMS, TIER_COLOR } from "../game/creatures";
import { Portrait } from "./Portrait";

/** A Champion or Mega raised for the first time this game: from now on it can turn up
 *  in the shop (tiers 4–5 offer only discovered forms) — say so as it happens. */
export function DiscoveryToast() {
  const flash = useGame((s) => s.discoveryFlash);
  const [shown, setShown] = useState(flash);

  useEffect(() => {
    if (!flash) return;
    setShown(flash);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!shown) return null;
  const forms = shown.ids.map((id) => FORMS[id]).filter(Boolean);
  if (forms.length === 0) return null;
  const tier = Math.max(...forms.map((f) => f.stage));
  return (
    <div className="discovery-toast" key={shown.key} style={{ borderColor: TIER_COLOR[tier] }}>
      {forms.map((f) => (
        <Portrait key={f.id} formId={f.id} className="discovery-portrait" />
      ))}
      <span className="discovery-text">
        <b style={{ color: TIER_COLOR[tier] }}>✨ Discovered: {forms.map((f) => f.name).join(", ")}</b>
        <span>now it can show up in your shop (⛂{tier})</span>
      </span>
    </div>
  );
}
