import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { FORMS, ELEMENT_COLOR, STAGE_NAME, ATTR_COLOR } from "../game/creatures";
import { useGame } from "../game/store";
import { useProfile } from "../profile/store";
import {
  CRESTS,
  MAX_PARTNERS,
  PARTNER_STARTERS,
  STAGE_LEVELS,
  STAR_LEVELS,
  favoriteElement,
  favoriteForm,
  levelFor,
  nextGrowthLevel,
  offerBranches,
  partnerStarCap,
  xpToNext,
} from "../profile/profile";
import { playerName } from "../net/leaderboard";
import { useAccount } from "../net/account";
import { AccountBox } from "./AccountBox";
import { EvoCutIn } from "./Moments";
import { Digivice } from "./Digivice";
import { Portrait } from "./Portrait";
import { ATTR_PATH, CREST_ICON, ELEMENT_PATH, ICON, Icon, Meat, STAGE_JP, orList } from "./kit";
import { CARE, careBonus, careNow, hearts, isHungry } from "../profile/care";
import { sfx } from "../audio/sfx";
import { isMuted, onAudioChange, setMuted } from "../audio/engine";

const Guide = lazy(() => import("./Guide").then((m) => ({ default: m.Guide })));
const LeaderboardModal = lazy(() => import("./LeaderboardModal").then((m) => ({ default: m.LeaderboardModal })));
const SettingsModal = lazy(() => import("./SettingsModal").then((m) => ({ default: m.SettingsModal })));

type Panel = "guide" | "lb" | "settings";

/** total XP that reaches a tamer level */
function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Top left: the partner as the tamer's avatar, ringed by their level's progress. */
function TamerBadge({ onAvatar }: { onAvatar: () => void }) {
  const xp = useProfile((s) => s.xp);
  const partner = useProfile((s) => s.partner);
  const face = partner?.formId;
  const { level, into, need } = levelFor(xp);
  const [name, setName] = useState(playerName());
  const [editing, setEditing] = useState(false);
  // signing in can bring a name with it
  const account = useAccount((s) => s.status);
  useEffect(() => setName(playerName()), [account]);
  const r = 52;
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
      <button className="tamer-avatar" onClick={onAvatar} aria-label="Your tamer file">
        <svg viewBox="0 0 116 116" className="tamer-ring" aria-hidden="true">
          <defs>
            <linearGradient id="xp-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffe27a" />
              <stop offset="1" stopColor="#ff7a1a" />
            </linearGradient>
          </defs>
          <circle cx="58" cy="58" r={r} className="ring-bg" />
          <circle
            cx="58"
            cy="58"
            r={r}
            className="ring-fg"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - into / need)}
            transform="rotate(-90 58 58)"
          />
        </svg>
        <span className="tamer-face">
          {face ? <Portrait formId={face} className="tamer-portrait" /> : <Icon d={CREST_ICON.hope} size={34} />}
        </span>
        <span className="rib orange tamer-level">
          <span className="in">Lv.{level}</span>
        </span>
      </button>
      <div className="tamer-id">
        <span className="jp">TAMER · テイマー</span>
        {editing ? (
          <input
            className="tamer-name-input"
            value={name}
            autoFocus
            maxLength={16}
            aria-label="Your name"
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <button className="tamer-name" onClick={() => setEditing(true)} title="Change your name">
            {name} <Icon d={ICON.pencil} size={15} width={2.4} />
          </button>
        )}
        <span className="tamer-xp">
          {into} / {need} XP to Lv.{level + 1}
        </span>
        {account === "guest" && <span className="tamer-guest">Guest · tap your avatar to sign in</span>}
      </div>
    </div>
  );
}

