import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import { useProfile } from "../profile/store";
import { CreatureModel } from "./CreatureModel";
import { modelFor, tweakFor } from "./models";
import { newDrive, type UnitDrive } from "./unitDrive";
import { sfx } from "../audio/sfx";

/** the partner is shown bigger than on the board, still growing with its stage */
const SHOWCASE_SCALE = [0.95, 1.05, 1.2, 1.45, 1.65];
const TOP = 0.32;

/** The holographic pedestal the partner stands on: a dark plinth, a glowing top and two
 *  counter-rotating rings. */
function Pedestal({ color }: { color: string }) {
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ringA.current) ringA.current.rotation.z += dt * 0.35;
    if (ringB.current) ringB.current.rotation.z -= dt * 0.22;
  });
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.7, 1.95, 0.24, 64]} />
        <meshStandardMaterial color="#14182c" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[1.62, 1.7, 0.04, 64]} />
        <meshStandardMaterial color="#0d1022" emissive={color} emissiveIntensity={0.35} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh ref={ringA} position={[0, TOP + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.42, 1.5, 64, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color="#7fe9ff" toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringB} position={[0, TOP + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.18, 1.22, 64, 1, 0, Math.PI * 1.2]} />
        <meshBasicMaterial color="#ff7ad9" toneMapped={false} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Before a partner is chosen: a Digitama, waiting. */
function Egg() {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    g.current.position.y = TOP + 0.62 + Math.sin(t * 1.6) * 0.05;
    g.current.rotation.z = Math.sin(t * 2.3) * 0.06;
  });
  return (
    <group ref={g}>
      <mesh scale={[0.45, 0.58, 0.45]}>
        <sphereGeometry args={[1, 40, 32]} />
        <meshStandardMaterial color="#f6f2e6" roughness={0.45} emissive="#7fe9ff" emissiveIntensity={0.08} />
      </mesh>
      {[0, 1.3, 2.6, 3.9, 5.2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.41, (i % 2 ? 0.12 : -0.1), Math.sin(a) * 0.41]} scale={0.085}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={i % 2 ? "#ff7ad9" : "#4da6ff"} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Hearts that float up when the partner is petted. */
function Hearts({ burst }: { burst: number }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef(-1);
  const seeds = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: (i - 3) * 0.22, d: 0.4 + (i % 3) * 0.25 })), []);
  useEffect(() => {
    if (burst) born.current = performance.now() / 1000;
  }, [burst]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = born.current < 0 ? 9 : performance.now() / 1000 - born.current;
    g.visible = t < 1.6;
    g.children.forEach((c, i) => {
      const s = seeds[i];
      c.position.set(s.x + Math.sin(t * 3 + i) * 0.08, 1.4 + t * (0.8 + s.d * 0.5), 0);
      c.scale.setScalar(Math.max(0.001, 0.12 * Math.min(1, t * 4) * (1 - t / 1.6)));
    });
  });
  return (
    <group ref={group}>
      {seeds.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={i % 2 ? "#ff5c8a" : "#ff9ec4"} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A column of light while the partner digivolves. */
function GrowthBeam({ grewKey }: { grewKey: number | undefined }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = grewKey ? (Date.now() - grewKey) / 1000 : 9;
    if (mesh.current) mesh.current.visible = t < 2.4;
    if (mat.current) mat.current.opacity = Math.max(0, t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 2) * 0.55;
  });
  return (
    <mesh ref={mesh} position={[0, 3, 0]}>
      <cylinderGeometry args={[0.9, 1.3, 6, 32, 1, true]} />
      <meshBasicMaterial ref={mat} color="#bff6ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** The partner itself: its real model, facing the camera with a slow sway; a tap pets it. */
function Partner({ formId, star }: { formId: string; star: number }) {
  const form = FORMS[formId];
  const drive = useRef<UnitDrive>(newDrive(0, 0, Math.PI));
  const g = useRef<THREE.Group>(null);
  const [hearts, setHearts] = useState(0);
  const petUntil = useRef(0);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (g.current) g.current.rotation.y = Math.PI + Math.sin(t * 0.4) * 0.35;
    drive.current.win = performance.now() < petUntil.current;
  });
  const scale = SHOWCASE_SCALE[(form?.stage ?? 1) - 1] * (star > 1 ? 1.06 : 1);
  return (
    <group
      ref={g}
      position={[0, TOP, 0]}
      scale={scale}
      onPointerDown={(e) => {
        e.stopPropagation();
        petUntil.current = performance.now() + 1700;
        setHearts((h) => h + 1);
        sfx.buy();
      }}
    >
      <Suspense fallback={null}>
        <CreatureModel
          key={formId}
          url={modelFor(formId)!}
          tweak={tweakFor(formId)}
          drive={drive}
          color={form ? ATTR_COLOR[form.attribute] : "#8893b5"}
          spawnOnMount
        />
      </Suspense>
      <Hearts burst={hearts} />
    </group>
  );
}

/** The main menu's 3D stage: the partner on its pedestal in the middle of the Digital World. */
export function MenuStage() {
  const partner = useProfile((s) => s.partner);
  const grew = useProfile((s) => s.grew);
  const color = partner ? ATTR_COLOR[FORMS[partner.formId]?.attribute ?? "Free"] ?? "#7fe9ff" : "#7fe9ff";
  return (
    <group>
      <Pedestal color={color} />
      {partner ? <Partner formId={partner.formId} star={partner.star} /> : <Egg />}
      <GrowthBeam grewKey={grew?.key} />
      <pointLight position={[0, 3.2, -2.2]} intensity={14} color="#ffffff" distance={9} />
    </group>
  );
}
