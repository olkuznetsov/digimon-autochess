import { useGame } from "../game/store";
import { CREATURES, ATTR_COLOR } from "../game/creatures";

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
        {shop.map((defId, i) => {
          if (!defId) return <div key={i} className="shop-card empty" />;
          const def = CREATURES[defId];
          const color = ATTR_COLOR[def.attribute];
          return (
            <button
              key={i}
              className="shop-card"
              style={{ borderColor: color }}
              disabled={gold < def.cost}
              onClick={() => buy(i)}
            >
              <span className="attr-dot" style={{ background: color }} />
              <span className="card-name">{def.name}</span>
              <span className="card-attr" style={{ color }}>
                {def.attribute}
              </span>
              <span className="card-cost">⛂ {def.cost}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
