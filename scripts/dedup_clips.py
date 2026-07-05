#!/usr/bin/env python3
"""Remove duplicate animation clips from .glb models, keeping the take with the
most channels (the full-body one).

Cyber Sleuth FBX rips contain a second, PARTIAL `attack01` take (a fraction of
the channels, in a differently-scaled bone space). Duplicate clip names collide
in the runtime animation map and the partial take wins — producing stretched /
flying / mis-scaled models the moment a unit attacks. Keeping only the full
take fixes attack animations at the source.

Usage: python3 scripts/dedup_clips.py public/models/*.glb
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


def dedup(path):
    j, rest = load_glb(path)
    anims = j.get("animations", [])
    if not anims:
        return
    best = {}
    for a in anims:
        n = a.get("name", "?")
        if n not in best or len(a["channels"]) > len(best[n]["channels"]):
            best[n] = a
    kept = [a for a in anims if best[a.get("name", "?")] is a]
    dropped = len(anims) - len(kept)
    if dropped:
        j["animations"] = kept
        save_glb(path, j, rest)
        print(f"{path}: dropped {dropped} duplicate clip(s), kept {len(kept)}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        dedup(p)
