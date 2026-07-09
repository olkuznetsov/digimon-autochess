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

// ---------- ultimate cast effects (one visual per ability archetype) ----------

const FROST = "#7fe9ff";
const GUARD = "#ffd34d";
const HEAL = "#46e39a";

/** Expanding flat ground ring. The workhorse for most cast bursts. */
function Wave({
  x, z, color, born, dur, from = 0.5, to = 2.4, y = 0.09, delay = 0, thin = 0.16, intensity = 3.6,
}: {
  x: number; z: number; color: string; born: number; dur: number;
  from?: number; to?: number; y?: number; delay?: number; thin?: number; intensity?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born - delay) / dur;
    if (ref.current) {
      ref.current.visible = t >= 0 && t < 1;
      ref.current.scale.setScalar(from + Math.max(0, t) * (to - from));
    }
    if (mat.current) mat.current.opacity = t >= 0 ? Math.max(0, 1 - t) : 0;
  });
  return (
    <mesh ref={ref} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.5, 0.5 + thin, 44]} />
      <meshStandardMaterial ref={mat} transparent depthWrite={false} color={color} emissive={color} emissiveIntensity={intensity} />
    </mesh>
  );
}

/** Vertical column of light that flashes up from the caster. */
function Beam({ x, z, color, born, dur, h = 3.2, r = 0.36 }: {
  x: number; z: number; color: string; born: number; dur: number; h?: number; r?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born) / dur;
    if (ref.current) {
      ref.current.visible = t < 1;
      ref.current.scale.set(Math.max(0.15, 1 - t * 0.5), 1, Math.max(0.15, 1 - t * 0.5));
    }
    if (mat.current) mat.current.opacity = Math.max(0, 1 - t) * 0.85;
  });
  return (
    <mesh ref={ref} position={[x, h / 2, z]}>
      <cylinderGeometry args={[r, r * 0.4, h, 18, 1, true]} />
      <meshBasicMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        color={color}
      />
    </mesh>
  );
}

/** Bright core flash sphere at the caster. */
function Core({ x, z, color, born, dur, y = 0.7, max = 1.2 }: {
  x: number; z: number; color: string; born: number; dur: number; y?: number; max?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born) / dur;
    if (ref.current) {
      ref.current.visible = t < 1;
      ref.current.scale.setScalar(0.2 + Math.sin(Math.min(1, t) * Math.PI) * max);
    }
    if (mat.current) mat.current.opacity = Math.max(0, 1 - t);
  });
  return (
    <mesh ref={ref} position={[x, y, z]}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial ref={mat} transparent depthWrite={false} blending={THREE.AdditiveBlending} color={color} />
    </mesh>
  );
}

/** Golden protective dome that rises over the caster (bulwark). */
function Dome({ x, z, born, dur }: { x: number; z: number; born: number; dur: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born) / dur;
    if (ref.current) {
      ref.current.visible = t < 1;
      const s = 0.6 + Math.min(1, t * 3) * 0.5;
      ref.current.scale.set(s, s * 0.9, s);
    }
    if (mat.current) mat.current.opacity = Math.max(0, 1 - t) * 0.5;
  });
  return (
    <mesh ref={ref} position={[x, 0.05, z]}>
      <sphereGeometry args={[0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshBasicMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        color={GUARD}
      />
    </mesh>
  );
}

/** Ice shards jutting up around the caster (frost). */
function Shards({ x, z, born, dur }: { x: number; z: number; born: number; dur: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born) / dur;
    if (group.current) {
      group.current.visible = t < 1;
      group.current.children.forEach((c, i) => {
        const lt = Math.min(1, Math.max(0, t * 1.4 - i * 0.06));
        c.scale.setScalar(0.001 + lt);
        (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t) * 0.9);
      });
    }
  });
  return (
    <group ref={group} position={[x, 0.1, z]} visible={false}>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        const r = 0.55;
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.28, Math.sin(a) * r]} rotation={[0, -a, 0.12]}>
            <coneGeometry args={[0.12, 0.6, 5]} />
            <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} color={FROST} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Motes drifting upward (heal / life drain). */
