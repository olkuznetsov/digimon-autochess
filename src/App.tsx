import { Scene } from "./three/Scene";
import { Hud } from "./ui/Hud";
import { Shop } from "./ui/Shop";
import { SynergyPanel } from "./ui/SynergyPanel";

export default function App() {
  return (
    <div className="app">
      <Scene />
      <Hud />
      <SynergyPanel />
      <Shop />
    </div>
  );
}
