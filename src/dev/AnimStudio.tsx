import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { modelFor } from "../three/models";

/**
 * Dev tool (open the dev server with ?studio=anim): poses one model's clip at one moment, for
 * checking animations frame by frame — `window.__anim.show(formId, clip, seconds)` resolves
 * once that pose is on screen. The framing is fixed per model (its idle pose, with room around
 * it), so a stretching limb shows how far it really goes.
 */
type Spec = { id: string; clip: string; t: number; room: number; done: (duration: number) => void };

function Pose({ spec }: { spec: Spec }) {
  const url = modelFor(spec.id)!;
  const { scene, animations } = useGLTF(url);
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const invalidate = useThree((s) => s.invalidate);
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  // framing: the idle pose's bounds, with `room` around them
  const frame = useMemo(() => {
    const idle = animations.find((a) => a.name === "idle");
    if (idle) {
      mixer.clipAction(idle).play();
      mixer.setTime(0);
    }
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.skeleton.update();
      m.computeBoundingBox();
      box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
    mixer.stopAllAction();
    return box;
  }, [model, mixer, animations]);

  useEffect(() => {
    const clip = animations.find((a) => a.name === spec.clip);
    mixer.stopAllAction();
    if (clip) mixer.clipAction(clip).play();
    mixer.setTime(spec.t);
    const size = frame.getSize(new THREE.Vector3());
    const c = frame.getCenter(new THREE.Vector3());
    const h = Math.max(size.x, size.y, size.z) * spec.room;
    camera.left = -h;
    camera.right = h;
    camera.top = h * 1.15;
    camera.bottom = -h * 0.85;
    camera.position.set(c.x + h * 1.2, c.y + h * 0.5, c.z + h * 2);
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    invalidate();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => spec.done(clip?.duration ?? 0)));
    return () => cancelAnimationFrame(id);
  }, [spec, animations, mixer, frame, camera, invalidate]);

  return <primitive object={model} />;
}

export function AnimStudio() {
  const [spec, setSpec] = useState<Spec | null>(null);
  useEffect(() => {
    Object.assign(window, {
      __anim: {
        show: (id: string, clip: string, t: number, room = 1.5) => new Promise<number>((done) => setSpec({ id, clip, t, room, done })),
      },
    });
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#dfe6ef" }}>
      <Canvas orthographic camera={{ zoom: 1, near: -100, far: 100 }} gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} />
        <Suspense fallback={null}>{spec && <Pose key={spec.id} spec={spec} />}</Suspense>
      </Canvas>
    </div>
  );
}
