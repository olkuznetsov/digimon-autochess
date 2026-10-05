import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ATTR_COLOR, FORMS } from "../game/creatures";
import { cellToWorld } from "../game/board";
import { Board } from "../three/Board";
import { Creature } from "../three/Creature";
import { IslandEnvironment } from "../three/Island";
import { SceneLighting, ScenePost } from "../three/Scene";

/**
 * Dev tool (dev server, /?studio=og): renders the link-preview card (public/og.jpg,
 * 1200×630: five Megas on File Island's beach board, the game's logo over the sky) and the app
 * icons (public/icon-512.png, icon-192.png, apple-touch-icon.png) from the real scene, with
 * the title drawn on top.
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
      const until = performance.now() + 90000; // a software renderer takes its time
      while (fitted() < want && performance.now() < until) {
        await yieldTask();
        step(1);
      }
      stage(`fitted ${fitted()}/${want}`);
      step(45); // settle into idle, let the sun slats and stars move a little
      await document.fonts.load("700 64px 'Chakra Petch'");
      await document.fonts.load("500 24px 'Exo 2 Variable'");
      await document.fonts.load("400 80px 'Dela Gothic One'");
      // the Latin faces by hand: load() settles for the Japanese subset's face (its 500–900
      // weight range matches first), so canvas text would fall back to a serif
      await Promise.all(
        [...document.fonts].filter((f) => f.family.includes("M PLUS Rounded") && f.weight === "800").map((f) => f.load().catch(() => null)),
      );
      await document.fonts.load("800 22px 'M PLUS Rounded 1c'", "デジモン オートチェス");
      stage("rendering");
      if (mode === "og") {
        // low over the near side: the Megas, the beach and the sea, the sky left for the title
        camera.position.set(0, 2.1, -6.6);
        camera.lookAt(0, 1.55, 2.2);
        step(2);
        const out = document.createElement("canvas");
        out.width = 1200;
        out.height = 630;
        const g = out.getContext("2d")!;
        g.drawImage(gl.domElement, 0, 0);
        // a soft navy wash under the logo, as the menu's sky has
        const band = g.createLinearGradient(0, 0, 0, 260);
        band.addColorStop(0, "rgba(14,22,64,0.5)");
        band.addColorStop(1, "rgba(14,22,64,0)");
        g.fillStyle = band;
        g.fillRect(0, 0, 1200, 260);
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        // the game's logo: デジモン オートチェス · DIGIMON in gold · AUTO CHESS, white, slanted, inked
        g.font = "800 22px 'M PLUS Rounded 1c'";
        g.letterSpacing = "8px";
        g.fillStyle = "#ffffff";
        g.shadowColor = "rgba(20,40,90,0.7)";
        g.shadowBlur = 8;
        g.fillText("デジモン オートチェス", 604, 50);
        g.shadowBlur = 0;
        g.letterSpacing = "2px";
        g.font = "400 40px 'Dela Gothic One'";
        g.lineJoin = "round";
        g.lineWidth = 5;
        g.strokeStyle = "#1b2350";
        g.strokeText("DIGIMON", 600, 98);
        g.fillStyle = "#ffe27a";
        g.fillText("DIGIMON", 600, 98);
        g.save();
        g.translate(600, 186);
        g.transform(1, 0, -0.18, 1, 0, 0); // skewX(-10deg)
        g.letterSpacing = "1px";
        g.font = "400 92px 'Dela Gothic One'";
        g.fillStyle = "#1b2350"; // the drop under the letters
        g.fillText("AUTO CHESS", 0, 8);
        g.lineWidth = 7;
        g.strokeText("AUTO CHESS", 0, 0);
        const fill = g.createLinearGradient(0, -70, 0, 0);
        fill.addColorStop(0, "#ffffff");
        fill.addColorStop(0.5, "#ffffff");
        fill.addColorStop(1, "#a8e4ff");
        g.fillStyle = fill;
        g.fillText("AUTO CHESS", 0, 0);
        g.restore();
        // the tagline on a white pill at the bottom
        const tag = "Raise Digimon from babies · branching digivolutions · VS up to 8 — free in your browser";
        g.letterSpacing = "0px";
        g.font = "800 23px 'M PLUS Rounded 1c'";
        const tw = g.measureText(tag).width + 48;
        g.fillStyle = "rgba(255,255,255,0.92)";
        g.shadowColor = "rgba(20,40,90,0.35)";
        g.shadowBlur = 16;
        g.beginPath();
        g.roundRect(600 - tw / 2, 566, tw, 44, 22);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#1b2350";
        g.fillText(tag, 600, 596);
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
      <IslandEnvironment />
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
      <ScenePost day />
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
          {/* the island brings its own daylight */}
          {mode === "icon" && <SceneLighting />}
          <Shoot mode={mode} onLog={onLog} />
        </Canvas>
      </div>
      <pre style={{ margin: 0 }}>{log.join("\n")}</pre>
    </div>
  );
}
