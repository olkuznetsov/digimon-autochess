import { COLS, ROWS, CELL, cellToWorld, benchToWorld, BENCH_SLOTS } from "../game/board";

interface BoardProps {
  /** highlight player cells (during drag) */
  highlight?: boolean;
  hovered?: { col: number; row: number } | null;
}

function Tile({
  x,
  z,
  color,
  emissive,
  active,
}: {
  x: number;
  z: number;
  color: string;
  emissive: number;
  active?: boolean;
}) {
  return (
    <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[CELL * 0.92, CELL * 0.92]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={active ? 0.9 : emissive}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  );
}

export function Board({ highlight = false, hovered = null }: BoardProps) {
  const tiles = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const [x, z] = cellToWorld(col, row);
      const isPlayer = row <= 2;
      const isHovered = hovered && hovered.col === col && hovered.row === row;
      tiles.push(
        <Tile
          key={`${col}-${row}`}
          x={x}
          z={z}
          color={isPlayer ? "#1d6cff" : "#ff4d6d"}
          emissive={isPlayer ? (highlight ? 0.35 : 0.12) : 0.1}
          active={!!isHovered}
        />,
      );
    }
  }

  // bench slots
  const bench = [];
  for (let slot = 0; slot < BENCH_SLOTS; slot++) {
    const [x, z] = benchToWorld(slot);
    bench.push(<Tile key={`b-${slot}`} x={x} z={z} color="#3a3f5c" emissive={0.18} />);
  }

  const platformDepth = (ROWS + 3.2) * CELL;
  const platformWidth = (COLS + 1.4) * CELL;

  return (
    <group>
      {/* base platform under everything */}
      <mesh position={[0, -0.06, CELL * 1.0]} receiveShadow>
        <boxGeometry args={[platformWidth, 0.12, platformDepth]} />
        <meshStandardMaterial color="#0c1022" roughness={0.8} metalness={0.3} />
      </mesh>
      {/* glowing seam between player and enemy halves */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[platformWidth, 0.06]} />
        <meshStandardMaterial color="#9be7ff" emissive="#9be7ff" emissiveIntensity={3} />
      </mesh>
      {tiles}
      {bench}
    </group>
  );
}
