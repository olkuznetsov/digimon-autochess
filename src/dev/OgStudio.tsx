import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ATTR_COLOR, FORMS } from "../game/creatures";
import { cellToWorld } from "../game/board";
import { Board } from "../three/Board";
import { Creature } from "../three/Creature";
import { DigitalEnvironment, HORIZON } from "../three/Environment";
import { SceneLighting, ScenePost } from "../three/Scene";

/**
 * Dev tool (dev server, /?studio=og): renders the link-preview card (public/og.jpg,
 * 1200×630) and the app icons (public/icon-512.png, icon-192.png,
 * apple-touch-icon.png) from the real scene, with the title drawn on top.
 * Frames are advanced by hand, so it also works in a background tab.
 */
const LINEUP = ["metalgarurumon", "gallantmon", "wargreymon", "imperialdramon", "alphamon"];

async function post(name: string, canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("toBlob failed");
  const res = await fetch(`/__asset?name=${name}`, { method: "POST", body: blob });
  return res.ok;
}

function hexagon(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function Shoot({ mode, onLog }: { mode: "og" | "icon"; onLog: (s: string) => void }) {
  const advance = useThree((s) => s.advance);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useEffect(() => {
    let t = 0;
    const step = (n: number) => {
      for (let i = 0; i < n; i++) advance((t += 1 / 60));
    };
    // yield via MessageChannel: hidden tabs throttle timers to about one per minute
    const yieldTask = () =>
      new Promise<void>((r) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => r();
        ch.port2.postMessage(0);
      });
    const fitted = () => {
      let n = 0;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !(m.material as THREE.Material)?.userData?.unitFx) return;
        for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
        n++;
      });
      return n;
    };
    Object.assign(window, { __studio: { scene, stage: "loading" } });
    const stage = (name: string) => Object.assign((window as unknown as { __studio: object }).__studio, { stage: name });
    (async () => {
      const want = mode === "og" ? LINEUP.length : 1;
      const until = performance.now() + 30000;
      while (fitted() < want && performance.now() < until) {
        await yieldTask();
        step(1);
      }
      stage(`fitted ${fitted()}/${want}`);
      step(45); // settle into idle, let the sun slats and stars move a little
      await document.fonts.load("700 64px 'Chakra Petch'");
      await document.fonts.load("500 24px 'Exo 2 Variable'");
      stage("rendering");
      if (mode === "og") {
        camera.position.set(0, 2.5, -6.4);
        camera.lookAt(0, 1.05, 2.2);
        step(2);
        const out = document.createElement("canvas");
        out.width = 1200;
        out.height = 630;
        const g = out.getContext("2d")!;
        g.drawImage(gl.domElement, 0, 0);
        // a dark band behind the title keeps it readable over the sun
        const band = g.createLinearGradient(0, 0, 0, 230);
        band.addColorStop(0, "rgba(5,6,15,0.85)");
        band.addColorStop(1, "rgba(5,6,15,0)");
        g.fillStyle = band;
        g.fillRect(0, 0, 1200, 230);
        g.textAlign = "center";
        g.font = "700 72px 'Chakra Petch'";
        g.shadowColor = "rgba(57,216,255,0.9)";
        g.shadowBlur = 28;
        g.fillStyle = "#f2f6ff";
        const left = "DIGIMON ";
        const right = "AUTO CHESS";
        const wl = g.measureText(left).width;
        const wr = g.measureText(right).width;
        const x0 = 600 - (wl + wr) / 2;
        g.textAlign = "left";
        g.fillText(left, x0, 92);
        g.shadowColor = "rgba(183,107,255,0.95)";
        g.fillStyle = "#c78bff";
        g.fillText(right, x0 + wl, 92);
        g.shadowBlur = 10;
        g.shadowColor = "rgba(0,0,0,0.9)";
        g.textAlign = "center";
        g.font = "500 26px 'Exo 2 Variable'";
        g.fillStyle = "#dbe6ff";
        g.fillText("Branching digivolutions · synergies · VS a friend — free in your browser", 600, 140);
        onLog((await post("og.jpg", out)) ? "✓ og.jpg" : "✗ og.jpg");
      } else {
        // prep units face the game camera (toward -z)
        camera.position.set(-0.7, 1.1, -2.5);
        camera.lookAt(0, 0.6, 0);
        step(2);
        for (const [name, size] of [
          ["icon-512.png", 512],
          ["icon-192.png", 192],
          ["apple-touch-icon.png", 180],
        ] as const) {
          const out = document.createElement("canvas");
          out.width = out.height = size;
          const g = out.getContext("2d")!;
          const k = size / 512;
          const bg = g.createRadialGradient(256 * k, 230 * k, 20 * k, 256 * k, 256 * k, 360 * k);
          bg.addColorStop(0, "#2a1660");
          bg.addColorStop(1, "#05060f");
          g.fillStyle = bg;
          g.fillRect(0, 0, size, size);
          hexagon(g, 256 * k, 262 * k, 214 * k);
          const ring = g.createLinearGradient(0, 0, size, size);
          ring.addColorStop(0, "#39d8ff");
          ring.addColorStop(1, "#ff4fd8");
          g.lineWidth = 16 * k;
          g.strokeStyle = ring;
          g.shadowColor = "#39d8ff";
          g.shadowBlur = 24 * k;
          g.stroke();
          g.shadowBlur = 0;
          g.drawImage(gl.domElement, 56 * k, 56 * k, 400 * k, 400 * k);
          onLog((await post(name, out)) ? `✓ ${name}` : `✗ ${name}`);
        }
      }
      (window as unknown as { __studioDone: boolean }).__studioDone = true;
    })();
  }, [advance, scene, gl, camera, mode, onLog]);

  if (mode === "icon") {
    return (
      <Creature
        formId="agumon"
        color={ATTR_COLOR[FORMS.agumon.attribute]}
        name=""
        stage={3}
        position={[0, 0, 0]}
        showHealth={false}
      />
    );
  }
  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, 16, 52]} />
      <DigitalEnvironment />
      <Board />
      {LINEUP.map((id, i) => {
        const [x, z] = cellToWorld(0.5 + i, 1.4);
        return (
          <Creature
            key={id}
            formId={id}
            color={ATTR_COLOR[FORMS[id].attribute]}
            name=""
            stage={5}
            position={[x, 0, z]}
            showHealth={false}
          />
        );
      })}
      <ScenePost />
    </>
  );
}

export function OgStudio() {
  const mode = new URLSearchParams(location.search).get("studio") === "icon" ? "icon" : "og";
  const [log, setLog] = useState<string[]>([]);
  const [onLog] = useState(() => (s: string) => setLog((l) => [...l, s]));
  const size = mode === "og" ? { width: 1200, height: 630 } : { width: 512, height: 512 };
  return (
    <div style={{ display: "flex", gap: 16, padding: 16, background: "#222", color: "#ddd", font: "13px monospace" }}>
      <div style={{ ...size, flex: "none" }}>
        <Canvas
          frameloop="never"
          dpr={1}
          camera={{ fov: mode === "og" ? 44 : 30, near: 0.05, far: 120 }}
          // the og shot runs the game's post chain (which tone-maps); the icon has none
          gl={{
            preserveDrawingBuffer: true,
            alpha: mode === "icon",
            antialias: true,
            toneMapping: mode === "icon" ? THREE.NeutralToneMapping : THREE.NoToneMapping,
          }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <SceneLighting />
          <Shoot mode={mode} onLog={onLog} />
        </Canvas>
      </div>
      <pre style={{ margin: 0 }}>{log.join("\n")}</pre>
    </div>
  );
}
