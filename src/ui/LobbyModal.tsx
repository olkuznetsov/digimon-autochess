import { useEffect, useState } from "react";
import { useGame, pvpName } from "../game/store";
import { MAX_PLAYERS } from "../game/lobby";
import { lobbyConnect, lobbyLeave } from "../net/lobby";
import { queueJoin, queueLeave, type QueueStatus } from "../net/queue";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

function savedName() {
  try {
    return localStorage.getItem("dac-name") ?? "";
  } catch {
    return "";
  }
}

/** Create / join a VS lobby (2–8 players) and wait in it until the host starts —
 *  or find a public match through the matchmaking queue. */
export function LobbyModal({ onClose }: { onClose: () => void }) {
  const pvp = useGame((s) => s.pvp);
  const pvpStart = useGame((s) => s.pvpStart);
  const [name, setName] = useState(savedName());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // public matchmaking: null = not searching
  const [search, setSearch] = useState<QueueStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // the match is on: get out of the way
  useEffect(() => {
    if (pvp && pvp.snap.stage !== "lobby") onClose();
  }, [pvp, onClose]);

  // closing the window while searching leaves the queue
  useEffect(() => () => queueLeave(), []);

  useEffect(() => {
    if (!search) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [search]);

  const playerName = () => {
    const n = name.trim() || "Tamer";
    try {
      localStorage.setItem("dac-name", n);
    } catch {
      /* ignore */
    }
    return n;
  };

  const connect = (code: string) => {
    setError(null);
    setBusy(true);
    lobbyConnect(code, playerName(), (why) => {
      setError(why);
      setBusy(false);
    });
  };

  const findMatch = () => {
    setError(null);
    setSearch({ waiting: 1, oldestAt: Date.now(), gatherMs: 20_000 });
    queueJoin(playerName(), {
      status: setSearch,
      match: (code) => {
        setSearch(null);
        connect(code);
      },
      error: (why) => {
        setSearch(null);
        setError(why);
      },
    });
  };

  if (!pvp && search) {
    // the queue starts whoever is there once the longest-waiting has waited gatherMs (2+ tamers)
    const startsIn = Math.max(0, Math.ceil((search.oldestAt + search.gatherMs - now) / 1000));
    return (
      <div className="help-overlay">
        <div className="help-modal pvp">
          <div className="help-title">🌐 Finding a match…</div>
          <div className="queue-count">
            <b>{search.waiting}</b> tamer{search.waiting === 1 ? "" : "s"} searching
          </div>
          <div className="pvp-waiting">
            {search.waiting < 2
              ? "Waiting for someone to join the queue…"
              : search.waiting >= MAX_PLAYERS
                ? "Lobby full — starting…"
                : `Starting with everyone here in ${startsIn} s (up to ${MAX_PLAYERS})`}
          </div>
          <button
            className="action ghost"
            onClick={() => {
              queueLeave();
              setSearch(null);
            }}
          >
            Cancel
          </button>
          <div className="pvp-note">Public matches move your VS rating like any other.</div>
        </div>
      </div>
    );
  }

  if (!pvp) {
    return (
      <div className="help-overlay" onClick={onClose}>
        <div className="help-modal pvp" onClick={(e) => e.stopPropagation()}>
          <div className="help-title">⚔ VS — 2 to {MAX_PLAYERS} tamers</div>
          <input
            className="pvp-input"
            maxLength={16}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="action" disabled={busy} onClick={findMatch} title="Play strangers: the queue builds a lobby of up to 8">
            🌐 Find a match
          </button>
          <div className="pvp-or">— or play with friends —</div>
          <button className="action ghost" disabled={busy} onClick={() => connect(randomCode())}>
            Create lobby
          </button>
          <div className="pvp-join">
            <input
              className="pvp-input code"
              maxLength={4}
              placeholder="CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="action ghost" disabled={busy || joinCode.length !== 4} onClick={() => connect(joinCode)}>
              Join
            </button>
          </div>
          {error && <div className="pvp-error">{error}</div>}
          <div className="pvp-note">
            Every round your board fights one of the others — wild Digimon on rounds 1–2 and every 5th, a boss every
            10th. Last tamer standing wins.
          </div>
        </div>
      </div>
    );
  }

  const seats = pvp.snap.seats;
  const online = seats.filter((s) => s.online).length;
  const isHost = pvp.snap.host === pvp.seat;
  const isPublic = pvp.snap.public;

  return (
    <div className="help-overlay">
      <div className="help-modal pvp">
        <div className="help-title">{isPublic ? "🌐 Public match" : "⚔ VS lobby"}</div>
        {!isPublic && (
          <>
            <div className="pvp-code-label">Room code — send it to your friends:</div>
            <div className="pvp-code">{pvp.code}</div>
          </>
        )}
        <div className="lobby-seats">
          {seats.map((s) => (
            <div key={s.seat} className={`lobby-seat${s.seat === pvp.seat ? " me" : ""}${s.online ? "" : " away"}`}>
              <span className="lobby-name">{s.name}</span>
              {s.seat === pvp.snap.host && <span title="Host — starts the match">👑</span>}
              {!s.online && <span title="Disconnected">📡</span>}
            </div>
          ))}
          {seats.length < MAX_PLAYERS && (
            <div className="lobby-seat empty">
              {seats.length}/{MAX_PLAYERS} — waiting for tamers…
            </div>
          )}
        </div>
        {isPublic ? (
          <div className="pvp-waiting">
            Starting as soon as everyone's in — {online}/{pvp.snap.expect || online}
          </div>
        ) : isHost ? (
          <button className="action" disabled={online < 2} onClick={pvpStart}>
            {online < 2 ? "Need at least 2 tamers" : `⚔ Start match · ${online} tamers`}
          </button>
        ) : (
          <div className="pvp-waiting">Waiting for {pvpName(pvp, pvp.snap.host)} to start…</div>
        )}
        <button
          className="action ghost"
          onClick={() => {
            lobbyLeave();
            onClose();
          }}
        >
          Leave
        </button>
        {pvp.selfOffline && <div className="pvp-error">📡 Reconnecting…</div>}
      </div>
    </div>
  );
}