/** Left: the tamer file — records and Adventure's crests (a drawer from the avatar on phones). */
function TamerFile({ onDigivice }: { onDigivice: () => void }) {
  const stats = useProfile((s) => s.stats);
  const crests = useProfile((s) => s.crests);
  const fav = favoriteForm(stats);
  const el = favoriteElement(stats);
  const tiles: [string, string][] = [
    ["RUNS", stats.runsWon ? `${stats.runs} · ${stats.runsWon}★` : String(stats.runs)],
    ["BEST ROUND", stats.bestRound ? String(stats.bestRound) : "—"],
    ["BOSSES", String(stats.bosses)],
    ["VS WINS", stats.vsMatches ? `${stats.vsWins}/${stats.vsMatches}` : "—"],
  ];
  const earned = CRESTS.filter((c) => crests.includes(c.id)).length;
  return (
    <section className="tamer-file glass" onClick={(e) => e.stopPropagation()}>
      <h2 className="rib orange">
        <span className="in">
          TAMER FILE <span className="jp">テイマーファイル</span>
        </span>
      </h2>
      <div className="tf-stats">
        {tiles.map(([k, v]) => (
          <div key={k}>
            <b>{v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
      <div className="tf-row">
        <span>Favourite</span>
        <b>
          {fav ? (
            <>
              <Portrait formId={fav} className="tf-fav" /> {FORMS[fav].name}
            </>
          ) : (
            "—"
          )}
        </b>
      </div>
      <div className="tf-row">
        <span>Top element</span>
        {el ? (
          <b className="chip" style={{ "--c": ELEMENT_COLOR[el] } as CSSProperties}>
            <Icon d={ELEMENT_PATH[el]} size={13} width={2.6} /> {el.toUpperCase()}
          </b>
        ) : (
          <b>—</b>
        )}
      </div>
      <div className="tf-row">
        <span>Digimon raised</span>
        <b>{stats.raised.length}</b>
      </div>
      <button className="tf-digivice" onClick={onDigivice}>
        <Icon d={ICON.digivice} size={16} width={2.4} /> PARTNERS <span className="jp">デジヴァイス</span>
      </button>
      <div className="tf-crests-head">
        <span>CRESTS · 紋章</span>
        <b>
          {earned} / {CRESTS.length}
        </b>
      </div>
      <div className="tf-crests">
        {CRESTS.map((c) => {
          const on = crests.includes(c.id);
          return (
            <span
              key={c.id}
              className={`crest-gem${on ? " on" : ""}`}
              style={on ? ({ "--c": c.color } as CSSProperties) : undefined}
              title={`Crest of ${c.name} — ${c.desc}${on ? "" : " (locked)"}`}
            >
              <Icon d={CREST_ICON[c.id]} size={18} width={2.5} />
            </span>
          );
        })}
      </div>
      <AccountBox />
    </section>
  );
}

/** The V-Pet: fullness, mood and the bond's five hearts, meat to feed and a training session
 *  — a happy partner or a best friend earns the tamer more XP. */
function CareBlock() {
  const partner = useProfile((s) => s.partner);
  const meat = useProfile((s) => s.meat);
  const feed = useProfile((s) => s.feed);
  const train = useProfile((s) => s.train);
  // needs drop with time: look again every half a minute
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!partner?.care) return null;
  // the clock ticks every half a minute; an action since then settled the needs at its time
  const t = Math.max(now, partner.care.at);
  const c = careNow(partner.care, t);
  const h = hearts(c);
  const bonus = careBonus(partner.care);
  const rest = Math.max(0, (c.trainAt ?? 0) + CARE.trainGapMs - t);
  const tooHungry = c.fed < CARE.trainMinFed;
  return (
    <div className="care">
      <div className="care-meters">
        <div className={`care-meter fed${isHungry(c) ? " low" : ""}`} title={`Fullness ${Math.round(c.fed)}/100`}>
          <span>
            FULL <i className="jp">おなか</i>
          </span>
          <b>
            <em style={{ width: `${c.fed}%` }} />
          </b>
        </div>
        <div className={`care-meter mood${bonus.happy ? " max" : c.mood < 30 ? " low" : ""}`} title={`Mood ${Math.round(c.mood)}/100`}>
          <span>
            MOOD <i className="jp">きげん</i>
          </span>
          <b>
            <em style={{ width: `${c.mood}%` }} />
          </b>
        </div>
        <div className="care-hearts" title={`Bond ${Math.round(c.bond)}/100 — care grows it`}>
          <span>
            BOND <i className="jp">きずな</i>
          </span>
          <span className="hearts">
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon key={i} d={ICON.heart} size={15} width={2.2} fill={i < h ? "currentColor" : undefined} className={i < h ? "on" : ""} />
            ))}
          </span>
        </div>
      </div>
      <div className="care-actions">
        <button className="care-btn feed" onClick={feed} disabled={meat <= 0} title={meat > 0 ? "Feed your partner" : "Win battles to earn meat"}>
          <Meat size={20} /> FEED <b>×{meat}</b>
        </button>
        <button
          className="care-btn train"
          onClick={train}
          disabled={rest > 0 || tooHungry}
          title={tooHungry ? "Too hungry to train" : rest > 0 ? "Resting after training" : "A training session: +mood, +bond, +XP"}
        >
          <Icon d={ICON.train} size={18} width={2.6} />
          {rest > 0 ? `REST ${Math.ceil(rest / 60000)}m` : tooHungry ? "HUNGRY" : "TRAIN"}
        </button>
      </div>
      {bonus.mult > 1 && (
        <div className="care-bonus">
          {[bonus.happy && "HAPPY", bonus.friends && "BEST FRIENDS"].filter(Boolean).join(" · ")} <b>+{Math.round((bonus.mult - 1) * 100)}% XP</b>
        </div>
      )}
    </div>
  );
}

