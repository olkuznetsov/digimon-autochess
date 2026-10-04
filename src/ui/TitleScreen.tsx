import { useEffect, useRef, useState } from "react";
import { loadGis, prepareAccount, session, useAccount } from "../net/account";
import { unlockAudio } from "../audio/engine";
import { ICON, Icon } from "./kit";

/**
 * Before the main menu: sign in with Google, or play as a guest. It runs before the game
 * is even loaded, so the account's partner and records are in place when the stores read
 * them; a tamer who signed in before goes straight through ("welcome back"). The tap that
 * starts also unlocks audio, so the menu's music can play on phones.
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const status = useAccount((s) => s.status);
  const name = useAccount((s) => s.name);
  const error = useAccount((s) => s.error);
  const [phase, setPhase] = useState<"checking" | "choose" | "starting">(session() ? "checking" : "choose");
  const button = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    setPhase("starting");
    onStart();
  };

  // signed in before: settle with the account, then straight in
  useEffect(() => {
    if (phase !== "checking") return;
    void prepareAccount().then((signed) => (signed ? start() : setPhase("choose")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google's button
  useEffect(() => {
    if (phase !== "choose") return;
    let alive = true;
    loadGis()
      .then((g) => {
        if (!alive || !button.current) return;
        g.accounts.id.renderButton(button.current, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "left",
          width: 300,
        });
      })
      .catch((e: Error) => useAccount.setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [phase]);

  // a sign-in from the button went through
  useEffect(() => {
    if (phase === "choose" && status === "signed") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, phase]);

  return (
    <div className="title-screen" onPointerDown={() => unlockAudio()}>
      <div className="game-logo ts-logo">
        <span className="jp">デジモン オートチェス</span>
        <b className="gl-top">DIGIMON</b>
        <b className="gl-main">AUTO CHESS</b>
      </div>
      <div className="ts-panel">
        {phase === "choose" ? (
          <>
            <p className="ts-lead">Sign in to keep your tamer, partner and run on every device.</p>
            <div className="ts-google" ref={button} />
            {status === "busy" && <p className="ts-note">Signing in…</p>}
            {error && <p className="ts-error">{error}</p>}
            <button
              className="sbtn ts-guest"
              onClick={() => {
                unlockAudio();
                start();
              }}
            >
              <span className="in">
                <b>PLAY AS GUEST</b> <span className="jp">ゲスト</span>
              </span>
            </button>
            <p className="ts-note">
              A guest's progress stays on this device. <a href="/privacy">Privacy</a>
            </p>
          </>
        ) : (
          <p className="ts-lead ts-wait">
            <Icon d={ICON.digivice} size={22} className="ls-digivice" />
            {phase === "checking" || !name ? "Opening your Digivice…" : `Welcome back, ${name}!`}
          </p>
        )}
      </div>
    </div>
  );
}
