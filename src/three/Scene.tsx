import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import { Creature } from "./Creature";
import { BattleFx } from "./BattleFx";
import { DigitalEnvironment, HORIZON } from "./Environment";
import { useGame, type PvpBoardUnit } from "../game/store";
import { opponentOf } from "../game/lobby";
import { useSettings } from "../settings";
import { useProfile } from "../profile/store";
import { MenuStage } from "./MenuStage";
import { newDrive, type UnitDrive } from "./unitDrive";
import { juice, resetJuice, tickJuice } from "./juice";
import { SIM_DT } from "../game/battle";
import { makeEnemyWave, makeVsWave, vsRoundKind } from "../game/tuning";
import { ITEMS } from "../game/items";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import {
  cellToWorld,
  benchToWorld,
  worldToPlayerCell,
  worldToBenchSlot,
  BENCH_BOUNDARY,
  COLS,
  ROWS,
} from "../game/board";

// pointer-down position of the current drag, to tell a click from a drag
let dragStart: { x: number; z: number } | null = null;

/** Camera: portrait/landscape framing, a gentle push toward the fight during
 *  battles, and trauma-based shake. Also ticks the shared juice clock first thing
 *  every frame. */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const push = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const battleLook = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __gl: gl });
  }, [scene, gl]);

  useFrame((state, dt) => {
    tickJuice(dt);
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width / size.height < 0.9;
    const fov = portrait ? 70 : 55;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // prep frames board + bench above the shop panel; battle tilts up onto the board
    // and eases in a little (portrait already fills the width — pushing in would crop)
    // framed for the 7 × 4 board and its 9-slot bench (portrait is width-bound: the bench
    // spans the board's 7.7 units)
    if (useProfile.getState().screen === "menu") {
      // the main menu: the partner on its pedestal, framed low with a slow drift
      const t = state.clock.elapsedTime;
      if (portrait) {
        pos.set(Math.sin(t * 0.12) * 0.5, 2.5, -7.4);
        look.set(0, 1.55, 0);
      } else {
        pos.set(Math.sin(t * 0.12) * 0.7, 2.1, -5.6);
        look.set(0, 1.25, 0);
      }
      cam.position.copy(pos);
      cam.lookAt(look);
      return;
    }
    if (portrait) {
      pos.set(0, 11.0, -13.6);
      look.set(0, 0.4, 2.2);
      battleLook.set(0, 0.55, 2.6);
    } else {
      pos.set(0, 8.4, -11.8);
      look.set(0, 0.0, 0.6);
      battleLook.set(0, 0.3, 2.4);
    }
    const phase = useGame.getState().phase;
    const target = phase === "prep" ? 0 : 1;
    push.current += (target - push.current) * (1 - Math.exp(-dt * 1.8));
    look.lerp(battleLook, push.current);
    pos.lerp(look, push.current * (portrait ? 0.05 : 0.14));

    // trauma^2 shake: small positional jitter + a touch of roll
    const t = juice.trauma * juice.trauma;
    if (t > 0.0001) {
      const time = state.clock.elapsedTime * 28;
      pos.x += Math.sin(time * 1.13) * 0.16 * t;
      pos.y += Math.sin(time * 1.71 + 1.3) * 0.12 * t;
      pos.z += Math.sin(time * 0.93 + 2.1) * 0.08 * t;
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    if (t > 0.0001) cam.rotation.z += Math.sin(state.clock.elapsedTime * 21) * 0.012 * t;
  });
  return null;
}

