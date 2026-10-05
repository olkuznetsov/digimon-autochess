import { useEffect } from "react";
import { create } from "zustand";
import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR, ELEMENT_COLOR, ELEMENT_ICON, STAGE_NAME } from "../game/creatures";
import { ICON, Icon } from "./kit";
import { Portrait } from "./Portrait";

/** The choice tucked away to look at the board (or the Guide) first — the HUD's action
 *  button brings it back. */
export const useEvoPeek = create<{ peek: boolean }>(() => ({ peek: false }));

export function EvolutionChoice() {
  const pending = useGame((s) => s.pendingEvolution);
  const choose = useGame((s) => s.chooseEvolution);
  const peek = useEvoPeek((s) => s.peek);
  // every new choice opens up front
  useEffect(() => useEvoPeek.setState({ peek: false }), [pending]);
  if (!pending || peek) return null;

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
                <Portrait formId={id} className="evo-portrait" />
                <span className="evo-stage">{STAGE_NAME[form.stage]}</span>
                <span className="evo-name">{form.name}</span>
                <span className="evo-tags">
                  <span className="evo-tag" style={{ background: attr }}>
                    {form.attribute}
                  </span>
                  <span className="evo-tag fam" style={{ color: ELEMENT_COLOR[form.element], borderColor: ELEMENT_COLOR[form.element] }}>
                    {ELEMENT_ICON[form.element]} {form.element}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="evo-hint">Choose an evolution — branches change your attribute &amp; element synergies.</div>
        <button className="evo-hide" onClick={() => useEvoPeek.setState({ peek: true })}>
          <Icon d={ICON.eye} size={16} width={2.4} /> Look at the board first
        </button>
      </div>
    </div>
  );
}
