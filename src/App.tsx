import { Scene } from "./three/Scene";
import { Hud } from "./ui/Hud";
import { Shop } from "./ui/Shop";
import { SynergyPanel } from "./ui/SynergyPanel";
import { EvolutionChoice } from "./ui/EvolutionChoice";
import { ItemTray } from "./ui/ItemTray";
import { UnitPanel } from "./ui/UnitPanel";

export default function App() {
  return (
    <div className="app">
      <Scene />
      <Hud />
      <SynergyPanel />
      <Shop />
      <ItemTray />
      <UnitPanel />
      <EvolutionChoice />
    </div>
  );
}
