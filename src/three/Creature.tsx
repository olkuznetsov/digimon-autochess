import { Suspense } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { ProceduralCreature } from "./ProceduralCreature";
import { CreatureModel } from "./CreatureModel";
import { modelFor, tweakFor } from "./models";

interface CreatureProps {
  formId: string;
  position: [number, number, number];
  color: string;
  name: string;
  star: 1 | 2 | 3;
  hp: number;
  maxHp: number;
  team?: "player" | "enemy";
  showHealth?: boolean;
  dragging?: boolean;
  /** combat-only: drives the attack lunge / animation state */
  cooldown?: number;
  attackSpeed?: number;
  moving?: boolean;
  /** bumped when the unit casts its ultimate → plays the special01 animation */
  castKey?: number;
  /** oversized boss styling (boss rounds) */
  boss?: boolean;
  /** mana for the ability bar (battle only) */
  mana?: number;
  maxMana?: number;
  /** equipped item emojis shown under the name */
  itemEmojis?: string[];
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

// Wrapper: base ring + star pips + name/HP label, with the creature body itself
// being either an AI-generated glTF model (if registered) or the animated
// procedural fallback. The emissive glow is what the bloom pass turns neon.
export function Creature({
  formId,
  position,
  color,
  name,
  star,
  hp,
  maxHp,
  team = "player",
  showHealth = true,
  dragging = false,
  cooldown,
  attackSpeed,
  moving = false,
  castKey,
  boss = false,
  mana,
  maxMana,
  itemEmojis,
  onPointerDown,
}: CreatureProps) {
  const scale = (0.85 + (star - 1) * 0.18) * (boss ? 1.55 : 1);
  const hpPct = Math.max(0, Math.min(1, hp / maxHp));
  const facing = team === "enemy" ? -1 : 1;
  const url = modelFor(formId);

  const body = (
    <ProceduralCreature
      formId={formId}
      color={color}
      cooldown={cooldown}
      attackSpeed={attackSpeed}
      moving={moving}
      facing={facing}
    />
  );

  return (
    <group position={position} scale={dragging ? scale * 1.08 : scale}>
      {/* glowing base ring */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.48, 32]} />
        <meshStandardMaterial
          color={boss ? "#ff3355" : color}
          emissive={boss ? "#ff3355" : color}
          emissiveIntensity={dragging ? 3 : boss ? 2.2 : 1.4}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* the creature */}
      <Suspense fallback={body}>
        {url ? (
          <CreatureModel
            url={url}
            tweak={tweakFor(formId)}
            facing={facing}
            cooldown={cooldown}
            moving={moving}
            castKey={castKey}
          />
        ) : (
          body
        )}
      </Suspense>

      {/* transparent hit target for dragging (covers procedural + model) */}
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
      {Array.from({ length: star }).map((_, i) => (
        <mesh key={i} position={[(i - (star - 1) / 2) * 0.18, 1.2, 0]}>
          <octahedronGeometry args={[0.07]} />
          <meshStandardMaterial color="#ffd34d" emissive="#ffd34d" emissiveIntensity={2} />
        </mesh>
      ))}

      <Html center position={[0, 1.55, 0]} distanceFactor={9} zIndexRange={[10, 0]}>
        <div className={`unit-label ${team}`}>
          <span className="unit-name">
            {boss ? "👑 " : ""}
            {name}
            {itemEmojis && itemEmojis.length > 0 && <span className="unit-items"> {itemEmojis.join("")}</span>}
          </span>
          {showHealth && (
            <span className="hp-track">
              <span className="hp-fill" style={{ width: `${hpPct * 100}%` }} />
            </span>
          )}
          {showHealth && maxMana != null && (
            <span className="mana-track">
              <span className="mana-fill" style={{ width: `${Math.min(100, ((mana ?? 0) / maxMana) * 100)}%` }} />
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
