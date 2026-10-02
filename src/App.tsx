import { Scene } from "./three/Scene";
import { Hud } from "./ui/Hud";
import { Shop } from "./ui/Shop";
import { SynergyPanel } from "./ui/SynergyPanel";
import { EvolutionChoice } from "./ui/EvolutionChoice";
import { ItemTray } from "./ui/ItemTray";
import { UnitPanel } from "./ui/UnitPanel";
import { EvoBanner } from "./ui/EvoBanner";
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

export default function App() {
  return (
    <div className="app">
      <Scene />
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
      <DiscoveryToast />
      <EvolutionChoice />
      <CarouselPanel />
      <AugmentChoice />
      <LoadingScreen />
      <AudioDirector />
      <Hotkeys />
    </div>
  );
}
