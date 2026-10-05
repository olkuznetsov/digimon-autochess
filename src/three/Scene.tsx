import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import { Creature } from "./Creature";
import { BattleFx } from "./BattleFx";
import { IslandEnvironment } from "./Island";
import { useGame, type PvpBoardUnit } from "../game/store";
import { opponentOf } from "../game/lobby";
import { useSettings } from "../settings";
import { useProfile } from "../profile/store";
import { MenuStage } from "./MenuStage";
import { newDrive, type UnitDrive } from "./unitDrive";
import { juice, resetJuice, tickJuice } from "./juice";
import { SIM_DT } from "../game/battle";
import { isBossRound, makeEnemyWave, makeVsWave, vsRoundKind } from "../game/tuning";
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
/** dev: a camera for recorded clips — `__cam.k` (0…1) pulls the board camera in toward
 *  where it looks, `__cam.x` / `__cam.z` pan it (world units); it stands in for the
 *  portrait fight camera below */
const devCam = { k: 0, x: 0, z: 0 };
/** Portrait: the board is width-bound, so a fight is small on a phone — once it starts the
 *  camera drifts after the fight's centre and pulls in toward where it looks, up to this
 *  far, as long as every living fighter stays in the frame. */
const FIGHT_PULL = 0.32;
/** room kept between a fighter and the frame's edge (world units) */
const FIGHT_MARGIN = 0.7;
const UP = new THREE.Vector3(0, 1, 0);
if (import.meta.env.DEV) Object.assign(window, { __cam: devCam });

/** The player's own view of the board: the mouse wheel (toward the pointer) or a pinch zooms,
 *  a middle click resets. `zoom` scales the camera's distance (under 1 = closer), `panX` /
 *  `panZ` shift where it looks (zooming in leans toward the pointer); the camera eases after. */
