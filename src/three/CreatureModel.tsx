import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { TARGET_HEIGHT, type ModelTweak } from "./models";
import type { UnitDrive } from "./unitDrive";
import { withUnitFx, type UnitFxUniforms } from "./unitFx";
import { juice } from "./juice";

interface Props {
  url: string;
  tweak?: ModelTweak;
  /** per-frame animation state, owned by Creature / BattleUnit */
  drive: MutableRefObject<UnitDrive>;
  /** attribute colour: dissolve edge glow */
  color: string;
  /** materialize in on mount (battle start, digivolution) */
  spawnOnMount?: boolean;
  /** called when the death dissolve begins (for the data-fragment burst) */
  onDissolveStart?: () => void;
}

/** fraction of an attack clip where the blow visually lands */
const CONTACT = 0.4;
const WHITE = new THREE.Color("#ffffff");
const ICE = new THREE.Color("#7fe9ff");

type Mode = "loco" | "attack" | "cast" | "hit" | "win" | "dead";

/**
 * A creature model: normalized to TARGET_HEIGHT with feet at y=0, per-instance
 * materials with dissolve/flash effects (unitFx), and an event-driven animation
 * state machine read from `drive` every frame:
 *   dead > cast (special01) > attack (attack01, swing anticipated so the blow lands
 *   when the damage does, sped up to fit the attack interval) > heavy-hit (damage)
 *   > win > idle/move.
 * Facing/position are applied by the parent.
 *
 * Hard-won rules: clips come from models-src via scripts/optimize-models.mjs (deduped,
 * renamed, baked scale harmonized) — never mutate tracks here; the FIRST clip plays at
 * full weight because the deferred fit measures the posed skeleton on frame ~3; a
 * restarted clip is reset without a fade (fading the same action in dips its weight
 * to 0 = a bind-pose flash).
 */
