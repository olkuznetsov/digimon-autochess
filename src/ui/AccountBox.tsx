import { useEffect, useRef } from "react";
import { deleteAccount, loadGis, signOut, useAccount } from "../net/account";

/** In the tamer file: Sign in with Google (optional) — the tamer, the partner and the run
 *  on every device; signed in, where it's synced and the ways out. */
export function AccountBox() {
  const status = useAccount((s) => s.status);
  const name = useAccount((s) => s.name);
  const error = useAccount((s) => s.error);
  const button = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "guest") return;
    let alive = true;
    loadGis()
      .then((g) => {
        if (!alive || !button.current) return;
        g.accounts.id.renderButton(button.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
          width: 300,
        });
      })
      .catch((e: Error) => useAccount.setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [status]);

  if (status === "signed") {
    return (
      <div className="acct signed">
        <span className="acct-dot" aria-hidden="true" />
        <span className="acct-text">
          <b>Synced</b> to your Google account{name ? ` · ${name}` : ""}
        </span>
        <span className="acct-links">
          <button className="acct-link" onClick={signOut}>
            Sign out
          </button>
          <button
            className="acct-link danger"
            onClick={() => {
              if (confirm("Delete your account and its saved progress from the server? What's on this device stays.")) void deleteAccount();
            }}
          >
            Delete account
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="acct">
      <span className="acct-text">
        {status === "busy" ? "Signing in…" : "Sign in to keep your tamer, partner and run on every device."}
      </span>
      <div ref={button} className="acct-button" />
      {error && <span className="acct-error">{error}</span>}
    </div>
  );
}
