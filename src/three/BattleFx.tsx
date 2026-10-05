import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame, type Fx } from "../game/store";
import { ATTR_COLOR, FORMS } from "../game/creatures";
import type { Element } from "../game/types";
import { cellToWorld } from "../game/board";
import { juice, addTrauma, hitStop, slowMo, screenFlash } from "./juice";
import { useSettings } from "../settings";
import { SHOT_FLIGHT } from "../game/battle";

/** Effects run on the juice clock: they freeze in hit-stop, slow in slow-mo and
 *  keep playing after the battle ends (the final blow). */
function useAge() {
  const born = useRef(juice.now);
  return () => juice.now - born.current;
}
function useBorn() {
  return useRef(juice.now).current;
}

// ---------- sparks: one pooled instanced field for every hit ----------

const SPARKS = 320;
const spark = {
  p: new Float32Array(SPARKS * 3),
  v: new Float32Array(SPARKS * 3),
  life: new Float32Array(SPARKS),
  max: new Float32Array(SPARKS),
  c: new Float32Array(SPARKS * 3),
  next: 0,
};
const tmpColor = new THREE.Color();

/** Throw `count` sparks from a point, outward and up, in `color`. */
function spawnSparks(x: number, y: number, z: number, color: string, count: number, power = 1) {
  tmpColor.set(color);
  for (let n = 0; n < count; n++) {
    const i = spark.next++ % SPARKS;
    const a = Math.random() * Math.PI * 2;
    const up = 0.4 + Math.random() * 1.1;
    const sp = (1.6 + Math.random() * 2.6) * power;
    spark.p.set([x, y, z], i * 3);
    spark.v.set([Math.cos(a) * sp, up * sp * 0.8, Math.sin(a) * sp], i * 3);
    spark.max[i] = spark.life[i] = 0.22 + Math.random() * 0.26;
    const hot = Math.random() < 0.35 ? 1 : 0; // some sparks burn white-hot
    spark.c.set([tmpColor.r + hot, tmpColor.g + hot, tmpColor.b + hot], i * 3);
  }
}

const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
function SparkField() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    [],
  );
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const im = mesh.current;
    if (!im) return;
    const step = Math.min(dt, 0.05) * juice.timeScale;
    for (let i = 0; i < SPARKS; i++) {
      let life = spark.life[i];
      if (life > 0) {
        life -= step;
        spark.life[i] = life;
        const j = i * 3;
        spark.v[j + 1] -= 7.5 * step;
        spark.p[j] += spark.v[j] * step;
        spark.p[j + 1] = Math.max(0.03, spark.p[j + 1] + spark.v[j + 1] * step);
        spark.p[j + 2] += spark.v[j + 2] * step;
      }
      const k = life > 0 ? life / spark.max[i] : 0;
      pos.set(spark.p[i * 3], spark.p[i * 3 + 1], spark.p[i * 3 + 2]);
      scl.setScalar(0.055 * k + (k > 0 ? 0.012 : 0));
      im.setMatrixAt(i, m4.compose(pos, q, scl));
      col.setRGB(spark.c[i * 3] * 2.2 * k, spark.c[i * 3 + 1] * 2.2 * k, spark.c[i * 3 + 2] * 2.2 * k);
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[sparkGeo, material, SPARKS]} frustumCulled={false} />;
}

// ---------- the elements' look: what a Digimon's shots and signature moves are made of ----------

/** core (white-hot middle), glow (the body) and trail (embers, droplets, leaves…) */
const ELEMENT_FX: Record<Exclude<Element, "Neutral">, { core: string; glow: string; trail: string }> = {
  Fire: { core: "#fff1b0", glow: "#ff6a1a", trail: "#ffa03d" },
  Water: { core: "#e6f6ff", glow: "#2f8cff", trail: "#8fd0ff" },
  Plant: { core: "#efffd8", glow: "#3fbf4a", trail: "#9be86a" },
  Electric: { core: "#ffffff", glow: "#ffe14d", trail: "#fff6a8" },
  Earth: { core: "#ffe2bd", glow: "#b0703a", trail: "#d2a26c" },
  Wind: { core: "#ffffff", glow: "#8fe8ff", trail: "#dff9ff" },
  Light: { core: "#ffffff", glow: "#ffd84d", trail: "#fff8d2" },
  Dark: { core: "#efe2ff", glow: "#8a45ff", trail: "#4a2088" },
};
type ElementLook = (typeof ELEMENT_FX)[keyof typeof ELEMENT_FX];
const lookOf = (formId: string | undefined): { el: Element; look: ElementLook } | null => {
  const el = formId ? FORMS[formId]?.element : undefined;
  return el && el !== "Neutral" ? { el, look: ELEMENT_FX[el] } : null;
};
/** whoever made a hit (the battle's fighters, alive or fallen) */
const formOfUid = (uid: string | undefined): string | undefined => {
  if (!uid) return undefined;
  const s = useGame.getState();
  return (s.fighters.find((f) => f.uid === uid) ?? s.corpses.find((f) => f.uid === uid))?.formId;
};

