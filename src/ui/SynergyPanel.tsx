import { useGame } from "../game/store";
import { traitViews } from "../game/synergies";

export function SynergyPanel() {
  const phase = useGame((s) => s.phase);
  const units = useGame((s) => s.units);
  if (phase !== "prep") return null;

  const views = traitViews(units);
  if (views.length === 0) return null;

  return (
    <div className="synergies">
      <div className="syn-title">Synergies</div>
      {views.map((v) => {
        const active = v.activeIndex >= 0;
        const tier = active ? v.def.tiers[v.activeIndex] : null;
        const nextTier = v.def.tiers.find((t) => t.need > v.count);
        return (
          <div key={v.def.key} className={`syn-row ${active ? "on" : "off"}`}>
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
