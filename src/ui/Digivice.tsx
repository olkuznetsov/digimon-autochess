import { FORMS } from "../game/creatures";
import { MAX_PARTNERS, partnerLevel, type Partner } from "../profile/profile";
import { useProfile } from "../profile/store";
import { sfx } from "../audio/sfx";
import { STAGE_JP } from "./kit";
import { Portrait } from "./Portrait";

/**
 * The Digivice: the V-Pet side of the game. Every partner the tamer has hatched — one at their
 * side (it's also their avatar), the others resting, each grown on its own — and a new egg
 * while there's room. Cosmetic only: a partner never touches a fight or the tamer's records.
 */
export function Digivice({ onClose, onHatch }: { onClose: () => void; onHatch: () => void }) {
  const partner = useProfile((s) => s.partner);
  const others = useProfile((s) => s.others);
  const switchTo = useProfile((s) => s.switchPartner);
  const all = [partner, ...others].filter((p): p is Partner => !!p);
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
          The one at your side is your avatar and grows with the XP you earn; the others wait here, just as you left them.
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
                  {STAGE_JP[f.stage]} · Lv.{partnerLevel(p)}
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
      </section>
    </div>
  );
}