// ---------- projectile: a glowing streak with a short trail ----------

/** the sim's flight: a shot leaves at the swing's contact and lands with its hit */
const SHOT_DUR = SHOT_FLIGHT;
/** an Electric attacker's bolt crackles at once — no shot flies first */
const strikesAtOnce = (fx: Fx) => lookOf(formOfUid(fx.src))?.el === "Electric";

function Shot({ fx }: { fx: Fx }) {
  const element = useMemo(() => lookOf(formOfUid(fx.src)), [fx.src]);
  if (element?.el === "Electric") return <Bolt fx={fx} look={element.look} />;
  if (element) return <ElementShot fx={fx} el={element.el} look={element.look} />;
  return <PlainShot fx={fx} />;
}

/** a shot of no element: the attribute's glowing streak */
function PlainShot({ fx }: { fx: Fx }) {
  const age = useAge();
  const group = useRef<THREE.Group>(null);
  const [x0, z0] = cellToWorld(fx.fromCol ?? fx.col, fx.fromRow ?? fx.row);
  const [x1, z1] = cellToWorld(fx.col, fx.row);
  const c = ATTR_COLOR[fx.attr];
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = Math.min(1, age() / SHOT_DUR);
    g.visible = t < 1;
    g.children.forEach((child, i) => {
      const tt = Math.max(0, t - i * 0.07);
      child.position.set(x0 + (x1 - x0) * tt, 0.8 + Math.sin(tt * Math.PI) * 0.35, z0 + (z1 - z0) * tt);
    });
  });
  return (
    <group ref={group}>
      <mesh rotation={[0, yaw, 0]} scale={[0.09, 0.09, 0.32]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshBasicMaterial color={new THREE.Color(c).multiplyScalar(2.6)} toneMapped={false} />
      </mesh>
      {[0.7, 0.45, 0.25].map((o, i) => (
        <mesh key={i} scale={0.07 * (1 - i * 0.22)}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={c} transparent opacity={o} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** An element's shot: a fireball shedding embers, a water orb, spinning leaves, a rock lobbed
 *  high, a wind crescent, a needle of light, a smoking shadow orb. */
function ElementShot({ fx, el, look }: { fx: Fx; el: Element; look: ElementLook }) {
  const age = useAge();
  const group = useRef<THREE.Group>(null);
  const [x0, z0] = cellToWorld(fx.fromCol ?? fx.col, fx.fromRow ?? fx.row);
  const [x1, z1] = cellToWorld(fx.col, fx.row);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const arc = el === "Earth" ? 0.9 : el === "Light" ? 0 : 0.3;
  const size = el === "Fire" || el === "Dark" ? 0.24 : el === "Light" ? 0.09 : 0.17;
  const trail = el === "Fire" || el === "Dark" || el === "Water" || el === "Plant";
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = Math.min(1, age() / SHOT_DUR);
    g.visible = t < 1;
    const x = x0 + (x1 - x0) * t;
    const y = 0.8 + Math.sin(t * Math.PI) * arc;
    const z = z0 + (z1 - z0) * t;
    g.position.set(x, y, z);
    // tumble: leaves, rocks and crescents spin as they fly
    g.rotation.set(el === "Wind" ? 0 : t * 9, yaw, el === "Wind" ? t * 18 : 0);
    if (trail && t < 1) spawnSparks(x, y, z, look.trail, 2, 0.25);
  });
  return (
    <group ref={group}>
      {el === "Earth" ? (
        <mesh scale={size * 1.2}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={look.glow} flatShading roughness={0.9} />
        </mesh>
      ) : el === "Wind" ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={size * 2.2}>
          <torusGeometry args={[1, 0.14, 6, 20, Math.PI]} />
          <meshBasicMaterial color={look.trail} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : el === "Plant" ? (
        [0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.08, Math.sin(i * 2.1) * 0.08, 0]} scale={[size * 0.5, size * 0.12, size]} rotation={[0, 0, i * 2.1]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color={hot(look.glow, 1.6)} toneMapped={false} />
          </mesh>
        ))
      ) : el === "Light" ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[size, 0.5, size]}>
          <capsuleGeometry args={[1, 1, 4, 8]} />
          <meshBasicMaterial color={hot(look.glow, 2.4)} toneMapped={false} />
        </mesh>
      ) : (
        <>
          <mesh scale={size * 0.55}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshBasicMaterial color={hot(look.core, 2.2)} toneMapped={false} />
          </mesh>
          <mesh scale={size}>
            <sphereGeometry args={[1, 14, 12]} />
            <meshBasicMaterial color={look.glow} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh scale={size * 1.9}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshBasicMaterial color={look.glow} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Electric shots don't fly: a forked bolt cracks between the two, flickering. */
function Bolt({ fx, look, dur = 0.2, y = 0.8, width = 0.07 }: { fx: Fx; look: ElementLook; dur?: number; y?: number; width?: number }) {
  const age = useAge();
  const [x0, z0] = cellToWorld(fx.fromCol ?? fx.col, fx.fromRow ?? fx.row);
  const [x1, z1] = cellToWorld(fx.col, fx.row);
  return <BoltLine x0={x0} z0={z0} x1={x1} z1={z1} y={y} color={look.core} glow={look.glow} age={age} dur={dur} width={width} />;
}

const BOLT_SEGS = 9;
const BOLT_GEO = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
function BoltLine({ x0, z0, x1, z1, y, color, glow, age, dur, width, lift = 0 }: {
  x0: number; z0: number; x1: number; z1: number; y: number; color: string; glow: string;
  age: () => number; dur: number; width: number; lift?: number;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const pts = useMemo(() => Array.from({ length: BOLT_SEGS + 1 }, () => new THREE.Vector3()), []);
  const tmp = useMemo(() => ({ mid: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  const lastJag = useRef(-1);
  const mats = useMemo(
    () => [new THREE.MeshBasicMaterial({ color: hot(color, 2.4), toneMapped: false }), new THREE.MeshBasicMaterial({ color: glow, toneMapped: false })],
    [color, glow],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    const t = age() / dur;
    const on = t < 1;
    // a new jagged path every few frames: the bolt crackles
    const jag = Math.floor(age() / 0.035);
    if (on && jag !== lastJag.current) {
      lastJag.current = jag;
      for (let i = 0; i <= BOLT_SEGS; i++) {
        const k = i / BOLT_SEGS;
        const off = i === 0 || i === BOLT_SEGS ? 0 : 0.22;
        pts[i].set(
          x0 + (x1 - x0) * k + (Math.random() - 0.5) * off,
          y + Math.sin(k * Math.PI) * lift + (Math.random() - 0.5) * off,
          z0 + (z1 - z0) * k + (Math.random() - 0.5) * off,
        );
      }
    }
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = on;
      if (!on) return;
      const a = pts[i];
      const b = pts[i + 1];
      tmp.mid.addVectors(a, b).multiplyScalar(0.5);
      tmp.dir.subVectors(b, a);
      const len = tmp.dir.length();
      m.position.copy(tmp.mid);
      m.quaternion.setFromUnitVectors(tmp.up, tmp.dir.normalize());
      m.scale.set(width * (i % 2 ? 1 : 1.3), Math.max(0.001, len), width * (i % 2 ? 1 : 1.3));
    });
  });
  return (
    <group>
      {Array.from({ length: BOLT_SEGS }, (_, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} visible={false} geometry={BOLT_GEO} material={mats[i % 3 === 1 ? 1 : 0]} />
      ))}
    </group>
  );
}

/** A signature move's breath: the element pouring from the caster to its target — a stream
 *  of fire, water, leaves, stones, wind, light or shadow (lightning: three bolts). */
function Breath({ x0, z0, x1, z1, el, look, born, dur = 0.42, scale = 1 }: {
  x0: number; z0: number; x1: number; z1: number; el: Element; look: ElementLook; born: number; dur?: number; scale?: number;
}) {
  const age = () => juice.now - born;
  if (el === "Electric")
    return (
      <group>
        {[0, 0.12, -0.12].map((lift, i) => (
          <BoltLine key={i} x0={x0} z0={z0} x1={x1} z1={z1} y={0.9} lift={lift + 0.15} color={look.core} glow={look.glow} age={age} dur={dur} width={0.06 * scale} />
        ))}
      </group>
    );
  return <Stream x0={x0} z0={z0} x1={x1} z1={z1} el={el} look={look} born={born} dur={dur} scale={scale} />;
}

const STREAM_N = 26;
const PUFF_SPHERE = new THREE.SphereGeometry(1, 10, 8);
const PUFF_LEAF = new THREE.SphereGeometry(1, 6, 4);
const PUFF_ROCK = new THREE.IcosahedronGeometry(1, 0);
function Stream({ x0, z0, x1, z1, el, look, born, dur, scale }: {
  x0: number; z0: number; x1: number; z1: number; el: Element; look: ElementLook; born: number; dur: number; scale: number;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  // each puff: when it leaves (0..0.55 of the breath), how far off the line, how big
  const puffs = useMemo(
    () => Array.from({ length: STREAM_N }, (_, i) => ({ at: (i / STREAM_N) * 0.55, ox: (Math.random() - 0.5) * 0.5, oy: (Math.random() - 0.5) * 0.35, s: 0.6 + Math.random() * 0.7 })),
    [],
  );
  const flight = 0.45; // a puff's share of the breath to cross the board
  useFrame(() => {
    const t = (juice.now - born) / dur;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const p = puffs[i];
      const k = (t - p.at) / flight;
      m.visible = k > 0 && k < 1;
      if (!m.visible) return;
      // the stream widens as it travels, like a breath
      const spread = 0.15 + k * 1.1;
      const px = x0 + (x1 - x0) * k + p.ox * spread * Math.cos(Math.atan2(x1 - x0, z1 - z0));
      const pz = z0 + (z1 - z0) * k - p.ox * spread * Math.sin(Math.atan2(x1 - x0, z1 - z0));
      m.position.set(px, 0.85 + p.oy * spread + (el === "Earth" ? Math.sin(k * Math.PI) * 0.5 : 0), pz);
      m.scale.setScalar(0.19 * p.s * scale * (0.6 + k * 1.2) * (el === "Light" ? 0.6 : 1));
      if (el === "Plant") m.scale.y *= 0.3; // leaves are flat
      m.rotation.set(k * 6, k * 4, 0);
    });
    if (t < 0.6 && el !== "Light") spawnSparks(x1, 0.8, z1, look.trail, 1, 0.5);
  });
  const geo = el === "Earth" ? PUFF_ROCK : el === "Plant" ? PUFF_LEAF : PUFF_SPHERE;
  // two materials for the whole breath (a white-hot puff every fourth), freed with it
  const mats = useMemo(() => {
    if (el === "Earth") {
      const m = new THREE.MeshStandardMaterial({ color: look.glow, flatShading: true, roughness: 0.9 });
      return [m, m];
    }
    const make = (color: string) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: el === "Dark" ? 0.8 : 0.85,
        blending: el === "Dark" ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
    return [make(hot(look.core, 2)), make(look.glow)];
  }, [el, look]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return (
    <group>
      {puffs.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => (refs.current[i] = m)}
          visible={false}
          scale-y={el === "Plant" ? 0.3 : 1}
          geometry={geo}
          material={mats[i % 4 === 0 ? 0 : 1]}
        />
      ))}
    </group>
  );
}

