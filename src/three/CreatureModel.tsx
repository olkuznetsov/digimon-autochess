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
}

/**
 * Loads an AI/glTF creature, normalizes it to TARGET_HEIGHT (feet at y=0), and runs
 * an animation state machine off the combat state:
 *   moving → "move",  in-range attack → "attack01" (one-shot),  otherwise → "idle".
 * The desired clip is (re)asserted every frame, so it survives StrictMode/HMR remounts.
 * Models without clips get a subtle procedural bob so they aren't frozen.
 */
export function CreatureModel({ url, tweak, facing = 1, cooldown, moving = false }: Props) {
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
    return { idle: find("idle"), move: find("move", "walk", "run"), attack: find("attack01", "attack", "attack02") };
  }, [actions, names]);

  const hasClips = names.length > 0;
  const current = useRef<THREE.AnimationAction | null>(null);
  const attacking = useRef(false);
  const prevCd = useRef<number | undefined>(undefined);

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

    // new attack? cooldown jumps up the instant a hit lands
    if (cooldown != null && prevCd.current != null && cooldown > prevCd.current + 0.01 && clips.attack) {
      attacking.current = true;
      play(clips.attack, true);
    }
    prevCd.current = cooldown;

    // hold the attack clip until it finishes, then resume idle/move
    if (attacking.current) {
      if (clips.attack && clips.attack.isRunning()) return;
      attacking.current = false;
    }
    play(moving ? clips.move ?? clips.idle : clips.idle, false);
  });

  const fit = useMemo(() => {
    // Bake any orientation fix into the model BEFORE measuring, so grounding/centering
    // are computed on the corrected pose.
    if (tweak?.rot) cloned.rotation.set(tweak.rot[0], tweak.rot[1], tweak.rot[2]);
    cloned.updateWorldMatrix(true, true);
    // Skeleton-aware bounds: a plain Box3.setFromObject ignores skinning and grounds
    // rigged models wrong (they float). Union each mesh's pose-aware box instead.
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    cloned.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      const m = o as THREE.Mesh;
      if (sk.isSkinnedMesh) {
        sk.computeBoundingBox();
        if (sk.boundingBox) box.union(tmp.copy(sk.boundingBox).applyMatrix4(sk.matrixWorld));
      } else if (m.isMesh && m.geometry) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
      }
    });
    if (box.isEmpty()) box.setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = (TARGET_HEIGHT * (tweak?.scale ?? 1)) / Math.max(size.y, size.x * 0.5, size.z * 0.5, 0.001);
    return { s, offset: [-center.x * s, -box.min.y * s, -center.z * s] as [number, number, number] };
  }, [cloned, tweak]);

  // Player units (facing +1) look toward the enemy half (+z); enemies look back at
  // the player (-z). The model's front is +z at rotation 0, so flip the enemies.
  return (
    <group rotation={[0, facing > 0 ? 0 : Math.PI, 0]}>
      <group ref={bob}>
        <group position={fit.offset} scale={fit.s}>
          <primitive object={cloned} />
        </group>
      </group>
    </group>
  );
}
