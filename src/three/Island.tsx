import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Line, useTexture } from "@react-three/drei";
import * as THREE from "three";

/**
 * The board's world after Digimon Adventure: a File Island beach. Near the board it's 3D —
 * sand, the wet band and the surf, painted by one shader, with phone booths, telephone poles
 * and palms; past the surf the sea melts into a painting (the menu's seascapes, sampled in
 * screen space by the same shader): the far sea, the horizon, the islands and the sky. The
 * play camera looks down at ~34°, so the true horizon sits above the screen — the painting's
 * is set where it reads as the view. Boss rounds turn the beach to dusk under the Black
 * Gears' sky and raise them over the water; the final round, under the eclipse.
 */

interface Mood {
  sky: string;
  fog: string;
  sand: string;
  sandDark: string;
  wet: string;
  shallow: string;
  deep: string;
  foam: string;
}
const DAY: Mood = {
  sky: "#9ad8ff",
  fog: "#cdebff",
  sand: "#f4e2b0",
  sandDark: "#e8cf97",
  wet: "#d6bb84",
  shallow: "#5fd6e6",
  deep: "#1f8fd0",
  foam: "#ffffff",
};
const DUSK: Mood = {
  sky: "#2a1446",
  fog: "#4a1f45",
  sand: "#c7a27a",
  sandDark: "#b18c68",
  wet: "#94735c",
  shallow: "#8a3a62",
  deep: "#2a1236",
  foam: "#ffc6b8",
};

/** where the sand meets the sea (world z, the enemy side's back edge is at +4.4) — close,
 *  so the painted sea, horizon and sky have room above it */
const SHORE_Z = 8;

/** The paintings past the surf: the image, where its horizon is (from the top) and where
 *  to look across it on a narrow screen (its subject). */
const PAINTINGS = {
  day: { src: "/art/sea-day.webp", horizon: 0.628, focus: 0.72 },
  dusk: { src: "/art/sea-dusk.webp", horizon: 0.633, focus: 0.56 },
  eclipse: { src: "/art/sea-eclipse.webp", horizon: 0.66, focus: 0.5 },
} as const;
type PaintingKey = keyof typeof PAINTINGS;
/** where the painted horizon sits on screen (from the top), and how tall a phone shows it */
const PAINT_HORIZON = 0.21;
const PAINT_MIN_HEIGHT = 0.62;