// ---------- impact: hot core + camera-facing ring + sparks (+ juice) ----------

const IMPACT_DUR = 0.22;
function Impact({ fx }: { fx: Fx }) {
  const age = useAge();
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const camera = useThree((s) => s.camera);
  const [x, z] = cellToWorld(fx.col, fx.row);
  const px = x + fx.jx * 0.5;
  const pz = z + fx.jz * 0.5;
  const superEff = (fx.mult ?? 1) >= 1.1 && !fx.ability;
  const c = ATTR_COLOR[fx.attr];
  const strength = fx.ability ? 1.6 : fx.heavy ? 1.3 : 1;

  useEffect(() => {
    spawnSparks(px, 0.75, pz, superEff ? "#ffb02e" : c, Math.round(5 * strength + (superEff ? 3 : 0)), 0.8 + strength * 0.25);
    if (fx.heavy) {
      hitStop(fx.ability ? 0.06 : 0.045);
      addTrauma(fx.ability ? 0.22 : 0.14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const t = Math.min(1, age() / IMPACT_DUR);
    if (core.current) {
      core.current.visible = t < 1;
      core.current.scale.setScalar((0.12 + t * 0.2) * strength);
    }
    if (coreMat.current) coreMat.current.opacity = 1 - t;
    if (ring.current) {
      ring.current.visible = t < 1;
      ring.current.quaternion.copy(camera.quaternion);
      ring.current.scale.setScalar((0.15 + t * 0.55) * strength);
    }
    if (ringMat.current) ringMat.current.opacity = 0.9 * (1 - t);
  });
  return (
    <group position={[px, 0.75, pz]}>
      <mesh ref={core}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial ref={coreMat} color="#ffffff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.72, 1, 32]} />
        <meshBasicMaterial
          ref={ringMat}
          color={new THREE.Color(superEff ? "#ffb02e" : c).multiplyScalar(2)}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Expanding ring + spark burst when a unit dies (the body's own dissolve follows). */
const DEATH_DUR = 0.7;
function DeathRing({ fx }: { fx: Fx }) {
  const age = useAge();
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const [x, z] = cellToWorld(fx.col, fx.row);
  const c = ATTR_COLOR[fx.attr];
  useEffect(() => {
    spawnSparks(x, 0.6, z, c, 14, 1.2);
    hitStop(0.07);
    addTrauma(0.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame(() => {
    const t = Math.min(1, age() / DEATH_DUR);
    if (ref.current) {
      ref.current.scale.setScalar(0.4 + t * 1.6);
      ref.current.visible = t < 1;
    }
    if (mat.current) mat.current.opacity = 0.9 * (1 - t);
  });
  return (
    <mesh ref={ref} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.44, 32]} />
      <meshBasicMaterial
        ref={mat}
        transparent
        depthWrite={false}
        color={new THREE.Color(c).multiplyScalar(2.2)}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------- damage numbers: one pooled DOM layer, projected every frame ----------

const NUMBERS = 48;
const NUMBER_LIFE = 0.95;
interface Num {
  el: HTMLDivElement;
  alive: boolean;
  born: number;
  x: number;
  y: number;
  z: number;
  drift: number;
  size: number;
  /** a small number (chatter) — the next hit on its unit adds to it */
  small: boolean;
  target: string;
  total: number;
}

function DamageNumbers({ host }: { host: HTMLDivElement }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pool = useRef<Num[]>([]);
  const seen = useRef(new Set<string>());
  const v = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    pool.current = Array.from({ length: NUMBERS }, () => {
      const el = document.createElement("div");
      el.className = "dmgn";
      el.style.opacity = "0";
      host.appendChild(el);
      return { el, alive: false, born: 0, x: 0, y: 0, z: 0, drift: 0, size: 1, small: false, target: "", total: 0 };
    });
    return () => pool.current.forEach((n) => n.el.remove());
  }, [host]);

  useFrame(() => {
    // spawn numbers for hits we haven't shown yet
    const fx = useGame.getState().fx;
    const mode = useSettings.getState().damageNumbers;
    for (const f of fx) {
      if (f.kind !== "hit" || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      if (mode === "off") continue;
      const [x, z] = cellToWorld(f.col, f.row);
      const amount = Math.round(f.amount ?? 0);
      const mult = f.mult ?? 1;
      const variant = f.tag ?? (f.ability ? "abil" : mult >= 1.1 ? "se" : mult <= 0.9 ? "res" : "");
      // the big ones: an ultimate's hits (and a dodge); every other hit — super-effective and
      // heavy swings included — is chatter: small, and summed per unit
      const big = !!f.ability || f.tag === "miss";
      if (mode === "big" && !big) continue;
      // chatter on one unit adds up in one small number instead of a new one per hit
      if (!big) {
        const near = pool.current.find(
          (n) => n.alive && n.small && n.target === `${f.col},${f.row}` && juice.now - n.born < 0.45,
        );
        if (near) {
          near.total += amount;
          near.el.textContent = String(near.total);
          near.born = juice.now - 0.05;
          continue;
        }
      }
      const slot = pool.current.find((n) => !n.alive) ?? pool.current.reduce((a, b) => (a.born < b.born ? a : b));
      if (!slot) continue;
      // simultaneous hits on one unit stack upward instead of printing over each other
      const bx = x + f.jx;
      const bz = z + f.jz;
      let stack = 0;
      for (const n of pool.current) {
        if (n.alive && juice.now - n.born < 0.35 && Math.abs(n.x - bx) < 0.6 && Math.abs(n.z - bz) < 0.6) stack++;
      }
      slot.alive = true;
      slot.born = juice.now;
      slot.x = bx;
      slot.y = 1.45 + Math.min(stack, 4) * 0.32;
      slot.z = bz;
      slot.drift = (Math.random() - 0.5) * 26;
      slot.size = f.tag
        ? 0.85
        : big
          ? Math.min(1.9, (0.85 + Math.log10(Math.max(10, amount)) * 0.28) * (f.ability ? 1.15 : 1) * (f.heavy ? 1.08 : 1))
          : 0.62 * (variant === "res" ? 0.9 : 1);
      slot.small = !big;
      slot.target = `${f.col},${f.row}`;
      slot.total = amount;
      slot.el.className = `dmgn ${variant}${f.heavy ? " heavy" : ""}${big ? "" : " small"}`;
      slot.el.textContent = f.tag === "miss" ? "miss" : variant === "se" ? `${amount}!` : `${amount}`;
    }
    if (seen.current.size > 400) seen.current = new Set(fx.map((f) => f.id));

    // animate: pop, rise with a slight arc, fade
    for (const n of pool.current) {
      if (!n.alive) continue;
      const t = (juice.now - n.born) / NUMBER_LIFE;
      if (t >= 1) {
        n.alive = false;
        n.el.style.opacity = "0";
        continue;
      }
      v.set(n.x, n.y, n.z).project(camera);
      if (v.z > 1) {
        n.el.style.opacity = "0";
        continue;
      }
      const sx = (v.x * 0.5 + 0.5) * size.width + n.drift * t;
      const sy = (-v.y * 0.5 + 0.5) * size.height - 46 * (1 - (1 - t) * (1 - t));
      const pop = t < 0.12 ? 1.55 - (t / 0.12) * 0.55 : 1;
      n.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(n.size * pop).toFixed(3)})`;
      n.el.style.opacity = t > 0.7 ? ((1 - t) / 0.3).toFixed(2) : "1";
    }
  });
  return null;
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
    const t = (juice.now - born - delay) / dur;
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
    const t = (juice.now - born) / dur;
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
    const t = (juice.now - born) / dur;
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
    const t = (juice.now - born) / dur;
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
    const t = (juice.now - born) / dur;
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
    const t = (juice.now - born) / dur;
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

/** Horizontal energy lance from caster to target (bolts, volleys, drains). */
function Lance({ x0, z0, x1, z1, color, born, dur, r = 0.13, y = 0.85, delay = 0, side = 0 }: {
  x0: number; z0: number; x1: number; z1: number; color: string; born: number; dur: number;
  r?: number; y?: number; delay?: number; side?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  const yaw = Math.atan2(dx, dz);
  // a sideways offset (perpendicular to the lance) fans out barrage volleys
  const ox = Math.cos(yaw) * side;
  const oz = -Math.sin(yaw) * side;
  useFrame(() => {
    const t = (juice.now - born - delay) / dur;
    if (ref.current) {
      ref.current.visible = t >= 0 && t < 1 && len > 0.2;
      const k = Math.max(0.05, 1 - t);
      ref.current.scale.set(k, Math.min(1, 0.25 + Math.max(0, t) * 6), k);
    }
    if (mat.current) mat.current.opacity = t >= 0 ? Math.max(0, 1 - t) : 0;
  });
  return (
    <group position={[(x0 + x1) / 2 + ox, y, (z0 + z1) / 2 + oz]} rotation={[0, yaw, 0]}>
      <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <cylinderGeometry args={[r, r, Math.max(0.01, len), 12, 1, true]} />
        <meshBasicMaterial
          ref={mat}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          color={color}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const hot = (c: string, k: number) => new THREE.Color(c).multiplyScalar(k).getStyle();

/** Dispatches the right signature-move visual for a cast, keyed by the ability archetype.
 *  Offensive moves land on the caster's target; guards and rallies stay on the caster. */
function CastFxImpl({ fx }: { fx: Fx }) {
  const [cx, cz] = cellToWorld(fx.col, fx.row);
  const [tx, tz] = fx.toCol != null && fx.toRow != null ? cellToWorld(fx.toCol, fx.toRow) : [cx, cz];
  // a starred Mega's ultimate: platinum at ★★, prismatic at ★★★
  const star = fx.star ?? 1;
  const element = lookOf(fx.form);
  const c = star >= 3 ? "#ff7ad9" : star === 2 ? "#d9f6ff" : element ? element.look.glow : ATTR_COLOR[fx.attr];
  const b = useBorn();
  const mega = (fx.stage ?? 3) >= 5;
  // offensive moves breathe their element at the target (Greymon's fireball, Garurumon's blue fire…)
  const breath =
    element && (fx.ult === "blast" || fx.ult === "strike" || fx.ult === "barrage" || fx.ult === "frost") && (cx !== tx || cz !== tz) ? (
      <Breath x0={cx} z0={cz} x1={tx} z1={tz} el={element.el} look={element.look} born={b} scale={(mega ? 1.3 : 1) * (1 + 0.15 * (star - 1))} />
    ) : null;

  useEffect(() => {
    // Megas get a cinematic beat: slow-mo + flash + a heavy shake (rationed)
    if (mega) {
      if (slowMo(0.6, 0.3, 2.2)) screenFlash(0.32, c);
      addTrauma(0.3);
    } else if (fx.stage === 4) {
      addTrauma(0.12);
    }
    spawnSparks(tx, 0.7, tz, c, (mega ? 22 : 10) * star, mega ? 1.5 : 1.1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group>
      {breath}
      <CastBurst fx={fx} c={c} b={b} cx={cx} cz={cz} tx={tx} tz={tz} mega={mega} scale={(mega ? 1.25 : 1) * (1 + 0.22 * (star - 1))} />
    </group>
  );
}

/** The archetype's burst: where the move lands (or, for guards and rallies, the caster). */
function CastBurst({ fx, c, b, cx, cz, tx, tz, mega, scale }: {
  fx: Fx; c: string; b: number; cx: number; cz: number; tx: number; tz: number; mega: boolean; scale: number;
}) {
  switch (fx.ult) {
    case "blast": // AoE nuke on the target — shockwave + light pillar + core flash
      return (
        <group>
          <Core x={cx} z={cz} color={c} born={b} dur={0.25} max={0.5} />
          <Wave x={tx} z={tz} color="#ffffff" born={b} dur={0.55} from={0.4} to={3.0 * scale} thin={0.3} intensity={5} />
          <Wave x={tx} z={tz} color={c} born={b} dur={0.7} from={0.4} to={2.4 * scale} delay={0.05} />
          <Beam x={tx} z={tz} color={c} born={b} dur={0.45} h={3.6 * scale} r={0.5 * scale} />
          <Core x={tx} z={tz} color={hot(c, 1.3)} born={b} dur={0.35} max={0.75 * scale} />
          <Core x={tx} z={tz} color="#ffffff" born={b} dur={0.18} max={0.35} />
        </group>
      );
    case "strike": // one devastating blow — a lance from caster to target + detonation
      return (
        <group>
          <Core x={cx} z={cz} color={c} born={b} dur={0.22} max={0.45} />
          <Lance x0={cx} z0={cz} x1={tx} z1={tz} color={hot(c, 1.8)} born={b} dur={0.32} r={0.16 * scale} />
          <Lance x0={cx} z0={cz} x1={tx} z1={tz} color="#ffffff" born={b} dur={0.24} r={0.06 * scale} />
          <Wave x={tx} z={tz} color={c} born={b} dur={0.4} from={0.4} to={1.8 * scale} intensity={4.5} delay={0.04} />
          <Core x={tx} z={tz} color={hot(c, 1.3)} born={b} dur={0.3} y={0.8} max={0.55 * scale} />
          {mega && <Beam x={tx} z={tz} color={c} born={b} dur={0.35} h={3.4} r={0.36} />}
        </group>
      );
    case "frost": // freeze — icy ring + shards around the target
      return (
        <group>
          <Wave x={tx} z={tz} color={FROST} born={b} dur={0.8} from={0.4} to={2.6 * scale} intensity={4} />
          <Shards x={tx} z={tz} born={b} dur={0.9} />
          <Core x={tx} z={tz} color={FROST} born={b} dur={0.45} max={0.6 * scale} />
        </group>
      );
    case "barrage": // flurry / volley — a fan of quick lances, then rings on the target
      return (
        <group>
          {[-0.22, 0.22, 0].map((side, i) => (
            <Lance key={i} x0={cx} z0={cz} x1={tx} z1={tz} color={hot(c, 1.6)} born={b} dur={0.2} r={0.07} delay={i * 0.07} side={side} />
          ))}
          <Wave x={tx} z={tz} color={c} born={b} dur={0.4} from={0.3} to={1.7} />
          <Wave x={tx} z={tz} color={c} born={b} dur={0.4} from={0.3} to={1.9} delay={0.09} />
          <Wave x={tx} z={tz} color="#ffffff" born={b} dur={0.4} from={0.3} to={2.1 * scale} delay={0.18} intensity={4.5} />
        </group>
      );
    case "guard": // bulwark — golden dome over the caster
      return (
        <group>
          <Dome x={cx} z={cz} born={b} dur={0.8} />
          <Wave x={cx} z={cz} color={GUARD} born={b} dur={0.6} from={0.5} to={1.6 * scale} intensity={4} />
        </group>
      );
    case "heal": // siphon — a draining lance, life motes rising on the caster
      return (
        <group>
          <Lance x0={tx} z0={tz} x1={cx} z1={cz} color={hot(HEAL, 1.4)} born={b} dur={0.5} r={0.08} />
          <Wave x={tx} z={tz} color={c} born={b} dur={0.45} from={0.3} to={1.4} intensity={4} />
          <Motes x={cx} z={cz} color={HEAL} born={b} dur={0.8} />
          <Wave x={cx} z={cz} color={HEAL} born={b} dur={0.6} from={0.4} to={1.5} intensity={3.5} />
        </group>
      );
    case "buff": // rally — wide gentle team pulse from the caster
      return (
        <group>
          <Wave x={cx} z={cz} color={c} born={b} dur={0.6} from={0.5} to={3.4} thin={0.1} intensity={3} />
          <Core x={cx} z={cz} color={c} born={b} dur={0.4} max={0.6} />
        </group>
      );
    default:
      return <Wave x={tx} z={tz} color={c} born={b} dur={0.5} from={0.5} to={1.7} intensity={4} />;
  }
}
const CastFx = memo(CastFxImpl);

// ---------- screen flash + ultimate callouts (DOM, on the shared overlay) ----------

function ScreenFlash({ host }: { host: HTMLDivElement }) {
  const el = useMemo(() => {
    const d = document.createElement("div");
    d.className = "fx-flash";
    return d;
  }, []);
  const last = useRef(-1);
  useEffect(() => {
    host.appendChild(el);
    return () => el.remove();
  }, [host, el]);
  useFrame(() => {
    const o = Math.round(juice.flash * 0.55 * 100) / 100;
    if (o === last.current) return;
    last.current = o;
    el.style.opacity = String(o);
    el.style.background = `radial-gradient(circle at 50% 45%, #ffffff 0%, ${juice.flashColor} 45%, transparent 100%)`;
  });
  return null;
}

const CALLOUTS = 6;
const CALLOUT_LIFE = 1.1;
interface Callout {
  el: HTMLDivElement;
  alive: boolean;
  born: number;
  x: number;
  z: number;
}

/** Champions tag their signature move over their head; Megas roll a full-width banner. */
function UltCallouts({ host }: { host: HTMLDivElement }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pool = useRef<Callout[]>([]);
  const banner = useRef<{ root: HTMLDivElement; who: HTMLDivElement; name: HTMLDivElement } | null>(null);
  const seen = useRef(new Set<string>());
  const lastBanner = useRef(-Infinity);
  const v = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    pool.current = Array.from({ length: CALLOUTS }, () => {
      const el = document.createElement("div");
      el.className = "ult-callout";
      host.appendChild(el);
      return { el, alive: false, born: 0, x: 0, z: 0 };
    });
    const root = document.createElement("div");
    root.className = "ult-banner";
    const who = document.createElement("div");
    who.className = "ult-banner-who";
    const name = document.createElement("div");
    name.className = "ult-banner-name";
    root.append(who, name);
    host.appendChild(root);
    banner.current = { root, who, name };
    return () => {
      pool.current.forEach((c) => c.el.remove());
      root.remove();
    };
  }, [host]);

  useFrame(() => {
    const fx = useGame.getState().fx;
    for (const f of fx) {
      if (f.kind !== "cast" || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      const stage = f.stage ?? 3;
      const color = ATTR_COLOR[f.attr];
      const formName = (f.form && FORMS[f.form]?.name) || "";
      // late game fields several Megas: one banner at a time, the rest get a tag
      const now = performance.now() / 1000;
      if (stage >= 5 && banner.current && now - lastBanner.current > 2.5) {
        lastBanner.current = now;
        const { root, who, name } = banner.current;
        const stars = f.star ? ` ${"★".repeat(f.star)}` : "";
        who.textContent = f.mine === false ? `Enemy ${formName}${stars}` : `${formName}${stars}`;
        name.textContent = f.name ?? "";
        root.style.setProperty("--accent", color);
        root.className = `ult-banner ${f.mine === false ? "foe" : "mine"}`;
        void root.offsetWidth; // restart the CSS animation
        root.className += " go";
      } else if (stage >= 4) {
        const slot = pool.current.find((c) => !c.alive) ?? pool.current.reduce((a, b) => (a.born < b.born ? a : b));
        if (!slot) continue;
        const [x, z] = cellToWorld(f.col, f.row);
        slot.alive = true;
        slot.born = juice.now;
        slot.x = x;
        slot.z = z;
        slot.el.textContent = f.name ?? "";
        slot.el.style.setProperty("--accent", color);
      }
    }
    if (seen.current.size > 200) seen.current = new Set(fx.map((f) => f.id));

    for (const c of pool.current) {
      if (!c.alive) continue;
      const t = (juice.now - c.born) / CALLOUT_LIFE;
      if (t >= 1) {
        c.alive = false;
        c.el.style.opacity = "0";
        continue;
      }
      v.set(c.x, 2.15, c.z).project(camera);
      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height - 18 * t;
      const s = t < 0.1 ? 0.7 + t * 3 : 1;
      c.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      c.el.style.opacity = t < 0.1 ? (t / 0.1).toFixed(2) : t > 0.75 ? ((1 - t) / 0.25).toFixed(2) : "1";
    }
  });
  return null;
}

/** A burn pulse or a dodge: a few embers or wisps — no impact ring, no shot. */
function TagSparks({ fx }: { fx: Fx }) {
  useEffect(() => {
    const [x, z] = cellToWorld(fx.col, fx.row);
    if (fx.tag === "burn") spawnSparks(x + fx.jx * 0.4, 0.55, z + fx.jz * 0.4, "#ff6a3d", 4, 0.55);
    else spawnSparks(x, 0.9, z, "#c8fff2", 3, 0.45);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const ShotM = memo(Shot);
const ImpactM = memo(Impact);
const TagSparksM = memo(TagSparks);
const DeathRingM = memo(DeathRing);

/** One DOM overlay for numbers, callouts and the flash, stacked over the canvas. */
function useOverlay(): HTMLDivElement {
  const gl = useThree((s) => s.gl);
  const host = useMemo(() => {
    const d = document.createElement("div");
    d.className = "dmg-layer";
    return d;
  }, []);
  useEffect(() => {
    (gl.domElement.parentElement ?? document.body).appendChild(host);
    return () => host.remove();
  }, [gl, host]);
  return host;
}

export function BattleFx() {
  const fx = useGame((s) => s.fx);
  const host = useOverlay();
  return (
    <>
      <SparkField />
      <DamageNumbers host={host} />
      <UltCallouts host={host} />
      <ScreenFlash host={host} />
      {fx.map((f) =>
        f.kind === "hit" && f.tag ? (
          <TagSparksM key={f.id} fx={f} />
        ) : f.kind === "hit" ? (
          <group key={f.id}>
            {/* a shot flew in since its launch (kind "shot"); Electric strikes at once */}
            {f.ranged && !f.ability && strikesAtOnce(f) && <ShotM fx={f} />}
            <ImpactM fx={f} />
          </group>
        ) : f.kind === "shot" ? (
          <ShotM key={f.id} fx={f} />
        ) : f.kind === "cast" ? (
          <CastFx key={f.id} fx={f} />
        ) : (
          <DeathRingM key={f.id} fx={f} />
        ),
      )}
    </>
  );
}
