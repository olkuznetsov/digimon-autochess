import { Scene } from "./three/Scene";
import { Hud } from "./ui/Hud";
import { Shop } from "./ui/Shop";
import { SynergyPanel } from "./ui/SynergyPanel";
import { EvolutionChoice } from "./ui/EvolutionChoice";
import { ItemTray } from "./ui/ItemTray";
import { UnitPanel } from "./ui/UnitPanel";
import { EvoBanner } from "./ui/EvoBanner";
import { BattleIntro, EvoMoment } from "./ui/Moments";
import { DiscoveryToast } from "./ui/DiscoveryToast";
import { LoadingScreen } from "./ui/LoadingScreen";
import { AudioDirector } from "./audio/AudioDirector";
import { Hotkeys } from "./ui/Hotkeys";
import { DamageMeter } from "./ui/DamageMeter";
import { NextWave } from "./ui/NextWave";
import { Onboarding } from "./ui/Onboarding";
import { CarouselPanel } from "./ui/CarouselPanel";
import { AugmentChoice } from "./ui/AugmentChoice";
import { Standings } from "./ui/Standings";
import { MainMenu } from "./ui/MainMenu";
import { ProfileToast } from "./ui/ProfileToast";
import { useProfile } from "./profile/store";
import { startProfileTracker } from "./profile/tracker";
import { startAccountSync } from "./net/account";
import { startSocial } from "./net/social";
import { startLadder } from "./net/ladder";
import { InviteToast } from "./ui/InviteToast";

startProfileTracker();
startAccountSync();
startSocial();
startLadder();

export default function App() {
  const screen = useProfile((s) => s.screen);
  return (
    <div className="app">
      <Scene />
      {screen === "menu" ? (
        <MainMenu />
      ) : (
        <>
          <Hud />
          <SynergyPanel />
          <DamageMeter />
          <NextWave />
          <Onboarding />
          <Shop />
          {/* right rail: VS players above the item tray */}
          <div className="right-rail">
            <Standings />
            <ItemTray />
          </div>
          <UnitPanel />
          <EvoBanner />
          <EvoMoment />
          <BattleIntro />
          <DiscoveryToast />
          <EvolutionChoice />
          <CarouselPanel />
          <AugmentChoice />
          <Hotkeys />
        </>
      )}
      <ProfileToast />
      <InviteToast />
      <LoadingScreen />
      <AudioDirector />
    </div>
  );
}
