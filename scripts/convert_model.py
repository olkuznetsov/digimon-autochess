#!/usr/bin/env python3
"""Convert a ripped model (.fbx/.dae) to public/models/<formid>.glb.

- runs assimp export
- strips COLOR_0 vertex colors (some rips bake black -> model renders as silhouette)
- copies referenced external textures next to the glb
- reports animation clip count

Usage: python3 scripts/convert_model.py <source-file> <form-id>
"""
import json, struct, shutil, os, subprocess, sys

OUT_DIR = "public/models"


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
    if stripped or dropped_dups:
        save_glb(out, j, rest)
    anims = len(j.get("animations", []))
    src_dir = os.path.dirname(src)
    copied = []
    for img in j.get("images", []):
        uri = img.get("uri")
        if not uri:
            continue
        cand = os.path.join(src_dir, uri)
        if os.path.exists(cand):
            shutil.copy(cand, os.path.join(OUT_DIR, uri))
            copied.append(uri)
    size_kb = os.path.getsize(out) // 1024
    anim_count = len(j.get("animations", []))
    print(f"{form_id}: anims={anim_count} dropped_dups={dropped_dups} stripped_colors={stripped} textures={copied} size={size_kb}KB")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
