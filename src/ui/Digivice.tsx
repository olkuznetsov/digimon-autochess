import { FORMS } from "../game/creatures";
import { MAX_PARTNERS, bondLevel, type Partner } from "../profile/profile";
import { useProfile } from "../profile/store";
import { sfx } from "../audio/sfx";
import { STAGE_JP } from "./kit";
import { Portrait } from "./Portrait";

/**
 * The Digivice: every partner the tamer has hatched — one at their side, the others resting,
 * each growing on its own — a new egg while there's room, and the avatar on the tamer card
 * (the partner, or any Digimon they've raised).
 */
export function Digivice({ onClose, onHatch }: { onClose: () => void; onHatch: () => void }) {
  const partner = useProfile((s) => s.partner);
  const others = useProfile((s) => s.others);
  const avatar = useProfile((s) => s.avatar);
  const raised = useProfile((s) => s.stats.raised);
  const switchTo = useProfile((s) => s.switchPartner);
  const setAvatar = useProfile((s) => s.setAvatar);
  const all = [partner, ...others].filter((p): p is Partner => !!p);
  // every Digimon the tamer has raised: their partners' forms first, then the board's
  const known = [...new Set([...all.flatMap((p) => [...p.history].reverse()), ...[...raised].reverse()])].filter((id) => FORMS[id]);
  return (
    <div className="dv-overlay" onClick={onClose}>
      <section className="dv glass" onClick={(e) => e.stopPropagation()} aria-label="Digivice">
        <header className="dv-head">
          <h2 className="rib orange">
            <span className="in">
              DIGIVICE <span className="jp">デジヴァイス</span>
            </span>
          </h2>
          <button className="dv-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="dv-sub">
          <b>PARTNERS · パートナー</b>
          <span>
            {all.length} / {MAX_PARTNERS}
          </span>
        </div>
        <p className="dv-note">
          Each partner grows on its own, with the XP you earn while it's at your side. A new one learns twice as fast until it reaches your
          tamer level.
        </p>
        <div className="dv-partners">
          {all.map((p, i) => {
            const f = FORMS[p.formId];
            const body = (
              <>
                <Portrait formId={p.formId} className="dv-face" />
                <b className="dv-name">
                  {f.name}
                  {p.star > 1 && <span className="dv-stars"> {"★".repeat(p.star)}</span>}
                </b>
                <span className="dv-stage">
                  {STAGE_JP[f.stage]} · BOND Lv.{bondLevel(p)}
                </span>
                <span className="dv-rec">
                  {p.runs ?? 0} runs · best {p.best || "—"}
                </span>
              </>
            );
            return i === 0 ? (
              <div key={p.since} className="dv-slot active">
                <span className="dv-tag">AT YOUR SIDE</span>
                {body}
              </div>
            ) : (
              <button
                key={p.since}
                className="dv-slot"
                onClick={() => {
                  sfx.evolve();
                  switchTo(i - 1);
                }}
              >
                {body}
                <span className="dv-call">CALL · 交代</span>
              </button>
            );
          })}
          {all.length < MAX_PARTNERS && (
            <button
              className="dv-slot dv-new"
              onClick={() => {
                sfx.click();
                onHatch();
              }}
            >
              <span className="dv-egg" />
              <b className="dv-name">NEW EGG</b>
              <span className="dv-stage">タマゴ · Primary Village</span>
            </button>
          )}
        </div>

        <div className="dv-sub">
          <b>AVATAR · アバター</b>
          <span>on your tamer card</span>
        </div>
        <div className="dv-avatars">
          <button className={`dv-av partner${avatar === null ? " on" : ""}`} onClick={() => setAvatar(null)} title="Your partner">
            {partner && <Portrait formId={partner.formId} className="dv-av-face" />}
            <span>PARTNER</span>
          </button>
          {known.map((id) => (
            <button key={id} className={`dv-av${avatar === id ? " on" : ""}`} onClick={() => setAvatar(id)} title={FORMS[id].name}>
              <Portrait formId={id} className="dv-av-face" />
            </button>
          ))}
        </div>
        {known.length <= 1 && <p className="dv-note">Every Digimon you raise in a run joins this list.</p>}
      </section>
    </div>
  );
}
