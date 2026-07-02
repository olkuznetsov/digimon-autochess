import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FORMS, FAMILY_COLOR } from "../game/creatures";
import type { Role } from "../game/types";

interface Props {
  formId: string;
  /** attribute color — the body */
  color: string;
  /** seconds until next attack — drives the attack pose (battle only) */
  cooldown?: number;
  attackSpeed?: number;
  moving?: boolean;
  /** +1 = player (faces +z / enemy half), -1 = enemy (faces -z) */
  facing?: number;
}

/**
 * Procedural creature v2: an articulated, code-animated body per combat ROLE
 * (bruiser/tank/assassin/ranged/caster) with a FAMILY-colored accent, so every
 * form without a glTF model still reads as a distinct creature. Front is +z
 * (same convention as CreatureModel).
 *
 * Animations (all code, no rig): idle breathe/sway + blink, walk cycle with
 * leg/arm swing (wing flap for birds, hover for ghosts), attack lunge + swipe.
 */
export function ProceduralCreature({ formId, color, cooldown, attackSpeed, moving = false, facing = 1 }: Props) {
  const form = FORMS[formId];
  const role: Role = form?.role ?? "bruiser";
  const accent = form ? FAMILY_COLOR[form.family] : color;

  const rig = useRef<THREE.Group>(null);
  const headG = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const orb = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const walk = useRef(0);

  useFrame((state) => {
    const g = rig.current;
    if (!g) return;
    const t = state.clock.elapsedTime + phase.current;

    // blend into/out of the walk cycle
    walk.current += ((moving ? 1 : 0) - walk.current) * 0.18;
    const w = walk.current;
    const gait = Math.sin(t * 9);

    // attack pose: cooldown is ~1/attackSpeed right after a hit, decaying to 0
    let pop = 0;
    if (attackSpeed && cooldown != null) {
      const phaseT = Math.min(1, cooldown * attackSpeed);
      pop = Math.max(0, (phaseT - 0.55) / 0.45);
    }

    const ghost = role === "caster";
    const hover = ghost ? 0.16 + Math.sin(t * 2.2) * 0.05 : 0;
    g.position.y = hover + (ghost ? 0 : Math.abs(gait) * 0.05 * w + Math.sin(t * 2) * 0.02 * (1 - w));
    g.position.z = pop * 0.22;

    const breathe = 1 + Math.sin(t * 2.6) * 0.03 * (1 - w);
    g.scale.set(breathe - pop * 0.08, breathe + pop * 0.12, breathe - pop * 0.08);
    g.rotation.x = pop * 0.28 + (ghost ? w * 0.18 : 0) + (role === "assassin" ? 0.06 : 0);
    g.rotation.z = Math.sin(t * 1.3) * 0.02;

    if (legL.current) legL.current.rotation.x = gait * 0.55 * w;
    if (legR.current) legR.current.rotation.x = -gait * 0.55 * w;
    if (armL.current) armL.current.rotation.x = -gait * 0.4 * w;
    if (armR.current) armR.current.rotation.x = gait * 0.4 * w - pop * 1.5;
    if (headG.current) headG.current.rotation.x = pop * 0.35;
    if (tail.current) tail.current.rotation.y = Math.sin(t * 2.3) * 0.22 + gait * 0.12 * w;

    if (wingL.current && wingR.current) {
      const flap = w > 0.2 ? Math.sin(t * 13) * 0.55 : Math.sin(t * 2.8) * 0.12;
      wingL.current.rotation.z = 0.25 + flap;
      wingR.current.rotation.z = -(0.25 + flap);
    }

    if (orb.current) {
      const a = t * 2.6;
      const r = 0.45 * (1 - pop);
      orb.current.position.set(Math.cos(a) * r, 0.74 + Math.sin(t * 3) * 0.06, Math.sin(a) * r + pop * 0.55);
      const s = 1 + pop * 0.9;
      orb.current.scale.set(s, s, s);
    }

    if (eyes.current) eyes.current.scale.y = Math.sin(t * 0.8) > 0.96 ? 0.15 : 1;
  });

  const std = (c: string, e = 0.4) => (
    <meshStandardMaterial color={c} emissive={c} emissiveIntensity={e} roughness={0.4} metalness={0.15} />
  );

  const eyesEl = (y: number, z: number, spread = 0.09, r = 0.055) => (
    <group ref={eyes} position={[0, y, z]}>
      <mesh position={[-spread, 0, 0]}>
        <sphereGeometry args={[r, 10, 10]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[spread, 0, 0]}>
        <sphereGeometry args={[r, 10, 10]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-spread, 0, r * 0.75]}>
        <sphereGeometry args={[r * 0.45, 8, 8]} />
        <meshStandardMaterial color="#0a0c16" />
      </mesh>
      <mesh position={[spread, 0, r * 0.75]}>
        <sphereGeometry args={[r * 0.45, 8, 8]} />
        <meshStandardMaterial color="#0a0c16" />
      </mesh>
    </group>
  );

  // family accent, mounted on the head group
  const accentEl = (() => {
    switch (form?.family) {
      case "Dragon's Roar":
        return (
          <>
            <mesh position={[-0.09, 0.16, -0.02]} rotation={[-0.35, 0, 0.28]}>
              <coneGeometry args={[0.045, 0.18, 8]} />
              {std(accent, 0.9)}
            </mesh>
            <mesh position={[0.09, 0.16, -0.02]} rotation={[-0.35, 0, -0.28]}>
              <coneGeometry args={[0.045, 0.18, 8]} />
              {std(accent, 0.9)}
            </mesh>
          </>
        );
      case "Nature Spirits":
        return (
          <mesh position={[0, 0.19, 0]} rotation={[-0.5, 0, 0]} scale={[1, 1, 0.4]}>
            <coneGeometry args={[0.075, 0.2, 8]} />
            {std(accent, 0.8)}
          </mesh>
        );
      case "Wind Guardians":
        return (
          <mesh position={[0, 0.18, -0.03]} rotation={[-0.7, 0, 0]} scale={[1, 1, 0.35]}>
            <coneGeometry args={[0.05, 0.22, 8]} />
            {std(accent, 0.9)}
          </mesh>
        );
      case "Nightmare Soldiers":
        return (
          <>
            {[-0.09, 0, 0.09].map((x, i) => (
              <mesh key={i} position={[x, i === 1 ? 0.2 : 0.15, 0]} rotation={[0, 0, x * -2]}>
                <coneGeometry args={[0.035, 0.13, 6]} />
                {std(accent, 1)}
              </mesh>
            ))}
          </>
        );
      case "Deep Savers":
        return (
          <mesh position={[0, 0.15, -0.1]} rotation={[-0.85, 0, 0]} scale={[0.35, 1, 1]}>
            <coneGeometry args={[0.09, 0.24, 8]} />
            {std(accent, 0.8)}
          </mesh>
        );
      default:
        return null;
    }
  })();

  const body = (() => {
    switch (role) {
      case "tank":
        return (
          <>
            <group ref={legL} position={[0.2, 0.32, 0]}>
              <mesh position={[0, -0.14, 0]} castShadow>
                <capsuleGeometry args={[0.11, 0.14, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={legR} position={[-0.2, 0.32, 0]}>
              <mesh position={[0, -0.14, 0]} castShadow>
                <capsuleGeometry args={[0.11, 0.14, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <mesh position={[0, 0.6, 0]} scale={[1.2, 0.95, 1.05]} castShadow>
              <sphereGeometry args={[0.4, 20, 16]} />
              {std(color, 0.4)}
            </mesh>
            {/* back ridge */}
            {[0.12, 0, -0.14].map((z, i) => (
              <mesh key={i} position={[0, 0.95 - i * 0.04, z - 0.12]} rotation={[-0.5, 0, 0]}>
                <coneGeometry args={[0.06, 0.16, 6]} />
                {std(accent, 0.7)}
              </mesh>
            ))}
            <group ref={headG} position={[0, 0.88, 0.32]}>
              <mesh castShadow>
                <sphereGeometry args={[0.18, 16, 14]} />
                {std(color, 0.45)}
              </mesh>
              {eyesEl(0.03, 0.13, 0.08, 0.05)}
              {accentEl}
            </group>
          </>
        );
      case "assassin":
        return (
          <>
            <group ref={legL} position={[0.11, 0.42, 0]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.055, 0.26, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={legR} position={[-0.11, 0.42, 0]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.055, 0.26, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <mesh position={[0, 0.72, 0]} rotation={[0.1, 0, 0]} castShadow>
              <capsuleGeometry args={[0.16, 0.3, 8, 14]} />
              {std(color, 0.4)}
            </mesh>
            <group ref={armL} position={[0.22, 0.82, 0.04]}>
              <mesh position={[0.02, -0.16, 0]} castShadow>
                <capsuleGeometry args={[0.05, 0.24, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={armR} position={[-0.22, 0.82, 0.04]}>
              <mesh position={[-0.02, -0.16, 0]} castShadow>
                <capsuleGeometry args={[0.05, 0.24, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={headG} position={[0, 1.08, 0.08]}>
              <mesh castShadow>
                <sphereGeometry args={[0.15, 16, 14]} />
                {std(color, 0.45)}
              </mesh>
              {/* ears */}
              <mesh position={[-0.08, 0.13, 0]} rotation={[0, 0, 0.25]}>
                <coneGeometry args={[0.045, 0.16, 6]} />
                {std(color, 0.5)}
              </mesh>
              <mesh position={[0.08, 0.13, 0]} rotation={[0, 0, -0.25]}>
                <coneGeometry args={[0.045, 0.16, 6]} />
                {std(color, 0.5)}
              </mesh>
              {eyesEl(0.02, 0.11, 0.07, 0.045)}
              {accentEl}
            </group>
          </>
        );
      case "ranged": // bird
        return (
          <>
            <mesh position={[0.1, 0.07, 0.02]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              {std(color, 0.3)}
            </mesh>
            <mesh position={[-0.1, 0.07, 0.02]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              {std(color, 0.3)}
            </mesh>
            <mesh position={[0, 0.45, 0]} scale={[1, 1.1, 1.05]} castShadow>
              <sphereGeometry args={[0.3, 18, 16]} />
              {std(color, 0.4)}
            </mesh>
            <group ref={wingL} position={[0.26, 0.52, 0]}>
              <mesh position={[0.2, 0, 0]} scale={[1.7, 0.22, 0.6]} castShadow>
                <sphereGeometry args={[0.2, 12, 10]} />
                {std(color, 0.45)}
              </mesh>
            </group>
            <group ref={wingR} position={[-0.26, 0.52, 0]}>
              <mesh position={[-0.2, 0, 0]} scale={[1.7, 0.22, 0.6]} castShadow>
                <sphereGeometry args={[0.2, 12, 10]} />
                {std(color, 0.45)}
              </mesh>
            </group>
            <group ref={tail} position={[0, 0.42, -0.26]}>
              <mesh rotation={[-1.9, 0, 0]} scale={[1.4, 1, 0.3]}>
                <coneGeometry args={[0.1, 0.28, 8]} />
                {std(color, 0.4)}
              </mesh>
            </group>
            <group ref={headG} position={[0, 0.8, 0.12]}>
              <mesh castShadow>
                <sphereGeometry args={[0.16, 16, 14]} />
                {std(color, 0.45)}
              </mesh>
              {/* beak */}
              <mesh position={[0, -0.02, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.06, 0.18, 8]} />
                {std("#ffb84d", 0.6)}
              </mesh>
              {eyesEl(0.05, 0.11, 0.075, 0.045)}
              {accentEl}
            </group>
          </>
        );
      case "caster": // ghost — hovers, no legs
        return (
          <>
            <mesh position={[0, 0.4, 0]} rotation={[Math.PI, 0, 0]} castShadow>
              <coneGeometry args={[0.3, 0.42, 14, 1, true]} />
              {std(color, 0.35)}
            </mesh>
            <mesh position={[0, 0.64, 0]} castShadow>
              <sphereGeometry args={[0.28, 18, 16]} />
              {std(color, 0.45)}
            </mesh>
            <group ref={armL} position={[0.32, 0.58, 0.05]}>
              <mesh>
                <sphereGeometry args={[0.08, 10, 10]} />
                {std(color, 0.4)}
              </mesh>
            </group>
            <group ref={armR} position={[-0.32, 0.58, 0.05]}>
              <mesh>
                <sphereGeometry args={[0.08, 10, 10]} />
                {std(color, 0.4)}
              </mesh>
            </group>
            {/* magic orb — high emissive so bloom picks it up */}
            <mesh ref={orb} position={[0.45, 0.74, 0]}>
              <sphereGeometry args={[0.07, 12, 12]} />
              {std(accent, 2.4)}
            </mesh>
            <group ref={headG} position={[0, 0.72, 0.08]}>
              {eyesEl(0.02, 0.2, 0.1, 0.055)}
              {accentEl}
            </group>
          </>
        );
      case "bruiser": // dino
      default:
        return (
          <>
            <group ref={legL} position={[0.15, 0.36, 0]}>
              <mesh position={[0, -0.16, 0]} castShadow>
                <capsuleGeometry args={[0.085, 0.18, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
              <mesh position={[0, -0.3, 0.05]}>
                <sphereGeometry args={[0.09, 10, 8]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={legR} position={[-0.15, 0.36, 0]}>
              <mesh position={[0, -0.16, 0]} castShadow>
                <capsuleGeometry args={[0.085, 0.18, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
              <mesh position={[0, -0.3, 0.05]}>
                <sphereGeometry args={[0.09, 10, 8]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <mesh position={[0, 0.62, 0]} rotation={[0.12, 0, 0]} scale={[0.95, 1, 1.1]} castShadow>
              <sphereGeometry args={[0.33, 18, 16]} />
              {std(color, 0.4)}
            </mesh>
            <group ref={tail} position={[0, 0.55, -0.26]}>
              <mesh position={[0, 0, -0.2]} rotation={[-1.95, 0, 0]}>
                <coneGeometry args={[0.11, 0.5, 10]} />
                {std(color, 0.4)}
              </mesh>
            </group>
            <group ref={armL} position={[0.3, 0.68, 0.1]}>
              <mesh position={[0.04, -0.1, 0.02]} castShadow>
                <capsuleGeometry args={[0.055, 0.12, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={armR} position={[-0.3, 0.68, 0.1]}>
              <mesh position={[-0.04, -0.1, 0.02]} castShadow>
                <capsuleGeometry args={[0.055, 0.12, 6, 10]} />
                {std(color, 0.3)}
              </mesh>
            </group>
            <group ref={headG} position={[0, 0.98, 0.16]}>
              <mesh castShadow>
                <sphereGeometry args={[0.2, 18, 16]} />
                {std(color, 0.45)}
              </mesh>
              {/* snout */}
              <mesh position={[0, -0.05, 0.17]} scale={[1, 0.7, 1.4]}>
                <sphereGeometry args={[0.11, 12, 10]} />
                {std(color, 0.5)}
              </mesh>
              {eyesEl(0.06, 0.15, 0.085, 0.05)}
              {accentEl}
            </group>
          </>
        );
    }
  })();

  return (
    <group rotation={[0, facing > 0 ? 0 : Math.PI, 0]}>
      <group ref={rig}>{body}</group>
    </group>
  );
}
