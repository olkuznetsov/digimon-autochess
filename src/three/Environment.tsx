import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import * as THREE from "three";

/**
 * The Digital World arena: everything procedural, no assets.
 * - gradient sky with twinkling stars
 * - a synthwave "data sun" with scrolling slats, sinking behind neon mountain ridges
 * - distant data towers with blinking beacons framing the board
 * - neon grid floor fading into the haze, data motes drifting upward
 */

/** Haze colour where the floor meets the sky — the scene fog uses it too. */
export const HORIZON = "#140b2c";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
  // magenta haze hugging the horizon behind the sun
  col += uGlow * exp(-abs(h) * 9.0) * smoothstep(-0.2, 1.0, vDir.z) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}
`;

function Sky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color("#020309") },
          uHorizon: { value: new THREE.Color(HORIZON) },
          uGlow: { value: new THREE.Color("#5a1a5e") },
        },
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-10}>
      <sphereGeometry args={[90, 32, 16]} />
    </mesh>
  );
}

const STAR_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
varying float vAlpha;
void main() {
  vAlpha = 0.45 + 0.55 * sin(uTime * (0.6 + fract(aPhase * 7.3) * 1.8) + aPhase * 6.283);
  gl_PointSize = 1.2 + fract(aPhase * 13.1) * 1.6;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const STAR_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(p)) * vAlpha;
  gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * 1.4, a);
}
`;

function Stars({ count = 700 }: { count?: number }) {
  const { positions, phases } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // upper hemisphere, denser toward the zenith, kept off the horizon haze
      const u = Math.random();
      const v = 0.12 + Math.random() * 0.88;
      const theta = u * Math.PI * 2;
      const y = v;
      const r = Math.sqrt(1 - y * y);
      p.set([Math.cos(theta) * r * 80, y * 80, Math.sin(theta) * r * 80], i * 3);
      ph[i] = Math.random();
    }
    return { positions: p, phases: ph };
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <points material={material} renderOrder={-9}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
    </points>
  );
}

const SUN_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float y = vUv.y;
  // slats: gaps widen toward the floor line and scroll downward
  float band = fract(y * 13.0 + uTime * 0.25);
  float cut = smoothstep(0.72, 0.4, y) * 0.7;
  if (y < 0.72 && band < cut) discard;
  vec3 top = vec3(1.0, 0.82, 0.3);
  vec3 bottom = vec3(1.0, 0.1, 0.55);
  vec3 col = mix(bottom, top, smoothstep(0.42, 0.98, y)) * 1.5;
  gl_FragColor = vec4(col, 1.0);
}
`;
const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.2) * 0.55;
  gl_FragColor = vec4(vec3(1.0, 0.25, 0.55) * a, a);
}
`;

function DataSun() {
  const sun = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: UV_VERT,
        fragmentShader: SUN_FRAG,
        fog: false,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );
  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: UV_VERT,
        fragmentShader: HALO_FRAG,
        fog: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame((state) => {
    sun.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    // the camera looks ~27° down, so the true horizon sits at the top edge of the
    // screen: the sun is placed low and fairly close so it rises behind the board
    <group position={[0, 1.2, 40]} rotation={[0, Math.PI, 0]}>
      <mesh material={halo} position={[0, 0, 0.1]} renderOrder={-8}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      <mesh material={sun} renderOrder={-7}>
        <planeGeometry args={[19, 19]} />
      </mesh>
    </group>
  );
}

/** Mountain ridge: dark silhouette + glowing ridge ribbon + faint vertical wires. */
function Ridge({ z, height, color, seed, gapWidth }: { z: number; height: number; color: string; seed: number; gapWidth: number }) {
  const { fill, ribbon, wires } = useMemo(() => {
    let s = seed;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const N = 72;
    const W = 150;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = -W / 2 + (i / N) * W;
      // valley in the middle so the sun shows, peaks rising toward the sides
      const side = Math.min(1, Math.max(0, (Math.abs(x) - gapWidth) / 14));
      const h = height * side * (0.45 + rnd() * 0.75) + rnd() * 0.35;
      xs.push(x);
      ys.push(h);
    }
    const fillPos: number[] = [];
    const ribbonPos: number[] = [];
    const wirePos: number[] = [];
    for (let i = 0; i < N; i++) {
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[i], ys[i + 1]];
      fillPos.push(x0, -1, 0, x1, -1, 0, x1, y1, 0, x0, -1, 0, x1, y1, 0, x0, y0, 0);
      const t = 0.09;
      ribbonPos.push(x0, y0 - t, -0.02, x1, y1 - t, -0.02, x1, y1 + t, -0.02, x0, y0 - t, -0.02, x1, y1 + t, -0.02, x0, y0 + t, -0.02);
      if (i % 2 === 0) wirePos.push(x0, -1, -0.01, x0, y0, -0.01);
    }
    const fill = new THREE.BufferGeometry();
    fill.setAttribute("position", new THREE.Float32BufferAttribute(fillPos, 3));
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute("position", new THREE.Float32BufferAttribute(ribbonPos, 3));
    const wires = new THREE.BufferGeometry();
    wires.setAttribute("position", new THREE.Float32BufferAttribute(wirePos, 3));
    return { fill, ribbon, wires };
  }, [height, seed, gapWidth]);

  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(1.8), [color]);
  return (
    <group position={[0, -0.2, z]}>
      <mesh geometry={fill}>
        <meshBasicMaterial color="#060312" side={THREE.DoubleSide} fog={false} />
      </mesh>
      <mesh geometry={ribbon}>
        <meshBasicMaterial color={glow} side={THREE.DoubleSide} toneMapped={false} fog={false} />
      </mesh>
      <lineSegments geometry={wires}>
        <lineBasicMaterial color={color} transparent opacity={0.22} fog={false} />
      </lineSegments>
    </group>
  );
}

