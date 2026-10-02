"""Cyber Sleuth model (.name/.skel/.geom + clips) -> .glb, without Blender.

  model-sources/tools/venv/bin/python scripts/dscs_to_glb.py <model dir> <chrID> <out.glb>

Run through scripts/dscs_convert.py, which stages the model (and any borrowed clips).

The game files are read by Pherakki's Blender-Tools-for-DSCS — its readers are plain
Python (numpy); only its Blender importer needs Blender, and the old Blender it needs
crashes at random under Rosetta. The glTF is written straight from the game's data,
which maps onto glTF almost one to one:
  - a node per bone, the game's inverse bind matrices (.geom) as the skin's; the clips
    are relative to that bind pose (final = bind local × clip TRS — what the Blender
    importer does by building its bones from these matrices), baked into the keys
  - meshes with up to 4 bone weights per vertex; the base texture from ColorSampler,
    alpha-tested materials as MASK; left out: the cel-outline shells (MTR_line*) and the
    effect meshes (EFF_* / ef_* materials on eff_* textures: jet glows, sword light) —
    the game draws both with its own shaders, here they'd be grey hulls and opaque cards
  - a clip per .anim file, keyed sparsely like the game (time = frame / playback rate).
Both use Y up, so nothing is rotated.
"""
import io
import json
import os
import struct
import sys
import types

import numpy as np
from PIL import Image

ADDON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model-sources", "tools", "Blender-Tools-for-DSCS")
# the add-on's sub-packages, without its __init__ (which registers Blender operators)
_pkg = types.ModuleType("dscsio")
_pkg.__path__ = [ADDON]
sys.modules["dscsio"] = _pkg
from dscsio.CollatedData.FromReadWrites import generate_intermediate_format_from_files  # noqa: E402
from dscsio.Utilities.OpenGLResources import id_to_glfunc  # noqa: E402

GL_GREATER, GL_GEQUAL = 0x204, 0x206


def quat_of(r: np.ndarray) -> np.ndarray:
    """Rotation matrix -> quaternion (x, y, z, w)."""
    t = np.trace(r)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
    elif r[1, 1] > r[2, 2]:
        s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Hamilton product of (x, y, z, w) quaternions: a then b in a's frame, rows of b at once."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], axis=1)


