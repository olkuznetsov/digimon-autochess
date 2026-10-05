import { useMemo, useState, type CSSProperties } from "react";
import {
  FORMS,
  ALL_FORM_IDS,
  ROOKIE_IDS,
  PLAYABLE_IDS,
  WILD_IDS,
  ATTR_COLOR,
  ELEMENT_COLOR,
  ELEMENT_ICON,
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
import type { Element, Role } from "../game/types";
import { Portrait } from "./Portrait";
import { STAGE_JP } from "./kit";

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
const ELEMENTS = (Object.keys(ELEMENT_COLOR) as Element[]).filter((e) => e !== "Neutral");

export function Guide({ onClose, initial = "basics" }: { onClose: () => void; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <span className="guide-title">
            TAMER'S GUIDE <span className="jp">図鑑</span>
          </span>
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
          <li>🔀 Most stages <b>branch</b> — you pick the evolution (3 Koromon: Agumon, Guilmon or Dracomon), and with it the attribute and element.</li>
          <li>🍼 <b>Babies</b> (Fresh, In-Training) are <b>Free</b>: neutral to every attribute. Fresh have no element yet; In-Training already carry one, as in Cyber Sleuth. Raise them into Rookies.</li>
          <li>⭐ A <b>Mega</b> has nowhere to digivolve: three copies star it up — <b>★★</b> (×1.8 HP and attack), and three ★★ make <b>★★★</b> (×3.2, its ultimate +50%).</li>
          <li>🪑 When a fight starts, empty board slots fill from your bench, first slot first — tanks to the front, ranged to the back.</li>
          <li>🎒 Items carry over: three stay on the new form, the rest go back to your tray.</li>
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
        <h3>Your partner</h3>
        <ul>
          <li>🏠 The <b>main menu</b> is home to your partner Digimon: pick one of five Fresh in Primary Village and hatch it. It levels up with the XP you earn while it's at your side — In-Training at level 3, Rookie at 6, Champion at 12, Mega at 20 (★★ at 30, ★★★ at 40).</li>
          <li>🍖 <b>Care for it</b>, like a V-Pet: fullness drops through the day and meat fills it (a boss beaten brings a piece, and so do a run played past round 5 and a VS match; the larder holds 12); petting, feeding, training (once an hour, a little XP) and winning lift its mood; the bond's five hearts grow from your care and only fade if it's left starving. Nothing ever dies. A <b>happy</b> partner (full mood) earns you +20% XP, a <b>best friend</b> (five hearts) another +20%.</li>
          <li>📟 The <b>Digivice</b> (your avatar, or the button on the partner card) holds up to six partners: hatch another egg or call a resting one back to your side. The partner at your side is your avatar and the only one growing; the others wait just as you left them. Partners are purely cosmetic — they never touch a fight or your records.</li>
          <li>✨ When it's ready, you choose who it becomes — the branches on offer follow the elements and attributes you field most.</li>
          <li>🎖 Tamer XP comes from solo runs and VS matches. A run counts its XP as you play — 10 for a battle won, 5 for one lost, 25 for a boss, 100 for winning the run — and pays it when the run ends, with a <b>run report</b>: game over, or once round 15's final boss is fought. Endless rounds earn no XP. Adventure's <b>crests</b> mark your milestones. Your partner is yours alone — it never changes a fight.</li>
          <li>🔑 <b>Sign in with Google</b> on the title screen (or later, in your tamer file) to keep your tamer, partner and run on every device: your progress syncs by itself. Signing in on a second device takes whichever tamer has more XP.</li>
          <li>🎚️ <b>Difficulty</b> (menu, before a new run): <b>Easy</b> — weaker enemies, gentler losses, ×0.75 tamer XP, and the run stays off the leaderboard; <b>Normal</b>; <b>Hard</b> — tougher enemies, harsher losses, ×1.5 tamer XP.</li>
          <li>🥚 <b>Primary Village mode</b> (menu, VILLAGE, before a new run): a Digimon that falls in battle hatches again, in the same fight, as its line's baby (Greymon → Botamon; a line with no babies comes back as its Rookie) — once a fight, without its items. The wild ones hatch too, and so does a boss that falls for good (a boss's second phase comes first; the data-eaters don't come back). A playful variant: it stays off the leaderboard.</li>
          <li>👻 <b>Ghost ladder</b> (menu → GHOST): your solo run's board fights a ghost — another tamer's board from the same round (the bot's, while the ladder fills up). Wins raise your ladder rating (Elo against the ghost's), losses lower it; leagues go In-Training → Rookie (1050) → Champion (1150) → Mega (1300). Your run is untouched, and your board joins the ghosts for others to meet.</li>
          <li>🤝 <b>Friends</b> (menu, signed in): share your tamer code — when a friend enters it, you're friends on both sides. See who's online and what they're up to, <b>JOIN</b> the VS lobby a friend is in, or <b>INVITE</b> one to yours (a room opens if you aren't in one); their invite pops up wherever you are. Your partner is your avatar there and on the leaderboard.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Solo run</h3>
        <ul>
          <li>☠ Every <b>5th round is a boss</b> — beat it for an item and bonus gold.</li>
          <li>
            🏆 <b>Round 15</b> is the final boss, <b>Lucemon Falldown Mode</b> — and when he falls, he rises again as{" "}
            <b>Satan Mode</b>. Beat both to win the run, then keep going in endless mode.
          </li>
          <li>👻 The <b>leaderboard</b> stores your best board — anyone can fight it as a risk-free ghost battle.</li>
        </ul>
      </section>
      <section className="guide-sec">
        <h3>Keys</h3>
        <p className="guide-keys">
          <kbd>D</kbd> reroll · <kbd>F</kbd> buy XP · <kbd>1</kbd>–<kbd>5</kbd> buy · <kbd>L</kbd> lock shop · <kbd>E</kbd> sell
          selected · <kbd>Space</kbd> start / ready / continue · <kbd>S</kbd> battle speed · drag a unit onto the shop to sell ·
          mouse wheel zooms toward the pointer (a pinch on a phone), a middle click resets the view
        </p>
      </section>
    </>
  );
}

