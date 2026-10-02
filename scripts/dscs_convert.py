#!/usr/bin/env python3
"""Digimon Story Cyber Sleuth model -> models-src/<formId>.glb, straight from the game files.

  python3 scripts/dscs_convert.py --list [filter]      the game's Digimon: chr number, name, clips, ours?
  python3 scripts/dscs_convert.py <chr number> <formId>  e.g. `54 geogreymon`, then
  npm run optimize-models -- <formId>

Needs the one-time setup (scripts/dscs_setup.sh): the game's archives unpacked to
model-sources/dscs/, the readers (Blender-Tools-for-DSCS) and a Python venv with numpy
and Pillow in model-sources/tools/. No Blender: scripts/dscs_to_glb.py writes the glTF.

A model without battle clips of its own (recolours, GeoGreymon …) borrows another
model's, as the game does (data/same_animation_data.mbe); the clips are staged under
the model's name for the reader. rename_clips.py then maps the clip codes
(bn01 → idle, ba01 → attack01 …).
"""
import csv, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DSCS = os.path.join(ROOT, "model-sources", "dscs")
DSDB = os.path.join(DSCS, "DSDB")
TABLES = os.path.join(DSCS, "tables")
PYTHON = os.path.join(ROOT, "model-sources", "tools", "venv", "bin", "python")


def names() -> dict[int, str]:
    """chrNNN → English name (text/charname.mbe: id 1000 + NNN)."""
    out = {}
    with open(os.path.join(TABLES, "charname", "charname.mbe", "000_Sheet1.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["ID"].isdigit() and int(row["ID"]) >= 1000:
                out[int(row["ID"]) - 1000] = row["English"]
    return out


def donors() -> dict[int, str]:
    """Models that play another model's clips (data/same_animation_data.mbe)."""
    path = os.path.join(TABLES, "same_animation_data", "same_animation_data.mbe", "000_digimon.csv")
    with open(path, encoding="utf-8") as f:
        return {int(r["ID"]): r["model"] for r in csv.DictReader(f)}


def clips_of(chr_id: str) -> list[str]:
    return sorted(f for f in os.listdir(DSDB) if f.startswith(chr_id + "_") and f.endswith(".anim"))


def catalog(filt: str = ""):
    src = open(os.path.join(ROOT, "src", "game", "creatures.ts"), encoding="utf-8").read()
    ours = {re.sub(r"[^a-z]", "", n.lower()) for n in re.findall(r'f\("[a-z0-9]+", "([^"]+)"', src)}
    nm, dn = names(), donors()
    models = sorted(int(m.group(1)) for f in os.listdir(DSDB) if (m := re.fullmatch(r"chr(\d+)\.name", f)))
    for n in models:
        name = nm.get(n, "?")
        if filt and filt.lower() not in name.lower():
            continue
        own = len(clips_of(f"chr{n:03d}"))
        clips = f"{own} clips" if own else (f"clips of {dn[n]}" if n in dn else "NO clips")
        mark = "  ← in the game" if re.sub(r"[^a-z]", "", name.lower()) in ours else ""
        print(f"{n:4d}  {name:28s} {clips}{mark}")


def convert(n: int, form_id: str):
    chr_id = f"chr{n:03d}"
    if not os.path.exists(os.path.join(DSDB, chr_id + ".name")):
        sys.exit(f"{chr_id}: no such model in {DSDB}")
    src_id = chr_id if clips_of(chr_id) else donors().get(n)
    if not src_id:
        sys.exit(f"{chr_id}: no battle clips of its own and no donor")
    stage = tempfile.mkdtemp(prefix=f"dscs-{chr_id}-")
    try:
        for ext in ("name", "skel", "geom", "anim"):
            if os.path.exists(os.path.join(DSDB, f"{chr_id}.{ext}")):
                os.symlink(os.path.join(DSDB, f"{chr_id}.{ext}"), os.path.join(stage, f"{chr_id}.{ext}"))
        os.symlink(os.path.join(DSDB, "images"), os.path.join(stage, "images"))
        for f in clips_of(src_id):
            os.symlink(os.path.join(DSDB, f), os.path.join(stage, chr_id + f[len(src_id):]))
        out = os.path.join(ROOT, "models-src", form_id + ".glb")
        r = subprocess.run([PYTHON, os.path.join(ROOT, "scripts", "dscs_to_glb.py"), stage, chr_id, out], capture_output=True, text=True)
        for line in r.stdout.splitlines():
            if line.startswith(("export:", "warning:", "skipped")):
                print("  " + line, flush=True)
        if r.returncode or not os.path.exists(out):
            sys.exit(f"{chr_id}: conversion failed\n{r.stderr[-2000:]}")
    finally:
        shutil.rmtree(stage)
    borrowed = f" (clips of {src_id})" if src_id != chr_id else ""
    print(f"{chr_id} {names().get(n, '?')} → models-src/{form_id}.glb{borrowed}", flush=True)
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "rename_clips.py"), out], check=True)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--list":
        catalog(sys.argv[2] if len(sys.argv) > 2 else "")
    elif len(sys.argv) == 3 and sys.argv[1].isdigit():
        convert(int(sys.argv[1]), sys.argv[2])
    else:
        sys.exit(__doc__)