/** Bottom right: who the partner is, where it can grow and when. */
function PartnerCard({ onEvolve, onDigivice }: { onEvolve: () => void; onDigivice: () => void }) {
  const partner = useProfile((s) => s.partner);
  const count = useProfile((s) => 1 + s.others.length);
  const stats = useProfile((s) => s.stats);
  const options = useProfile((s) => s.evolutionOptions)();
  const starUp = useProfile((s) => s.starUpPartner);
  if (!partner) return null;
  const form = FORMS[partner.formId];
  // a partner grows with its own XP: what was earned at the tamer's side
  const xp = partner.xp ?? 0;
  const level = levelFor(xp).level;
  const canStar = form.stage >= 5 && partner.star < partnerStarCap(level);
  const next = nextGrowthLevel(form.stage, partner.star);
  const ready = options.length > 0 || canStar;
  // progress from the last growth level to the next one
  const prev = form.stage < 5 ? (STAGE_LEVELS[form.stage - 2] ?? 1) : (STAR_LEVELS[partner.star - 2] ?? STAGE_LEVELS[3]);
  const pct = next ? Math.max(0, Math.min(100, (100 * (xp - xpForLevel(prev))) / (xpForLevel(next) - xpForLevel(prev)))) : 100;
  const branches = form.stage < 5 ? (options.length ? options : offerBranches(partner.formId, stats)) : [];
  const played = stats.battles > 0;
  return (
    <section className="partner-card glass">
      <div className="pc-head">
        <h2 className="rib blue">
          <span className="in">
            PARTNER <span className="jp">パートナー</span>
          </span>
        </h2>
        <button className="pc-switch" onClick={onDigivice} title="Your partners (the Digivice)">
          <Icon d={ICON.digivice} size={14} width={2.4} /> {count}/{MAX_PARTNERS}
        </button>
      </div>
      <div className="pc-name">
        <b>
          {form.name}
          {partner.star > 1 && <span className="pc-stars"> {"★".repeat(partner.star)}</span>}
        </b>
        <span className="pc-stage">
          {STAGE_NAME[form.stage].toUpperCase()} · {STAGE_JP[form.stage]} · Lv.{level}
        </span>
      </div>
      <div className="pc-chips">
        <span className="chip" style={{ "--c": ELEMENT_COLOR[form.element] } as CSSProperties}>
          <Icon d={ELEMENT_PATH[form.element]} size={13} width={2.6} /> {form.element.toUpperCase()}
        </span>
        <span className="chip" style={{ "--c": ATTR_COLOR[form.attribute] } as CSSProperties}>
          <Icon d={ATTR_PATH[form.attribute]} size={13} width={2.6} /> {form.attribute.toUpperCase()}
        </span>
        <span className="chip line">{form.role.toUpperCase()}</span>
      </div>
      <CareBlock />
      {next !== null && (
        <div className="pc-next">
          <div className="pc-next-row">
            <span>{form.stage < 5 ? "NEXT DIGIVOLUTION · 進化" : "NEXT STAR"}</span>
            <b>{ready ? "READY!" : `Lv.${next}`}</b>
          </div>
          <div className="pc-bar">
            <i style={{ width: `${ready ? 100 : pct}%` }} />
          </div>
        </div>
      )}
      {branches.length > 0 && (
        <div className="pc-branches">
          {branches.map((id, i) => (
            <div key={id} className="pc-branch">
              <Portrait formId={id} className={`pc-sil${ready ? " lit" : ""}`} />
              <span>{FORMS[id].name}</span>
              {i === 0 && played && branches.length > 1 && <span className="style-pick">Your style</span>}
            </div>
          ))}
        </div>
      )}
      {options.length > 0 ? (
        <button className="sbtn gold pc-go" onClick={onEvolve}>
          <span className="sheen" />
          <span className="in">
            DIGIVOLVE <span className="jp">進化</span>
          </span>
        </button>
      ) : canStar ? (
        <button className="sbtn gold pc-go" onClick={starUp}>
          <span className="sheen" />
          <span className="in">
            STAR UP <span className="jp">★</span>
          </span>
        </button>
      ) : next === null ? (
        <div className="pc-done">Fully grown — 究極体</div>
      ) : (
        <button className="sbtn pc-go" disabled>
          <span className="in">
            DIGIVOLVE <span className="jp">進化 · Lv.{next}</span>
          </span>
        </button>
      )}
    </section>
  );
}

