import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FORMS, ATTR_COLOR } from "../game/creatures";
import { useProfile } from "../profile/store";
import { CARE, careNow, isHungry, useCareFx, type CareFx } from "../profile/care";
import { Meat } from "../ui/kit";
import { playerName } from "../net/leaderboard";
import { CreatureModel } from "./CreatureModel";
import { modelFor, tweakFor } from "./models";
import { newDrive, type UnitDrive } from "./unitDrive";
import { sfx } from "../audio/sfx";

/** the partner is shown bigger than on the board, still growing with its stage */
const SHOWCASE_SCALE = [0.95, 1.05, 1.2, 1.45, 1.65];
const TOP = 0.02;
const BACKDROP = "/art/file-island.webp";

/** File Island, painted, as the scene's background — cropped like CSS `cover`; on portrait
 *  screens the crop sits a little right of the middle, on the tram and the mountain. */
function MenuBackdrop() {
  const tex = useTexture(BACKDROP);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    scene.background = tex;
    return () => {
      if (scene.background === tex) scene.background = null;
    };
  }, [tex, scene]);
  useEffect(() => {
    const img = tex.image as { width: number; height: number };
    const ia = img.width / img.height;
    const va = size.width / size.height;
    if (va > ia) {
      const r = ia / va;
      tex.repeat.set(1, r);
      tex.offset.set(0, (1 - r) / 2);
    } else {
      const r = va / ia;
      tex.repeat.set(r, 1);
      tex.offset.set((1 - r) * (va < 0.9 ? 0.55 : 0.5), 0);
    }
  }, [tex, size]);
  return null;
}

/** Daylight to match the painting: a warm key from the camera's side, sky fill, a rim. */
function MenuLighting() {
  return (
    <>
      <Environment resolution={64} frames={1} environmentIntensity={0.6}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 6, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#bfe6ff" position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe2b8" position={[8, 3, 2]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
      </Environment>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#cfeaff", "#e9d3a0", 0.7]} />
      <directionalLight position={[3, 7, -5]} intensity={1.6} color="#fff4e2" />
      <directionalLight position={[-2, 4, 6]} intensity={0.9} color="#ffffff" />
    </>
  );
}

/** a soft radial disc: light for the platform, or a contact shadow */
function radialTexture(inner: string, mid: string, outer: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.4, mid);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The partner's platform on the sand: a pool of light, a contact shadow and two
 *  counter-rotating rings (white, and courage orange). */
function GlowPlatform() {
  const glow = useMemo(() => radialTexture("rgba(255,255,255,0.95)", "rgba(200,240,255,0.55)", "rgba(200,240,255,0)"), []);
  const shade = useMemo(() => radialTexture("rgba(20,30,60,0.5)", "rgba(20,30,60,0.28)", "rgba(20,30,60,0)"), []);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ringA.current) ringA.current.rotation.z += dt * 0.35;
    if (ringB.current) ringB.current.rotation.z -= dt * 0.22;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[4.4, 4.4]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[1.9, 1.9]} />
        <meshBasicMaterial map={shade} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ringA} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.42, 1.5, 96, 1, 0, Math.PI * 1.7]} />
        <meshBasicMaterial color={[1.5, 1.5, 1.5]} toneMapped={false} transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringB} position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.16, 1.2, 96, 1, 0, Math.PI * 1.25]} />
        <meshBasicMaterial color="#ff8a1f" toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
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
        <mesh key={i} position={[Math.cos(a) * 0.41, i % 2 ? 0.12 : -0.1, Math.sin(a) * 0.41]} scale={0.085}>
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

/** What the partner says to what just happened. */
const SAY: Record<CareFx["kind"], [string, string] | null> = {
  feed: ["Yum!", "おいしい！"],
  train: ["Hyah!", "やあっ！"],
  pet: null,
  full: ["I'm full!", "おなかいっぱい！"],
  hungry: ["Too hungry to train…", "おなかすいた…"],
  tired: ["Let me rest a bit…", "ひとやすみ…"],
  nomeat: ["We're out of meat!", "おにくがない！"],
};