/** One form's card: portrait, role, attribute, stats and ultimate (and, for the babies,
 *  what they digivolve into). */
/** Does a form's name match the search (lower-cased)? */
const hits = (q: string, id: string) => !!q && FORMS[id].name.toLowerCase().includes(q);

/** One form's card as Izzy's Digimon Analyzer shows it: a window with the name, the picture,
 *  the data fields and the special move (and, for the babies, what they digivolve into). */
function FormCard({ id, next = false, hit = false }: { id: string; next?: boolean; hit?: boolean }) {
  const form = FORMS[id];
  const s = statsFor(form);
  const ult = ultimateFor(id, form.role);
  return (
    <div className={`dex-card az${hit ? " hit" : ""}`} style={{ "--attr": ATTR_COLOR[form.attribute] } as CSSProperties}>
      <div className="az-head">
        <span className="az-dots">
          <i />
          <i />
          <i />
        </span>
        <b className="dex-name">{form.name.toUpperCase()}</b>
        <span className="az-jp">{STAGE_JP[form.stage]}</span>
      </div>
      <div className="az-body">
        <Portrait formId={id} className="dex-portrait az-pic" />
        <dl className="az-data">
          <dt>LEVEL</dt>
          <dd>{STAGE_NAME[form.stage]}</dd>
          <dt>TYPE</dt>
          <dd>
            <span style={{ color: ELEMENT_COLOR[form.element] }}>
              {ELEMENT_ICON[form.element]} {form.element}
            </span>{" "}
            · <span style={{ color: ATTR_COLOR[form.attribute] }}>{form.attribute}</span>
          </dd>
          <dt>ROLE</dt>
          <dd>
            {ROLE_ICON[form.role]} {form.role}
          </dd>
          <dt>DATA</dt>
          <dd className="az-nums">
            HP {Math.round(s.hp * HP_SCALE)} · ATK {s.attack} · SPD {s.attackSpeed.toFixed(2)} · RNG {s.range}
          </dd>
        </dl>
      </div>
      <div className="az-move" title={ult.desc}>
        <span>SPECIAL MOVE</span>
        <b>
          {ult.icon} {ult.name}
        </b>
        <small>{ult.desc}</small>
      </div>
      {next && form.evolvesTo && (
        <div className="az-next">
          <span>DIGIVOLVES</span> {form.evolvesTo.map((n) => FORMS[n].name).join(" · ")}
        </div>
      )}
    </div>
  );
}

