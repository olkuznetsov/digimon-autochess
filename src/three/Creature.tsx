import { Suspense, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { ProceduralCreature } from "./ProceduralCreature";
import { CreatureModel } from "./CreatureModel";
import { modelFor, tweakFor } from "./models";
import { angleDelta, newDrive, type UnitDrive } from "./unitDrive";
import type { Stage } from "../game/types";

/** model size by stage: the babies are small, a Mega towers */
const STAGE_SCALE = [0.5, 0.6, 0.75, 1.02, 1.29];

interface CreatureProps {
  formId: string;
  color: string;
  name: string;
  stage: Stage;
  team?: "player" | "enemy";
  /** prep: where the unit stands (it faces the camera). Battle units pass `drive` instead. */
  position?: [number, number, number];
  /** battle: live state owned by BattleUnit (position, yaw, animation events, bars) */
  drive?: MutableRefObject<UnitDrive>;
  showHealth?: boolean;
  dragging?: boolean;
  /** oversized boss styling (boss rounds) */
  boss?: boolean;
  /** size multiplier (bench units sit a little smaller: the slots are tighter) */
  shrink?: number;
  /** materialize in on mount */
  spawn?: boolean;
  /** changes when this unit just digivolved (evoFlash.key) → play the 3D sequence */
  evolveKey?: number;
  /** equipped item emojis shown next to the name */
  itemEmojis?: string[];
  /** battle: max HP, for the segment ticks on the HP bar */
  maxHp?: number;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

/** HP per segment tick: fine for regular units, coarser for big bosses. */
function hpTick(maxHp: number): number {
  return maxHp <= 1000 ? 100 : maxHp <= 2500 ? 250 : 500;
}

let shadowTex: THREE.Texture | null = null;
/** Radial falloff (opaque centre → clear edge) used as the alpha map of contact shadows. */
function shadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** where prep units look: roughly the camera, so their faces show */
const CAMERA_XZ: [number, number] = [0, -9.5];

/**
 * A unit on the board: base ring, star pips, name/HP label and the creature body —
 * the animated glTF model, or the procedural stand-in while it streams in.
 * Position and yaw are applied here every frame (smoothed), so neither prep drags
 * nor 20 Hz battle ticks re-render the unit.
 */
export function Creature({
  formId,
  color,
  name,
  stage,
  team = "player",
  position,
  drive: external,
  showHealth = true,
  dragging = false,
  boss = false,
  shrink = 1,
  spawn = false,
  evolveKey,
  itemEmojis,
  maxHp,
  onPointerDown,
}: CreatureProps) {
  // visible digivolution growth: Fresh 0.5 -> In-Training 0.6 -> Rookie 0.75 -> Champion 1.02 -> Mega 1.29
  const scale = STAGE_SCALE[stage - 1] * (boss ? 1.5 : 1) * shrink;
  const pipCount = Math.max(0, stage - 2);
  const url = modelFor(formId);

  // prep units own a drive fed from props
  const own = useRef<UnitDrive>(newDrive());
  const drive = external ?? own;
  if (!external && position) {
    own.current.x = position[0];
    own.current.z = position[2];
    own.current.yaw = Math.atan2(CAMERA_XZ[0] - position[0], CAMERA_XZ[1] - position[2]);
  }

  const root = useRef<THREE.Group>(null);
  const placed = useRef(false);
  // digivolution "pop": the new form bursts out slightly oversized, then settles
  const evolving = evolveKey !== undefined && Date.now() - evolveKey < 2500;
  const popT = useRef(evolving ? 0 : 9);
  const lastEvolve = useRef(evolveKey);
  if (evolveKey !== lastEvolve.current) {
    lastEvolve.current = evolveKey;
    if (evolving) popT.current = 0;
  }
  const lift = position?.[1] ?? 0;
  const hpFill = useRef<HTMLSpanElement>(null);
  const shieldFill = useRef<HTMLSpanElement>(null);
  const manaFill = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const shown = useRef({ hp: -1, mana: -1, shield: -1, dead: false });
  // ground marks and star pips: they go with the body when the unit is deleted
  const ground = useRef<THREE.Group>(null);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const pips = useRef<THREE.Group>(null);
  const deadFor = useRef(-1);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const d = drive.current;
    if (!placed.current || !external) {
      // prep: go exactly where the pointer / cell says
      g.position.set(d.x, lift, d.z);
      if (!placed.current) g.rotation.y = d.yaw;
      placed.current = true;
    } else {
      // battle: frame-rate independent glide between 20 Hz sim steps
      const k = 1 - Math.exp(-dt * 16);
      const dx = d.x - g.position.x;
      const dz = d.z - g.position.z;
      if (dx * dx + dz * dz > 4) g.position.set(d.x, 0, d.z);
      else g.position.set(g.position.x + dx * k, 0, g.position.z + dz * k);
    }
    g.rotation.y += angleDelta(g.rotation.y, d.yaw) * (1 - Math.exp(-dt * 10));
    popT.current += dt;
    const p = popT.current;
    const pop =
      p < 0.35 ? 0.55 + (p / 0.35) * 0.68 : p < 0.6 ? 1.23 - ((p - 0.35) / 0.25) * 0.28 : p < 0.9 ? 0.95 + ((p - 0.6) / 0.3) * 0.05 : 1;
    g.scale.setScalar((dragging ? scale * 1.08 : scale) * pop);

    // bars: touch the DOM only when a value visibly changed
    const s = shown.current;
    const hp = Math.round(d.hpFrac * 200);
    const mana = Math.round(d.manaFrac * 100);
    const shield = Math.round(d.shieldFrac * 100);
    if (hpFill.current && hp !== s.hp) hpFill.current.style.width = `${hp / 2}%`;
    if (manaFill.current && mana !== s.mana) manaFill.current.style.width = `${mana}%`;
    if (shieldFill.current && shield !== s.shield) shieldFill.current.style.width = `${shield}%`;
    if (label.current && d.dead !== s.dead) label.current.style.visibility = d.dead ? "hidden" : "visible";
    Object.assign(s, { hp, mana, shield, dead: d.dead });

    // a deleted unit's ring, shadow and stars fade out with its dissolve (set every
    // frame while dead: a re-render would restore the materials' opacity props)
    deadFor.current = d.dead ? (deadFor.current < 0 ? 0 : deadFor.current + dt) : -1;
    if (deadFor.current >= 0) {
      const fade = THREE.MathUtils.clamp(1 - (deadFor.current - 0.3) / 1.1, 0, 1);
      if (shadowMat.current) shadowMat.current.opacity = 0.75 * fade;
      if (ringMat.current) ringMat.current.opacity = 0.9 * fade;
      if (ground.current) ground.current.visible = fade > 0;
      if (pips.current) {
        pips.current.visible = fade > 0;
        pips.current.scale.setScalar(Math.max(0.001, fade));
      }
    } else if (ground.current && !ground.current.visible) {
      ground.current.visible = true;
      if (pips.current) {
        pips.current.visible = true;
        pips.current.scale.setScalar(1);
      }
    }
  });

  const [burst, setBurst] = useState(0);

  const body = (
    <ProceduralCreature
      formId={formId}
      color={color}
      cooldown={drive.current.cooldown}
      attackSpeed={1 / drive.current.attackInterval}
      moving={drive.current.moving}
      facing={1}
    />
  );

  return (
    // position/rotation are driven in useFrame (it runs before the first render),
    // so re-renders never snap a gliding battle unit back to its sim cell
    <group ref={root}>
      {/* soft contact shadow, then a thin glowing base ring */}
      <group ref={ground}>
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <circleGeometry args={[0.55, 24]} />
          <meshBasicMaterial
            ref={shadowMat}
            map={shadowTexture()}
            color="#000000"
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[0.4, 0.465, 40]} />
          <meshStandardMaterial
            ref={ringMat}
            color={boss ? "#ff3355" : color}
            emissive={boss ? "#ff3355" : color}
            emissiveIntensity={dragging ? 2.6 : boss ? 2 : 1.15}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      </group>

      <Suspense fallback={body}>
        {url ? (
          <CreatureModel
            /* key: digivolution keeps the unit uid but changes the model — remount
               cleanly or the previous model's fit/animation state leaks over */
            key={url}
            url={url}
            tweak={tweakFor(formId)}
            drive={drive}
            color={color}
            spawnOnMount={spawn || evolving}
            onDissolveStart={() => setBurst((b) => b + 1)}
          />
        ) : (
          body
        )}
      </Suspense>
      {burst > 0 && <DataBurst key={burst} color={color} />}
      {evolving && <EvoSequence key={evolveKey} color={color} />}

      {/* transparent hit target for dragging / inspecting (covers procedural + model) */}
      <mesh
        position={[0, 0.55, 0]}
        onPointerDown={onPointerDown}
        onPointerOver={(e) => {
          if (onPointerDown) {
            e.stopPropagation();
            document.body.style.cursor = "grab";
          }
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <cylinderGeometry args={[0.5, 0.5, 1.25, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* star pips */}
      <group ref={pips}>
        {Array.from({ length: pipCount }).map((_, i) => (
          <mesh key={i} position={[(i - (pipCount - 1) / 2) * 0.18, 1.2, 0]}>
            <octahedronGeometry args={[0.07]} />
            <meshStandardMaterial color="#ffd34d" emissive="#ffd34d" emissiveIntensity={2} />
          </mesh>
        ))}
      </group>

      <Html center position={[0, 1.55, 0]} distanceFactor={9} zIndexRange={[4, 0]}>
        {/* battle shows bars only (names are prep information) — bosses keep their title */}
        <div ref={label} className={`unit-label ${team}${showHealth ? " battle" : ""}${boss ? " boss" : ""}`}>
          <span className="unit-name">
            <span className="attr-gem" style={{ background: color, color }} />
            {boss ? "👑 " : ""}
            {name}
            {itemEmojis && itemEmojis.length > 0 && <span className="unit-items"> {itemEmojis.join("")}</span>}
          </span>
          {showHealth && (
            <span className="hp-track">
              <span ref={hpFill} className="hp-fill" style={{ width: "100%" }} />
              <span ref={shieldFill} className="shield-fill" style={{ width: "0%" }} />
              {maxHp ? <span className="hp-ticks" style={{ backgroundSize: `${(hpTick(maxHp) / maxHp) * 100}% 100%` }} /> : null}
            </span>
          )}
          {showHealth && (
            <span className="mana-track">
              <span ref={manaFill} className="mana-fill" style={{ width: "0%" }} />
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

// ---------- "data deletion" burst: glowing fragments drifting up as a unit dissolves ----------

const FRAGMENTS = 26;
const fragGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);

function DataBurst({ color, spread = 0.5, rise = 1 }: { color: string; spread?: number; rise?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const seeds = useMemo(
    () =>
      Array.from({ length: FRAGMENTS }, () => ({
        x: (Math.random() - 0.5) * 0.7,
        y: 0.2 + Math.random() * 1.0,
        z: (Math.random() - 0.5) * 0.7,
        vx: (Math.random() - 0.5) * spread,
        vy: (0.7 + Math.random() * 1.1) * rise,
        vz: (Math.random() - 0.5) * spread,
        spin: Math.random() * 6,
        s: 0.6 + Math.random() * 0.9,
      })),
    [spread, rise],
  );
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(2.2),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [color],
  );
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const im = mesh.current;
    if (!im) return;
    t.current += dt;
    const life = t.current / 1.15;
    if (life >= 1) {
      im.visible = false;
      return;
    }
    material.opacity = 1 - life * life;
    for (let i = 0; i < FRAGMENTS; i++) {
      const p = seeds[i];
      const tt = t.current;
      v.set(p.x + p.vx * tt, p.y + p.vy * tt, p.z + p.vz * tt);
      e.set(p.spin * tt, p.spin * tt * 0.7, 0);
      q.setFromEuler(e);
      sc.setScalar(p.s * (1 - life * 0.6));
      im.setMatrixAt(i, m4.compose(v, q, sc));
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[fragGeo, material, FRAGMENTS]} frustumCulled={false} />;
}

// ---------- digivolution: a pillar of light, a ground shockwave and a data burst ----------

// origin at the base, so the pillar grows up out of the ground
const pillarGeo = new THREE.CylinderGeometry(0.5, 0.72, 5, 28, 1, true).translate(0, 2.5, 0);
const ringGeo = new THREE.RingGeometry(0.45, 0.6, 48);

function EvoSequence({ color }: { color: string }) {
  const t = useRef(0);
  const pillar = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(() => {
    const c = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35);
    const make = (k: number) =>
      new THREE.MeshBasicMaterial({
        color: c.clone().multiplyScalar(k),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    return { pillar: make(2.6), ring: make(3.2) };
  }, [color]);

  useFrame((_, dt) => {
    t.current += dt;
    const tt = t.current;
    if (group.current) group.current.visible = tt < 1.8;
    if (pillar.current) {
      const rise = Math.min(1, tt / 0.22);
      const thin = tt < 0.9 ? 1 : Math.max(0.05, 1 - (tt - 0.9) / 0.7);
      pillar.current.scale.set(thin, rise, thin);
      pillar.current.rotation.y += dt * 2.5;
      mats.pillar.opacity = tt < 0.9 ? 0.75 : Math.max(0, 0.75 * (1 - (tt - 0.9) / 0.7));
    }
    if (ring.current) {
      const r = Math.max(0, (tt - 0.15) / 0.75);
      ring.current.scale.setScalar(0.6 + r * 3.2);
      mats.ring.opacity = r <= 0 ? 0 : Math.max(0, 1 - r);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={pillar} geometry={pillarGeo} material={mats.pillar} />
      <mesh ref={ring} geometry={ringGeo} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} />
      <DataBurst color={color} spread={2.2} rise={1.4} />
    </group>
  );
}