const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uShore;
uniform vec3 uSand;
uniform vec3 uSandDark;
uniform vec3 uWet;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uPaint;
uniform float uPaintOn;
uniform vec2 uRes;
uniform vec4 uPaintMap;
uniform vec2 uPaintScale;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = vWorld.xz;
  // the shoreline wanders a little
  float shore = uShore + sin(p.x * 0.23) * 0.9 + sin(p.x * 0.07 + 1.3) * 1.6;
  float d = p.y - shore; // < 0 on the sand, > 0 in the sea

  // sand: soft cel-shaded patches and a fine grain
  float n = noise(p * 0.35);
  vec3 sand = mix(uSand, uSandDark, step(0.62, n) * 0.7);
  sand *= 0.975 + 0.05 * hash(floor(p * 7.0));
  // the wet band the waves reach
  vec3 land = mix(sand, uWet, smoothstep(-1.8, -0.1, d) * 0.85);

  // water: shallow turquoise into deep blue, with glints drifting on the swell
  float depth = smoothstep(0.0, 24.0, d);
  vec3 water = mix(uShallow, uDeep, depth);
  float swell = sin(p.x * 0.6 + p.y * 1.7 - uTime * 0.8) * sin(p.x * 0.23 - uTime * 0.3);
  water += step(0.86, swell) * 0.16 * (1.0 - depth * 0.6);

  vec3 col = d < 0.0 ? land : water;
  // the surf: a white line lapping at the waterline, a fainter one behind it
  float lap = sin(uTime * 0.9 + p.x * 0.15) * 0.5;
  float foam = 1.0 - smoothstep(0.0, 0.32, abs(d - 0.3 - lap));
  foam += (1.0 - smoothstep(0.0, 0.16, abs(d - 1.9 - lap * 0.6))) * 0.5;
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * step(-0.25, d));

  // distance haze
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));

  // past the surf the sea melts into the painting: the far sea, the horizon, the sky —
  // sampled where this pixel sits on screen (uPaintMap: x the image's u at screen centre,
  // y its horizon's v, z the horizon's screen y; uPaintScale: image uv per screen uv)
  if (uPaintOn > 0.5) {
    vec2 s = gl_FragCoord.xy / uRes;
    vec2 iuv = vec2(uPaintMap.x + (s.x - 0.5) * uPaintScale.x, uPaintMap.y + (s.y - uPaintMap.z) * uPaintScale.y);
    vec3 paint = texture2D(uPaint, clamp(iuv, vec2(0.002), vec2(0.998))).rgb;
    col = mix(col, paint, smoothstep(2.2, 9.0, d));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const FOG_NEAR = 38;
const FOG_FAR = 110;

/** The beach and the sea: one big plane under everything, colours easing between moods;
 *  past the surf, the painting. */
function Ground({ mood, paint }: { mood: Mood; paint: THREE.Texture | null }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uShore: { value: SHORE_Z },
          uSand: { value: new THREE.Color(DAY.sand) },
          uSandDark: { value: new THREE.Color(DAY.sandDark) },
          uWet: { value: new THREE.Color(DAY.wet) },
          uShallow: { value: new THREE.Color(DAY.shallow) },
          uDeep: { value: new THREE.Color(DAY.deep) },
          uFoam: { value: new THREE.Color(DAY.foam) },
          uFog: { value: new THREE.Color(DAY.fog) },
          uFogNear: { value: FOG_NEAR },
          uFogFar: { value: FOG_FAR },
          uPaint: { value: null as THREE.Texture | null },
          uPaintOn: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uPaintMap: { value: new THREE.Vector4(0.5, 0.37, 0.79, 0) },
          uPaintScale: { value: new THREE.Vector2(1, 1) },
        },
      }),
    [],
  );
  const buffer = useMemo(() => new THREE.Vector2(), []);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((state, dt) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    // the painting, laid over the screen: as wide as the screen (a phone shows a slice of it,
    // at least PAINT_MIN_HEIGHT tall, around its subject), its horizon at PAINT_HORIZON
    const img = paint?.image as { width: number; height: number } | undefined;
    u.uPaintOn.value = paint && img ? 1 : 0;
    if (paint && img) {
      state.gl.getDrawingBufferSize(buffer);
      u.uRes.value.copy(buffer);
      const { width: W, height: H } = state.size;
      const ia = img.width / img.height;
      const hs = Math.max(W / ia, H * PAINT_MIN_HEIGHT); // the painting's height on screen (px)
      const sx = W / (hs * ia); // image u per screen u
      const sy = H / hs; // image v per screen v
      const key = (paint.userData.key ?? "day") as PaintingKey;
      const p = PAINTINGS[key];
      const focus = Math.min(1 - sx / 2, Math.max(sx / 2, sx >= 1 ? 0.5 : p.focus));
      u.uPaint.value = paint;
      u.uPaintScale.value.set(sx, sy);
      u.uPaintMap.value.set(focus, 1 - p.horizon, 1 - PAINT_HORIZON, 0);
    }
    const k = Math.min(1, dt * 2.5);
    const ease = (name: string, hex: string) => (u[name].value as THREE.Color).lerp(target.set(hex), k);
    ease("uSand", mood.sand);
    ease("uSandDark", mood.sandDark);
    ease("uWet", mood.wet);
    ease("uShallow", mood.shallow);
    ease("uDeep", mood.deep);
    ease("uFoam", mood.foam);
    ease("uFog", mood.fog);
  });
  return (
    <mesh position={[0, -0.16, 30]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[320, 320]} />
    </mesh>
  );
}

const toon = (color: string) => <meshToonMaterial color={color} />;

/** A glass phone booth on the sand, like the ones on File Island's beach. */
function PhoneBooth({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.9, 2.1, 0.9]} />
        {toon("#d9e9e2")}
      </mesh>
      {/* glass panes, front and sides */}
      <mesh position={[0, 1.0, -0.46]}>
        <boxGeometry args={[0.7, 1.55, 0.03]} />
        <meshStandardMaterial color="#9fdcef" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0.46, 1.0, 0]}>
        <boxGeometry args={[0.03, 1.55, 0.7]} />
        <meshStandardMaterial color="#9fdcef" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[-0.46, 1.0, 0]}>
        <boxGeometry args={[0.03, 1.55, 0.7]} />
        <meshStandardMaterial color="#9fdcef" transparent opacity={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0, 2.16, 0]}>
        <boxGeometry args={[1.0, 0.16, 1.0]} />
        {toon("#3fa58a")}
      </mesh>
      <mesh position={[0, 1.93, -0.461]}>
        <boxGeometry args={[0.6, 0.16, 0.02]} />
        {toon("#ffd23f")}
      </mesh>
    </group>
  );
}

