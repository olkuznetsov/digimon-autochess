import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useState } from "react";
import { Board } from "./Board";
import { Creature } from "./Creature";
import { useGame } from "../game/store";
import { CREATURES, ATTR_COLOR, displayName } from "../game/creatures";
import {
  cellToWorld,
  benchToWorld,
  worldToPlayerCell,
  worldToBenchSlot,
  BENCH_BOUNDARY,
} from "../game/board";

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    camera.position.set(0, 7.2, -8.4);
    camera.lookAt(0, 0, -0.4);
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene;
  }, [camera, scene]);
  return null;
}

function PrepUnits() {
  const units = useGame((s) => s.units);
  const dragId = useGame((s) => s.dragId);
  const dragPos = useGame((s) => s.dragPos);
  const setDrag = useGame((s) => s.setDrag);

  return (
    <>
      {units.map((u) => {
        const def = CREATURES[u.defId];
        let pos: [number, number, number];
        if (u.uid === dragId && dragPos) {
          pos = [dragPos.x, 0.7, dragPos.z];
        } else if (u.placement.kind === "bench") {
          const [x, z] = benchToWorld(u.placement.slot);
          pos = [x, 0, z];
        } else {
          const [x, z] = cellToWorld(u.placement.col, u.placement.row);
          pos = [x, 0, z];
        }
        return (
          <Creature
            key={u.uid}
            defId={u.defId}
            position={pos}
            color={ATTR_COLOR[def.attribute]}
            name={displayName(def, u.star)}
            star={u.star}
            hp={1}
            maxHp={1}
            showHealth={false}
            dragging={u.uid === dragId}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setDrag(u.uid, { x: e.point.x, z: e.point.z });
            }}
          />
        );
      })}
    </>
  );
}

function BattleUnits() {
  const fighters = useGame((s) => s.fighters);
  return (
    <>
      {fighters.map((f) => {
        const def = CREATURES[f.defId];
        const [x, z] = cellToWorld(f.col, f.row);
        return (
          <Creature
            key={f.uid}
            defId={f.defId}
            position={[x, 0, z]}
            color={ATTR_COLOR[f.attribute]}
            name={displayName(def, f.star)}
            star={f.star}
            hp={f.hp}
            maxHp={f.maxHp}
            team={f.team}
            cooldown={f.cooldown}
            attackSpeed={f.attackSpeed}
            moving={f.moving}
          />
        );
      })}
    </>
  );
}

function BattleRunner() {
  const stepBattle = useGame((s) => s.stepBattle);
  useFrame((_, dt) => stepBattle(Math.min(dt, 0.05)));
  return null;
}

function SceneContents() {
  const phase = useGame((s) => s.phase);
  const dragId = useGame((s) => s.dragId);
  const setDrag = useGame((s) => s.setDrag);
  const moveUnit = useGame((s) => s.moveUnit);
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);

  const commitDrag = () => {
    const { dragId: id, dragPos } = useGame.getState();
    if (!id || !dragPos) return;
    if (dragPos.z < BENCH_BOUNDARY) {
      moveUnit(id, { kind: "bench", slot: worldToBenchSlot(dragPos.x) });
    } else {
      const { col, row } = worldToPlayerCell(dragPos.x, dragPos.z);
      moveUnit(id, { kind: "board", col, row });
    }
    setDrag(null, null);
    setHovered(null);
  };

  // fallback: release outside the catcher plane still ends the drag
  useEffect(() => {
    const up = () => {
      if (useGame.getState().dragId) commitDrag();
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inPrep = phase === "prep";

  return (
    <>
      <color attach="background" args={["#05060f"]} />
      <fog attach="fog" args={["#05060f", 12, 26]} />

      <CameraRig />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#6fa8ff", "#1a1030", 0.6]} />
      <directionalLight
        position={[4, 10, -2]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-5, 4, -6]} intensity={40} color="#ff4d6d" distance={20} />
      <pointLight position={[5, 4, 2]} intensity={40} color="#3aa0ff" distance={20} />

      <Board highlight={!!dragId} hovered={hovered} />

      {inPrep && <PrepUnits />}
      {!inPrep && <BattleUnits />}
      {phase === "battle" && <BattleRunner />}

      {/* invisible pointer catcher for dragging */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!useGame.getState().dragId) return;
          const x = e.point.x;
          const z = e.point.z;
          setDrag(useGame.getState().dragId, { x, z });
          if (z >= BENCH_BOUNDARY) setHovered(worldToPlayerCell(x, z));
          else setHovered(null);
        }}
        onPointerUp={commitDrag}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.35} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.8} />
      </EffectComposer>
    </>
  );
}

export function Scene() {
  return (
    <Canvas shadows camera={{ position: [0, 7.2, -8.4], fov: 42 }} dpr={[1, 2]}>
      <SceneContents />
    </Canvas>
  );
}