function PrepUnits() {
  const units = useGame((s) => s.units);
  const evo = useGame((s) => s.evoFlash);
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
            name={form.name + (u.star ? ` ${"★".repeat(u.star)}` : "")}
            stage={form.stage}
            star={u.star}
            shrink={u.placement.kind === "bench" && u.uid !== dragId ? 0.8 : 1}
            showHealth={false}
            evolveKey={evo && evo.uid === u.uid ? evo.key : undefined}
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

const NO_BOARD: PvpBoardUnit[] = [];

/** Who waits on the enemy half during planning: in VS the live board of the player
 *  being scouted, else of this round's opponent; otherwise the wild / boss / solo wave. */
function EnemyPreview() {
  const round = useGame((s) => s.round);
  const vs = useGame((s) => !!s.pvp && s.pvp.snap.stage !== "lobby");
  const seed = useGame((s) => (s.pvp ? (s.pvp.snap.variant ?? 0) : s.runSeed));
  const scouting = useGame((s) => s.pvp?.scout != null);
  const shown = useGame((s) => {
    const p = s.pvp;
    const seat = p ? (p.scout ?? opponentOf(p.snap.plan, p.seat)?.seat) : undefined;
    return p && seat != null ? (p.boards[seat] ?? NO_BOARD) : NO_BOARD;
  });
  const units = useMemo(() => {
    if (vs && (scouting || vsRoundKind(round) === "pvp")) {
      return shown.map((u) => ({
        key: `o${u.uid}`,
        formId: u.formId,
        col: COLS - 1 - u.col,
        row: ROWS - 1 - u.row,
        boss: false,
        items: u.items ?? [],
      }));
    }
    const wave = vs ? makeVsWave(round, "W", seed) : makeEnemyWave(round, seed);
    return wave.map((f) => ({ key: f.uid, formId: f.formId, col: f.col, row: f.row, boss: !!f.boss, items: [] as string[] }));
  }, [round, vs, seed, scouting, shown]);

  return (
    <>
      {units.map((u) => {
        const form = FORMS[u.formId];
        if (!form) return null;
        const [x, z] = cellToWorld(u.col, u.row);
        return (
          <Creature
            key={u.key}
            formId={u.formId}
            position={[x, 0, z]}
            color={ATTR_COLOR[form.attribute]}
            name={form.name}
            stage={form.stage}
            team="enemy"
            boss={u.boss}
            showHealth={false}
            itemEmojis={u.items.map((id) => ITEMS[id]?.emoji ?? "")}
          />
        );
      })}
    </>
  );
}

/** Board cell → world XZ for display (PvP guests see the canonical fight mirrored). */
function viewXZ(col: number, row: number, flip: boolean): [number, number] {
  return flip ? cellToWorld(COLS - 1 - col, ROWS - 1 - row) : cellToWorld(col, row);
}

function findFighter(uid: string) {
  const s = useGame.getState();
  const alive = s.fighters.find((f) => f.uid === uid);
  if (alive) return { f: alive, dead: false };
  const corpse = s.corpses.find((f) => f.uid === uid);
  return corpse ? { f: corpse, dead: true } : null;
}

/**
 * One combat unit. Reads its fighter from the store every frame and turns sim state
 * into animation state on its drive: position, facing its target, attacks landed
 * (cooldown jumps), hits taken (hp drops; heavy ≥ 14% max HP), casts, freeze, death,
 * victory. No React re-render per sim tick.
 */
function BattleUnit({ uid }: { uid: string }) {
  const found = findFighter(uid)!;
  const f0 = found.f;
  const flip = useGame.getState().viewFlip;
  const form = FORMS[f0.formId];
  const team = flip ? (f0.team === "player" ? "enemy" : "player") : f0.team;
  const [x0, z0] = viewXZ(f0.col, f0.row, flip);
  const drive = useRef<UnitDrive>(newDrive(x0, z0, team === "player" ? 0 : Math.PI));
  const prev = useRef({ cooldown: f0.cooldown, hp: f0.hp });

  useFrame(() => {
    const hit = findFighter(uid);
    if (!hit) return;
    const { f, dead } = hit;
    const s = useGame.getState();
    const d = drive.current;
    const [x, z] = viewXZ(f.col, f.row, s.viewFlip);
    d.x = x;
    d.z = z;
    const target = !dead && f.targetUid ? s.fighters.find((o) => o.uid === f.targetUid) : undefined;
    if (target) {
      const [tx, tz] = viewXZ(target.col, target.row, s.viewFlip);
      if ((tx - x) ** 2 + (tz - z) ** 2 > 1e-4) d.yaw = Math.atan2(tx - x, tz - z);
    }
    d.moving = f.moving && !dead;
    d.cooldown = f.cooldown;
    d.attackInterval = 1 / f.attackSpeed;
    d.engaged = !!target && !f.moving;
    if (f.cooldown > prev.current.cooldown + 0.01) d.attackKey++;
    d.castKey = f.castKey;
    const lost = prev.current.hp - f.hp;
    if (lost > 0.5) {
      d.hitKey++;
      if (lost >= f.maxHp * 0.14) d.heavyHitKey++;
    }
    d.stunned = f.stunned > 0;
    d.burning = (f.burnLeft ?? 0) > 0;
    d.dead = dead;
    d.win = s.phase === "result" && !dead;
    d.hpFrac = Math.max(0, f.hp) / f.maxHp;
    d.manaFrac = Math.min(1, f.mana / f.maxMana);
    d.shieldFrac = Math.min(1, f.shield / f.maxHp);
    prev.current.cooldown = f.cooldown;
    prev.current.hp = f.hp;
  });

  return (
    <Creature
      formId={f0.formId}
      drive={drive}
      color={ATTR_COLOR[f0.attribute]}
      name={form.name + (f0.star ? ` ${"★".repeat(f0.star)}` : "")}
      stage={form.stage}
      star={f0.star}
      team={team}
      boss={f0.boss}
      spawn
      itemEmojis={(f0.items ?? []).map((id) => ITEMS[id]?.emoji ?? "")}
      maxHp={f0.maxHp}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        useGame.getState().setInspected(uid);
      }}
    />
  );
}

function BattleUnits() {
  // re-render only when the roster changes (a death moves a uid to the corpses list)
  const roster = useGame((s) => [...s.fighters, ...s.corpses].map((f) => f.uid).join("|"));
  return (
    <>
      {roster
        .split("|")
        .filter(Boolean)
        .map((uid) => (
          <BattleUnit key={uid} uid={uid} />
        ))}
    </>
  );
}

/** Advances combat in fixed SIM_DT steps (frame-rate independent, identical
 *  on every device). Remounts per battle, so the accumulator starts at 0. */
