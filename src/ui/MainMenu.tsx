import { lazy, Suspense, useEffect, useState } from "react";
import { FORMS, ELEMENT_COLOR, ELEMENT_ICON, STAGE_NAME, ATTR_COLOR } from "../game/creatures";
import { useGame } from "../game/store";
import { useProfile } from "../profile/store";
import {
  CRESTS,
  PARTNER_STARTERS,
  favoriteElement,
  favoriteForm,
  levelFor,
  nextGrowthLevel,
  partnerStarCap,
} from "../profile/profile";
import { playerName } from "../net/leaderboard";
import { Portrait } from "./Portrait";
import { sfx } from "../audio/sfx";

const Guide = lazy(() => import("./Guide").then((m) => ({ default: m.Guide })));
const LeaderboardModal = lazy(() => import("./LeaderboardModal").then((m) => ({ default: m.LeaderboardModal })));
const SettingsModal = lazy(() => import("./SettingsModal").then((m) => ({ default: m.SettingsModal })));

/** Top left: the partner as the tamer's avatar, ringed by their level's progress. */
function TamerBadge({ onAvatar }: { onAvatar: () => void }) {
  const xp = useProfile((s) => s.xp);
  const partner = useProfile((s) => s.partner);
  const { level, into, need } = levelFor(xp);
  const [name, setName] = useState(playerName());
  const [editing, setEditing] = useState(false);
  const r = 27;
  const c = 2 * Math.PI * r;
  const save = () => {
    const n = name.trim().slice(0, 16) || "Tamer";
    setName(n);
    setEditing(false);
    try {
      localStorage.setItem("dac-name", n);
    } catch {
      /* not saved: still shown for this visit */
    }
  };
  return (
    <div className="tamer-badge">
      <div className="tamer-avatar" onClick={onAvatar} title="Your tamer card">
        <svg viewBox="0 0 64 64" className="tamer-ring" aria-hidden="true">
          <circle cx="32" cy="32" r={r} className="ring-bg" />
          <circle cx="32" cy="32" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - into / need)} />
        </svg>
        {partner ? <Portrait formId={partner.formId} className="tamer-portrait" /> : <span className="tamer-egg">🥚</span>}
        <span className="tamer-level">{level}</span>
      </div>
      <div className="tamer-id">
        {editing ? (
          <input
            className="tamer-name-input"
            value={name}
            autoFocus
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <button className="tamer-name" onClick={() => setEditing(true)} title="Change your name">
            {name} <span className="tamer-edit">✎</span>
          </button>
        )}
        <span className="tamer-xp">
          Tamer level {level} · {into} / {need} XP
        </span>
      </div>
    </div>
  );
}

