import { FORMS, ATTR_COLOR, ELEMENT_COLOR, ELEMENT_ICON, STAGE_NAME, statsFor } from "../game/creatures";
import { ultimateFor } from "../game/ultimates";
import { HP_SCALE } from "../game/battle";
import type { Attribute } from "../game/types";
import { Portrait } from "./Portrait";

const BEATS: Record<Attribute, Attribute | null> = { Vaccine: "Virus", Virus: "Data", Data: "Vaccine", Free: null };
const LOSES: Record<Attribute, Attribute | null> = { Vaccine: "Data", Virus: "Vaccine", Data: "Virus", Free: null };

/** Everything a player wants to know before buying: matchup, role, stats, ultimate, line. */
export function FormTooltip({ formId }: { formId: string }) {
  const form = FORMS[formId];
  if (!form) return null;
  const s = statsFor(form);
  const ult = ultimateFor(formId, form.role);
  const attr = ATTR_COLOR[form.attribute];
  const next = (form.evolvesTo ?? []).map((id) => FORMS[id]?.name).filter(Boolean);
  return (
    <div className="form-tip" style={{ borderColor: attr }}>
      <div className="tip-head">
        <Portrait formId={formId} className="tip-portrait" />
        <div className="tip-title">
          <span className="tip-name">{form.name}</span>
          <span className="tip-stage">
            {STAGE_NAME[form.stage]} · {form.role}
          </span>
          <span className="tip-tags">
            <span className="tip-tag" style={{ background: attr }}>
              {form.attribute}
            </span>
            <span className="tip-tag fam" style={{ color: ELEMENT_COLOR[form.element], borderColor: ELEMENT_COLOR[form.element] }}>
              {ELEMENT_ICON[form.element]} {form.element}
            </span>
          </span>
        </div>
      </div>
      <div className="tip-matchup">
        {BEATS[form.attribute] && LOSES[form.attribute] ? (
          <>
            ▲ strong vs <b style={{ color: ATTR_COLOR[BEATS[form.attribute]!] }}>{BEATS[form.attribute]}</b> · ▼ weak vs{" "}
            <b style={{ color: ATTR_COLOR[LOSES[form.attribute]!] }}>{LOSES[form.attribute]}</b>
          </>
        ) : (
          <>◇ Free: a baby, neutral against every attribute</>
        )}
      </div>
      <div className="tip-stats">
        <span>❤️ {Math.round(s.hp * HP_SCALE)}</span>
        <span>⚔️ {s.attack}</span>
        <span>⚡ {s.attackSpeed.toFixed(2)}/s</span>
        <span>🎯 {s.range}</span>
      </div>
      <div className="tip-ult">
        <b>
          {ult.icon} {ult.name}
        </b>
        <span>{ult.desc}</span>
      </div>
      {next.length > 0 && <div className="tip-line">🧬 3 copies → {next.join(" or ")}</div>}
    </div>
  );
}
