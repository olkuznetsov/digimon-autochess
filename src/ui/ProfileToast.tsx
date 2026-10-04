import { useEffect, useState } from "react";
import { useProfile } from "../profile/store";
import { CRESTS } from "../profile/profile";

/** Tamer XP, level-ups and crests as they're earned — after a battle, a run, a VS match. */
export function ProfileToast() {
  const gain = useProfile((s) => s.gain);
  const crest = useProfile((s) => s.newCrest);
  const [shown, setShown] = useState<{ text: string; big: boolean; key: number } | null>(null);

  useEffect(() => {
    if (!gain) return;
    setShown({
      text: gain.levelUp ? `Tamer level ${gain.levelUp}!` : `+${gain.amount} tamer XP · ${gain.reason}`,
      big: !!gain.levelUp,
      key: gain.key,
    });
  }, [gain]);
  useEffect(() => {
    if (!crest) return;
    const c = CRESTS.find((x) => x.id === crest);
    if (c) setShown({ text: `Crest of ${c.name} earned`, big: true, key: Date.now() });
    useProfile.setState({ newCrest: null });
  }, [crest]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), shown.big ? 3200 : 2200);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className={`profile-toast${shown.big ? " big" : ""}`} key={shown.key}>
      {shown.text}
    </div>
  );
}
