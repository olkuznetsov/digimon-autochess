import { useState, type CSSProperties } from "react";
import { useGame, pvpMe } from "../game/store";
import { FORMS, ATTR_COLOR, DESCENDANTS, ELEMENT_COLOR, PLAYABLE_IDS, STAGE_NAME, TIER_COLOR, costOf, isTerminal, sellValue } from "../game/creatures";
import { ECONOMY, SHOP_ODDS } from "../game/tuning";
import { Portrait } from "./Portrait";
import { FormTooltip } from "./FormTooltip";
import { MAX_LEVEL } from "../game/xpView";
import { Coin, ELEMENT_PATH, ICON, Icon, ROLE_NAME, ROLE_PATH, STAGE_JP } from "./kit";

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
      {dragged && <div className="sell-hint">Drop here to sell for <Coin size={14} /> {sellValue(dragged)}</div>}
      <div className="shop-econ">
        <button
          className="econ-btn xp"
          onClick={buyXp}
          disabled={gold < ECONOMY.xpCost || level >= MAX_LEVEL}
          title={`Buy ${ECONOMY.xpPerBuy} XP (F)`}
        >
          <Icon d={ICON.levelUp} size={16} width={2.6} /> <span className="econ-word">Buy XP </span>
          <span className="cost">
            <Coin size={13} />
            {ECONOMY.xpCost}
          </span>
        </button>
        <button
          className="econ-btn reroll"
          onClick={reroll}
          disabled={gold < ECONOMY.rerollCost && freeRerolls === 0}
          title={freeRerolls > 0 ? "Free reroll (Lucky Roll) (D)" : "Reroll the shop (D)"}
        >
          <Icon d={ICON.reroll} size={16} width={2.6} /> <span className="econ-word">Reroll </span>
          <span className="cost">
            {freeRerolls > 0 ? (
              "free"
            ) : (
              <>
                <Coin size={13} />
                {ECONOMY.rerollCost}
              </>
            )}
          </span>
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
          // a Mega merges with copies of its own star level (★): the third stars it up
          const copies = units.filter((u) => u.formId === formId && (!isTerminal(formId) || !u.star)).length;
          // it digivolves into something you have: name the furthest of those that can still grow —
          // a form still digivolving, or a Mega short of ★★★ (more copies star it up); a ★★★ Mega
          // is finished and needs nothing more
          const lead =
            copies === 0
              ? units
                  .filter((u) => DESCENDANTS[formId]?.has(u.formId) && (!isTerminal(u.formId) || (u.star ?? 1) < 3))
                  .map((u) => u.formId)
                  .sort((a, b) => FORMS[b].stage - FORMS[a].stage)[0]
              : undefined;
          const line = !!lead;
          const mark = copies >= 2 ? " upgrade" : copies === 1 ? " owned" : line ? " line" : "";
          const rarity = form.stage >= 5 ? " legendary" : form.stage === 4 ? " epic" : "";
          return (
            <button
              key={i}
              className={`shop-card tier-${form.stage}${mark}${rarity}`}
              style={{ "--attr": color } as CSSProperties}
              disabled={gold < cost}
              onClick={() => buy(i)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
            >
              {hover === i && !dragged && <FormTooltip formId={formId} />}
              {copies >= 2 && <span className="card-badge up">{isTerminal(formId) ? "⬆ ★★" : "⬆ Digivolve"}</span>}
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
                <span className="card-attr">
                  <i style={{ background: color }} />
                  {STAGE_JP[form.stage]} · {form.attribute === "Free" ? STAGE_NAME[form.stage] : form.attribute}
                </span>
                <span className="card-cost" title={STAGE_NAME[form.stage]}>
                  <Coin size={13} />
                  {cost}
                </span>
                {/* how it fights: its element (a baby has none until a Digimental) and its role */}
                {form.element !== "Neutral" && (
                  <span className="card-tag el" style={{ "--el": ELEMENT_COLOR[form.element] } as CSSProperties} title={`${form.element} element`}>
                    <Icon d={ELEMENT_PATH[form.element]} size={11} width={2.6} />
                    <span className="card-tag-text">{form.element}</span>
                  </span>
                )}
                <span className="card-tag role" title={ROLE_NAME[form.role]}>
                  <Icon d={ROLE_PATH[form.role]} size={11} width={2.6} />
                  <span className="card-tag-text">{ROLE_NAME[form.role]}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        className={`econ-btn lock${locked ? " on" : ""}`}
        onClick={toggleLock}
        title={locked ? "Shop locked — kept for the next round (L)" : "Lock the shop: keep these offers for the next round (L)"}
      >
        <Icon d={locked ? ICON.lock : ICON.unlock} size={18} />
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
            <Coin size={11} />
            {tier} {p}%
          </span>
        );
      })}
      {discovered.length > 0 && <span className="odds-raised">
          <Icon d={ICON.sparkle} size={11} fill="currentColor" /> {discovered.length} raised
        </span>}
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
                      <Coin size={11} />
                      {tier} {STAGE_NAME[tier]}
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
            Champions (4) and Megas (5) show up only once you've raised them this game; a tier with nothing to offer
            hands its share to the others.{pool ? " VS: copies other tamers hold are out of the pool." : ""}
          </div>
        </div>
      )}
    </div>
  );
}