function BattleRunner() {
  const acc = useRef(0);
  // units materialize before the first blow; the HUD shows "FIGHT!" while battleTime is 0
  const intro = useRef(0.9);
  useEffect(() => {
    resetJuice();
    return () => {
      juice.speed = 1;
    };
  }, []);
  useFrame((_, dt) => {
    const game = useGame.getState();
    juice.speed = game.pvp ? 1 : game.simSpeed;
    if (intro.current > 0) {
      intro.current -= Math.min(dt, 0.25);
      return;
    }
    acc.current += Math.min(dt, 0.25) * juice.speed * juice.timeScale;
    let steps = 0;
    while (acc.current >= SIM_DT && steps < 12) {
      acc.current -= SIM_DT;
      steps++;
      game.stepBattle(SIM_DT);
      if (useGame.getState().phase !== "battle") {
        acc.current = 0;
        break;
      }
    }
  });
  return null;
}

// postprocessing's ToneMappingMode.NEUTRAL (the enum lives in a nested dependency
// that can't be imported directly): keeps the neon hues, only rolls off highlights
const TONE_MAPPING = 8;

/** The game's light rig: image-based light from Lightformers plus a few fills. */
export function SceneLighting() {
  return (
    <>
      {/* image-based light: soft key + synthwave rims, baked once into a cube map */}
      <Environment resolution={128} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 6, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={3} color="#39d8ff" position={[-8, 2, 4]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={3} color="#ff4d88" position={[8, 2, 4]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#7a5cff" position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={6} />
      </Environment>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={["#6fa8ff", "#1a1030", 0.45]} />
      <directionalLight position={[4, 10, -2]} intensity={1.4} />
      <pointLight position={[-5, 4, -6]} intensity={40} color="#ff4d6d" distance={20} />
      <pointLight position={[5, 4, 2]} intensity={40} color="#3aa0ff" distance={20} />
    </>
  );
}

/** Bloom (HDR only), tone mapping and vignette — the game's post chain. */
export function ScenePost({ low = false }: { low?: boolean }) {
  return (
    <EffectComposer multisampling={low ? 0 : 4}>
      {/* bloom reads the HDR buffer: only emissive and effects (> 1.0) glow, not lit fur */}
      <Bloom intensity={0.85} luminanceThreshold={0.9} luminanceSmoothing={0.3} mipmapBlur />
      {/* the composer disables the renderer's tone mapping, so it happens here */}
      <ToneMapping mode={TONE_MAPPING} />
      <Vignette eskil={false} offset={0.25} darkness={0.8} />
    </EffectComposer>
  );
}

/** The main menu's scene: the Digital World around the partner's pedestal — no board. */
function MenuContents() {
  const low = useSettings((s) => s.quality === "low");
  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 16, 52]} />
      <DigitalEnvironment />
      <CameraRig />
      <SceneLighting />
      <MenuStage />
      <ScenePost low={low} />
    </>
  );
}

function SceneContents() {
  const low = useSettings((s) => s.quality === "low");
  const phase = useGame((s) => s.phase);
  const dragId = useGame((s) => s.dragId);
  const battleSeq = useGame((s) => s.battleSeq);
  const setDrag = useGame((s) => s.setDrag);
  const moveUnit = useGame((s) => s.moveUnit);
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);

  const commitDrag = (clientX?: number, clientY?: number) => {
    const { dragId: id, dragPos } = useGame.getState();
    if (!id) return;
    // dropped on the shop panel → sell it
    if (clientX !== undefined && clientY !== undefined && document.elementFromPoint(clientX, clientY)?.closest(".shop")) {
      dragStart = null;
      useGame.getState().sellUnit(id);
      setDrag(null, null);
      setHovered(null);
      return;
    }
    if (!dragPos) return;
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
    const up = (e: PointerEvent) => {
      if (useGame.getState().dragId) commitDrag(e.clientX, e.clientY);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inPrep = phase === "prep";

  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 16, 52]} />

      <DigitalEnvironment />

      <CameraRig />
      <SceneLighting />

      <Board highlight={!!dragId} hovered={hovered} />

      {inPrep && <PrepUnits />}
      {inPrep && <EnemyPreview />}
      {/* fresh components per fight; sibling keys must stay distinct */}
      {!inPrep && <BattleUnits key={`units-${battleSeq}`} />}
      {phase === "battle" && <BattleRunner key={`runner-${battleSeq}`} />}
      {phase !== "prep" && <BattleFx key={`fx-${battleSeq}`} />}

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
        onPointerUp={(e: ThreeEvent<PointerEvent>) => commitDrag(e.nativeEvent.clientX, e.nativeEvent.clientY)}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <ScenePost low={low} />
    </>
  );
}

export function Scene() {
  const low = useSettings((s) => s.quality === "low");
  const menu = useProfile((s) => s.screen === "menu");
  return (
    // no shadow maps: models ground themselves with contact-shadow blobs (Creature.tsx)
    <Canvas camera={{ position: [0, 8.4, -11.8], fov: 55 }} dpr={low ? 1 : [1, 2]}>
      {menu ? <MenuContents /> : <SceneContents />}
    </Canvas>
  );
}
