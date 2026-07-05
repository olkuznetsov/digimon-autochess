#!/usr/bin/env python3
"""Inspect animation tracks inside a .glb: per clip, per node — which paths are
animated, whether tracks are constant, and their value ranges. Used to diagnose
scale/position unit mismatches in game rips.

Usage: python3 scripts/inspect_anim.py <model.glb> [clipA clipB ...]
"""
import json, struct, sys

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    d = open(path, "rb").read()
    jlen = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20 : 20 + jlen])
    # find BIN chunk
    off = 20 + jlen
    blen = struct.unpack("<I", d[off : off + 4])[0]
    assert d[off + 4 : off + 8] == b"BIN\x00"
    bin_ = d[off + 8 : off + 8 + blen]
    return j, bin_


def read_accessor(j, bin_, idx):
    acc = j["accessors"][idx]
    bv = j["bufferViews"][acc["bufferView"]]
    fmt, size = COMP[acc["componentType"]]
    n = NCOMP[acc["type"]]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    vals = struct.unpack_from(f"<{count * n}{fmt}", bin_, start)
    return [vals[i * n : (i + 1) * n] for i in range(count)]


def rng(vals):
    lo = [min(v[i] for v in vals) for i in range(len(vals[0]))]
    hi = [max(v[i] for v in vals) for i in range(len(vals[0]))]
    return lo, hi


def main(path, only_clips):
    j, bin_ = load(path)
    nodes = j.get("nodes", [])
    name = lambda i: nodes[i].get("name", f"#{i}")

    # node hierarchy (parents)
    parent = {}
    for pi, nd in enumerate(nodes):
        for ci in nd.get("children", []):
            parent[ci] = pi

    print(f"=== {path} — {len(j.get('animations', []))} clips ===")
    # static node scales that aren't 1
    odd = [(name(i), nd.get("scale")) for i, nd in enumerate(nodes) if nd.get("scale") and any(abs(s - 1) > 0.01 for s in nd["scale"])]
    if odd:
        print("bind-pose node scales != 1:", odd[:6])

    for anim in j.get("animations", []):
        cname = anim.get("name", "?")
        if only_clips and cname not in only_clips:
            continue
        by_node = {}
        for ch in anim["channels"]:
            tgt = ch["target"]
            ni = tgt.get("node")
            samp = anim["samplers"][ch["sampler"]]
            out = read_accessor(j, bin_, samp["output"])
            lo, hi = rng(out)
            const = all(abs(h - l) < 1e-3 for l, h in zip(lo, hi))
            by_node.setdefault(ni, []).append((tgt["path"], const, lo, hi))
        print(f"\n-- clip '{cname}' ({len(anim['channels'])} channels) --")
        shown = 0
        for ni, chans in by_node.items():
            interesting = []
            for p, const, lo, hi in chans:
                if p == "scale":
                    if any(abs(v - 1) > 0.05 for v in lo + hi):
                        interesting.append(f"scale {'CONST' if const else 'ANIM'} {[round(v,3) for v in lo]}..{[round(v,3) for v in hi]}")
                elif p == "translation":
                    mag = max(abs(v) for v in lo + hi)
                    if mag > 3:
                        interesting.append(f"pos {'CONST' if const else 'ANIM'} maxmag={round(mag,1)}")
            if interesting and shown < 12:
                par = name(parent.get(ni, -1)) if ni in parent else "ROOT"
                print(f"  {name(ni)} (parent {par}): " + " | ".join(interesting))
                shown += 1
        if shown == 0:
            print("  (no scale!=1 or |pos|>3 tracks)")


if __name__ == "__main__":
    main(sys.argv[1], set(sys.argv[2:]) if len(sys.argv) > 2 else None)
