import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR, FAMILY_COLOR, sellValue } from "../game/creatures";
import { ROLE_ABILITIES } from "../game/abilities";
import { makeFighter } from "../game/battle";
import { ITEMS } from "../game/items";

const STAGE_NAME = ["", "Rookie", "Champion", "Ultimate"];

/** Inspector card for the clicked unit: stats (item-adjusted), ability, items.
 *  Works in prep (units) and battle (live fighters); hides when the uid is gone. */
export function UnitPanel() {
  const inspected = useGame((s) => s.inspected);
  const unit = useGame((s) => s.units.find((u) => u.uid === s.inspected));
  const fighter = useGame((s) => s.fighters.find((f) => f.uid === s.inspected));
  const setInspected = useGame((s) => s.setInspected);
  const phase = useGame((s) => s.phase);
  const sellUnit = useGame((s) => s.sellUnit);

  if (!inspected) return null;
  const formId = fighter?.formId ?? unit?.formId;
  if (!formId) return null; // died / sold — auto-hide
  const form = FORMS[formId];
  const items = fighter?.items ?? unit?.items ?? [];

  // live fighter in battle; otherwise a preview with items applied
  const stats = fighter ?? makeFighter(formId, "preview", "player", 0, 0, 1, items);
  const ability = ROLE_ABILITIES[form.role];
  const attr = ATTR_COLOR[form.attribute];
  const fam = FAMILY_COLOR[form.family];

  return (
    <div className="unit-panel">
      <div className="up-head">
        <span className="up-name">{form.name}</span>
        <span className="up-stage">{STAGE_NAME[form.stage]}</span>
        <button className="up-close" onClick={() => setInspected(null)}>
          ✕
        </button>
      </div>
      <div className="up-tags">
        <span className="up-tag" style={{ background: attr }}>
          {form.attribute}
        </span>
        <span className="up-tag fam" style={{ color: fam, borderColor: fam }}>
          {form.family}
        </span>
        <span className="up-tag role">{form.role}</span>
      </div>
      <div className="up-stats">
        <span>
          ❤️ {fighter ? `${Math.max(0, Math.ceil(fighter.hp))} / ${fighter.maxHp}` : stats.maxHp}
          {fighter && fighter.shield > 0 && <em className="up-shield"> +{Math.ceil(fighter.shield)}🛡</em>}
        </span>
        <span>⚔️ {stats.attack}</span>
        <span>⚡ {stats.attackSpeed.toFixed(2)}/s</span>
        <span>🎯 range {stats.range}</span>
      </div>
      {fighter && (
        <div className="up-mana">
          <span className="mana-track big">
            <span className="mana-fill" style={{ width: `${(fighter.mana / fighter.maxMana) * 100}%` }} />
          </span>
        </div>
      )}
      <div className="up-ability">
        <span className="up-ab-name">
          {ability.icon} {ability.name}
        </span>
        <span className="up-ab-desc">{ability.desc}</span>
      </div>
      <div className="up-items">
        {items.length === 0 ? (
          <span className="up-noitems">No items equipped</span>
        ) : (
          items.map((id, i) => {
            const def = ITEMS[id];
            return def ? (
              <span key={`${id}-${i}`} className="up-item" title={def.desc}>
                {def.emoji} {def.name} <em>{def.desc}</em>
              </span>
            ) : null;
          })
        )}
      </div>
      {phase === "prep" && unit && (
        <button className="up-sell" onClick={() => sellUnit(unit.uid)}>
          Sell for {sellValue(formId)} ⛂
        </button>
      )}
    </div>
  );
}