/** Bottom left: the ways to play. */
function ModeButtons() {
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
    <nav className={`menu-modes${ongoing ? "" : " fresh"}`} aria-label="Game modes">
      <button className="sbtn mode-main" onClick={() => go()}>
        <span className="sheen" />
        <span className="in">
          <span className="mm-text">
            <b>{ongoing ? "CONTINUE" : "SOLO RUN"}</b>
            <small>{ongoing ? `つづきから · round ${round}` : "はじめから · 15 rounds and a final boss"}</small>
          </span>
          <Icon d={ICON.play} size={30} fill="#ffffff" />
        </span>
      </button>
      {ongoing && (
        <button
          className="sbtn mode-alt"
          onClick={() => {
            useGame.getState().reset();
            go();
          }}
        >
          <span className="in">
            <b>NEW RUN</b> <span className="jp">はじめから</span>
          </span>
        </button>
      )}
      <button className="sbtn mode-vs" onClick={() => go(true)}>
        <span className="sheen" />
        <span className="in">
          <Icon d={ICON.swords} size={22} width={2.6} />
          <b>VS</b> <span className="jp">たいせん</span>
        </span>
      </button>
      <div className="mode-soon-row">
        <button className="sbtn mode-soon" onClick={() => setSoon("The ghost ladder")}>
          <span className="in">
            <b>GHOST</b> <span className="soon-tag">SOON</span>
          </span>
        </button>
        <button className="sbtn mode-soon" onClick={() => setSoon("Friends")}>
          <span className="in">
            <b>FRIENDS</b> <span className="soon-tag">SOON</span>
          </span>
        </button>
      </div>
      {soon && <div className="mode-soon-note">{soon} is on its way</div>}
    </nav>
  );
}