/** A wooden telephone pole: crossbars and white insulators; its wires are drawn by Wires. */
function Pole({ position, height = 6 }: { position: [number, number, number]; height?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.11, height, 8]} />
        {toon("#7a5537")}
      </mesh>
      <mesh position={[0, height - 0.45, 0]}>
        <boxGeometry args={[1.5, 0.1, 0.12]} />
        {toon("#6a4a30")}
      </mesh>
      <mesh position={[0, height - 0.95, 0]}>
        <boxGeometry args={[1.1, 0.09, 0.11]} />
        {toon("#6a4a30")}
      </mesh>
      {[-0.65, 0.65, -0.45, 0.45].map((x, i) => (
        <mesh key={i} position={[x, height - (i < 2 ? 0.36 : 0.87), 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 6]} />
          {toon("#f5f7fb")}
        </mesh>
      ))}
    </group>
  );
}

/** wires sag between consecutive poles (catenary-ish: a parabola) */
function Wires({ poles, height = 6 }: { poles: [number, number, number][]; height?: number }) {
  const lines = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    for (const dx of [-0.65, 0.65, -0.45, 0.45]) {
      const y0 = height - (Math.abs(dx) > 0.5 ? 0.3 : 0.81);
      for (let i = 0; i + 1 < poles.length; i++) {
        const a = new THREE.Vector3(poles[i][0] + dx, poles[i][1] + y0, poles[i][2]);
        const b = new THREE.Vector3(poles[i + 1][0] + dx, poles[i + 1][1] + y0, poles[i + 1][2]);
        const pts: THREE.Vector3[] = [];
        for (let t = 0; t <= 1.0001; t += 0.1) {
          const p = a.clone().lerp(b, t);
          p.y -= Math.sin(Math.PI * t) * 0.55;
          pts.push(p);
        }
        out.push(pts);
      }
    }
    return out;
  }, [poles, height]);
  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#2a2a35" lineWidth={1.4} />
      ))}
    </>
  );
}

/** A palm: a curved trunk and drooping fronds. */
function Palm({ position, lean = 0.4, rotation = 0, scale = 1 }: { position: [number, number, number]; lean?: number; rotation?: number; scale?: number }) {
  const trunk = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.4, 1.6, 0),
      new THREE.Vector3(lean * 1.1, 3.1, 0),
      new THREE.Vector3(lean * 2.0, 4.4, 0),
    ]);
    return { geo: new THREE.TubeGeometry(curve, 20, 0.13, 7, false), top: curve.getPoint(1) };
  }, [lean]);
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh geometry={trunk.geo}>{toon("#9a6a3e")}</mesh>
      <group position={trunk.top}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <mesh position={[0.85, -0.25, 0]} rotation={[0, 0, -0.55]}>
                <boxGeometry args={[1.9, 0.05, 0.42]} />
                {toon(i % 2 ? "#2f9e44" : "#3cb04f")}
              </mesh>
            </group>
          );
        })}
        <mesh position={[0.12, -0.18, 0.05]}>
          <sphereGeometry args={[0.16, 10, 8]} />
          {toon("#7a5537")}
        </mesh>
        <mesh position={[-0.1, -0.2, -0.08]}>
          <sphereGeometry args={[0.15, 10, 8]} />
          {toon("#7a5537")}
        </mesh>
      </group>
    </group>
  );
}


/** a gear outline with teeth and a hole, extruded */
function gearGeometry(radius: number, teeth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const inner = radius * 0.8;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [inner, a],
      [radius, a + step * 0.12],
      [radius, a + step * 0.42],
      [inner, a + step * 0.54],
    ];
    pts.forEach(([r, t], j) => {
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.28, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: radius * 0.22, bevelEnabled: true, bevelSize: radius * 0.03, bevelThickness: radius * 0.03, bevelSegments: 1 });
}