/** A speech bubble over the partner's head: how it feels when the menu opens, then what it
 *  thinks of being fed, trained or turned down. */
function Bubble({ y }: { y: number }) {
  const fx = useCareFx((s) => s.fx);
  const [line, setLine] = useState<{ text: string; jp: string; meat: boolean; key: number } | null>(() => {
    const p = useProfile.getState().partner;
    const c = p?.care ? careNow(p.care) : null;
    const name = playerName();
    const [text, jp] = !c
      ? [`Let’s go, ${name}!`, "いこう！"]
      : isHungry(c)
        ? [`I'm hungry, ${name}…`, "おなかすいた…"]
        : c.mood < 30
          ? ["Play with me!", "あそぼうよ！"]
          : c.mood >= CARE.happyAt
            ? [`I'm so happy, ${name}!`, "うれしい！"]
            : [`Let’s go, ${name}!`, "いこう！"];
    return { text, jp, meat: false, key: 0 };
  });
  useEffect(() => {
    if (!fx || Date.now() - fx.key > 1500) return;
    const say = SAY[fx.kind];
    if (say) setLine({ text: say[0], jp: say[1], meat: fx.kind === "feed", key: fx.key });
  }, [fx]);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), line.key ? 2200 : 5000);
    return () => clearTimeout(t);
  }, [line]);
  if (!line) return null;
  return (
    <Html position={[0, y, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
      <div className="menu-bubble" key={line.key}>
        <b>{line.text}</b>
        <span className="jp">{line.jp}</span>
      </div>
      {line.meat && (
        <span className="meat-pop" key={`m${line.key}`}>
          <Meat size={34} />
        </span>
      )}
    </Html>
  );
}

/** The partner itself: its real model, facing the camera with a slow sway; a tap pets it. */
function Partner({ formId, star }: { formId: string; star: number }) {
  const form = FORMS[formId];
  const drive = useRef<UnitDrive>(newDrive(0, 0, Math.PI));
  const g = useRef<THREE.Group>(null);
  const [hearts, setHearts] = useState(0);
  const petUntil = useRef(0);
  // care: eating is a glad little dance and hearts; training, three blows and a cheer (a
  // refusal is only words, in the bubble)
  const fx = useCareFx((s) => s.fx);
  useEffect(() => {
    if (!fx || Date.now() - fx.key > 1500) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (fx.kind === "feed") {
      sfx.munch();
      petUntil.current = performance.now() + 1700;
      setHearts((h) => h + 1);
    } else if (fx.kind === "train") {
      [0, 480, 960].forEach((ms) =>
        timers.push(
          setTimeout(() => {
            drive.current.attackKey++;
            sfx.punch();
          }, ms),
        ),
      );
      timers.push(setTimeout(() => (petUntil.current = performance.now() + 1300), 1500));
    }
    return () => timers.forEach(clearTimeout);
  }, [fx]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (g.current) g.current.rotation.y = Math.PI + Math.sin(t * 0.4) * 0.35;
    drive.current.win = performance.now() < petUntil.current;
  });
  const scale = SHOWCASE_SCALE[(form?.stage ?? 1) - 1] * (star > 1 ? 1.06 : 1);
  return (
    <>
      <group
        ref={g}
        position={[0, TOP, 0]}
        scale={scale}
        onPointerDown={(e) => {
          e.stopPropagation();
          petUntil.current = performance.now() + 1700;
          setHearts((h) => h + 1);
          sfx.buy();
          useProfile.getState().pet();
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
      <Bubble y={TOP + 1.2 * scale} />
    </>
  );
}

/** The main menu's 3D stage: File Island behind, the partner on its platform of light. */
export function MenuStage() {
  const partner = useProfile((s) => s.partner);
  const grew = useProfile((s) => s.grew);
  return (
    <group>
      <Suspense fallback={null}>
        <MenuBackdrop />
      </Suspense>
      <MenuLighting />
      <GlowPlatform />
      {partner ? <Partner formId={partner.formId} star={partner.star} /> : <Egg />}
      <GrowthBeam grewKey={grew?.key} />
    </group>
  );
}