/** Sound on/off where the music plays — the game plays through a phone's silent switch, so
 *  this is the switch that counts (the same one as the board's, and remembered). */
function SoundButton() {
  const [muted, setMutedUi] = useState(isMuted());
  useEffect(() => {
    const off = onAudioChange(() => setMutedUi(isMuted()));
    return () => {
      off();
    };
  }, []);
  return (
    <button
      className={`round-btn${muted ? " off" : ""}`}
      aria-pressed={!muted}
      title={muted ? "Turn the sound on" : "Turn the sound off"}
      onClick={() => {
        const m = !muted;
        setMuted(m);
        setMutedUi(m);
        if (!m) sfx.click();
      }}
    >
      <span className="glass">
        <Icon d={muted ? ICON.mute : ICON.speaker} size={25} />
      </span>
      <b>{muted ? "SOUND OFF" : "SOUND"}</b>
      <span className="jp">{muted ? "ミュート" : "サウンド"}</span>
    </button>
  );
}

/** Top right: the title, and sound, ranking, the guide and settings under it. */
function MenuCorner({ onPanel }: { onPanel: (p: Panel) => void }) {
  const items: [Panel, string, string, string][] = [
    ["lb", "RANKING", "ランキング", ICON.trophy],
    ["guide", "GUIDE", "図鑑", ICON.book],
    ["settings", "SETTINGS", "設定", ICON.sliders],
  ];
  return (
    <div className="menu-corner">
      <div className="game-logo">
        <span className="jp">デジモン オートチェス</span>
        <b className="gl-top">DIGIMON</b>
        <b className="gl-main">AUTO CHESS</b>
      </div>
      <div className="menu-icons">
        <SoundButton />
        {items.map(([p, label, jp, icon]) => (
          <button key={p} className="round-btn" onClick={() => onPanel(p)}>
            <span className="glass">
              <Icon d={icon} size={25} />
            </span>
            <b>{label}</b>
            <span className="jp">{jp}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two pastel spots on each egg */
const EGG_SPOTS: [string, string][] = [
  ["#ff9ec8", "#7cc6ff"],
  ["#ffd23f", "#ff9ec8"],
  ["#7cc6ff", "#9be8ae"],
  ["#9be8ae", "#ffd23f"],
  ["#c9a8ff", "#ff9ec8"],
];

/** First visit: Primary Village — pick a baby to raise, then hatch it. */
function PartnerChoice({ extra, onDone }: { extra?: boolean; onDone?: () => void }) {
  const choose = useProfile((s) => (extra ? s.hatchPartner : s.choosePartner));
  const [pick, setPick] = useState<string>(PARTNER_STARTERS[0]);
  const form = FORMS[pick];
  return (
    <div className="village">
      <div className="village-head">
        <span className="pill">
          <span className="jp">はじまりの町</span> PRIMARY VILLAGE
        </span>
        <h1>
          <span className="v-small">{extra ? "A NEW" : "CHOOSE YOUR"}</span>
          <span className="v-big">PARTNER</span>
        </h1>
        <p className="v-sub">
          {extra
            ? "It hatches at your side, becomes your avatar and grows with the XP you earn. Your other partners wait in the Digivice, just as you left them."
            : "Every Digimon starts as a baby. Yours grows as you play — and you choose who it becomes."}
        </p>
      </div>
      <div className="village-stage">
        <span className="v-cushion" />
        <Portrait formId={pick} className="v-baby" key={pick} />
      </div>
      <div className="village-name">
        <b>{form.name.toUpperCase()}</b>
        <span className="pill">
          {STAGE_JP[form.stage]} · FRESH · grows into {orList((form.evolvesTo ?? []).map((id) => FORMS[id].name))}
        </span>
      </div>
      <div className="village-eggs" role="radiogroup" aria-label="Babies to raise">
        {PARTNER_STARTERS.map((id, i) => (
          <button
            key={id}
            role="radio"
            aria-checked={id === pick}
            className={`egg${id === pick ? " on" : ""}`}
            style={{ "--s1": EGG_SPOTS[i % 5][0], "--s2": EGG_SPOTS[i % 5][1] } as CSSProperties}
            onClick={() => {
              sfx.click();
              setPick(id);
            }}
          >
            <span className="egg-shell">
              <Portrait formId={id} className="egg-baby" />
            </span>
            <span className="egg-name">{FORMS[id].name}</span>
          </button>
        ))}
      </div>
      <button
        className="sbtn v-hatch"
        onClick={() => {
          sfx.evolve();
          choose(pick);
          onDone?.();
        }}
      >
        <span className="sheen" />
        <span className="in">
          <b>HATCH {form.name.toUpperCase()}</b> <span className="jp">孵化</span>
        </span>
      </button>
      {extra && (
        <button className="v-cancel" onClick={onDone}>
          Not now
        </button>
      )}
      <p className="v-note">Cosmetic only — your partner never changes the battles.</p>
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
          {FORMS[partner.formId].name} <span className="jp">進化</span>
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
                <span className="evo-stage">
                  {STAGE_NAME[form.stage]} · {STAGE_JP[form.stage]}
                </span>
                <span className="evo-name">{form.name}</span>
                <span className="evo-tags">
                  <span className="evo-tag" style={{ background: ATTR_COLOR[form.attribute] }}>
                    {form.attribute}
                  </span>
                  <span className="evo-tag fam" style={{ color: ELEMENT_COLOR[form.element], borderColor: ELEMENT_COLOR[form.element] }}>
                    <Icon d={ELEMENT_PATH[form.element]} size={12} width={2.6} /> {form.element}
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
  if (grew.from !== grew.to) return <EvoCutIn key={grew.key} from={grew.from} to={grew.to} />;
  const from = FORMS[grew.from];
  const to = FORMS[grew.to];
  return (
    <div className="evo-banner" key={grew.key}>
      <div className="evo-banner-label">{grew.from === grew.to ? "STAR UP" : "DIGIVOLVING · 進化"}</div>
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

/** The main menu over File Island (the backdrop and the partner on its platform are the 3D
 *  scene's MenuStage): the tamer, their partner and the ways to play. */
export function MainMenu() {
  const partner = useProfile((s) => s.partner);
  const [evolving, setEvolving] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  // phones: the tamer file slides in from the avatar
  const [card, setCard] = useState(false);
  const [digivice, setDigivice] = useState(false);
  const [hatching, setHatching] = useState(false);
  const openDigivice = () => {
    sfx.click();
    setCard(false);
    setDigivice(true);
  };
  return (
    <div className={`menu${card ? " card-open" : ""}`} onClick={() => card && setCard(false)}>
      <TamerBadge
        onAvatar={() => {
          // a phone opens the tamer file (the Digivice is a tap away in it); wider screens
          // show the file already, so the avatar opens the Digivice
          if (!matchMedia("(max-width: 640px)").matches) return openDigivice();
          sfx.click();
          setCard((c) => !c);
        }}
      />
      <TamerFile onDigivice={openDigivice} />
      <div className="menu-place">
        <Icon d={ICON.pin} size={16} width={2.6} /> FILE ISLAND <span className="jp">ファイル島</span>
      </div>
      <MenuCorner onPanel={setPanel} />
      <PartnerCard onEvolve={() => setEvolving(true)} onDigivice={openDigivice} />
      <ModeButtons />
      {!partner && <PartnerChoice />}
      {digivice && (
        <Digivice
          onClose={() => setDigivice(false)}
          onHatch={() => {
            setDigivice(false);
            setHatching(true);
          }}
        />
      )}
      {hatching && <PartnerChoice extra onDone={() => setHatching(false)} />}
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