const BABY_IDS = PLAYABLE_IDS.filter((id) => FORMS[id].stage <= 2);
/** The In-Training forms that digivolve into a rookie. */
const BABY_OF: Record<string, string[]> = {};
for (const id of BABY_IDS) for (const n of FORMS[id].evolvesTo ?? []) (BABY_OF[n] ??= []).push(id);

/** Fresh → In-Training → which rookies: the start of every line that has babies. */
function Babies({ q }: { q: string }) {
  if (q && !BABY_IDS.some((id) => hits(q, id))) return null;
  return (
    <section className="dex-line">
      <div className="dex-line-head">
        <b>Babies</b>
        <span className="dex-note">⛂1 Fresh and ⛂2 In-Training — Free, neutral to every attribute; In-Training have an element; three of a kind digivolve</span>
      </div>
      <div className="dex-tree">
        {([1, 2] as const).map((stage) => (
          <div key={stage} className="dex-stage">
            <span className="dex-stage-name">{STAGE_NAME[stage]}</span>
            {BABY_IDS.filter((id) => FORMS[id].stage === stage).map((id) => (
              <FormCard key={id} id={id} next hit={hits(q, id)} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const BOSS_IDS = ALL_FORM_IDS.filter((id) => FORMS[id].bossOnly);

/** The bosses with a mechanic of their own (battle.ts), and their minions. */
const BOSS_NOTE: Record<string, string> = {
  eater: "DEVOUR — every 5 s it bites 12% of the max HP off your weakest Digimon, wherever it stands, heals as much and grows 4% stronger. Shield the weak, or bring it down fast.",
  mothereater: "BROOD — every 8 s an Eater Bit hatches beside her (two at most); while any lives she takes 40% less damage. Clear the brood.",
};

/** Where a boss-only form turns up, read off the boss tables. */
function bossRounds(id: string): string {
  if (id === "eaterbit" || id === "eaterlegion") return "the Eaters' minion";
  const at: string[] = [];
  const final = (i: number) => (i === WAVES.bosses.length - 1 ? " — the final boss" : "");
  WAVES.bosses.forEach((tier, i) => {
    if (tier.some((b) => b.id === id)) at.push(`solo R${(i + 1) * 5}${final(i)}`);
    if (tier.some((b) => b.phase2?.id === id)) at.push(`solo R${(i + 1) * 5}, his second phase`);
  });
  VS.bosses.forEach((tier, i) => {
    const r = `VS R${(i + 1) * 10}${i === VS.bosses.length - 1 ? "+" : ""}`;
    if (tier.some((b) => b.id === id)) at.push(r);
    if (tier.some((b) => b.phase2?.id === id)) at.push(`${r}, the second phase`);
  });
  if (WAVES.endlessBosses.includes(id)) at.push("endless");
  return at.join(" · ");
}

/** The Digimon you meet but can't recruit: wild ones in the waves, and the bosses. */
function Bestiary({ element, q }: { element: Element | null; q: string }) {
  const of = (ids: string[]) => ids.filter((id) => (!element || FORMS[id].element === element) && (!q || hits(q, id)));
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
                    <FormCard key={id} id={id} hit={hits(q, id)} />
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
                <FormCard id={id} hit={hits(q, id)} />
                {BOSS_NOTE[id] && <span className="dex-note boss-mech">{BOSS_NOTE[id]}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Digimon() {
  const [element, setElement] = useState<Element | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
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
      {/* Izzy's laptop */}
      <div className="analyzer-bar">
        <span className="az-dot" />
        DIGIMON ANALYZER <span className="jp">デジモンアナライザー</span>
        <span className="az-count">{PLAYABLE_IDS.length} DATA</span>
      </div>
      <p className="guide-intro">
        {lines.length} lines from {BABY_IDS.length} babies, {PLAYABLE_IDS.length} forms to collect — plus {WILD_IDS.length}{" "}
        wild Digimon and {BOSS_IDS.length} bosses you can only fight. Stats are per role and stage; what sets a Digimon
        apart is its attribute, element and ultimate.
      </p>
      <input
        className="guide-search"
        type="search"
        placeholder="🔍 Find a Digimon by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="guide-chips">
        <button className={`guide-chip${element === null ? " on" : ""}`} onClick={() => setElement(null)}>
          All
        </button>
        {ELEMENTS.map((e) => (
          <button
            key={e}
            className={`guide-chip${element === e ? " on" : ""}`}
            style={{ color: ELEMENT_COLOR[e] }}
            onClick={() => setElement(element === e ? null : e)}
          >
            {ELEMENT_ICON[e]} {e}
          </button>
        ))}
      </div>
      {!element && <Babies q={q} />}
      {q && ![...lines.flatMap((l) => [l.rookie, ...l.champions, ...l.megas]), ...BABY_IDS, ...WILD_IDS, ...BOSS_IDS].some((id) => hits(q, id)) && (
        <p className="guide-note">No Digimon called “{query.trim()}”.</p>
      )}
      {lines
        .filter((l) => !element || [l.rookie, ...l.champions, ...l.megas].some((id) => FORMS[id].element === element))
        .filter((l) => !q || [l.rookie, ...l.champions, ...l.megas].some((id) => hits(q, id)))
        .map((l) => (
          <section key={l.rookie} className="dex-line">
            <div className="dex-line-head">
              <b>{FORMS[l.rookie].name} line</b>
              <span className="dex-note">
                {BABY_OF[l.rookie] ? `from ${BABY_OF[l.rookie].map((b) => FORMS[b].name).join(" / ")}` : "starts at Rookie"}
              </span>
              <span style={{ color: ELEMENT_COLOR[FORMS[l.rookie].element] }}>
                {ELEMENT_ICON[FORMS[l.rookie].element]} {FORMS[l.rookie].element}
              </span>
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
                      <FormCard id={id} hit={hits(q, id)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      <Bestiary element={element} q={q} />
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
          Different Digimon of the same attribute or element on the board unlock a bonus (copies of one form count once).
          The elements are Cyber Sleuth's eight, each with its own way to fight — and at 4 each gets a mechanic of its
          own: Fire burns, Water keeps mana, Plant grows thorns, Electric chains lightning, Earth holds a last stand,
          Wind dodges, Light shields a wounded ally, Dark wounds healing. Free babies count for no attribute, and Fresh
          ones have no element yet — unless a Digimental gives them one.
        </p>
        <div className="syn-grid">
          {TRAITS.map((t) => {
            // attributes: their rookies; elements: every Digimon of theirs, In-Training to Mega
            const members = Object.values(FORMS)
              .filter((f) =>
                t.kind === "attribute" ? isPlayable(f) && f.stage === 3 && f.attribute === t.key : isPlayable(f) && f.element === t.key,
              )
              .sort((a, b) => a.stage - b.stage)
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
        <p className="guide-note">Attributes show their rookies, elements every Digimon of theirs; a branch can change attribute or element when it evolves.</p>
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
          Won in battles, bosses and VS loot. Click an item, then a Digimon, to equip it — three per unit. 🥚 Digitama is
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
          count for an element — a baby too; two Digitama make a <b>Digivice</b>: one more Digimon on the board, straight from the item tray — nobody needs to hold it.
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
                <span className="item-from">{a.element ?? a.kind}</span>
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
