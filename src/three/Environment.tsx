import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid, Edges } from "@react-three/drei";
import * as THREE from "three";

/**
 * The Digital World arena: everything procedural, no assets.
 * - synthwave "data sun" on the horizon behind the enemy side (bloom does the rest)
 * - infinite neon grid floor fading into the fog
 * - data motes (glowing particles) drifting upward
 * - floating monolith structures slowly rotating in the distance
 */

function DataSun() {
  return (
    <group position={[0, 3.6, 30]}>
      {/* halo */}
      <mesh position={[0, 0, 0.06]}>
        <ringGeometry args={[7.6, 10.5, 48]} />
        <meshBasicMaterial color="#6e2c58" transparent opacity={0.3} fog={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the sun disc */}
      <mesh>
        <circleGeometry args={[7.5, 48]} />
        <meshBasicMaterial color="#ff4d88" fog={false} side={THREE.DoubleSide} />
      </mesh>
      {/* classic synthwave slats across the lower half */}
      {[
        { y: -1.6, h: 0.3 },
        { y: -3.0, h: 0.5 },
        { y: -4.6, h: 0.75 },
        { y: -6.3, h: 1.0 },
      ].map((s, i) => (
        <mesh key={i} position={[0, s.y, -0.05]}>
          <planeGeometry args={[16.5, s.h]} />
          <meshBasicMaterial color="#05060f" fog={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function DataMotes({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, speeds } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const c = new Float32Array(count * 3);
    const s = new Float32Array(count);
    const palette = [new THREE.Color("#39d8ff"), new THREE.Color("#b76bff"), new THREE.Color("#27e0a3")];
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 44;
      p[i * 3 + 1] = Math.random() * 12;
      p[i * 3 + 2] = (Math.random() - 0.5) * 44 + 4;
      const col = palette[i % palette.length];
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
      s[i] = 0.15 + Math.random() * 0.5;
    }
    return { positions: p, colors: c, speeds: s };
  }, [count]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = attr.getY(i) + speeds[i] * Math.min(dt, 0.1);
      if (y > 12) y = 0;
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.09}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Monoliths() {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + 0.4;
        const r = 17 + (i % 3) * 4.5;
        return {
          pos: [Math.sin(a) * r, 1.5 + (i % 4) * 1.4, Math.cos(a) * r * 0.8 + 7] as [number, number, number],
          h: 2.5 + ((i * 1.7) % 5),
          phase: i * 1.3,
          spin: 0.05 + (i % 3) * 0.04,
        };
      }),
    [],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const it = items[i];
      c.rotation.y = state.clock.elapsedTime * it.spin;
      c.position.y = it.pos[1] + Math.sin(state.clock.elapsedTime * 0.5 + it.phase) * 0.45;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={it.pos}>
          <boxGeometry args={[1.4, it.h, 1.4]} />
          <meshStandardMaterial color="#0a0f26" emissive="#1b2f6e" emissiveIntensity={0.35} />
          <Edges color="#3a66ff" />
        </mesh>
      ))}
    </group>
  );
}

export function DigitalEnvironment() {
  return (
    <>
      <DataSun />
      <DataMotes />
      <Monoliths />
      <Grid
        position={[0, -0.15, 2]}
        cellSize={1.1}
        cellThickness={0.6}
        cellColor="#16204a"
        sectionSize={5.5}
        sectionThickness={1.1}
        sectionColor="#27408f"
        fadeDistance={46}
        fadeStrength={1.6}
        infiniteGrid
      />
    </>
  );
}
