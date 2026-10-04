import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COLS, ROWS, CELL, BENCH_SLOTS, BENCH_STEP, BENCH_Z } from "../game/board";

interface BoardProps {
  /** a boss round: the board dims with the dusk */
  boss?: boolean;
  /** highlight player cells (during drag) */
  highlight?: boolean;
  hovered?: { col: number; row: number } | null;
}

/**
 * The board on the beach: one shader plane per area instead of a mesh per tile. Each cell
 * is a flat, cel-shaded tile — grass on your half, raked sand on theirs — with white grout
 * between them, a darker band inside the edge and a light corner; the hovered cell
 * brightens and, while a unit is dragged, your half pulses sky blue. Unlit on purpose: the
 * anime look wants flat colour (and nothing here reaches the bloom threshold).
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
uniform float uDim;     // 1 by day, lower at a boss's dusk
varying vec2 vXZ;

void main() {
  vec2 g = (vXZ - uOrigin) / uCell;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float team = step(uSplit, cell.y);
  // a gentle checker, like mown grass and raked sand
  vec3 base = mix(uColorA, uColorB, team) * (0.95 + 0.07 * mod(cell.x + cell.y, 2.0));

  vec2 d2 = min(f, 1.0 - f);
  float d = min(d2.x, d2.y);
  const float gap = 0.035;
  float tile = smoothstep(gap, gap + 0.012, d);
  // cel shading: a darker band inside the edge, a light corner (screen top-left)
  float edge = 1.0 - smoothstep(gap + 0.01, gap + 0.11, d);
  vec3 col = base * (1.0 - 0.12 * edge);
  col += tile * 0.05 * (1.0 - smoothstep(0.0, 0.45, length(f - vec2(0.72, 0.72))));
  // white grout
  col = mix(vec3(0.97, 0.98, 1.0), col, tile);

  float hover = 1.0 - step(0.5, abs(cell.x - uHover.x) + abs(cell.y - uHover.y));
  col = mix(col, vec3(1.0, 1.0, 0.92), hover * tile * 0.45);
  float pulse = uDrag * (1.0 - team) * (0.55 + 0.45 * sin(uTime * 5.0));
  col = mix(col, vec3(0.72, 0.92, 1.0), pulse * tile * 0.3);

  gl_FragColor = vec4(col * uDim, 1.0);
}
`;

const PLAYER = new THREE.Color("#93d36d");
const ENEMY = new THREE.Color("#efd49a");
const BENCH = new THREE.Color("#cfe2ef");
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
  dim = 1,
}: {
  /** darker at a boss's dusk */
  dim?: number;
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
          uDim: { value: 1 },
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
    u.uDim.value += (dim - u.uDim.value) * Math.min(1, dt * 2.5);
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

export function Board({ highlight = false, hovered = null, boss = false }: BoardProps) {
  const boardW = COLS * CELL;
  const boardD = ROWS * CELL;
  const platformW = boardW + CELL * 0.6;
  const front = BENCH_Z - CELL / 2 - CELL * 0.3;
  const back = boardD / 2 + CELL * 0.3;
  const platformD = back - front;
  const platformZ = (back + front) / 2;

  return (
    <group>
      {/* a sandstone slab under the board and bench */}
      <mesh position={[0, -0.07, platformZ]}>
        <boxGeometry args={[platformW, 0.14, platformD]} />
        <meshToonMaterial color="#d9bb80" />
      </mesh>
      <Rim w={platformW} d={platformD} z={platformZ} color="#ffffff" glow={0.95} />

      <GridSurface
        cols={COLS}
        rows={ROWS}
        centerZ={0}
        split={ROWS / 2}
        colorA={PLAYER}
        colorB={ENEMY}
        hovered={hovered}
        drag={highlight}
        dim={boss ? 0.78 : 1}
      />
      {/* the front line between the halves */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[boardW + CELL * 0.4, 0.035]} />
        <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(0.95)} toneMapped={false} />
      </mesh>

      {/* the bench strip slightly overlaps the board's front edge — sit it just below */}
      <GridSurface cols={BENCH_SLOTS} rows={1} centerZ={BENCH_Z} y={0.008} split={1} colorA={BENCH} colorB={BENCH} cell={BENCH_STEP} dim={boss ? 0.78 : 1} />
    </group>
  );
}
