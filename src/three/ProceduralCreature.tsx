import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  color: string;
  /** seconds until next attack — used to drive the attack-lunge pose (battle only) */
  cooldown?: number;
  attackSpeed?: number;
  /** +1 = faces / lunges toward +z (player), -1 = toward -z (enemy) */
  facing?: number;
}

/**
 * Animated placeholder creature: a blobby body with idle bob/breathe, occasional
 * blink, and an attack lunge synced to the combat cooldown. This is the stand-in
 * until AI-generated glTF models are dropped in (see models.ts / CreatureModel.tsx).
 */
export function ProceduralCreature({ color, cooldown, attackSpeed, facing = 1 }: Props) {
  const root = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    const g = root.current;
    if (!g) return;
    const t = state.clock.elapsedTime + phase.current;
    const breathe = 1 + Math.sin(t * 3) * 0.045;

    // attack lunge: cooldown is ~1/attackSpeed right after a hit, decaying to 0.
    let pop = 0;
    if (attackSpeed && cooldown != null) {
      const phaseT = Math.min(1, cooldown * attackSpeed); // 1 = just attacked
      pop = Math.max(0, (phaseT - 0.55) / 0.45);
    }

    const bob = Math.sin(t * 2) * 0.035;
    g.position.set(facing * pop * 0.16, bob + pop * 0.16, 0);
    g.scale.set(breathe - pop * 0.12, breathe + pop * 0.18, breathe - pop * 0.12);
    g.rotation.z = Math.sin(t * 1.3) * 0.03;

    if (eyes.current) eyes.current.scale.y = Math.sin(t * 0.8) > 0.96 ? 0.1 : 1;
  });

  const mat = (intensity: number) => (
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} roughness={0.4} metalness={0.15} />
  );

  return (
    <group ref={root}>
      {/* body */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.4, 24, 20]} />
        {mat(0.4)}
      </mesh>
      {/* feet */}
      <mesh position={[-0.2, 0.07, -0.14]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        {mat(0.3)}
      </mesh>
      <mesh position={[0.2, 0.07, -0.14]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        {mat(0.3)}
      </mesh>
      {/* stubby arms */}
      <mesh position={[-0.42, 0.42, -0.04]}>
        <sphereGeometry args={[0.1, 14, 12]} />
        {mat(0.3)}
      </mesh>
      <mesh position={[0.42, 0.42, -0.04]}>
        <sphereGeometry args={[0.1, 14, 12]} />
        {mat(0.3)}
      </mesh>
      {/* horn / crest */}
      <mesh position={[0, 0.86, -0.04]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.12, 0.26, 12]} />
        {mat(0.55)}
      </mesh>
      {/* eyes (toward the camera, -z) */}
      <group ref={eyes}>
        <mesh position={[-0.14, 0.5, -0.32]}>
          <sphereGeometry args={[0.088, 14, 14]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[0.14, 0.5, -0.32]}>
          <sphereGeometry args={[0.088, 14, 14]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[-0.14, 0.49, -0.4]}>
          <sphereGeometry args={[0.042, 12, 12]} />
          <meshStandardMaterial color="#0a0c16" />
        </mesh>
        <mesh position={[0.14, 0.49, -0.4]}>
          <sphereGeometry args={[0.042, 12, 12]} />
          <meshStandardMaterial color="#0a0c16" />
        </mesh>
      </group>
    </group>
  );
}
