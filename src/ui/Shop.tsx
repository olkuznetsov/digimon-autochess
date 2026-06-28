import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR } from "../game/creatures";

export function Shop() {
  const phase = useGame((s) => s.phase);
  const shop = useGame((s) => s.shop);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const buy = useGame((s) => s.buy);
  const reroll = useGame((s) => s.reroll);
  const buyXp = useGame((s) => s.buyXp);

  if (phase !== "prep") return null;

  return (
    <div className="shop">
      <div className="shop-econ">
        <button className="econ-btn xp" onClick={buyXp} disabled={gold < 4 || level >= 8}>
          ▲ Buy XP <span className="cost">4</span>
        </button>
        <button className="econ-btn reroll" onClick={reroll} disabled={gold < 2}>
          ⟳ Reroll <span className="cost">2</span>
        </button>
      </div>
      <div className="shop-slots">
        {shop.map((formId, i) => {
          if (!formId) return <div key={i} className="shop-card empty" />;
          const form = FORMS[formId];
          const cost = form.cost ?? 0;
          const color = ATTR_COLOR[form.attribute];
          return (
            <button
              key={i}
              className="shop-card"
              style={{ borderColor: color }}
              disabled={gold < cost}
              onClick={() => buy(i)}
            >
              <span className="attr-dot" style={{ background: color }} />
              <span className="card-name">{form.name}</span>
              <span className="card-attr" style={{ color }}>
                {form.attribute}
              </span>
              <span className="card-cost">⛂ {cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
