import { useSettings } from "../settings";

/** Audio volumes, graphics quality and reduced motion. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="help-title">
          SETTINGS <span className="jp">設定</span>
        </div>
        <label className="set-row">
          <span>Music</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.musicVolume}
            onChange={(e) => s.set({ musicVolume: Number(e.target.value) })}
          />
          <em>{Math.round(s.musicVolume * 100)}%</em>
        </label>
        <label className="set-row">
          <span>Effects</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.sfxVolume}
            onChange={(e) => s.set({ sfxVolume: Number(e.target.value) })}
          />
          <em>{Math.round(s.sfxVolume * 100)}%</em>
        </label>
        <div className="set-row">
          <span>Graphics</span>
          <span className="set-seg">
            {(["high", "low"] as const).map((q) => (
              <button key={q} className={s.quality === q ? "on" : ""} onClick={() => s.set({ quality: q })}>
                {q === "high" ? "High" : "Low (battery)"}
              </button>
            ))}
          </span>
        </div>
        <div className="set-row">
          <span>Damage numbers</span>
          <span className="set-seg">
            {(["all", "big", "off"] as const).map((d) => (
              <button key={d} className={s.damageNumbers === d ? "on" : ""} onClick={() => s.set({ damageNumbers: d })}>
                {d === "all" ? "All" : d === "big" ? "Ultimates" : "Off"}
              </button>
            ))}
          </span>
        </div>
        <label className="set-row check">
          <span>Reduced motion</span>
          <input type="checkbox" checked={s.reducedMotion} onChange={(e) => s.set({ reducedMotion: e.target.checked })} />
          <em>no camera shake or flashes</em>
        </label>
        <button className="action" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
