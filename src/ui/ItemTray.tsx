import { useEffect, useState } from "react";
import { useGame } from "../game/store";
import { DIGIVICE, ITEMS, fuseResult } from "../game/items";

/** Inventory of dropped items. Click an item, then a unit to equip (max 2) — or a
 *  glowing item to fuse the pair into a stronger one. */
export function ItemTray() {
  const phase = useGame((s) => s.phase);
  const inventory = useGame((s) => s.inventory);
  const selected = useGame((s) => s.selectedItem);
  const selectItem = useGame((s) => s.selectItem);
  const fuseItems = useGame((s) => s.fuseItems);
  // which chip is selected (the store keeps only the id, and duplicates are common)
  const [selIdx, setSelIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!selected) setSelIdx(null);
  }, [selected]);

  if (phase !== "prep" || inventory.length === 0) return null;
  const selId = selIdx !== null ? inventory[selIdx] : null;

  return (
    <div className="item-tray">
      <div className="tray-title">Items</div>
      <div className="tray-chips">
        {inventory.map((id, i) => {
          const def = ITEMS[id];
          if (!def) return null;
          const fuse = selId && i !== selIdx ? fuseResult(selId, id) : null;
          const into = fuse ? ITEMS[fuse] : null;
          // a Digivice already adds its slot from here: nothing to pick it up for
          if (id === DIGIVICE)
            return (
              <div key={`${id}-${i}`} className="item-chip fused active" title={`${def.name} — ${def.desc}`}>
                <span className="item-emoji">{def.emoji}</span>
                <span className="item-name">{def.name}</span>
                <span className="item-desc">+1 on the board · active</span>
              </div>
            );
          return (
            <button
              key={`${id}-${i}`}
              className={`item-chip${selIdx === i ? " sel" : ""}${into ? " fusable" : ""}${def.from ? " fused" : ""}`}
              title={into ? `Fuse → ${into.name}: ${into.desc}` : `${def.name} — ${def.desc}`}
              onClick={() => {
                if (selIdx === i) {
                  setSelIdx(null);
                  selectItem(null);
                } else if (selIdx !== null && into) {
                  fuseItems(selIdx, i);
                  setSelIdx(null);
                } else {
                  setSelIdx(i);
                  selectItem(id);
                }
              }}
            >
              <span className="item-emoji">{into ? into.emoji : def.emoji}</span>
              <span className="item-name">{into ? `→ ${into.name}` : def.name}</span>
              <span className="item-desc">{into ? into.desc : def.desc}</span>
            </button>
          );
        })}
      </div>
      {selected && <div className="tray-hint">Click a Digimon to equip — or a glowing item to fuse</div>}
    </div>
  );
}
