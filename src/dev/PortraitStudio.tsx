import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { ALL_FORM_IDS, ATTR_COLOR, FORMS } from "../game/creatures";
import { CreatureModel } from "../three/CreatureModel";
import { modelFor, tweakFor } from "../three/models";
import { newDrive } from "../three/unitDrive";

/**
 * Dev tool (open the dev server with ?studio): renders every form's model in the
 * same 3/4 view and light and posts each frame to the dev server, which writes
 * public/portraits/<formId>.webp. Frames are advanced by hand (frameloop "never"),
 * so it also works in a background tab.
 */
const SIZE = 512;

function Studio({ onLog }: { onLog: (s: string) => void }) {
  const advance = useThree((s) => s.advance);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const [id, setId] = useState<string | null>(null);
  const drive = useRef(newDrive());
  const t = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        t.current += 1 / 60;
        advance(t.current);
      }
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const modelBox = () => {
      const box = new THREE.Box3();
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!(m.isMesh && m.material && (m.material as THREE.Material).userData?.unitFx)) return;
        let visible = true;
        for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) visible = false;
        if (!visible) return;
        if (m.isSkinnedMesh) m.computeBoundingBox();
        else if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const b = (m.isSkinnedMesh ? m.boundingBox : m.geometry.boundingBox)!.clone().applyMatrix4(m.matrixWorld);
        box.union(b);
      });
      return box;
    };
    (async () => {
      for (const formId of ALL_FORM_IDS) {
        if (cancelled) return;
        setId(formId);
        // wait for the model to stream in and fit itself (it stays hidden until then)
        let box = new THREE.Box3();
        for (let tries = 0; tries < 400 && box.isEmpty(); tries++) {
          await wait(25);
          step(1);
          box = modelBox();
        }
        step(20); // settle into the idle pose
        box = modelBox();
        if (box.isEmpty()) {
          onLog(`✗ ${formId}: no model`);
          continue;
        }
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const span = Math.max(size.y, size.x * 0.9) * 0.5;
        const dist = (span / Math.tan(fov / 2)) * 1.12 + size.z * 0.5;
        // 3/4 view from the front-left, slightly above
        const dir = new THREE.Vector3(-0.42, 0.22, 1).normalize();
        camera.position.copy(center).addScaledVector(dir, dist);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        step(1);
        const blob = await new Promise<Blob | null>((r) => gl.domElement.toBlob(r, "image/png"));
        if (!blob) continue;
        const res = await fetch(`/__portrait?id=${formId}`, { method: "POST", body: blob });
        onLog(`${res.ok ? "✓" : "✗"} ${formId}`);
      }
      onLog("done");
      (window as unknown as { __studioDone: boolean }).__studioDone = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [advance, scene, camera, gl, onLog]);

  if (!id) return null;
  const url = modelFor(id);
  return (
    <Suspense fallback={null}>
      {url && (
        <CreatureModel key={id} url={url} tweak={tweakFor(id)} drive={drive} color={ATTR_COLOR[FORMS[id].attribute]} />
      )}
    </Suspense>
  );
}

export function PortraitStudio() {
  const [log, setLog] = useState<string[]>([]);
  const onLog = useRef((s: string) => setLog((l) => [...l, s])).current;
  return (
    <div style={{ display: "flex", gap: 16, padding: 16, background: "#222", color: "#ddd", font: "13px monospace" }}>
      <div style={{ width: SIZE, height: SIZE, flex: "none", background: "repeating-conic-gradient(#333 0 25%, #2a2a2a 0 50%) 0 0/24px 24px" }}>
        <Canvas
          frameloop="never"
          dpr={1}
          camera={{ fov: 30, near: 0.05, far: 50 }}
          gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <Environment resolution={128} frames={1} environmentIntensity={0.7}>
            <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 6, 6]} scale={[10, 4, 1]} />
            <Lightformer form="rect" intensity={3} color="#39d8ff" position={[-8, 2, -4]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
            <Lightformer form="rect" intensity={3} color="#ff4d88" position={[8, 2, -4]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
          </Environment>
          <ambientLight intensity={0.3} />
          <directionalLight position={[-3, 5, 6]} intensity={1.6} />
          <Studio onLog={onLog} />
        </Canvas>
      </div>
      <pre style={{ margin: 0, maxHeight: SIZE, overflow: "auto" }}>{log.join("\n")}</pre>
    </div>
  );
}
