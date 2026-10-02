import { useState } from "react";
import { useGame, pvpMe } from "../game/store";
import { FORMS, ATTR_COLOR, DESCENDANTS, STAGE_NAME, TIER_COLOR, costOf, sellValue } from "../game/creatures";
import { ECONOMY, SHOP_ODDS } from "../game/tuning";
import { Portrait } from "./Portrait";
import { FormTooltip } from "./FormTooltip";
import { MAX_LEVEL } from "../game/xpView";

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
  const units = useGame((s) => s.units);
  const discovered = useGame((s) => s.discovered);
  const freeRerolls = useGame((s) => s.freeRerolls);
  // VS: the shared pool — copies of each rookie still out there
  const pool = useGame((s) => (s.pvp?.snap.stage === "match" ? s.pvp.snap.pool : null));
  const [hover, setHover] = useState<number | null>(null);
  const spectating = useGame((s) => s.pvp?.snap.stage === "match" && !pvpMe(s.pvp)?.alive);

  if (phase !== "prep" || spectating) return null;

  return (
    <div className={`shop${dragged ? " sell-zone" : ""}`}>
      {dragged && <div className="sell-hint">Drop here to sell for ⛂ {sellValue(dragged)}</div>}
      <div className="shop-econ">
        <button
          className="econ-btn xp"
          onClick={buyXp}
          disabled={gold < ECONOMY.xpCost || level >= MAX_LEVEL}
          title={`Buy ${ECONOMY.xpPerBuy} XP (F)`}
        >
          ▲ <span className="econ-word">Buy XP </span><span className="cost">{ECONOMY.xpCost}</span>
        </button>
        <button
          className="econ-btn reroll"
          onClick={reroll}
          disabled={gold < ECONOMY.rerollCost && freeRerolls === 0}
          title={freeRerolls > 0 ? "Free reroll (Lucky Roll) (D)" : "Reroll the shop (D)"}
        >
          ⟳ <span className="econ-word">Reroll </span>
          <span className="cost">{freeRerolls > 0 ? "free" : ECONOMY.rerollCost}</span>
        </button>
      </div>
      <ShopOdds level={level} discovered={discovered} />
      <div className="shop-slots">
        {shop.map((formId, i) => {
          if (!formId) return <div key={i} className="shop-card empty" />;
          const form = FORMS[formId];
          const cost = costOf(formId);
          const color = ATTR_COLOR[form.attribute];
          // what you're already collecting: copies owned, and whether this one digivolves them
          const copies = units.filter((u) => u.formId === formId).length;
          // a Rookie or Champion of a line you're building; a baby only when you hold its very next form
          // (a Fresh leads to half the roster)
          const next = form.stage >= 3 ? DESCENDANTS[formId] : new Set(form.evolvesTo ?? []);
          const line = copies === 0 && units.some((u) => next?.has(u.formId));
          const mark = copies >= 2 ? " upgrade" : copies === 1 ? " owned" : line ? " line" : "";
          const rarity = form.stage >= 5 ? " legendary" : form.stage === 4 ? " epic" : "";
          return (
            <button
              key={i}
              className={`shop-card${mark}${rarity}`}
              style={{ borderColor: color }}
              disabled={gold < cost}
              onClick={() => buy(i)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
            >
              {hover === i && !dragged && <FormTooltip formId={formId} />}
              {copies >= 2 && <span className="card-badge up">⬆ Digivolve</span>}
              {copies === 1 && <span className="card-badge">×1 owned</span>}
              {line && (
                <span className="card-badge line" title="It digivolves into a Digimon you have">
                  ★ line
                </span>
              )}
              {pool && (pool[formId] ?? 0) <= 3 && (
                <span className="card-badge pool" title="Copies left in the lobby's shared pool">
                  {(pool[formId] ?? 0) === 0 ? "sold out" : `last ${pool[formId]}`}
                </span>
              )}
              <Portrait formId={formId} className="card-portrait" />
              <span className="card-info">
                <span className={`card-name${form.name.length > 9 ? " long" : ""}`}>{form.name}</span>
                <span className="card-attr" style={{ color }}>
                  {form.attribute === "Free" ? STAGE_NAME[form.stage] : form.attribute}
                </span>
                <span className="card-cost" style={{ color: TIER_COLOR[form.stage] }} title={STAGE_NAME[form.stage]}>
                  ⛂ {cost}
                </span>
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

/** This level's odds per tier, as TFT shows them over the shop. Tiers 4–5 only offer
 *  what was raised this game — dimmed while there's nothing of that tier yet. */
function ShopOdds({ level, discovered }: { level: number; discovered: string[] }) {
  const odds = SHOP_ODDS[Math.max(1, Math.min(MAX_LEVEL, level))];
  const raised = (tier: number) => discovered.filter((id) => FORMS[id]?.stage === tier);
  return (
    <div className="shop-odds" title="Shop odds at your level — Champions (⛂4) and Megas (⛂5) only once you've raised them">
      {odds.map((p, i) => {
        const tier = i + 1;
        if (p === 0) return null;
        const dim = tier >= 4 && raised(tier).length === 0;
        const names = raised(tier).map((id) => FORMS[id].name).join(", ");
        return (
          <span
            key={tier}
            className={`odds-tier${dim ? " dim" : ""}`}
            style={{ color: TIER_COLOR[tier] }}
            title={tier >= 4 ? (dim ? `nothing raised yet — these slots roll another tier` : `raised: ${names}`) : STAGE_NAME[tier]}
          >
            ⛂{tier} {p}%
          </span>
        );
      })}
      {discovered.length > 0 && <span className="odds-raised">✨ {discovered.length} raised</span>}
    </div>
  );
}
