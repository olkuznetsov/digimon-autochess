#!/usr/bin/env python3
"""Convert a ripped model (.fbx/.dae) to models-src/<formid>.glb (then run `npm run optimize-models`).

- runs assimp export
- strips COLOR_0 vertex colors (some rips bake black -> model renders as silhouette)
- resets 3ds Max's default grey diffuse on textured materials (renders ~40% too dark)
- copies referenced external textures next to the glb (form id prefix on a name clash)
- reports animation clip count

Usage: python3 scripts/convert_model.py <source-file> <form-id>
"""
import json, struct, shutil, os, subprocess, sys

OUT_DIR = "models-src"


def load_glb(path):
    d = open(path, "rb").read()
    assert d[:4] == b"glTF", "not a glb"
    jlen = struct.unpack("<I", d[12:16])[0]
    assert d[16:20] == b"JSON"
    return json.loads(d[20 : 20 + jlen]), d[20 + jlen :]


def save_glb(path, j, rest):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + len(rest)
    open(path, "wb").write(
        b"glTF" + struct.pack("<I", 2) + struct.pack("<I", total) + struct.pack("<I", len(js)) + b"JSON" + js + rest
    )


MAX_GREY = 150 / 255  # 3ds Max's default diffuse; the game drew the texture, not this


def whiten_max_grey(j):
    """assimp turns an FBX DiffuseColor into baseColorFactor. On textured materials
    exported from 3ds Max that is its default grey (0.588), which darkens the model
    by ~40% next to the rest of the roster — reset it to white. Returns how many."""
    n = 0
    for mat in j.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        fac = pbr.get("baseColorFactor")
        if "baseColorTexture" in pbr and fac and all(abs(c - MAX_GREY) < 0.002 for c in fac[:3]):
            pbr["baseColorFactor"] = [1, 1, 1, fac[3]]
            n += 1
    return n


def convert(src, form_id):
    out = os.path.join(OUT_DIR, f"{form_id}.glb")
    r = subprocess.run(["assimp", "export", src, out], capture_output=True, text=True)
    if not os.path.exists(out):
        print(f"{form_id}: FAILED — {r.stderr.strip()[-200:]}")
        return False
    j, rest = load_glb(out)
    # drop duplicate clip names (CS rips carry a partial second "attack01" take
    # that collides in the runtime animation map and mangles attack poses)
    anims = j.get("animations", [])
    best = {}
    for a in anims:
        n = a.get("name", "?")
        if n not in best or len(a["channels"]) > len(best[n]["channels"]):
            best[n] = a
    deduped = [a for a in anims if best[a.get("name", "?")] is a]
    dropped_dups = len(anims) - len(deduped)
    if dropped_dups:
        j["animations"] = deduped
    stripped = 0
    for mesh in j.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if "COLOR_0" in prim.get("attributes", {}):
                del prim["attributes"]["COLOR_0"]
                stripped += 1
    whitened = whiten_max_grey(j)
    # textures land next to every other model's: a different file under the same
    # name (two rips' "eye.png") gets the form id as a prefix instead of overwriting
    src_dir = os.path.dirname(src)
    copied, renamed = [], 0
    for img in j.get("images", []):
        uri = img.get("uri")
        if not uri:
            continue
        cand = os.path.join(src_dir, uri)
        if not os.path.exists(cand):
            continue
        dest = uri
        taken = os.path.join(OUT_DIR, dest)
        if os.path.exists(taken) and open(taken, "rb").read() != open(cand, "rb").read():
            dest = f"{form_id}_{uri}"
            img["uri"] = dest
            renamed += 1
        shutil.copy(cand, os.path.join(OUT_DIR, dest))
        copied.append(dest)
    if stripped or dropped_dups or whitened or renamed:
        save_glb(out, j, rest)
    size_kb = os.path.getsize(out) // 1024
    anim_count = len(j.get("animations", []))
    print(f"{form_id}: anims={anim_count} dropped_dups={dropped_dups} stripped_colors={stripped} whitened={whitened} textures={copied} size={size_kb}KB")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
