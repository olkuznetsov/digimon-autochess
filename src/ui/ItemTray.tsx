import { useGame } from "../game/store";
import { ITEMS } from "../game/items";

/** Inventory of dropped items. Click an item, then click a unit to equip (max 2). */
export function ItemTray() {
  const phase = useGame((s) => s.phase);
  const inventory = useGame((s) => s.inventory);
  const selected = useGame((s) => s.selectedItem);
  const selectItem = useGame((s) => s.selectItem);

  if (phase !== "prep" || inventory.length === 0) return null;

  return (
    <div className="item-tray">
      <div className="tray-title">Items</div>
      <div className="tray-chips">
        {inventory.map((id, i) => {
          const def = ITEMS[id];
          if (!def) return null;
          return (
            <button
              key={`${id}-${i}`}
              className={`item-chip ${selected === id ? "sel" : ""}`}
              title={`${def.name} — ${def.desc}`}
              onClick={() => selectItem(selected === id ? null : id)}
            >
              <span className="item-emoji">{def.emoji}</span>
              <span className="item-name">{def.name}</span>
              <span className="item-desc">{def.desc}</span>
            </button>
          );
        })}
      </div>
      {selected && <div className="tray-hint">Click one of your Digimon to equip</div>}
    </div>
  );
}
