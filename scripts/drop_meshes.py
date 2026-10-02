#!/usr/bin/env python3
"""Detach effect meshes from a .glb model (in models-src/) by node name.

Some rips ship effect geometry that the original game drew with special
shaders: glowing bands, energy orbs. Without those shaders they render as
big untextured (white) or garish shapes — Zeed's green ribbons, Gracenovamon's
white spheres. This drops the mesh from the named nodes; `npm run
optimize-models` then prunes the unused mesh, material and texture.

Usage: python3 scripts/drop_meshes.py models-src/<formId>.glb <nodeName> [<nodeName> ...]
"""
import json, struct, sys


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


if __name__ == "__main__":
    path, names = sys.argv[1], set(sys.argv[2:])
    j, rest = load_glb(path)
    dropped = []
    for node in j.get("nodes", []):
        if node.get("name") in names and "mesh" in node:
            del node["mesh"]
            node.pop("skin", None)
            dropped.append(node["name"])
    missing = names - set(dropped)
    if missing:
        sys.exit(f"{path}: no mesh node named {', '.join(sorted(missing))}")
    save_glb(path, j, rest)
    print(f"{path}: dropped {', '.join(dropped)}")
