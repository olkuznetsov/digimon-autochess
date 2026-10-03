import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COLS, ROWS, CELL, BENCH_SLOTS, BENCH_STEP, BENCH_Z } from "../game/board";

interface BoardProps {
  /** highlight player cells (during drag) */
  highlight?: boolean;
  hovered?: { col: number; row: number } | null;
}

/**
 * Holographic grid: one shader plane per area instead of a mesh per tile. Each cell
 * is a dark glass plate with a thin glowing frame (brighter at the corners), a faint
 * team tint and a slow scan band; the hovered cell lights up and, while a unit is
 * dragged, the player's half pulses. Frames run hotter than 1.0 so bloom picks them up.
 */
const VERT = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uOrigin;   // world xz of the grid's (col 0, row 0) corner
uniform float uCell;
uniform float uSplit;   // rows below this use colour A, the rest colour B
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec2 uHover;    // hovered cell, or far away
uniform float uDrag;    // 0..1 while a unit is being dragged
varying vec2 vXZ;

void main() {
  vec2 g = (vXZ - uOrigin) / uCell;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float team = step(uSplit, cell.y);
  vec3 tint = mix(uColorA, uColorB, team);

  vec2 d2 = min(f, 1.0 - f);
  float d = min(d2.x, d2.y);
  const float gap = 0.035;
  float plate = smoothstep(gap, gap + 0.01, d);
  float frame = plate * (1.0 - smoothstep(gap + 0.012, gap + 0.035, d));
  float corner = 1.0 - smoothstep(0.1, 0.2, max(d2.x, d2.y));
  float rim = plate * (1.0 - smoothstep(gap, gap + 0.16, d));

  // glass plate: dark, faintly tinted, a little brighter toward the centre
  float r = length(f - 0.5);
  vec3 col = vec3(0.006, 0.008, 0.02) + plate * tint * (0.035 + 0.03 * (1.0 - r * 1.4));
  // fine data dots
  vec2 dots = fract(g * 5.0) - 0.5;
  col += plate * tint * 0.025 * (1.0 - smoothstep(0.05, 0.12, length(dots)));
  // slow scan band sweeping away from the camera
  float scan = pow(0.5 + 0.5 * sin(g.y * 0.9 - uTime * 1.1), 24.0);
  col += plate * tint * scan * 0.16;
  // frame, hotter at the corners
  col += tint * (frame * (0.7 + corner * 1.6) + rim * 0.06);

  float hover = 1.0 - step(0.5, abs(cell.x - uHover.x) + abs(cell.y - uHover.y));
  col += tint * hover * (plate * 0.22 + frame * 2.2);
  float pulse = uDrag * (1.0 - team) * (0.55 + 0.45 * sin(uTime * 5.0));
  col += tint * pulse * (plate * 0.07 + frame * 0.9);

  gl_FragColor = vec4(col, 1.0);
}
`;

const PLAYER = new THREE.Color("#2f7dff");
const ENEMY = new THREE.Color("#ff3d81");
const BENCH = new THREE.Color("#8b6bff");
const FAR = new THREE.Vector2(-99, -99);

function GridSurface({
  cols,
  rows,
  centerZ,
  split,
  colorA,
  colorB,
  hovered,
  drag,
  y = 0.012,
  cell = CELL,
}: {
  y?: number;
  /** cell size (the bench packs its slots closer) */
  cell?: number;
  cols: number;
  rows: number;
  centerZ: number;
  split: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  hovered?: { col: number; row: number } | null;
  drag?: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uOrigin: { value: new THREE.Vector2((-cols / 2) * cell, centerZ - (rows / 2) * cell) },
          uCell: { value: cell },
          uSplit: { value: split },
          uColorA: { value: colorA.clone() },
          uColorB: { value: colorB.clone() },
          uHover: { value: FAR.clone() },
          uDrag: { value: 0 },
        },
      }),
    [cols, rows, centerZ, split, colorA, colorB, cell],
  );

  useFrame((state, dt) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    if (hovered) u.uHover.value.set(hovered.col, hovered.row);
    else u.uHover.value.copy(FAR);
    u.uDrag.value += ((drag ? 1 : 0) - u.uDrag.value) * Math.min(1, dt * 8);
  });

  return (
    <mesh position={[0, y, centerZ]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[cols * cell, rows * cell]} />
    </mesh>
  );
}

/** Thin glowing bars framing a rectangle on the ground. */
function Rim({ w, d, z, color, glow }: { w: number; d: number; z: number; color: string; glow: number }) {
  const t = 0.035;
  return (
    <group position={[0, 0.02, z]}>
      {[
        { p: [0, 0, d / 2], s: [w + t, t] },
        { p: [0, 0, -d / 2], s: [w + t, t] },
        { p: [w / 2, 0, 0], s: [t, d] },
        { p: [-w / 2, 0, 0], s: [t, d] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={b.s as [number, number]} />
          <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(glow)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Board({ highlight = false, hovered = null }: BoardProps) {
  const boardW = COLS * CELL;
  const boardD = ROWS * CELL;
  const platformW = boardW + CELL * 0.6;
  const front = BENCH_Z - CELL / 2 - CELL * 0.3;
  const back = boardD / 2 + CELL * 0.3;
  const platformD = back - front;
  const platformZ = (back + front) / 2;

  return (
    <group>
      {/* dark glass slab under the board and bench */}
      <mesh position={[0, -0.07, platformZ]} receiveShadow>
        <boxGeometry args={[platformW, 0.14, platformD]} />
        <meshStandardMaterial color="#070a18" roughness={0.35} metalness={0.6} />
      </mesh>
      <Rim w={platformW} d={platformD} z={platformZ} color="#3a5bff" glow={1.4} />

      <GridSurface
        cols={COLS}
        rows={ROWS}
        centerZ={0}
        split={ROWS / 2}
        colorA={PLAYER}
        colorB={ENEMY}
        hovered={hovered}
        drag={highlight}
      />
      {/* the front line between the halves */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[boardW + CELL * 0.4, 0.035]} />
        <meshBasicMaterial color={new THREE.Color("#9be7ff").multiplyScalar(2.2)} toneMapped={false} />
      </mesh>

      {/* the bench strip slightly overlaps the board's front edge — sit it just below */}
      <GridSurface cols={BENCH_SLOTS} rows={1} centerZ={BENCH_Z} y={0.008} split={1} colorA={BENCH} colorB={BENCH} cell={BENCH_STEP} />
    </group>
  );
}
