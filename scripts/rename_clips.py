#!/usr/bin/env python3
"""Normalize animation clip names inside .glb models to the runtime's expected
vocabulary (idle / move / attack01 / attack02 / special01 / special02 / win ...).

Some rips carry raw Cyber Sleuth internal codes (chrXXX_bn01_rd = idle,
br01 = run, ba01/02 = attacks, bs01/02 = specials, ...) and some fan models use
ad-hoc names (attack1, skill2, move2). Models with unmatched names stand frozen
in bind pose (T-pose) in game — this script fixes them at the source.

Usage: python3 scripts/rename_clips.py models-src/*.glb
"""
import json, re, struct, sys

# Cyber Sleuth suffix codes → canonical names
CS_CODES = {
    "bn01": "idle",
    "br01": "move",
    "ba01": "attack01",
    "ba02": "attack02",
    "bs01": "special01",
    "bs02": "special02",
    "bv01": "win",
    "bg01": "guard",
    "bd01": "damage",
    "bd02": "down",
    "bd03": "getup",
    "bb01": "stagger",
    "fe01": "eat",
    "fe02": "glad",
    "fa01": "face",
}
# ad-hoc names → canonical (only when the canonical name isn't already taken)
ADHOC = {
    "stand": "idle",
    "move2": "move",
    "attack": "attack01",
    "attack1": "attack01",
    "attack_1": "attack01",
    "attack2": "attack02",
    "skill1": "special01",
    "skill2": "special02",
    "hurt": "damage",
}
# last resort for the mobile-game rips (Flamemon, Aldamon …) that only ship
# dash-in takes: the run-up-and-hit clip stands in for the attack / special
FALLBACK = {
    "attack01": ["attack_move_to", "attack_move"],
    "special01": ["skill1_move_to", "skill2_move_to"],
}


def load_glb(path):
    d = open(path, "rb").read()
    jlen = struct.unpack("<I", d[12:16])[0]
    return json.loads(d[20 : 20 + jlen]), d[20 + jlen :]


def save_glb(path, j, rest):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + len(rest)
    open(path, "wb").write(
        b"glTF" + struct.pack("<I", 2) + struct.pack("<I", total) + struct.pack("<I", len(js)) + b"JSON" + js + rest
    )


def canonical(name: str, taken: set) -> str | None:
    m = re.fullmatch(r"chr\w*?_([a-z]{2}\d{2})(?:_rd)?", name)
    if m and m.group(1) in CS_CODES:
        return CS_CODES[m.group(1)]
    if name in ADHOC and ADHOC[name] not in taken:
        return ADHOC[name]
    return None


def fix(path):
    j, rest = load_glb(path)
    anims = j.get("animations", [])
    if not anims:
        return
    taken = {a.get("name") for a in anims}
    renames = []
    for a in anims:
        old = a.get("name", "")
        new = canonical(old, taken)
        if new and new not in taken:
            a["name"] = new
            taken.add(new)
            renames.append(f"{old}->{new}")
    for want, sources in FALLBACK.items():
        if want in taken or (want == "special01" and "special02" in taken):
            continue
        a = next((x for src in sources for x in anims if x.get("name") == src), None)
        if a:
            renames.append(f"{a['name']}->{want} (fallback)")
            a["name"] = want
            taken.add(want)
    if renames:
        save_glb(path, j, rest)
        print(f"{path}: {', '.join(renames)}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        fix(p)
