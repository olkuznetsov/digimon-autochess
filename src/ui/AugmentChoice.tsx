import { useGame } from "../game/store";
import { AUGMENTS, MAX_AUGMENTS } from "../game/augments";
import { ELEMENT_COLOR, ELEMENT_ICON } from "../game/creatures";

const KIND_LABEL = { instant: "now", economy: "every round", combat: "every fight" } as const;

/** VS augment rounds: one of three permanent bonuses (one reroll of the offer). */
export function AugmentChoice() {
  const offer = useGame((s) => s.augmentOffer);
  const phase = useGame((s) => s.phase);
  const rerolls = useGame((s) => s.augmentRerolls);
  const owned = useGame((s) => s.augments);
  const pendingEvolution = useGame((s) => s.pendingEvolution);
  const pick = useGame((s) => s.pickAugment);
  const reroll = useGame((s) => s.rerollAugments);
  // a digivolution choice goes first; then this
  if (!offer || phase !== "prep" || pendingEvolution) return null;

  return (
    <div className="evo-overlay">
      <div className="evo-modal augment">
        <div className="evo-title">
          ✨ Augment {owned.length + 1} of {MAX_AUGMENTS} — choose one
        </div>
        <div className="evo-options">
          {offer.map((id) => {
            const def = AUGMENTS[id];
            if (!def) return null;
            const famColor = def.element ? ELEMENT_COLOR[def.element] : undefined;
            return (
              <button key={id} className={`evo-card augment-card ${def.kind}`} onClick={() => pick(id)}>
                <span className="aug-emoji">{def.emoji}</span>
                <span className="evo-name">{def.name}</span>
                <span className="aug-desc">{def.desc}</span>
                <span className="evo-stage" style={famColor ? { color: famColor } : undefined}>
                  {def.element ? `${ELEMENT_ICON[def.element]} ${def.element}` : KIND_LABEL[def.kind]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="aug-foot">
          <button className="action ghost" disabled={rerolls <= 0} onClick={reroll}>
            ⟳ Reroll{rerolls > 0 ? "" : " used"}
          </button>
          {owned.length > 0 && (
            <span className="evo-hint">
              Yours: {owned.map((id) => `${AUGMENTS[id]?.emoji} ${AUGMENTS[id]?.name}`).join(" · ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
