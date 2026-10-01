import { useEffect, useState } from "react";
import { useGame, pvpName } from "../game/store";
import { MAX_PLAYERS } from "../game/lobby";
import { lobbyConnect, lobbyLeave } from "../net/lobby";

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

/** Create / join a VS lobby (2–8 players) and wait in it until the host starts. */
export function LobbyModal({ onClose }: { onClose: () => void }) {
  const pvp = useGame((s) => s.pvp);
  const pvpStart = useGame((s) => s.pvpStart);
  const [name, setName] = useState(savedName());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the match is on: get out of the way
  useEffect(() => {
    if (pvp && pvp.snap.stage !== "lobby") onClose();
  }, [pvp, onClose]);

  const connect = (code: string) => {
    const n = name.trim() || "Tamer";
    try {
      localStorage.setItem("dac-name", n);
    } catch {
      /* ignore */
    }
    setError(null);
    setBusy(true);
    lobbyConnect(code, n, (why) => {
      setError(why);
      setBusy(false);
    });
  };

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
          <button className="action" disabled={busy} onClick={() => connect(randomCode())}>
            Create lobby
          </button>
          <div className="pvp-or">— or —</div>
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

  return (
    <div className="help-overlay">
      <div className="help-modal pvp">
        <div className="help-title">⚔ VS lobby</div>
        <div className="pvp-code-label">Room code — send it to your friends:</div>
        <div className="pvp-code">{pvp.code}</div>
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
        {isHost ? (
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
