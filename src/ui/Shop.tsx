import { useState } from "react";
import { useGame, pvpMe } from "../game/store";
import { FORMS, ATTR_COLOR, DESCENDANTS, PLAYABLE_IDS, STAGE_NAME, TIER_COLOR, costOf, sellValue } from "../game/creatures";
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
          // it digivolves into something you have: name the furthest of those
          const lead =
            copies === 0
              ? units
                  .map((u) => u.formId)
                  // a form you're still raising: a finished evolution (Vikemon) needs nothing more
                  .filter((id) => DESCENDANTS[formId]?.has(id) && (FORMS[id].evolvesTo?.length ?? 0) > 0)
                  .sort((a, b) => FORMS[b].stage - FORMS[a].stage)[0]
              : undefined;
          const line = !!lead;
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
                <span className="card-badge line" title={`It digivolves into ${FORMS[lead!].name} — you have one`}>
                  → {FORMS[lead!].name}
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
 *  what was raised this game — dimmed while there's nothing of that tier yet. Hover (or
 *  tap) for the detail: the real chance per slot once empty tiers drop out, how many forms
 *  share a tier, the chance a given one turns up in a shop, and the next level's odds. */
function ShopOdds({ level, discovered }: { level: number; discovered: string[] }) {
  const [open, setOpen] = useState(false);
  const pool = useGame((s) => (s.pvp?.snap.stage === "match" ? s.pvp.snap.pool : null));
  const at = (lv: number) => SHOP_ODDS[Math.max(1, Math.min(MAX_LEVEL, lv))];
  const odds = at(level);
  const offer = (tier: number) =>
    PLAYABLE_IDS.filter(
      (id) => FORMS[id].stage === tier && (tier <= 3 || discovered.includes(id)) && (!pool || (pool[id] ?? 0) > 0),
    );
  const counts = odds.map((_, i) => offer(i + 1).length);
  const weights = odds.map((p, i) => (counts[i] > 0 ? p : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const pct = (x: number) => (x === 0 ? "—" : x < 0.001 ? "<0.1%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
  return (
    <div
      className="shop-odds"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      // touch has no hover: a tap opens and closes it
      onPointerUp={(e) => e.pointerType !== "mouse" && setOpen((o) => !o)}
    >
      {odds.map((p, i) => {
        const tier = i + 1;
        if (p === 0) return null;
        return (
          <span key={tier} className={`odds-tier${tier >= 4 && counts[i] === 0 ? " dim" : ""}`} style={{ color: TIER_COLOR[tier] }}>
            ⛂{tier} {p}%
          </span>
        );
      })}
      {discovered.length > 0 && <span className="odds-raised">✨ {discovered.length} raised</span>}
      {open && (
        <div className="odds-pop" onClick={(e) => e.stopPropagation()}>
          <div className="odds-pop-title">
            Shop odds · level {level}
            <span>5 slots a shop</span>
          </div>
          <table>
            <thead>
              <tr>
                <th />
                <th>a slot</th>
                <th>forms</th>
                <th title="the chance one particular Digimon of this tier shows up in a shop">a given one</th>
                {level < MAX_LEVEL && <th>level {level + 1}</th>}
              </tr>
            </thead>
            <tbody>
              {odds.map((_, i) => {
                const tier = i + 1;
                const slot = weights[i] / total;
                const one = counts[i] ? 1 - Math.pow(1 - slot / counts[i], 5) : 0;
                const raised = discovered.filter((id) => FORMS[id]?.stage === tier);
                return (
                  <tr key={tier} className={slot === 0 ? "off" : ""}>
                    <td style={{ color: TIER_COLOR[tier] }}>
                      ⛂{tier} {STAGE_NAME[tier]}
                    </td>
                    <td>{pct(slot)}</td>
                    <td title={tier >= 4 ? raised.map((id) => FORMS[id].name).join(", ") || "nothing raised yet" : undefined}>
                      {tier >= 4 ? (raised.length ? `${raised.length} raised` : "none raised") : counts[i]}
                    </td>
                    <td>{pct(one)}</td>
                    {level < MAX_LEVEL && <td>{at(level + 1)[i]}%</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="odds-pop-note">
            ⛂4 Champions and ⛂5 Megas show up only once you've raised them this game; a tier with nothing to offer
            hands its share to the others.{pool ? " VS: copies other tamers hold are out of the pool." : ""}
          </div>
        </div>
      )}
    </div>
  );
}
