import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { TARGET_HEIGHT, type ModelTweak } from "./models";

interface Props {
  url: string;
  tweak?: ModelTweak;
  facing?: number; // +1 player, -1 enemy
  /** combat state (battle only) */
  cooldown?: number;
  moving?: boolean;
  /** bumped when the unit casts its ultimate → plays the special01 (signature move) clip */
  castKey?: number;
}

/**
 * Loads an AI/glTF creature, normalizes it to TARGET_HEIGHT (feet at y=0), and runs
 * an animation state machine off the combat state:
 *   moving → "move",  in-range attack → "attack01" (one-shot),  otherwise → "idle".
 * The desired clip is (re)asserted every frame, so it survives StrictMode/HMR remounts.
 * Models without clips get a subtle procedural bob so they aren't frozen.
 */
// NOTE: attack-animation glitches (stretching/flying/giant models) were caused by
// DUPLICATE partial "attack01" takes inside the Cyber Sleuth rips — fixed offline
// by scripts/dedup_clips.py (run over public/models/*.glb). Don't mutate tracks here.

export function CreatureModel({ url, tweak, facing = 1, cooldown, moving = false, castKey }: Props) {
  const bob = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const { scene, animations } = useGLTF(url);
  // Root the mixer on the CLONE so clips bind to the cloned skeleton's bones.
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names } = useAnimations(animations, cloned);

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
    };
  }, [actions, names]);

  const hasClips = names.length > 0;
  const current = useRef<THREE.AnimationAction | null>(null);
  const attacking = useRef(false);
  const casting = useRef(false);
  const prevCd = useRef<number | undefined>(undefined);
  const prevCast = useRef<number | undefined>(undefined);

  const play = (next: THREE.AnimationAction | undefined, oneShot: boolean) => {
    if (!next || current.current === next) return;
    next.reset();
    next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    next.clampWhenFinished = oneShot;
    next.fadeIn(0.15).play();
    current.current?.fadeOut(0.15);
    current.current = next;
  };

  useFrame((state) => {
    // subtle bob only for un-animated models
    if (bob.current) {
      const t = state.clock.elapsedTime + phase.current;
      bob.current.position.y = hasClips ? 0 : Math.sin(t * 2) * 0.04;
      bob.current.rotation.z = hasClips ? 0 : Math.sin(t * 1.2) * 0.02;
    }
    if (!hasClips) return;

    // new cast? castKey bumps the instant an ultimate fires — the signature move
    // takes priority over a normal attack landing on the same tick.
    const castStarted =
      castKey != null && prevCast.current != null && castKey !== prevCast.current && !!clips.special;
    if (castStarted) {
      casting.current = true;
      attacking.current = false;
      play(clips.special, true);
    }
    prevCast.current = castKey;

    // new attack? cooldown jumps up the instant a hit lands (skip if we just cast)
    if (
      !casting.current &&
      cooldown != null &&
      prevCd.current != null &&
      cooldown > prevCd.current + 0.01 &&
      clips.attack
    ) {
      attacking.current = true;
      play(clips.attack, true);
    }
    prevCd.current = cooldown;

    // hold a one-shot clip until it finishes, then resume idle/move
    if (casting.current) {
      if (clips.special && clips.special.isRunning()) return;
      casting.current = false;
    }
    if (attacking.current) {
      if (clips.attack && clips.attack.isRunning()) return;
      attacking.current = false;
    }
    play(moving ? clips.move ?? clips.idle : clips.idle, false);
  });

  // Bake any orientation fix into the model before anything measures it.
  useMemo(() => {
    if (tweak?.rot) cloned.rotation.set(tweak.rot[0], tweak.rot[1], tweak.rot[2]);
  }, [cloned, tweak]);

  // Deferred fit: FBX rips often bake unit-conversion scale into the ANIMATION
  // tracks, so the bind pose measures wrong. We keep the model hidden for the
  // first couple of frames, let the mixer pose it, then measure the posed bounds
  // in fitG-local space and normalize to TARGET_HEIGHT with feet at y=0.
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

  // Player units (facing +1) look toward the enemy half (+z); enemies look back at
  // the player (-z). The model's front is +z at rotation 0, so flip the enemies.
  return (
    <group rotation={[0, facing > 0 ? 0 : Math.PI, 0]}>
      <group ref={bob}>
        <group ref={fitG} visible={false}>
          <primitive object={cloned} />
        </group>
      </group>
    </group>
  );
}
