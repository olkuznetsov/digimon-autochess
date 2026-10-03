import { useState, type CSSProperties } from "react";
import { useGame } from "../game/store";
import { traitViews, elementsOf } from "../game/synergies";
import { FORMS } from "../game/creatures";
import { MeterRows } from "./DamageMeter";

export function SynergyPanel() {
  const phase = useGame((s) => s.phase);
  const units = useGame((s) => s.units);
  // phones show only the active traits until the title is tapped
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  // the same corner shows the last battle's damage on demand
  const lastMeter = useGame((s) => s.lastMeter);
  const [tab, setTab] = useState<"syn" | "dmg">("syn");
  if (phase !== "prep") return null;

  const views = traitViews(units);
  if (views.length === 0 && !lastMeter) return null;
  const hidden = views.filter((v) => v.activeIndex < 0).length;
  const showDmg = tab === "dmg" && !!lastMeter;

  return (
    <div className={`synergies${open || showDmg ? " open" : ""}`}>
      <div className="syn-tabs">
        <button className={`syn-title${showDmg ? " off" : ""}`} onClick={() => (showDmg ? setTab("syn") : setOpen((o) => !o))}>
          Synergies
          {!showDmg && hidden > 0 && <span className="syn-toggle">{open ? " ▾" : ` +${hidden} ▸`}</span>}
        </button>
        {lastMeter && (
          <button
            className={`syn-title dmg${showDmg ? "" : " off"}`}
            title="Damage in the last battle"
            onClick={() => setTab(showDmg ? "syn" : "dmg")}
          >
            Damage
          </button>
        )}
      </div>
      {showDmg && (
        <div className="syn-dmg">
          <span className="syn-dmg-note">last battle</span>
          <MeterRows rows={lastMeter!} />
        </div>
      )}
      {!showDmg && views.map((v) => {
        const active = v.activeIndex >= 0;
        const tier = active ? v.def.tiers[v.activeIndex] : null;
        const nextTier = v.def.tiers.find((t) => t.need > v.count);
        return (
          <div
            key={v.def.key}
            className={`syn-row ${active ? "on" : "off"}`}
            style={{ "--syn": v.def.color } as CSSProperties}
            onPointerEnter={(e) => e.pointerType === "mouse" && setTip(v.def.key)}
            onPointerLeave={() => setTip((t) => (t === v.def.key ? null : t))}
          >
            {tip === v.def.key && (
              <div className="syn-tip" style={{ borderColor: v.def.color }}>
                <b style={{ color: v.def.color }}>{v.def.name}</b>
                <span className="syn-tip-kind">{v.def.kind === "attribute" ? "Attribute" : "Element"} · unique Digimon on the board</span>
                {v.def.tiers.map((t, ti) => (
                  <span key={t.need} className={`syn-tip-tier${ti === v.activeIndex ? " on" : ""}`}>
                    ({t.need}) {t.desc}
                  </span>
                ))}
                <span className="syn-tip-units">
                  {[
                    ...new Set(
                      units
                        .filter((u) => u.placement.kind === "board")
                        .filter((u) => FORMS[u.formId].attribute === v.def.key || elementsOf(u.formId, u.items).includes(v.def.key))
                        .map((u) => u.formId),
                    ),
                  ]
                    .map((id) => FORMS[id].name)
                    .join(", ") || "none on the board yet"}
                </span>
              </div>
            )}
            <span className="syn-pip" style={{ background: v.def.color, boxShadow: active ? `0 0 10px ${v.def.color}` : "none" }} />
            <span className="syn-body">
              <span className="syn-name" style={active ? { color: v.def.color } : undefined}>
                {v.def.name}
                <span className="syn-count">
                  {v.count}
                  {nextTier ? `/${nextTier.need}` : ""}
                </span>
              </span>
              <span className="syn-desc">{tier ? tier.desc : nextTier ? `${nextTier.need}: ${nextTier.desc}` : ""}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
