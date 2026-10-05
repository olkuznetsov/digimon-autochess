import { useEffect, useState } from "react";
import { FORMS } from "../game/creatures";
import { useAccount } from "../net/account";
import { addFriend, beat, describeStatus, inviteFriend, joinRoom, removeFriend, useSocial, type Friend } from "../net/social";
import { sfx } from "../audio/sfx";
import { AccountBox } from "./AccountBox";
import { ICON, Icon } from "./kit";
import { Portrait } from "./Portrait";

/**
 * Friends (なかま): your tamer code to share, a friend added by theirs (both ways at once),
 * and who's online and doing what — join the VS lobby a friend sits in, or invite one to
 * yours (a new room opens if you aren't in one). Needs the Google sign-in.
 */
export function Friends({ onClose, initialCode = "" }: { onClose: () => void; initialCode?: string }) {
  const signed = useAccount((s) => s.status === "signed");
  const code = useSocial((s) => s.code);
  const friends = useSocial((s) => s.friends);
  const [add, setAdd] = useState(initialCode);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState<string | null>(null);

  // fresh news when the panel opens, and every 15 s while it's open
  useEffect(() => {
    if (!signed) return;
    void beat();
    const t = setInterval(() => void beat(), 15_000);
    return () => clearInterval(t);
  }, [signed]);

  const link = code ? `${location.origin}/?friend=${code}` : "";
  const copy = async () => {
    if (!code) return;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Digimon Auto Chess", text: `Add me in Digimon Auto Chess — my tamer code is ${code}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* the share sheet was closed */
    }
  };
  const submit = async () => {
    if (add.trim().length < 4) return;
    setBusy(true);
    const err = await addFriend(add);
    setBusy(false);
    if (err) setMsg({ text: err, bad: true });
    else {
      sfx.buy();
      setMsg({ text: "Friends now — on both sides!", bad: false });
      setAdd("");
    }
  };
  const invite = async (f: Friend) => {
    sfx.click();
    const err = await inviteFriend(f.code);
    setMsg(err ? { text: err, bad: true } : { text: `Invite sent to ${f.name} — the VS lobby is open`, bad: false });
    if (!err) onClose();
  };

  return (
    <div className="dv-overlay" onClick={onClose}>
      <section className="dv glass friends" onClick={(e) => e.stopPropagation()} aria-label="Friends">
        <header className="dv-head">
          <h2 className="rib orange">
            <span className="in">
              FRIENDS <span className="jp">なかま</span>
            </span>
          </h2>
          <button className="dv-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {!signed ? (
          <>
            <p className="dv-note">
              Friends live on your account: sign in with Google to get your tamer code, add friends by theirs, see who's online and
              invite them to VS.
            </p>
            <AccountBox />
          </>
        ) : (
          <>
            <div className="fr-code">
              <span className="fr-label">YOUR TAMER CODE</span>
              <b>{code ?? "······"}</b>
              <button className="care-btn train" onClick={copy} disabled={!code}>
                {copied ? "COPIED!" : "SHARE"}
              </button>
            </div>
            <form
              className="fr-add"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input
                value={add}
                maxLength={6}
                placeholder="FRIEND'S CODE"
                aria-label="A friend's tamer code"
                onChange={(e) => setAdd(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button className="care-btn feed" disabled={busy || add.length < 4}>
                ADD
              </button>
            </form>
            {msg && <p className={`fr-msg${msg.bad ? " bad" : ""}`}>{msg.text}</p>}

            <div className="dv-sub">
              <b>FRIENDS · なかま</b>
              <span>
                {friends.filter((f) => f.online).length} online · {friends.length}
              </span>
            </div>
            {friends.length === 0 ? (
              <p className="dv-note">Share your code: once a friend adds it, you're friends on both sides.</p>
            ) : (
              <ul className="fr-list">
                {friends.map((f) => {
                  const room = f.online && f.status.startsWith("lobby:") ? f.status.slice(6) : null;
                  return (
                    <li key={f.code} className={`fr-row${f.online ? " on" : ""}`}>
                      {f.partner && FORMS[f.partner] ? <Portrait formId={f.partner} className="fr-face" /> : <span className="fr-face empty" />}
                      <span className="fr-who">
                        <b>{f.name}</b>
                        <span className="fr-status">
                          <i className="fr-dot" />
                          {describeStatus(f)}
                        </span>
                      </span>
                      {room ? (
                        <button
                          className="care-btn train fr-act"
                          onClick={() => {
                            if (joinRoom(room)) onClose();
                            else setMsg({ text: "Finish your match first", bad: true });
                          }}
                        >
                          JOIN
                        </button>
                      ) : (
                        f.online &&
                        f.status !== "vs" && (
                          <button className="care-btn feed fr-act" onClick={() => void invite(f)}>
                            <Icon d={ICON.swords} size={14} width={2.6} /> INVITE
                          </button>
                        )
                      )}
                      <button
                        className="fr-remove"
                        title={sure === f.code ? "Tap again to remove" : `Remove ${f.name}`}
                        onClick={() => {
                          if (sure !== f.code) return setSure(f.code);
                          setSure(null);
                          void removeFriend(f.code);
                        }}
                      >
                        {sure === f.code ? "REMOVE?" : "×"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
