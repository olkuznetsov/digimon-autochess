import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useEffect, useState } from "react";
import { Board } from "./Board";
import { Creature } from "./Creature";
import { BattleFx } from "./BattleFx";
import { DigitalEnvironment } from "./Environment";
import { useGame } from "../game/store";
import { ITEMS } from "../game/items";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import {
  cellToWorld,
  benchToWorld,
  worldToPlayerCell,
  worldToBenchSlot,
  BENCH_BOUNDARY,
} from "../game/board";

// pointer-down position of the current drag, to tell a click from a drag
let dragStart: { x: number; z: number } | null = null;

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    // Framed so the bench stays on screen while the horizon (data sun) is visible.
    // Portrait phones need a wider fov and a higher, farther camera or the board
    // gets cropped at the sides.
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width / size.height < 0.9;
    if (portrait) {
      cam.fov = 70;
      cam.position.set(0, 8.2, -10.6);
      cam.lookAt(0, 0.4, 3.4);
    } else {
      cam.fov = 55;
      cam.position.set(0, 6.6, -9.2);
      cam.lookAt(0, 0.3, 3.2);
    }
    cam.updateProjectionMatrix();
    if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = scene;
  }, [camera, scene, size]);
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
        const form = FORMS[u.formId];
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
            formId={u.formId}
            position={pos}
            color={ATTR_COLOR[form.attribute]}
            name={form.name}
            star={form.stage}
            hp={1}
            maxHp={1}
            showHealth={false}
            dragging={u.uid === dragId}
            itemEmojis={(u.items ?? []).map((id) => ITEMS[id]?.emoji ?? "")}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              if (useGame.getState().selectedItem) {
                useGame.getState().equipItem(u.uid);
                return;
              }
              dragStart = { x: e.point.x, z: e.point.z };
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
        const form = FORMS[f.formId];
        const [x, z] = cellToWorld(f.col, f.row);
        return (
          <Creature
            key={f.uid}
            formId={f.formId}
            position={[x, 0, z]}
            color={ATTR_COLOR[f.attribute]}
            name={form.name}
            star={form.stage}
            hp={f.hp}
            maxHp={f.maxHp}
            team={f.team}
            cooldown={f.cooldown}
            attackSpeed={f.attackSpeed}
            moving={f.moving}
            mana={f.mana}
            maxMana={f.maxMana}
            itemEmojis={(f.items ?? []).map((id) => ITEMS[id]?.emoji ?? "")}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              useGame.getState().setInspected(f.uid);
            }}
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
    // barely moved = a click, not a drag -> open the unit inspector
    const moved = dragStart ? Math.hypot(dragPos.x - dragStart.x, dragPos.z - dragStart.z) : 99;
    dragStart = null;
    if (moved < 0.2) {
      useGame.getState().setInspected(id);
      setDrag(null, null);
      setHovered(null);
      return;
    }
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
      <fog attach="fog" args={["#05060f", 14, 38]} />

      <DigitalEnvironment />

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
      {phase === "battle" && <BattleFx />}

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
    <Canvas shadows camera={{ position: [0, 6.6, -9.2], fov: 55 }} dpr={[1, 2]}>
      <SceneContents />
    </Canvas>
  );
}
