import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useGame, type Fx } from "../game/store";
import { ATTR_COLOR } from "../game/creatures";
import { cellToWorld } from "../game/board";

const SHOT_DUR = 0.18;
const IMPACT_DUR = 0.3;
const DEATH_DUR = 0.7;

/** Effect age in battle seconds (read imperatively to avoid per-frame re-renders). */
const age = (f: Fx) => useGame.getState().battleTime - f.born;

/** Ranged attack projectile: a glowing orb arcing from attacker to target. */
function Shot({ fx }: { fx: Fx }) {
  const ref = useRef<THREE.Mesh>(null);
  const [x0, z0] = cellToWorld(fx.fromCol ?? fx.col, fx.fromRow ?? fx.row);
  const [x1, z1] = cellToWorld(fx.col, fx.row);
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, age(fx) / SHOT_DUR);
    ref.current.position.set(x0 + (x1 - x0) * t, 0.75 + Math.sin(t * Math.PI) * 0.3, z0 + (z1 - z0) * t);
    ref.current.visible = t < 1;
  });
  const c = ATTR_COLOR[fx.attr];
  return (
    <mesh ref={ref} position={[x0, 0.75, z0]}>
      <sphereGeometry args={[0.09, 10, 10]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={3.2} />
    </mesh>
  );
}

/** Short white-hot flash where the hit lands. */
function Impact({ fx }: { fx: Fx }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [x, z] = cellToWorld(fx.col, fx.row);
  useFrame(() => {
    const t = Math.min(1, age(fx) / IMPACT_DUR);
    if (ref.current) {
      ref.current.scale.setScalar(0.15 + t * 0.5);
      ref.current.visible = t < 1;
    }
    if (mat.current) mat.current.opacity = 0.85 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[x + fx.jx, 0.6, z + fx.jz]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial
        ref={mat}
        transparent
        depthWrite={false}
        color="#ffffff"
        emissive={ATTR_COLOR[fx.attr]}
        emissiveIntensity={2}
      />
    </mesh>
  );
}

/** Floating damage number (CSS animation handles rise + fade). */
function DmgNumber({ fx }: { fx: Fx }) {
  const [x, z] = cellToWorld(fx.col, fx.row);
  const mult = fx.mult ?? 1;
  const cls = mult > 1.05 ? "dmg-float strong" : mult < 0.95 ? "dmg-float weak" : "dmg-float";
  return (
    <Html center position={[x + fx.jx, 1.35, z + fx.jz]} distanceFactor={9} zIndexRange={[20, 0]}>
      <div className={cls}>-{Math.round(fx.amount ?? 0)}</div>
    </Html>
  );
}

/** Expanding ring burst when a unit dies. */
function DeathRing({ fx }: { fx: Fx }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [x, z] = cellToWorld(fx.col, fx.row);
  const c = ATTR_COLOR[fx.attr];
  useFrame(() => {
    const t = Math.min(1, age(fx) / DEATH_DUR);
    if (ref.current) {
      ref.current.scale.setScalar(0.4 + t * 1.4);
      ref.current.visible = t < 1;
    }
    if (mat.current) mat.current.opacity = 0.9 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.44, 26]} />
      <meshStandardMaterial ref={mat} transparent depthWrite={false} color={c} emissive={c} emissiveIntensity={2.6} />
    </mesh>
  );
}

/** Bright expanding ring under a unit the moment it casts its ability. */
function CastRing({ fx }: { fx: Fx }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const [x, z] = cellToWorld(fx.col, fx.row);
  const c = ATTR_COLOR[fx.attr];
  useFrame(() => {
    const t = Math.min(1, age(fx) / 0.5);
    if (ref.current) {
      ref.current.scale.setScalar(0.5 + t * 1.1);
      ref.current.visible = t < 1;
    }
    if (mat.current) mat.current.opacity = (1 - t);
  });
  return (
    <mesh ref={ref} position={[x, 0.1, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42, 0.6, 28]} />
      <meshStandardMaterial ref={mat} transparent depthWrite={false} color="#ffffff" emissive={c} emissiveIntensity={4} />
    </mesh>
  );
}

export function BattleFx() {
  const fx = useGame((s) => s.fx);
  return (
    <>
      {fx.map((f) =>
        f.kind === "hit" ? (
          <group key={f.id}>
            {f.ranged && <Shot fx={f} />}
            <Impact fx={f} />
            <DmgNumber fx={f} />
          </group>
        ) : f.kind === "cast" ? (
          <CastRing key={f.id} fx={f} />
        ) : (
          <DeathRing key={f.id} fx={f} />
        ),
      )}
    </>
  );
}
