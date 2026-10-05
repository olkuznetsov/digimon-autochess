import * as THREE from "three";

/**
 * Per-instance material effects for creature models:
 *  - DISSOLVE ("data deletion"): world-space value noise discards fragments below
 *    `uDissolve`, with a glowing edge in `uEdgeColor` just above the cut — Digimon
 *    breaking into data when deleted; run backwards it materializes them.
 *  - FLASH: `uFlashColor * uFlash` added on top of the lit colour (hit flashes,
 *    freeze tint).
 * Emission is added in linear HDR before tone mapping, so the bloom pass picks up
 * the glowing edges.
 *
 * SkeletonUtils.clone shares materials between clones, so every model instance
 * clones its materials first — otherwise flashing one Greymon would flash all.
 */
export interface UnitFxUniforms {
  uDissolve: { value: number };
  uEdgeColor: { value: THREE.Color };
  uFlash: { value: number };
  uFlashColor: { value: THREE.Color };
}

const VERT_DECL = /* glsl */ `
varying vec3 vFxWorld;
`;
const VERT_BODY = /* glsl */ `
#include <skinning_vertex>
vFxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vFxWorld;
uniform float uDissolve;
uniform vec3 uEdgeColor;
uniform float uFlash;
uniform vec3 uFlashColor;
float fxHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float fxNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash(i + vec3(0, 0, 0)), fxHash(i + vec3(1, 0, 0)), f.x),
                 mix(fxHash(i + vec3(0, 1, 0)), fxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fxHash(i + vec3(0, 0, 1)), fxHash(i + vec3(1, 0, 1)), f.x),
                 mix(fxHash(i + vec3(0, 1, 1)), fxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
const FRAG_CUT = /* glsl */ `
#include <clipping_planes_fragment>
float fxGlow = 0.0;
if (uDissolve > 0.001) {
  // two octaves; the vertical term makes the body come apart from the top down
  float n = fxNoise(vFxWorld * 7.0) * 0.65 + fxNoise(vFxWorld * 19.0) * 0.35;
  n = n * 0.85 + clamp(1.0 - vFxWorld.y * 0.35, 0.0, 1.0) * 0.15;
  float edge = n - uDissolve;
  if (edge < 0.0) discard;
  fxGlow = 1.0 - smoothstep(0.0, 0.07, edge);
}
`;
const FRAG_ADD = /* glsl */ `
#include <opaque_fragment>
gl_FragColor.rgb += uEdgeColor * fxGlow * 4.0 + uFlashColor * uFlash;
// a ripped model can carry a degenerate normal; a NaN pixel would spread through the
// bloom's blur over the whole frame (a black blink) — GPU min/max turn it into a number
gl_FragColor = clamp(gl_FragColor, 0.0, 32.0);
`;

/** Clone a material and inject the dissolve + flash effects. */
export function withUnitFx(src: THREE.Material): { material: THREE.Material; uniforms: UnitFxUniforms } {
  const material = src.clone();
  const uniforms: UnitFxUniforms = {
    uDissolve: { value: 0 },
    uEdgeColor: { value: new THREE.Color("#7fe9ff") },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color("#ffffff") },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_DECL}`)
      .replace("#include <skinning_vertex>", VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_DECL}`)
      .replace("#include <clipping_planes_fragment>", FRAG_CUT)
      .replace("#include <opaque_fragment>", FRAG_ADD);
  };
  // every instance runs identical shader code → share one compiled program
  material.customProgramCacheKey = () => "unit-fx-v1";
  material.userData.unitFx = uniforms; // inspectable from devtools
  return { material, uniforms };
}
