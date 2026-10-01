import { useGame } from "../game/store";
import { ITEMS } from "../game/items";

/** VS "Arsenal" (every stage's 3rd round): take one of three items. Whoever is
 *  behind on health is offered a fused item — TFT's carousel catch-up, 1v1-sized. */
export function ArsenalChoice() {
  const offer = useGame((s) => s.arsenal);
  const phase = useGame((s) => s.phase);
  const pick = useGame((s) => s.pickArsenal);
  if (!offer || phase !== "prep") return null;
  return (
    <div className="evo-overlay">
      <div className="evo-modal arsenal">
        <div className="evo-title">🎁 Arsenal — take one</div>
        <div className="evo-options">
          {offer.map((id) => {
            const def = ITEMS[id];
            if (!def) return null;
            return (
              <button key={id} className={`evo-card arsenal-card${def.from ? " fused" : ""}`} onClick={() => pick(id)}>
                <span className="arsenal-emoji">{def.emoji}</span>
                <span className="evo-name">{def.name}</span>
                <span className="arsenal-desc">{def.desc}</span>
                {def.from && <span className="evo-stage">fused · catch-up</span>}
              </button>
            );
          })}
        </div>
        <div className="evo-hint">Items fuse in pairs in your tray — plan your carries.</div>
      </div>
    </div>
  );
}