export function CreatureModel({ url, tweak, drive, color, spawnOnMount, onDissolveStart }: Props) {
  const { scene, animations } = useGLTF(url);

  // Clone the skeleton AND the materials, so per-instance effects stay per-instance.
  const { cloned, fx } = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    const uniforms: UnitFxUniforms[] = [];
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((m) => {
        const r = withUnitFx(m);
        uniforms.push(r.uniforms);
        return r.material;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return { cloned: c, fx: uniforms };
  }, [scene]);

  useEffect(
    () => () => {
      cloned.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      });
    },
    [cloned],
  );

  const edge = useMemo(() => new THREE.Color(color), [color]);
  useEffect(() => {
    for (const u of fx) u.uEdgeColor.value.copy(edge);
  }, [fx, edge]);

  // Root the mixer on the CLONE so clips bind to the cloned skeleton's bones.
  const { actions, names, mixer } = useAnimations(animations, cloned);
  const clips = useMemo(() => {
    const find = (...cands: string[]) => {
      for (const c of cands) {
        const k = names.find((n) => n.toLowerCase() === c);
        if (k && actions[k]) return actions[k]!;
      }
      return undefined;
    };
    return {
      idle: find("idle"),
      move: find("move", "walk", "run"),
      attack: find("attack01", "attack", "attack02"),
      special: find("special01", "special02", "special", "attack02"),
      damage: find("damage"),
      down: find("down"),
      win: find("win"),
    };
  }, [actions, names]);
  const hasClips = names.length > 0;

  const current = useRef<THREE.AnimationAction | null>(null);
  const mode = useRef<Mode>("loco");
  const seen = useRef({ ...drive.current });
  const flash = useRef(0);
  const sinceFlash = useRef(1);
  const knock = useRef(0);
  const dissolve = useRef(spawnOnMount ? 1 : 0);
  const dissolveDir = useRef(spawnOnMount ? -1 : 0);
  const deathT = useRef(0);
  const dissolveAt = useRef(Infinity);
  const inner = useRef<THREE.Group>(null);

  const play = (next: THREE.AnimationAction | undefined, once: boolean, fade = 0.15, timeScale = 1, restart = false) => {
    if (!next) return false;
    next.timeScale = timeScale;
    if (current.current === next && !restart) return true;
    const first = current.current === null;
    const same = current.current === next;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    if (first || same) next.setEffectiveWeight(1).play();
    else next.fadeIn(fade).play();
    if (current.current && !same) current.current.fadeOut(fade);
    current.current = next;
    return true;
  };

  const swing = (d: UnitDrive) => {
    const a = clips.attack;
    if (!a) return;
    const dur = a.getClip().duration;
    const ts = THREE.MathUtils.clamp(dur / (d.attackInterval * 0.92), 1, 2.6);
    mode.current = "attack";
    play(a, true, 0.08, ts, true);
  };

  useFrame((_, dt) => {
    const d = drive.current;

    // ---- material effects ----
    // hit flash: short and moderate — a unit tanking several attackers must not
    // end up permanently white (a white model is always a bug)
    flash.current = Math.max(0, flash.current - dt * 12);
    knock.current = Math.max(0, knock.current - dt * 9);
    sinceFlash.current += dt;
    const tint = d.stunned && !d.dead ? 0.3 : 0;
    const f = Math.max(flash.current * 0.45, tint);
    const fc = flash.current * 0.45 >= tint ? WHITE : ICE;
    if (dissolveDir.current !== 0) {
      dissolve.current = THREE.MathUtils.clamp(
        dissolve.current + dissolveDir.current * dt * (dissolveDir.current > 0 ? 1.35 : 2.2),
        0,
        1,
      );
      // stop only on reaching the target in the direction of travel — the first
      // frame after mount often has dt = 0, which must not end a fade at its start
      if ((dissolveDir.current < 0 && dissolve.current <= 0) || (dissolveDir.current > 0 && dissolve.current >= 1)) {
        dissolveDir.current = 0;
      }
    }
    for (const u of fx) {
      u.uFlash.value = f;
      u.uFlashColor.value.copy(fc);
      u.uDissolve.value = dissolve.current;
    }
    if (inner.current) {
      inner.current.position.z = -0.07 * knock.current;
      // fully deleted: stop drawing it at all
      inner.current.visible = !(d.dead && dissolve.current >= 1);
    }
    if (!hasClips) return;

    // frozen units hold their pose; hit-stop / slow-mo scale every animation
    mixer.timeScale = (d.stunned && !d.dead ? 0 : 1) * juice.timeScale * juice.speed;

    // ---- one-shot events ----
    if (d.spawnKey !== seen.current.spawnKey) {
      seen.current.spawnKey = d.spawnKey;
      dissolve.current = 1;
      dissolveDir.current = -1;
    }
    if (d.hitKey !== seen.current.hitKey) {
      seen.current.hitKey = d.hitKey;
      if (sinceFlash.current > 0.15) {
        flash.current = 1;
        sinceFlash.current = 0;
      }
      knock.current = 1;
    }

    if (d.dead) {
      if (mode.current !== "dead") {
        mode.current = "dead";
        deathT.current = 0;
        const down = clips.down;
        const played = play(down, true, 0.1, 1.2, true);
        dissolveAt.current = played && down ? Math.min(0.85, (down.getClip().duration / 1.2) * 0.55) : 0.12;
      }
      deathT.current += dt * juice.speed;
      if (deathT.current >= dissolveAt.current && dissolveAt.current !== Infinity) {
        dissolveAt.current = Infinity;
        dissolveDir.current = 1;
        onDissolveStart?.();
      }
      return;
    }

    if (d.castKey !== seen.current.castKey) {
      seen.current.castKey = d.castKey;
      if (clips.special) {
        mode.current = "cast";
        play(clips.special, true, 0.1, 1, true);
      }
    }
    if (d.attackKey !== seen.current.attackKey) {
      seen.current.attackKey = d.attackKey;
      // blow landed without an anticipated swing (first hit on arrival) — swing now
      if (mode.current !== "cast" && mode.current !== "attack") swing(d);
    }
    if (d.heavyHitKey !== seen.current.heavyHitKey) {
      seen.current.heavyHitKey = d.heavyHitKey;
      if (mode.current === "loco" && clips.damage) {
        mode.current = "hit";
        play(clips.damage, true, 0.06, 1.7, true);
      }
    }

    // anticipate the next blow so the swing's contact frame meets the damage
    if ((mode.current === "loco" || mode.current === "hit") && d.engaged && !d.moving && clips.attack) {
      const dur = clips.attack.getClip().duration;
      const ts = THREE.MathUtils.clamp(dur / (d.attackInterval * 0.92), 1, 2.6);
      const lead = (CONTACT * dur) / ts;
      if (d.cooldown > 0 && d.cooldown <= lead) swing(d);
    }

    // one-shots return to locomotion when done
    if (mode.current === "attack" || mode.current === "cast" || mode.current === "hit") {
      if (current.current && current.current.isRunning()) return;
      mode.current = "loco";
    }
    if (d.win) {
      if (mode.current !== "win") {
        mode.current = "win";
        if (!play(clips.win, true, 0.25)) play(clips.idle, false);
      }
      return;
    }
    play(d.moving ? clips.move ?? clips.idle : clips.idle, false);
  });

  // Bake any orientation fix into the model before anything measures it.
  useMemo(() => {
    if (tweak?.rot) cloned.rotation.set(tweak.rot[0], tweak.rot[1], tweak.rot[2]);
  }, [cloned, tweak]);

  // Deferred fit: FBX rips bake unit-conversion scale into the ANIMATION tracks, so
  // the bind pose measures wrong. Keep the model hidden for a couple of frames, let
  // the mixer pose it, then measure the posed bounds in fitG-local space and
  // normalize to TARGET_HEIGHT with feet at y=0.
  const fitG = useRef<THREE.Group>(null);
  const fitted = useRef(false);
  const fitFrames = useRef(0);

  useFrame(() => {
    if (fitted.current || !fitG.current) return;
    fitFrames.current++;
    if (fitFrames.current < 3) return;

    cloned.updateWorldMatrix(true, true);
    cloned.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) sk.skeleton.update();
    });

    const inv = new THREE.Matrix4().copy(fitG.current.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    cloned.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      const m = o as THREE.Mesh;
      if (sk.isSkinnedMesh) {
        sk.computeBoundingBox();
        if (sk.boundingBox) {
          rel.multiplyMatrices(inv, sk.matrixWorld);
          box.union(tmp.copy(sk.boundingBox).applyMatrix4(rel));
        }
      } else if (m.isMesh && m.geometry) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) {
          rel.multiplyMatrices(inv, m.matrixWorld);
          box.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(rel));
        }
      }
    });
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = (TARGET_HEIGHT * (tweak?.scale ?? 1)) / Math.max(size.y, size.x * 0.5, size.z * 0.5, 0.001);
    fitG.current.scale.setScalar(s);
    fitG.current.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    fitG.current.visible = true;
    fitted.current = true;
  });

  return (
    <group ref={inner}>
      <group ref={fitG} visible={false}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}
