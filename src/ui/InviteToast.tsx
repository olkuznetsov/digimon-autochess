import { useEffect, useRef } from "react";
import { FORMS } from "../game/creatures";
import { dismissInvite, joinRoom, useSocial } from "../net/social";
import { sfx } from "../audio/sfx";
import { Portrait } from "./Portrait";

/** A friend's invite to a VS room, wherever the tamer is: join it, or wave it away. */
export function InviteToast() {
  const invite = useSocial((s) => s.invites[0]);
  const seen = useRef(new Set<number>());
  useEffect(() => {
    if (!invite || seen.current.has(invite.id)) return;
    seen.current.add(invite.id);
    sfx.drop();
  }, [invite]);
  if (!invite) return null;
  return (
    <div className="invite-toast" role="alert">
      {invite.from.partner && FORMS[invite.from.partner] ? <Portrait formId={invite.from.partner} className="it-face" /> : <span className="it-face" />}
      <span className="it-text">
        <b>{invite.from.name}</b> invites you to VS
        <small>room {invite.room}</small>
      </span>
      <button
        className="care-btn train it-join"
        onClick={() => {
          dismissInvite(invite.id);
          joinRoom(invite.room);
        }}
      >
        JOIN
      </button>
      <button className="it-close" aria-label="No thanks" onClick={() => dismissInvite(invite.id)}>
        ×
      </button>
    </div>
  );
}
