import { useMemo, useState } from "react";
import {
  FORMS,
  ALL_FORM_IDS,
  ROOKIE_IDS,
  PLAYABLE_IDS,
  WILD_IDS,
  ATTR_COLOR,
  FAMILY_COLOR,
  STAGE_NAME,
  isPlayable,
  statsFor,
  attributeMultiplier,
} from "../game/creatures";
import { ultimateFor } from "../game/ultimates";
import { HP_SCALE } from "../game/battle";
import { TRAITS } from "../game/synergies";
import { ITEMS, COMPONENT_IDS, FUSED_ITEM_IDS, RELIC_IDS, fuseResult } from "../game/items";
import { AUGMENTS, AUGMENT_IDS, AUGMENT_ROUNDS } from "../game/augments";
import { ECONOMY, SHOP_ODDS, VS, WAVES } from "../game/tuning";
import { MAX_LEVEL } from "../game/xpView";
import { POOL_COPIES, ratingDelta } from "../game/lobby";
import type { Family, Role } from "../game/types";
import { Portrait } from "./Portrait";

/**
 * The Tamer's Guide: how to play, every Digimon line, synergies, item recipes and
 * the VS rules — all generated from the game data, so it never goes stale.
 */

type Tab = "basics" | "digimon" | "synergies" | "items" | "vs";
const TABS: [Tab, string][] = [
  ["basics", "Basics"],
  ["digimon", "Digimon"],
  ["synergies", "Synergies"],
  ["items", "Items"],
  ["vs", "VS"],
];
const ROLE_ICON: Record<Role, string> = { tank: "🛡️", bruiser: "💪", assassin: "🗡️", ranged: "🏹", caster: "✨" };
const FAMILIES = (Object.keys(FAMILY_COLOR) as Family[]).filter((f) => f !== "Baby");