class Glb:
    """A tiny glTF 2.0 writer: one binary buffer, accessors appended as they come."""

    def __init__(self):
        self.json = {"asset": {"version": "2.0", "generator": "digimon-autochess dscs_to_glb"}, "buffers": [{"byteLength": 0}],
                     "bufferViews": [], "accessors": [], "nodes": [], "meshes": [], "materials": [], "textures": [],
                     "images": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
                     "skins": [], "animations": [], "scenes": [{"nodes": []}], "scene": 0}
        self.bin = bytearray()

    def view(self, data: bytes, target=None) -> int:
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.json["bufferViews"].append(v)
        return len(self.json["bufferViews"]) - 1

    def accessor(self, arr: np.ndarray, kind: str, target=None, minmax=False) -> int:
        ctype = {np.dtype("float32"): 5126, np.dtype("uint16"): 5123, np.dtype("uint32"): 5125, np.dtype("uint8"): 5121}[arr.dtype]
        acc = {"bufferView": self.view(np.ascontiguousarray(arr).tobytes(), target), "componentType": ctype,
               "count": int(arr.shape[0]), "type": kind}
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            acc["min"] = [float(x) for x in flat.min(axis=0)]
            acc["max"] = [float(x) for x in flat.max(axis=0)]
        self.json["accessors"].append(acc)
        return len(self.json["accessors"]) - 1

    def save(self, path: str):
        self.json["buffers"][0]["byteLength"] = len(self.bin)
        # glTF wants no empty arrays
        doc = {k: v for k, v in self.json.items() if v != []}
        js = json.dumps(doc, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        while len(self.bin) % 4:
            self.bin.append(0)
        with open(path, "wb") as f:
            f.write(b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack("<I", len(js)) + b"JSON" + js)
            f.write(struct.pack("<I", len(self.bin)) + b"BIN\0" + self.bin)


def convert(src_dir: str, chr_id: str, out: str):
    base = os.path.join(src_dir, chr_id)
    model = generate_intermediate_format_from_files(base, "PC", import_anims=True)
    sk = model.skeleton
    parents = dict(sk.bone_relations)
    g = Glb()

    # ---- skeleton: the bind pose, bones first so node index == bone index
    ibm4 = [np.asarray(m, dtype=np.float64).reshape(4, 4) for m in sk.inverse_bind_pose_matrices]
    world = [np.linalg.inv(m) for m in ibm4]
    bind = []  # per bone: rotation (x, y, z, w), translation, uniform scale, rotation matrix
    for i, name in enumerate(sk.bone_names):
        p = parents.get(i, -1)
        local = world[i] if p == -1 else np.linalg.inv(world[p]) @ world[i]
        scl = np.linalg.norm(local[:3, :3], axis=0)
        if np.ptp(scl) > 1e-3 * scl.max():
            print(f"warning: bone {name} has a non-uniform bind scale {scl} — its clips are approximate")
        rot = local[:3, :3] / scl
        bind.append((quat_of(rot), local[:3, 3], float(scl.mean()), rot))
        g.json["nodes"].append({"name": name, "rotation": [float(x) for x in bind[i][0]],
                                "translation": [float(x) for x in bind[i][1]], "scale": [float(scl.mean())] * 3})
    roots = []
    for i in range(len(sk.bone_names)):
        p = parents.get(i, -1)
        if p == -1:
            roots.append(i)
        else:
            g.json["nodes"][p].setdefault("children", []).append(i)
    ibm = np.stack([m.T for m in ibm4]).astype(np.float32)  # glTF matrices are column-major
    g.json["skins"].append({"joints": list(range(len(sk.bone_names))), "inverseBindMatrices": g.accessor(ibm.reshape(-1, 16), "MAT4")})

    # ---- textures: the game's .img files are DDS
    tex_of = {}

    def texture(idx: int) -> int:
        if idx not in tex_of:
            img = Image.open(model.textures[idx].filepath)
            img.load()
            buf = io.BytesIO()
            img.convert("RGBA").save(buf, "PNG")
            g.json["images"].append({"name": model.textures[idx].name, "mimeType": "image/png", "bufferView": g.view(buf.getvalue())})
            g.json["textures"].append({"source": len(g.json["images"]) - 1, "sampler": 0})
            tex_of[idx] = len(g.json["textures"]) - 1
        return tex_of[idx]

    # ---- materials
    mat_of = {}
    def is_effect(m) -> bool:
        if m.name.lower().startswith(("mtr_line", "eff_", "ef_")):
            return True
        tex = m.shader_uniforms.get("ColorSampler")
        return tex is not None and model.textures[int(tex[0])].name.lower().startswith("eff_")

    for i, m in enumerate(model.materials):
        if is_effect(m):
            print(f"skipped {m.name}")
            continue
        gm = {"name": m.name, "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 1.0}}
        if "ColorSampler" in m.shader_uniforms:
            gm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": texture(int(m.shader_uniforms["ColorSampler"][0]))}
        gl = {id_to_glfunc.get(k): v for k, v in m.unknown_data.get("unknown_material_components", {}).items()}
        if gl.get("GL_ALPHA_TEST", [0])[0] and gl.get("glAlphaFunc", [0])[0] in (GL_GREATER, GL_GEQUAL):
            gm["alphaMode"] = "MASK"
            gm["alphaCutoff"] = float(gl["glAlphaFunc"][1])
        elif gl.get("GL_BLEND", [0])[0]:
            gm["alphaMode"] = "BLEND"
        if "GL_CULL_FACE" in gl and not gl["GL_CULL_FACE"][0]:
            gm["doubleSided"] = True
        g.json["materials"].append(gm)
        mat_of[i] = len(g.json["materials"]) - 1

    # ---- meshes
    for mi, mesh in enumerate(model.meshes):
        if mesh.material_id not in mat_of or not mesh.vertices:
            continue
        verts = mesh.vertices
        n = len(verts)
        pos = np.array([v["Position"][:3] for v in verts], dtype=np.float32)
        attrs = {"POSITION": g.accessor(pos, "VEC3", 34962, minmax=True)}
        if "Normal" in verts[0]:
            nrm = np.array([v["Normal"][:3] for v in verts], dtype=np.float32)
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
            attrs["NORMAL"] = g.accessor(nrm, "VEC3", 34962)
        if "UV" in verts[0]:
            # the reader flips v for Blender; glTF keeps the game's (top-left) origin
            uv = np.array([(v["UV"][0], 1.0 - v["UV"][1]) for v in verts], dtype=np.float32)
            attrs["TEXCOORD_0"] = g.accessor(uv, "VEC2", 34962)
        # weights: the reader regroups them per bone; back to 4 strongest per vertex
        per_vertex = [[] for _ in range(n)]
        for grp in mesh.vertex_groups:
            for vi, w in zip(grp.vertex_indices, grp.weights):
                if w > 0:
                    per_vertex[vi].append((float(w), int(grp.bone_idx)))
        if not any(per_vertex) and len(verts[0]["Position"]) > 3:
            # rigid meshes keep their one bone in the 4th position component (3 × palette index)
            palette = [grp.bone_idx for grp in mesh.vertex_groups]
            per_vertex = [[(1.0, int(palette[int(round(v["Position"][3])) // 3]))] for v in verts]
        joints = np.zeros((n, 4), dtype=np.uint16)
        weights = np.zeros((n, 4), dtype=np.float32)
        for vi, ws in enumerate(per_vertex):
            ws = sorted(ws, reverse=True)[:4] or [(1.0, 0)]
            total = sum(w for w, _ in ws)
            for k, (w, b) in enumerate(ws):
                joints[vi, k] = b
                weights[vi, k] = w / total
        attrs["JOINTS_0"] = g.accessor(joints, "VEC4", 34962)
        attrs["WEIGHTS_0"] = g.accessor(weights, "VEC4", 34962)
        idx = np.array([p.indices for p in mesh.polygons], dtype=np.uint32).reshape(-1)
        idx = idx.astype(np.uint16) if n < 65536 else idx
        prim = {"attributes": attrs, "indices": g.accessor(idx, "SCALAR", 34963), "material": mat_of[mesh.material_id]}
        g.json["meshes"].append({"name": f"{chr_id}_{mi}", "primitives": [prim]})
        g.json["nodes"].append({"name": f"{chr_id}_{mi}", "mesh": len(g.json["meshes"]) - 1, "skin": 0})

    mesh_nodes = list(range(len(sk.bone_names), len(g.json["nodes"])))
    g.json["nodes"].append({"name": chr_id, "children": roots + mesh_nodes})
    g.json["scenes"][0]["nodes"] = [len(g.json["nodes"]) - 1]

    # ---- clips: one per .anim, named by its code (bn01 …) — rename_clips.py maps them
    for key, anim in model.animations.items():
        name = "base" if key == chr_id else key[len(chr_id) + 1:]
        rate = float(anim.playback_rate or 24)
        channels, samplers = [], []
        for path, curves, width, kind in (("rotation", anim.rotations, 4, "VEC4"), ("translation", anim.locations, 3, "VEC3"),
                                          ("scale", anim.scales, 3, "VEC3")):
            for bone, fc in curves.items():
                if not fc.frames:
                    continue
                order = np.argsort(fc.frames, kind="stable")
                times = (np.asarray(fc.frames, dtype=np.float64)[order] / rate).astype(np.float32)
                vals = np.asarray([list(v)[:width] for v in fc.values], dtype=np.float32)[order]
                bq, bt, bs, br = bind[bone]
                if path == "rotation":
                    vals = np.roll(vals, -1, axis=1)  # the reader hands them over as w, x, y, z (for Blender)
                    vals /= np.maximum(np.linalg.norm(vals, axis=1, keepdims=True), 1e-8)
                    vals = quat_mul(bq, vals).astype(np.float32)  # bind rotation, then the clip's
                elif path == "translation":
                    vals = (bt + bs * (vals @ br.T)).astype(np.float32)  # in the bind frame
                else:
                    vals = (bs * vals).astype(np.float32)
                samplers.append({"input": g.accessor(times, "SCALAR", minmax=True), "output": g.accessor(vals, kind),
                                 "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": int(bone), "path": path}})
        if channels:
            g.json["animations"].append({"name": name, "channels": channels, "samplers": samplers})

    g.save(out)
    print(f"export: {chr_id} → {out}: {len(sk.bone_names)} bones, {len(g.json['meshes'])} meshes, "
          f"{len(g.json['images'])} textures, clips {[a['name'] for a in g.json['animations']]}")


if __name__ == "__main__":
    convert(*sys.argv[1:4])