/** Left: the tamer card — records and Adventure's crests. */
function TamerCard() {
  const stats = useProfile((s) => s.stats);
  const crests = useProfile((s) => s.crests);
  const fav = favoriteForm(stats);
  const el = favoriteElement(stats);
  const rows: [string, string][] = [
    ["Solo runs", `${stats.runsWon} won / ${stats.runs}`],
    ["Best round", stats.bestRound ? String(stats.bestRound) : "—"],
    ["Battles won", stats.battles ? `${Math.round((100 * stats.battlesWon) / stats.battles)}%` : "—"],
    ["Bosses beaten", String(stats.bosses)],
    ["VS matches", stats.vsMatches ? `${stats.vsMatches} · ${stats.vsWins} won` : "—"],
    ["Digimon raised", String(stats.raised.length)],
  ];
  return (
    <aside className="tamer-card">
      <div className="tamer-card-title">Tamer card</div>
      {rows.map(([k, v]) => (
        <div key={k} className="tamer-row">
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
      <div className="tamer-row">
        <span>Favorite</span>
        <b className="tamer-fav">
          {fav ? (
            <>
              <Portrait formId={fav} className="tamer-fav-portrait" /> {FORMS[fav].name}
            </>
          ) : (
            "—"
          )}
        </b>
      </div>
      <div className="tamer-row">
        <span>Top element</span>
        <b style={el ? { color: ELEMENT_COLOR[el] } : undefined}>{el ? `${ELEMENT_ICON[el]} ${el}` : "—"}</b>
      </div>
      <div className="tamer-card-title crests-title">Crests</div>
      <div className="crests">
        {CRESTS.map((c) => {
          const on = crests.includes(c.id);
          return (
            <span
              key={c.id}
              className={`crest${on ? " on" : ""}`}
              style={on ? { color: c.color, borderColor: c.color } : undefined}
              title={`Crest of ${c.name} — ${c.desc}${on ? "" : " (locked)"}`}
            >
              {c.name}
            </span>
          );
        })}
      </div>
    </aside>
  );
}

/** Bottom middle: who the partner is and when it grows next. */
function PartnerPanel({ onEvolve }: { onEvolve: () => void }) {
  const partner = useProfile((s) => s.partner);
  const xp = useProfile((s) => s.xp);
  const options = useProfile((s) => s.evolutionOptions)();
  const starUp = useProfile((s) => s.starUpPartner);
  if (!partner) return null;
  const form = FORMS[partner.formId];
  const level = levelFor(xp).level;
  const canStar = form.stage >= 5 && partner.star < partnerStarCap(level);
  const next = nextGrowthLevel(form.stage, partner.star);
  return (
    <div className="partner-panel">
      <div className="partner-name">
        {form.name}
        {partner.star > 1 && <span className="up-star"> {"★".repeat(partner.star)}</span>}
      </div>
      <div className="partner-sub">
        <span style={{ color: ATTR_COLOR[form.attribute] }}>{form.attribute}</span> ·{" "}
        <span style={{ color: ELEMENT_COLOR[form.element] }}>
          {ELEMENT_ICON[form.element]} {form.element}
        </span>{" "}
        · {STAGE_NAME[form.stage]}
      </div>
      {options.length > 0 ? (
        <button className="partner-grow" onClick={onEvolve}>
          ✨ Ready to digivolve
        </button>
      ) : canStar ? (
        <button className="partner-grow" onClick={starUp}>
          ⭐ Star up
        </button>
      ) : (
        <div className="partner-next">{next ? `Next digivolution at tamer level ${next}` : "Fully grown"}</div>
      )}
      <div className="partner-hint">Tap your partner to pet it</div>
    </div>
  );
}

/** Right: the modes. */
function ModeButtons({ onPanel }: { onPanel: (p: "guide" | "lb" | "settings") => void }) {
  const setScreen = useProfile((s) => s.setScreen);
  const round = useGame((s) => s.round);
  const units = useGame((s) => s.units);
  const pvp = useGame((s) => s.pvp);
  const ongoing = !pvp && (round > 1 || units.length > 0);
  const [soon, setSoon] = useState<string | null>(null);
  const go = (vs = false) => {
    sfx.click();
    useProfile.setState({ openOnGame: vs ? "vs" : null });
    setScreen("game");
  };
  return (
    <nav className="menu-modes">
      <button className="mode-btn primary" onClick={() => go()}>
        ⚔ {ongoing ? `Continue run · round ${round}` : "Solo run"}
      </button>
      {ongoing && (
        <button
          className="mode-btn"
          onClick={() => {
            useGame.getState().reset();
            go();
          }}
        >
          ↻ New run
        </button>
      )}
      <button className="mode-btn" onClick={() => go(true)}>
        👥 VS
      </button>
      <button className="mode-btn soon" onClick={() => setSoon("Ghost ladder")}>
        👻 Ghost ladder <span className="soon-tag">soon</span>
      </button>
      <button className="mode-btn soon" onClick={() => setSoon("Friends")}>
        🤝 Friends <span className="soon-tag">soon</span>
      </button>
      <div className="mode-row">
        <button className="mode-btn small" onClick={() => onPanel("lb")} title="Leaderboard">
          🏆
        </button>
        <button className="mode-btn small" onClick={() => onPanel("guide")} title="Tamer's Guide">
          📖
        </button>
        <button className="mode-btn small" onClick={() => onPanel("settings")} title="Settings">
          ⚙️
        </button>
      </div>
      {soon && <div className="mode-soon">{soon} is on its way</div>}
    </nav>
  );
}

/** First visit: pick a Fresh to raise. */
function PartnerChoice() {
  const choose = useProfile((s) => s.choosePartner);
  return (
    <div className="evo-overlay">
      <div className="evo-modal partner-choice">
        <div className="evo-title">Choose your partner</div>
        <div className="partner-choice-sub">A Digimon to raise. It grows as you play, and you choose who it becomes.</div>
        <div className="evo-options">
          {PARTNER_STARTERS.map((id) => (
            <button
              key={id}
              className="evo-card"
              onClick={() => {
                sfx.evolve();
                choose(id);
              }}
            >
              <Portrait formId={id} className="evo-portrait" />
              <span className="evo-stage">Fresh</span>
              <span className="evo-name">{FORMS[id].name}</span>
              <span className="partner-choice-next">→ {(FORMS[id].evolvesTo ?? []).map((n) => FORMS[n].name).join(" · ")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The partner's digivolution: up to three forms, the first one the tamer's style points to. */
function PartnerEvolution({ onClose }: { onClose: () => void }) {
  const options = useProfile((s) => s.evolutionOptions)();
  const evolve = useProfile((s) => s.evolvePartner);
  const partner = useProfile((s) => s.partner);
  const played = useProfile((s) => s.stats.battles > 0);
  if (!partner || !options.length) return null;
  return (
    <div className="evo-overlay" onClick={onClose}>
      <div className="evo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="evo-title">
          Digivolve <span style={{ color: ATTR_COLOR[FORMS[partner.formId].attribute] }}>{FORMS[partner.formId].name}</span> ➜
        </div>
        <div className="evo-options">
          {options.map((id, i) => {
            const form = FORMS[id];
            return (
              <button
                key={id}
                className="evo-card"
                style={{ borderColor: ATTR_COLOR[form.attribute] }}
                onClick={() => {
                  sfx.evolve();
                  evolve(id);
                  onClose();
                }}
              >
                {i === 0 && played && options.length > 1 && <span className="style-pick">Your style</span>}
                <Portrait formId={id} className="evo-portrait" />
                <span className="evo-stage">{STAGE_NAME[form.stage]}</span>
                <span className="evo-name">{form.name}</span>
                <span className="evo-tags">
                  <span className="evo-tag" style={{ background: ATTR_COLOR[form.attribute] }}>
                    {form.attribute}
                  </span>
                  <span className="evo-tag fam" style={{ color: ELEMENT_COLOR[form.element], borderColor: ELEMENT_COLOR[form.element] }}>
                    {ELEMENT_ICON[form.element]} {form.element}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="evo-hint">The branches on offer follow the elements and attributes you field most.</div>
      </div>
    </div>
  );
}

/** The partner's growth moment, like a board digivolution. */
function GrowthBanner() {
  const grew = useProfile((s) => s.grew);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    // only a growth that just happened (coming back to the menu doesn't replay it)
    if (!grew || Date.now() - grew.key > 2600) return;
    setShown(grew.key);
    const t = setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(t);
  }, [grew]);
  if (!grew || shown !== grew.key) return null;
  const from = FORMS[grew.from];
  const to = FORMS[grew.to];
  return (
    <div className="evo-banner" key={grew.key}>
      <div className="evo-banner-label">{grew.from === grew.to ? "STAR UP" : "DIGIVOLVING"}</div>
      <div className="evo-banner-text">
        {grew.from !== grew.to && (
          <>
            <span className="evo-banner-side">
              <Portrait formId={grew.from} className="evo-banner-portrait" />
              {from.name}
            </span>
            <span className="evo-banner-arrow">▸</span>
          </>
        )}
        <span className="evo-banner-side" style={{ color: ATTR_COLOR[to.attribute] }}>
          <Portrait formId={grew.to} className="evo-banner-portrait to" />
          {to.name} {grew.star > 1 ? "★".repeat(grew.star) : ""}
        </span>
      </div>
    </div>
  );
}

/** The main menu: the tamer, their partner on its pedestal (MenuStage, in the 3D scene) and
 *  the ways to play. */
export function MainMenu() {
  const partner = useProfile((s) => s.partner);
  const [evolving, setEvolving] = useState(false);
  const [panel, setPanel] = useState<"guide" | "lb" | "settings" | null>(null);
  // phones: the tamer card slides in from the avatar
  const [card, setCard] = useState(false);
  return (
    <div className={`menu${card ? " card-open" : ""}`} onClick={() => card && setCard(false)}>
      <TamerBadge onAvatar={() => setCard((c) => !c)} />
      <div className="menu-title">
        DIGIMON <span>AUTO CHESS</span>
      </div>
      <TamerCard />
      <PartnerPanel onEvolve={() => setEvolving(true)} />
      <ModeButtons onPanel={setPanel} />
      {!partner && <PartnerChoice />}
      {evolving && <PartnerEvolution onClose={() => setEvolving(false)} />}
      <GrowthBanner />
      <Suspense fallback={null}>
        {panel === "guide" && <Guide onClose={() => setPanel(null)} />}
        {panel === "lb" && <LeaderboardModal onClose={() => setPanel(null)} />}
        {panel === "settings" && <SettingsModal onClose={() => setPanel(null)} />}
      </Suspense>
    </div>
  );
}