export function Guide({ onClose, initial = "basics" }: { onClose: () => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <span className="guide-title">📖 Tamer's Guide</span>
          <button className="guide-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="guide-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={`guide-tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="guide-body">
          {tab === "basics" && <Basics />}
          {tab === "digimon" && <Digimon />}
          {tab === "synergies" && <Synergies />}
          {tab === "items" && <Items />}
          {tab === "vs" && <Versus />}
        </div>
      </div>
    </div>
  );
}

function Basics() {
  return (
    <>
      <section className="guide-sec">
        <h3>The round</h3>
        <ul>
          <li>🛒 <b>Buy Digimon</b> in the shop — the price is the stage: ⛂1 Fresh, ⛂2 In-Training, ⛂3 Rookie, ⛂4 Champion, ⛂5 Mega. They wait on your bench.</li>
          <li>🖱 <b>Drag them onto your half</b> of the board. Your level is how many can fight.</li>
          <li>⚔ <b>The battle plays itself</b>: units attack, fill their mana and cast their ultimate.</li>
          <li>♥ Lose and you take damage; at 0 the run (or match) is over.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Digivolve</h3>
        <ul>
          <li>🧬 <b>3 copies</b> of the same Digimon merge into the next stage: Fresh → In-Training → Rookie → Champion → Mega.</li>
          <li>🔀 Most stages <b>branch</b> — you pick the evolution (3 Koromon: Agumon, Guilmon or Dracomon), and with it the attribute and family.</li>
          <li>🍼 <b>Babies</b> (Fresh, In-Training) have no attribute and no family: neutral to everyone, no synergies. Raise them into Rookies.</li>
          <li>⭐ A <b>Mega</b> has nowhere to digivolve: three copies star it up — <b>★★</b> (×1.8 HP and attack), and three ★★ make <b>★★★</b> (×3.2, its ultimate +50%).</li>
          <li>🪑 When a fight starts, empty board slots fill from your bench, first slot first — tanks to the front, ranged to the back.</li>
          <li>🎒 Items carry over: two stay on the new form, the rest go back to your tray.</li>
          <li>✨ The shop highlights what you're collecting: <b>×1 owned</b>, <b>⬆ Digivolve</b> (third copy), <b>→ Greymon</b> (it digivolves into one you have).</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Discovery</h3>
        <ul>
          <li>🔓 Fresh, In-Training and Rookies are <b>always in the shop</b>.</li>
          <li>
            ✨ A <b>Champion or Mega</b> shows up in your shop only once you've <b>raised one yourself</b> this game. The first
            costs three copies of the stage below; after that the shop can offer more for ⛂4 / ⛂5 — the fast way to the
            three you need for the next stage. Every game starts with nothing discovered.
          </li>
          <li>📊 The strip over the shop shows your level's odds; a dim ⛂4 / ⛂5 means nothing of that tier raised yet — those slots roll another tier.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Gold and levels</h3>
        <ul>
          <li>
            💰 You start with <b>{ECONOMY.startGold} gold</b>. Every round: <b>{ECONOMY.baseIncome} gold</b> + interest (1
            per 10 banked, up to 5) + a streak bonus (2+ wins <i>or</i> 2+ losses in a row: +1 to +3) +{" "}
            <b>{ECONOMY.winGold}</b> for a win.
          </li>
          <li>
            ⟳ <b>Reroll</b> the shop for <b>{ECONOMY.rerollCost} gold</b> — it's how you find the copies you're collecting,
            and the lock (🔒) keeps a good shop for next round.
          </li>
          <li>
            💱 <b>Selling</b> gives back everything a Digimon cost — a merged one returns the price of every copy in it.
          </li>
          <li>
            ▲ <b>Buy XP</b>: {ECONOMY.xpCost} gold for {ECONOMY.xpPerBuy} XP; you also get {ECONOMY.passiveXp} XP every round.
            Your level (1–{MAX_LEVEL}) is how many Digimon fit on the board, and it sets the shop's odds:
          </li>
        </ul>
        <table className="guide-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>⛂1 Fresh</th>
              <th>⛂2 In-Tr.</th>
              <th>⛂3 Rookie</th>
              <th>⛂4 Champ.</th>
              <th>⛂5 Mega</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(SHOP_ODDS).map(([lv, odds]) => (
              <tr key={lv}>
                <td>{lv}</td>
                {odds.map((p, i) => (
                  <td key={i}>{p}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="guide-sec">
        <h3>Solo run</h3>
        <ul>
          <li>☠ Every <b>5th round is a boss</b> — beat it for an item and bonus gold.</li>
          <li>🏆 Survive <b>round 15</b> to win the run, then keep going in endless mode.</li>
          <li>👻 The <b>leaderboard</b> stores your best board — anyone can fight it as a risk-free ghost battle.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Keys</h3>
        <p className="guide-keys">
          <kbd>D</kbd> reroll · <kbd>F</kbd> buy XP · <kbd>1</kbd>–<kbd>5</kbd> buy · <kbd>L</kbd> lock shop · <kbd>E</kbd> sell
          selected · <kbd>Space</kbd> start / ready / continue · <kbd>S</kbd> battle speed · drag a unit onto the shop to sell
        </p>
      </section>
    </>
  );
}

/** One form's card: portrait, role, attribute, stats and ultimate (and, for the babies,
 *  what they digivolve into). */
function FormCard({ id, next = false }: { id: string; next?: boolean }) {
  const form = FORMS[id];
  const s = statsFor(form);
  const ult = ultimateFor(id, form.role);
  return (
    <div className="dex-card" style={{ borderColor: ATTR_COLOR[form.attribute] }}>
      <Portrait formId={id} className="dex-portrait" />
      <div className="dex-info">
        <span className="dex-name">{form.name}</span>
        <span className="dex-meta">
          <span style={{ color: ATTR_COLOR[form.attribute] }}>{form.attribute}</span> · {ROLE_ICON[form.role]} {form.role}
        </span>
        <span className="dex-stats">
          ❤️{Math.round(s.hp * HP_SCALE)} ⚔️{s.attack} ⚡{s.attackSpeed.toFixed(2)} 🎯{s.range}
        </span>
        <span className="dex-ult" title={ult.desc}>
          {ult.icon} <b>{ult.name}</b> — {ult.desc}
        </span>
        {next && form.evolvesTo && (
          <span className="dex-next">→ {form.evolvesTo.map((n) => FORMS[n].name).join(" · ")}</span>
        )}
      </div>
    </div>
  );
}

const BABY_IDS = PLAYABLE_IDS.filter((id) => FORMS[id].stage <= 2);
/** The In-Training forms that digivolve into a rookie. */
const BABY_OF: Record<string, string[]> = {};
for (const id of BABY_IDS) for (const n of FORMS[id].evolvesTo ?? []) (BABY_OF[n] ??= []).push(id);

/** Fresh → In-Training → which rookies: the start of every line that has babies. */
function Babies() {
  return (
    <section className="dex-line">
      <div className="dex-line-head">
        <b>Babies</b>
        <span className="dex-note">⛂1 Fresh and ⛂2 In-Training — no attribute, no family; three of a kind digivolve</span>
      </div>
      <div className="dex-tree">
        {([1, 2] as const).map((stage) => (
          <div key={stage} className="dex-stage">
            <span className="dex-stage-name">{STAGE_NAME[stage]}</span>
            {BABY_IDS.filter((id) => FORMS[id].stage === stage).map((id) => (
              <FormCard key={id} id={id} next />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const BOSS_IDS = ALL_FORM_IDS.filter((id) => FORMS[id].bossOnly);

/** Where a boss-only form turns up, read off the boss tables. */
function bossRounds(id: string): string {
  const at: string[] = [];
  WAVES.bosses.forEach((tier, i) => {
    if (tier.some((b) => b.id === id)) at.push(`solo R${(i + 1) * 5}`);
  });
  VS.bosses.forEach((tier, i) => {
    if (tier.some((b) => b.id === id)) at.push(`VS R${(i + 1) * 10}${i === VS.bosses.length - 1 ? "+" : ""}`);
  });
  if (WAVES.endlessBosses.includes(id)) at.push("endless");
  return at.join(" · ");
}

/** The Digimon you meet but can't recruit: wild ones in the waves, and the bosses. */
function Bestiary({ family }: { family: Family | null }) {
  const of = (ids: string[]) => ids.filter((id) => !family || FORMS[id].family === family);
  const wild = of(WILD_IDS);
  const bosses = of(BOSS_IDS);
  return (
    <>
      {wild.length > 0 && (
        <section className="dex-line">
          <div className="dex-line-head">
            <b>Wild Digimon</b>
            <span className="dex-note">in enemy waves and VS wild rounds — they can't be recruited</span>
          </div>
          <div className="dex-tree">
            {([3, 4, 5] as const).map((stage) => (
              <div key={stage} className="dex-stage">
                <span className="dex-stage-name">{STAGE_NAME[stage]}</span>
                {wild
                  .filter((id) => FORMS[id].stage === stage)
                  .map((id) => (
                    <FormCard key={id} id={id} />
                  ))}
              </div>
            ))}
          </div>
        </section>
      )}
      {bosses.length > 0 && (
        <section className="dex-line">
          <div className="dex-line-head">
            <b>Bosses</b>
            <span className="dex-note">met only as bosses; a run or match draws one candidate per boss round</span>
          </div>
          <div className="dex-tree">
            {bosses.map((id) => (
              <div key={id} className="dex-stage">
                <span className="dex-stage-name">{bossRounds(id)}</span>
                <FormCard id={id} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Digimon() {
  const [family, setFamily] = useState<Family | null>(null);
  // lines by name: rookie → its champions → their megas
  const lines = useMemo(
    () =>
      [...ROOKIE_IDS]
        .sort((a, b) => FORMS[a].name.localeCompare(FORMS[b].name))
        .map((rookie) => {
          const champions = FORMS[rookie].evolvesTo ?? [];
          const megas = [...new Set(champions.flatMap((c) => FORMS[c].evolvesTo ?? []))];
          // champion branches that lead to different megas: say which mega comes from which
          const from: Record<string, string> = {};
          for (const m of megas) {
            const sources = champions.filter((c) => FORMS[c].evolvesTo?.includes(m));
            if (sources.length < champions.length) from[m] = sources.map((c) => FORMS[c].name).join(" / ");
          }
          return { rookie, champions, megas, from };
        }),
    [],
  );
  return (
    <>
      <p className="guide-intro">
        {lines.length} lines from {BABY_IDS.length} babies, {PLAYABLE_IDS.length} forms to collect — plus {WILD_IDS.length}{" "}
        wild Digimon and {BOSS_IDS.length} bosses you can only fight. Stats are per role and stage; what sets a Digimon
        apart is its attribute, family and ultimate.
      </p>
      <div className="guide-chips">
        <button className={`guide-chip${family === null ? " on" : ""}`} onClick={() => setFamily(null)}>
          All
        </button>
        {FAMILIES.map((f) => (
          <button
            key={f}
            className={`guide-chip${family === f ? " on" : ""}`}
            style={{ color: FAMILY_COLOR[f] }}
            onClick={() => setFamily(family === f ? null : f)}
          >
            {f}
          </button>
        ))}
      </div>
      {!family && <Babies />}
      {lines
        .filter((l) => !family || [l.rookie, ...l.champions, ...l.megas].some((id) => FORMS[id].family === family))
        .map((l) => (
          <section key={l.rookie} className="dex-line">
            <div className="dex-line-head">
              <b>{FORMS[l.rookie].name} line</b>
              <span className="dex-note">
                {BABY_OF[l.rookie] ? `from ${BABY_OF[l.rookie].map((b) => FORMS[b].name).join(" / ")}` : "starts at Rookie"}
              </span>
              <span style={{ color: FAMILY_COLOR[FORMS[l.rookie].family] }}>{FORMS[l.rookie].family}</span>
              {(l.champions.length > 1 || l.megas.length > 1) && <span className="dex-branch">🔀 branches</span>}
            </div>
            <div className="dex-tree">
              {[[l.rookie], l.champions, l.megas].map((stage, si) => (
                <div key={si} className="dex-stage">
                  <span className="dex-stage-name">{STAGE_NAME[si + 3]}</span>
                  {stage.map((id, i) => (
                    <div key={id}>
                      {l.from[id] && si === 2 ? (
                        <span className="dex-or">from {l.from[id]}</span>
                      ) : (
                        i > 0 && <span className="dex-or">or</span>
                      )}
                      <FormCard id={id} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      <Bestiary family={family} />
    </>
  );
}

function Synergies() {
  return (
    <>
      <section className="guide-sec">
        <h3>The attribute triangle</h3>
        <p className="guide-tri">
          <b style={{ color: ATTR_COLOR.Vaccine }}>Vaccine</b> ▶ <b style={{ color: ATTR_COLOR.Virus }}>Virus</b> ▶{" "}
          <b style={{ color: ATTR_COLOR.Data }}>Data</b> ▶ <b style={{ color: ATTR_COLOR.Vaccine }}>Vaccine</b>
        </p>
        <p>
          Hitting the attribute you beat deals <b>×{attributeMultiplier("Vaccine", "Virus").toFixed(2)}</b> damage; hitting
          the one that beats you, <b>×{attributeMultiplier("Virus", "Vaccine").toFixed(2)}</b>. Scout the next opponent and
          bring the counter.
        </p>
      </section>
      <section className="guide-sec">
        <h3>Synergies</h3>
        <p>
          Different Digimon of the same attribute or family on the board unlock a bonus (copies of one form count once).
          Babies count for none — unless a Digimental gives them a family.
        </p>
        <div className="syn-grid">
          {TRAITS.map((t) => {
            const members = Object.values(FORMS)
              .filter((f) => isPlayable(f) && f.stage === 3 && (f.attribute === t.key || f.family === t.key))
              .map((f) => f.id);
            return (
              <div key={t.key} className="syn-card" style={{ borderColor: t.color }}>
                <b style={{ color: t.color }}>{t.name}</b>
                <span className="syn-kind">{t.kind}</span>
                {t.tiers.map((tier) => (
                  <span key={tier.need} className="syn-tier">
                    <b>{tier.need}</b> {tier.desc}
                  </span>
                ))}
                <span className="syn-members">
                  {members.map((id) => (
                    <Portrait key={id} formId={id} className="syn-portrait" />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <p className="guide-note">Portraits show the rookies; a branch can change attribute or family when it evolves.</p>
      </section>
    </>
  );
}

function Items() {
  return (
    <>
      <section className="guide-sec">
        <h3>Base items</h3>
        <p>
          Won in battles, bosses and VS loot. Click an item, then a Digimon, to equip it — two per unit. 🥚 Digitama is
          rarer: bosses and the VS carousel.
        </p>
        <div className="item-grid">
          {COMPONENT_IDS.map((id) => (
            <div key={id} className="item-card">
              <span className="item-emoji">{ITEMS[id].emoji}</span>
              <b>{ITEMS[id].name}</b>
              <span>{ITEMS[id].desc}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="guide-sec">
        <h3>Fusion recipes</h3>
        <p>
          Any two base items fuse into a stronger one: pick one, then a glowing partner in your tray — or put the second
          on a Digimon that holds the first, and they fuse right there. The Crests, Lightning Coil, Spike Shell, Rage Chip
          and Blue Card do something of their own in battle. A <b>Digimental</b> (Digitama + a base item) makes its holder
          count for a family — a baby too; two Digitama make a <b>Digivice</b>: one more Digimon on the board.
        </p>
        <div className="fuse-wrap">
          <table className="guide-table fuse">
            <thead>
              <tr>
                <th />
                {COMPONENT_IDS.map((id) => (
                  <th key={id} title={ITEMS[id].name}>
                    {ITEMS[id].emoji}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPONENT_IDS.map((a) => (
                <tr key={a}>
                  <th title={ITEMS[a].name}>{ITEMS[a].emoji}</th>
                  {COMPONENT_IDS.map((b) => {
                    const r = fuseResult(a, b);
                    return (
                      <td key={b} title={r ? `${ITEMS[r].name}: ${ITEMS[r].desc}` : ""}>
                        {r ? ITEMS[r].emoji : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="item-grid">
          {FUSED_ITEM_IDS.map((id) => (
            <div key={id} className="item-card fused">
              <span className="item-emoji">{ITEMS[id].emoji}</span>
              <b>{ITEMS[id].name}</b>
              <span>{ITEMS[id].desc}</span>
              <span className="item-from">
                {ITEMS[id].from?.map((f) => ITEMS[f].emoji).join(" + ")}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="guide-sec">
        <h3>Relics</h3>
        <p>Complete items with no recipe — bosses and the VS carousel hand them out. Counters to freezes and to healing.</p>
        <div className="item-grid">
          {RELIC_IDS.map((id) => (
            <div key={id} className="item-card fused">
              <span className="item-emoji">{ITEMS[id].emoji}</span>
              <b>{ITEMS[id].name}</b>
              <span>{ITEMS[id].desc}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Versus() {
  const stages = VS.stageDamage.map((d, i) => ({ stage: i + 1, rounds: `${i * VS.stageLength + 1}–${(i + 1) * VS.stageLength}`, damage: d }));
  return (
    <>
      <section className="guide-sec">
        <h3>A VS match (2–8 tamers)</h3>
        <ul>
          <li>🌐 <b>Find a match</b> plays strangers; <b>Create lobby</b> gives a code for friends.</li>
          <li>⚔ Every fight round you face one other tamer — everyone meets everyone before rematches. With an odd count, one of you fights a 👻 <b>ghost copy</b> of someone's board.</li>
          <li>🐾 Rounds 1–2 and every 5th: <b>wild Digimon</b> (loot). ☠ Every 10th: a <b>boss</b> (a fused item for the win).</li>
          <li>🎠 The 3rd round of each stage opens with the <b>carousel</b>: one shared set of items, lowest HP picks first.</li>
          <li>✨ Rounds {AUGMENT_ROUNDS.join(", ")}: pick an <b>augment</b> (1 of 3, one reroll). Everyone sees your picks.</li>
          <li>
            🧪 <b>Shared pool</b>: each Digimon exists in {POOL_COPIES[1]} / {POOL_COPIES[2]} / {POOL_COPIES[3]} /{" "}
            {POOL_COPIES[4]} / {POOL_COPIES[5]} copies (tiers 1–5) for the whole lobby — what others collect, you can't.
          </li>
          <li>⏱ {VS.planSeconds} s to plan ({VS.planSecondsTouch} on phones), then you're locked in automatically.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Damage for a loss</h3>
        <p>The stage's damage plus 1 for every enemy unit left standing — early losses are cheap, late ones decide the match.</p>
        <table className="guide-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Rounds</th>
              <th>Damage</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stage}>
                <td>{s.stage}</td>
                <td>{s.rounds}</td>
                <td>{s.damage} + survivors</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="guide-sec">
        <h3>Augments</h3>
        <div className="item-grid">
          {AUGMENT_IDS.map((id) => {
            const a = AUGMENTS[id];
            return (
              <div key={id} className={`item-card aug ${a.kind}`}>
                <span className="item-emoji">{a.emoji}</span>
                <b>{a.name}</b>
                <span>{a.desc}</span>
                <span className="item-from">{a.family ?? a.kind}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="guide-sec">
        <h3>Rating</h3>
        <p>Your final place moves your VS rating (shown on the leaderboard). In an 8-tamer match:</p>
        <p className="guide-ratings">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>
              #{i + 1} <b className={ratingDelta(8, i + 1) >= 0 ? "up" : "down"}>{ratingDelta(8, i + 1) >= 0 ? "+" : ""}{ratingDelta(8, i + 1)}</b>
            </span>
          ))}
        </p>
        <p className="guide-note">Smaller lobbies move it less (a 1v1 win is +{ratingDelta(2, 1)}).</p>
      </section>
    </>
  );
}
