import { useGame } from "../game/store";
import { FORMS, ATTR_COLOR, sellValue } from "../game/creatures";
import { Portrait } from "./Portrait";

export function Shop() {
  const phase = useGame((s) => s.phase);
  const shop = useGame((s) => s.shop);
  const gold = useGame((s) => s.gold);
  const level = useGame((s) => s.level);
  const buy = useGame((s) => s.buy);
  const reroll = useGame((s) => s.reroll);
  const buyXp = useGame((s) => s.buyXp);
  const locked = useGame((s) => s.shopLocked);
  const toggleLock = useGame((s) => s.toggleShopLock);
  const dragged = useGame((s) => s.units.find((u) => u.uid === s.dragId));

  if (phase !== "prep") return null;

  return (
    <div className={`shop${dragged ? " sell-zone" : ""}`}>
      {dragged && <div className="sell-hint">Drop here to sell for ⛂ {sellValue(dragged.formId)}</div>}
      <div className="shop-econ">
        <button className="econ-btn xp" onClick={buyXp} disabled={gold < 4 || level >= 8} title="Buy 4 XP (F)">
          ▲ <span className="econ-word">Buy XP </span><span className="cost">4</span>
        </button>
        <button className="econ-btn reroll" onClick={reroll} disabled={gold < 2} title="Reroll the shop (D)">
          ⟳ <span className="econ-word">Reroll </span><span className="cost">2</span>
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
              <Portrait formId={formId} className="card-portrait" />
              <span className="card-info">
                <span className={`card-name${form.name.length > 9 ? " long" : ""}`}>{form.name}</span>
                <span className="card-attr" style={{ color }}>
                  {form.attribute}
                </span>
                <span className="card-cost">⛂ {cost}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        className={`econ-btn lock${locked ? " on" : ""}`}
        onClick={toggleLock}
        title={locked ? "Shop locked — kept next round (L)" : "Lock the shop for next round (L)"}
      >
        {locked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}
