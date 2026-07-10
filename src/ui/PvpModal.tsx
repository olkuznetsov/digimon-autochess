import { useEffect, useState } from "react";
import { useGame } from "../game/store";
import { pvpConnect, pvpClose } from "../net/pvp";

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

/** Create / join a VS-friend room. Auto-closes once the opponent is in. */
export function PvpModal({ onClose }: { onClose: () => void }) {
  const pvp = useGame((s) => s.pvp);
  const [name, setName] = useState(savedName());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // both players present -> get out of the way
  useEffect(() => {
    if (pvp && pvp.oppOnline) onClose();
  }, [pvp, onClose]);

  const connect = (code: string) => {
    const n = name.trim() || "Tamer";
    try {
      localStorage.setItem("dac-name", n);
    } catch {
      /* ignore */
    }
    setError(null);
    pvpConnect(code, n, (why) => setError(why));
  };

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal pvp" onClick={(e) => e.stopPropagation()}>
        <div className="help-title">⚔ VS Friend</div>

        {!pvp ? (
          <>
            <input
              className="pvp-input"
              maxLength={16}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="action" onClick={() => connect(randomCode())}>
              Create room
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
              <button className="action ghost" disabled={joinCode.length !== 4} onClick={() => connect(joinCode)}>
                Join
              </button>
            </div>
            {error && <div className="pvp-error">{error}</div>}
            <div className="pvp-note">Each round, your board fights your friend's board. First to 0 ♥ loses.</div>
          </>
        ) : (
          <>
            <div className="pvp-code-label">Room code — send it to your friend:</div>
            <div className="pvp-code">{pvp.code}</div>
            <div className="pvp-waiting">Waiting for a friend to join…</div>
            <button
              className="action ghost"
              onClick={() => {
                pvpClose();
                useGame.getState().pvpQuit();
                onClose();
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