/** Slim data towers with glowing edges and blinking beacons, far out on the flanks. */
function DataTowers() {
  const towers = useMemo(
    () => [
      { x: -9.5, z: 12, h: 4.2, w: 0.9 },
      { x: -13, z: 17, h: 6.2, w: 1.2 },
      { x: -8, z: 22, h: 3.4, w: 0.8 },
      { x: -17, z: 23, h: 7.5, w: 1.4 },
      { x: 9.5, z: 13, h: 4.6, w: 0.9 },
      { x: 13.5, z: 18, h: 6.8, w: 1.2 },
      { x: 8.5, z: 23, h: 3.2, w: 0.8 },
      { x: 17.5, z: 22, h: 7.8, w: 1.4 },
    ],
    [],
  );
  const beacons = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    beacons.current?.children.forEach((b, i) => {
      const on = Math.sin(t * 1.7 + i * 1.9) > 0.55;
      ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setScalar(0).set(on ? "#ff4d6d" : "#2a0a14");
      if (on) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).color.multiplyScalar(3);
    });
  });
  return (
    <group>
      {towers.map((t, i) => (
        <mesh key={i} position={[t.x, t.h / 2 - 0.2, t.z]}>
          <boxGeometry args={[t.w, t.h, t.w]} />
          <meshStandardMaterial color="#070a1c" emissive="#101a48" emissiveIntensity={0.5} roughness={0.4} metalness={0.7} />
          <Edges color={i % 2 ? "#ff4fd8" : "#39d8ff"} />
        </mesh>
      ))}
      <group ref={beacons}>
        {towers.map((t, i) => (
          <mesh key={i} position={[t.x, t.h + 0.1, t.z]}>
            <boxGeometry args={[0.28, 0.28, 0.28]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FLOOR_FRAG = /* glsl */ `
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uBase;
uniform vec3 uHaze;
varying vec3 vWorld;
float gridLine(vec2 p) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  vec2 p = vWorld.xz / 1.1; // the board's cell size
  float minor = gridLine(p);
  float major = gridLine(p / 5.0);
  float d = length(vWorld.xz);
  vec3 line = mix(uNear, uFar, smoothstep(6.0, 34.0, vWorld.z));
  // minor lines dissolve first so the distance doesn't shimmer
  float glow = minor * (1.0 - smoothstep(10.0, 26.0, d)) * 0.55 + major * (1.0 - smoothstep(24.0, 52.0, d)) * 1.25;
  vec3 col = uBase + line * glow;
  col = mix(col, uHaze, smoothstep(18.0, 58.0, d));
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Opaque neon grid floor, fading into the horizon haze (hides the sun's lower half). */
function Floor() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FLOOR_VERT,
        fragmentShader: FLOOR_FRAG,
        uniforms: {
          uNear: { value: new THREE.Color("#2fb8ff") },
          uFar: { value: new THREE.Color("#ff3dc8") },
          uBase: { value: new THREE.Color("#04030c") },
          uHaze: { value: new THREE.Color(HORIZON) },
        },
      }),
    [],
  );
  return (
    <mesh material={material} position={[0, -0.2, 30]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[180, 140]} />
    </mesh>
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
      // keep motes in front of the camera plane so none renders as a giant square point
      p[i * 3 + 2] = Math.random() * 34 - 2;
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

export function DigitalEnvironment() {
  return (
    <>
      <Sky />
      <Stars />
      <DataSun />
      <Ridge z={36} height={5.5} color="#ff4fd8" seed={7} gapWidth={8} />
      <Ridge z={31} height={3.6} color="#39d8ff" seed={23} gapWidth={12} />
      <DataTowers />
      <DataMotes />
      <Floor />
    </>
  );
}
