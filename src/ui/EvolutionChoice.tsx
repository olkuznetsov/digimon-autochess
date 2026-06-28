import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR, FAMILY_COLOR } from "../game/creatures";

const STAGE_NAME = ["", "Rookie", "Champion", "Ultimate"];

export function EvolutionChoice() {
  const pending = useGame((s) => s.pendingEvolution);
  const choose = useGame((s) => s.chooseEvolution);
  if (!pending) return null;

  const from = FORMS[pending.fromFormId];

  return (
    <div className="evo-overlay">
      <div className="evo-modal">
        <div className="evo-title">
          Digivolve <span style={{ color: ATTR_COLOR[from.attribute] }}>{from.name}</span> →
        </div>
        <div className="evo-options">
          {pending.options.map((id) => {
            const form = FORMS[id];
            const attr = ATTR_COLOR[form.attribute];
            return (
              <button key={id} className="evo-card" style={{ borderColor: attr }} onClick={() => choose(id)}>
                <span className="evo-stage">{STAGE_NAME[form.stage]}</span>
                <span className="evo-name">{form.name}</span>
                <span className="evo-tags">
                  <span className="evo-tag" style={{ background: attr }}>
                    {form.attribute}
                  </span>
                  <span className="evo-tag fam" style={{ color: FAMILY_COLOR[form.family], borderColor: FAMILY_COLOR[form.family] }}>
                    {form.family}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="evo-hint">Choose an evolution — branches change your attribute &amp; family synergies.</div>
      </div>
    </div>
  );
}