/** Devimon's Black Gears turning over the sea while a boss is near. */
function BlackGears({ show }: { show: boolean }) {
  const gears = useMemo(
    () => [
      { geo: gearGeometry(1.8, 12), pos: [6.5, 1.8, 14] as [number, number, number], speed: 0.25 },
      { geo: gearGeometry(2.6, 14), pos: [-7.5, 2.4, 18] as [number, number, number], speed: -0.18 },
      { geo: gearGeometry(1.0, 9), pos: [-2.5, 1.25, 12] as [number, number, number], speed: 0.4 },
    ],
    [],
  );
  const group = useRef<THREE.Group>(null);
  const shown = useRef(0);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    shown.current += ((show ? 1 : 0) - shown.current) * Math.min(1, dt * 1.5);
    g.visible = shown.current > 0.01;
    g.children.forEach((c, i) => {
      c.rotation.z += dt * gears[i].speed;
      c.position.y = gears[i].pos[1] - (1 - shown.current) * 6 + Math.sin(state.clock.elapsedTime * 0.7 + i) * 0.15;
    });
  });
  return (
    <group ref={group}>
      {gears.map((g, i) => (
        <mesh key={i} geometry={g.geo} position={g.pos}>
          <meshStandardMaterial color="#0b0b12" roughness={0.55} metalness={0.35} emissive="#4a0016" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

const POLES: [number, number, number][] = [
  [10.5, 0, 2],
  [11.5, 0, 7],
];

/** Daylight for the island, or a red-violet dusk on boss rounds. */
function IslandLighting({ boss }: { boss: boolean }) {
  return boss ? (
    <>
      <Environment key="dusk" resolution={64} frames={1} environmentIntensity={0.45}>
        <Lightformer form="rect" intensity={1.8} color="#ffb0a0" position={[0, 6, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ff4d6d" position={[-8, 2, 6]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={2} color="#8a4dff" position={[8, 2, 6]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
      </Environment>
      <ambientLight intensity={0.3} />
      <hemisphereLight args={["#8a5aa8", "#3a1a2a", 0.6]} />
      <directionalLight position={[4, 9, -6]} intensity={1.25} color="#ffc2a8" />
      <pointLight position={[-6, 4, 8]} intensity={30} color="#ff3d5a" distance={22} />
    </>
  ) : (
    <>
      <Environment key="day" resolution={64} frames={1} environmentIntensity={0.6}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 6, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#bfe6ff" position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe2b8" position={[8, 3, 2]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
      </Environment>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#cfeaff", "#e9d3a0", 0.7]} />
      <directionalLight position={[3, 10, -7]} intensity={1.5} color="#fff4e2" />
      <directionalLight position={[-3, 5, 7]} intensity={0.7} color="#ffffff" />
    </>
  );
}

/** The painting for the mood, once loaded (the plain 3D sea until then). */
function PaintedGround({ mood, painting }: { mood: Mood; painting: PaintingKey }) {
  const tex = useTexture(PAINTINGS[painting].src);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.key = painting;
    tex.needsUpdate = true;
  }, [tex, painting]);
  return <Ground mood={mood} paint={tex} />;
}

/** The whole island: sky, haze, beach and sea, the props, the light — dusk on boss rounds,
 *  the eclipse on the final one. */
export function IslandEnvironment({ boss = false, final = false }: { boss?: boolean; final?: boolean }) {
  const mood = boss || final ? DUSK : DAY;
  const painting: PaintingKey = final ? "eclipse" : boss ? "dusk" : "day";
  const scene = useThree((s) => s.scene);
  const bg = useMemo(() => new THREE.Color(DAY.sky), []);
  const fog = useMemo(() => new THREE.Fog(DAY.fog, FOG_NEAR, FOG_FAR), []);
  const sky = useMemo(() => new THREE.Color(mood.sky), [mood]);
  const haze = useMemo(() => new THREE.Color(mood.fog), [mood]);
  useEffect(() => {
    scene.background = bg;
    scene.fog = fog;
    return () => {
      // back to the menu: it paints its own background, and has no haze
      if (scene.background === bg) scene.background = null;
      if (scene.fog === fog) scene.fog = null;
    };
  }, [scene, bg, fog]);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2.5);
    bg.lerp(sky, k);
    fog.color.lerp(haze, k);
  });
  return (
    <>
      <IslandLighting boss={boss || final} />
      <Suspense fallback={<Ground mood={mood} paint={null} />}>
        <PaintedGround mood={mood} painting={painting} />
      </Suspense>
      <PhoneBooth position={[6.6, -0.16, 5.9]} rotation={0.35} />
      <PhoneBooth position={[7.8, -0.16, 6.6]} rotation={0.2} />
      {POLES.map((p, i) => (
        <Pole key={i} position={[p[0], -0.16, p[2]]} />
      ))}
      <Wires poles={POLES.map((p) => [p[0], -0.16, p[2]] as [number, number, number])} />
      <Palm position={[-8.2, -0.16, 1.5]} lean={-0.5} rotation={0.3} />
      <Palm position={[-9.6, -0.16, 7.5]} lean={-0.35} rotation={-0.4} scale={0.9} />
      <BlackGears show={boss} />
    </>
  );
}