function Motes({ x, z, color, born, dur }: { x: number; z: number; color: string; born: number; dur: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = (useGame.getState().battleTime - born) / dur;
    if (group.current) {
      group.current.visible = t < 1;
      group.current.children.forEach((c, i) => {
        const lt = Math.max(0, t - i * 0.05);
        c.position.y = lt * 1.6;
        (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t));
      });
    }
  });
  return (
    <group ref={group} position={[x, 0.2, z]} visible={false}>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        const r = 0.3 + (i % 3) * 0.12;
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} color={color} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Dispatches the right signature-move visual for a cast, keyed by the ability archetype. */
function CastFx({ fx }: { fx: Fx }) {
  const [x, z] = cellToWorld(fx.col, fx.row);
  const c = ATTR_COLOR[fx.attr];
  const b = fx.born;
  switch (fx.ult) {
    case "blast": // AoE nuke — shockwave + light pillar + core flash
      return (
        <group>
          <Wave x={x} z={z} color="#ffffff" born={b} dur={0.55} from={0.4} to={3.0} thin={0.3} intensity={5} />
          <Wave x={x} z={z} color={c} born={b} dur={0.7} from={0.4} to={2.4} delay={0.05} />
          <Beam x={x} z={z} color={c} born={b} dur={0.4} h={3.6} r={0.5} />
          <Core x={x} z={z} color="#ffffff" born={b} dur={0.35} max={1.4} />
        </group>
      );
    case "strike": // single big hit — focused beam + quick ring
      return (
        <group>
          <Beam x={x} z={z} color={c} born={b} dur={0.32} h={3.2} r={0.32} />
          <Wave x={x} z={z} color={c} born={b} dur={0.4} from={0.4} to={1.8} intensity={4.5} />
          <Core x={x} z={z} color={c} born={b} dur={0.28} y={0.8} max={0.7} />
        </group>
      );
    case "frost": // freeze — icy ring + shards
      return (
        <group>
          <Wave x={x} z={z} color={FROST} born={b} dur={0.8} from={0.4} to={2.6} intensity={4} />
          <Shards x={x} z={z} born={b} dur={0.8} />
          <Core x={x} z={z} color={FROST} born={b} dur={0.45} max={0.8} />
        </group>
      );
    case "barrage": // multi-hit / volley — rapid concentric rings
      return (
        <group>
          <Wave x={x} z={z} color={c} born={b} dur={0.4} from={0.3} to={1.7} />
          <Wave x={x} z={z} color={c} born={b} dur={0.4} from={0.3} to={1.9} delay={0.09} />
          <Wave x={x} z={z} color="#ffffff" born={b} dur={0.4} from={0.3} to={2.1} delay={0.18} intensity={4.5} />
        </group>
      );
    case "guard": // bulwark — golden dome
      return (
        <group>
          <Dome x={x} z={z} born={b} dur={0.7} />
          <Wave x={x} z={z} color={GUARD} born={b} dur={0.6} from={0.5} to={1.6} intensity={4} />
        </group>
      );
    case "heal": // siphon — green motes rising
      return (
        <group>
          <Motes x={x} z={z} color={HEAL} born={b} dur={0.7} />
          <Wave x={x} z={z} color={HEAL} born={b} dur={0.6} from={0.4} to={1.5} intensity={3.5} />
        </group>
      );
    case "buff": // rally — wide gentle team pulse
      return (
        <group>
          <Wave x={x} z={z} color={c} born={b} dur={0.6} from={0.5} to={3.4} thin={0.1} intensity={3} />
          <Core x={x} z={z} color={c} born={b} dur={0.4} max={0.6} />
        </group>
      );
    default: // rookie role abilities / safety fallback
      return <Wave x={x} z={z} color={c} born={b} dur={0.5} from={0.5} to={1.7} intensity={4} />;
  }
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
          <CastFx key={f.id} fx={f} />
        ) : (
          <DeathRing key={f.id} fx={f} />
        ),
      )}
    </>
  );
}