const playerView = { zoom: 1, panX: 0, panZ: 0 };
const VIEW_ZOOM_MIN = 0.4;
const VIEW_ZOOM_MAX = 1.3;

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const push = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const battleLook = useMemo(() => new THREE.Vector3(), []);
  const follow = useMemo(() => new THREE.Vector2(), []);
  const pull = useRef(0);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  const rel = useMemo(() => new THREE.Vector3(), []);
  const eased = useRef({ zoom: 1, panX: 0, panZ: 0 });
  const lastLook = useMemo(() => new THREE.Vector3(0, 0, 0.6), []);

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __gl: gl });
  }, [scene, gl]);

  // the player's zoom: wheel and middle click on the board, pinch on a touch screen
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(UP, 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const onBoard = () => useProfile.getState().screen !== "menu";
    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const v = playerView;
      const zoom = THREE.MathUtils.clamp(v.zoom * factor, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
      if (zoom < v.zoom) {
        // in: lean toward the ground under the pointer, so it stays under it
        const r = el.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(ground, hit)) {
          const k = 1 - zoom / v.zoom;
          v.panX += (hit.x - lastLook.x) * k;
          v.panZ += (hit.z - lastLook.z) * k;
        }
      } else if (v.zoom < 1) {
        // out: back toward the whole board — centred again at the default distance
        const k = zoom >= 1 ? 0 : (1 - zoom) / (1 - v.zoom);
        v.panX *= k;
        v.panZ *= k;
      }
      v.panX = THREE.MathUtils.clamp(v.panX, -3.5, 3.5);
      v.panZ = THREE.MathUtils.clamp(v.panZ, -4, 3.5);
      v.zoom = zoom;
    };
    const onWheel = (e: WheelEvent) => {
      if (!onBoard()) return;
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    // a middle click anywhere on the board screen resets (a unit's name label sits over the
    // canvas too) — and, kept from the page, starts no autoscroll
    const onMiddle = (e: PointerEvent) => {
      if (e.button !== 1 || !onBoard()) return;
      e.preventDefault();
      Object.assign(playerView, { zoom: 1, panX: 0, panZ: 0 });
    };
    // pinch: two fingers on the board
    const touches = new Map<number, { x: number; y: number }>();
    let spread = 0;
    const span = () => {
      const [a, b] = [...touches.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !onBoard()) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        spread = span().d;
        // the second finger makes it a pinch, not a drag
        if (useGame.getState().dragId) useGame.getState().setDrag(null, null);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || spread <= 0) return;
      const s = span();
      if (s.d > 0) zoomAt(spread / s.d, s.x, s.y);
      spread = s.d;
    };
    const onPointerUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) spread = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onMiddle);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onMiddle);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [gl, camera, lastLook]);

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
    // and eases in a little (portrait pulls in further on the fight — FIGHT_PULL)
    // framed for the 7 × 4 board and its 9-slot bench (portrait is width-bound: the bench
    // spans the board's 7.7 units)
    if (useProfile.getState().screen === "menu") {
      // the main menu: the partner on the painted beach, its feet low in the frame, with a
      // slow drift. Wide screens shift it left of centre (screen right is world -x here),
      // clear of the partner card; portrait frames it high, above the partner card and its
      // care buttons.
      const t = state.clock.elapsedTime;
      const aspect = size.width / size.height;
      if (portrait) {
        pos.set(Math.sin(t * 0.12) * 0.3, 2.0, -6.2);
        look.set(0, -0.55, 0);
      } else {
        const shift = aspect >= 1.6 ? -0.75 : aspect >= 1.3 ? -0.35 : 0;
        pos.set(shift + Math.sin(t * 0.12) * 0.35, 1.6, -4.4);
        look.set(shift, 1.39, 0);
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
    if (import.meta.env.DEV && (devCam.k || devCam.x || devCam.z)) {
      pos.lerp(look, devCam.k);
      pos.x += devCam.x;
      look.x += devCam.x;
      pos.z += devCam.z;
      look.z += devCam.z;
    } else if (portrait) {
      const living = phase === "prep" ? [] : useGame.getState().fighters.filter((f) => f.hp > 0);
      // the fight's centre: where the living stand, followed halfway and not far
      let cx = 0;
      let cz = 0;
      for (const f of living) {
        const [x, z] = cellToWorld(f.col, f.row);
        cx += x;
        cz += z;
      }
      const n = living.length;
      const tx = n ? THREE.MathUtils.clamp((cx / n) * 0.5, -1, 1) : 0;
      const tz = n ? THREE.MathUtils.clamp((cz / n - 1) * 0.4, -1, 1) : 0;
      const ease = 1 - Math.exp(-dt * 2.2);
      follow.x += (tx - follow.x) * ease;
      follow.y += (tz - follow.y) * ease;
      pos.x += follow.x * push.current;
      look.x += follow.x * push.current;
      pos.z += follow.y * push.current;
      look.z += follow.y * push.current;
      // how far in: pulling toward the look point keeps each fighter's sideways offset and
      // shortens its depth, so the widest one sets the limit
      fwd.subVectors(look, pos);
      const reach = fwd.length();
      fwd.divideScalar(reach);
      side.crossVectors(fwd, UP).normalize();
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (size.width / size.height);
      let k = FIGHT_PULL;
      for (const f of living) {
        const [x, z] = cellToWorld(f.col, f.row);
        rel.set(x, 0.6, z).sub(pos);
        k = Math.min(k, (rel.dot(fwd) - (Math.abs(rel.dot(side)) + FIGHT_MARGIN) / tanHalf) / reach);
      }
      pull.current += (Math.max(0, k) * push.current - pull.current) * ease;
      pos.lerp(look, pull.current);
    }

    // the player's zoom and pan on top
    const ev = eased.current;
    const ease = 1 - Math.exp(-dt * 12);
    ev.zoom += (playerView.zoom - ev.zoom) * ease;
    ev.panX += (playerView.panX - ev.panX) * ease;
    ev.panZ += (playerView.panZ - ev.panZ) * ease;
    look.x += ev.panX;
    look.z += ev.panZ;
    pos.x += ev.panX;
    pos.z += ev.panZ;
    pos.sub(look).multiplyScalar(ev.zoom).add(look);
    lastLook.copy(look);

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
              // the middle button resets the view, the right one isn't ours
              if (e.nativeEvent.button !== 0) return;
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
    // an attack starts (its interval restarts): the swing begins, its blow lands a wind-up later
    if (f.cooldown > prev.current.cooldown + 0.01) {
      d.windup = f.swing ?? d.windup;
      d.attackKey++;
    }
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
        if (e.nativeEvent.button !== 0) return;
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
/** phones: no MSAA on the HDR buffers — at 2× pixel density it's tens of MB of GPU memory
 *  for edges the density already smooths */
const COARSE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export function ScenePost({ low = false, day = false }: { low?: boolean; day?: boolean }) {
  return (
    <EffectComposer multisampling={low || COARSE ? 0 : 4}>
      {/* bloom reads the HDR buffer: only emissive and effects (> 1.0) glow, not lit fur
          (by day not the painted sky or the sand either: their whites are 1.0) */}
      <Bloom intensity={0.85} luminanceThreshold={day ? 1.05 : 0.9} luminanceSmoothing={0.3} mipmapBlur />
      {/* the composer disables the renderer's tone mapping, so it happens here */}
      <ToneMapping mode={TONE_MAPPING} />
      <Vignette eskil={false} offset={0.25} darkness={day ? 0.4 : 0.8} />
    </EffectComposer>
  );
}

/** The main menu's scene: the partner on File Island (a painted backdrop and its own
 *  daylight, see MenuStage) — no board, no Digital World. */
function MenuContents() {
  const low = useSettings((s) => s.quality === "low");
  return (
    <>
      <CameraRig />
      <MenuStage />
      <ScenePost low={low} day />
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
  // dusk, and Devimon's gears, while a boss is near
  const boss = useGame((s) => (s.pvp ? vsRoundKind(s.round) === "boss" : isBossRound(s.round)));
  // the solo run's last round: the final battle, under the eclipse
  const final = useGame((s) => !s.pvp && !s.ghost && s.round === 15);

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
      <IslandEnvironment boss={boss} final={final} />

      <CameraRig />

      <Board highlight={!!dragId} hovered={hovered} boss={boss} />

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

      <ScenePost low={low} day />
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
