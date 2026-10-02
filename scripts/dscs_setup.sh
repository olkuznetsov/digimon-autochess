#!/bin/bash
# One-time setup for taking models from Digimon Story Cyber Sleuth: Complete Edition
# (Windows game; on a Mac its files come through SteamCMD — see models-src/README.md).
#
#   scripts/dscs_setup.sh [game dir, default ~/Games/dscs]
#
# Builds everything under model-sources/ (git-ignored), skipping finished steps:
#   tools/venv         CMake + Ninja (for MVGLTools), numpy + Pillow (for scripts/dscs_to_glb.py)
#   tools/mvgltools    MVGLTools v2.2.0 (unpacks the game's MVGL archives and MBE tables)
#   tools/Blender-Tools-for-DSCS  its file readers only — no Blender: the 2.91 it needs
#                      corrupts its own heap at random under Rosetta (macOS 26)
#   dscs/DSDB          the main archive unpacked (~13 GB): chrNNN.name/.skel/.geom, clips, images/
#   dscs/tables        name and shared-clip tables as CSV
# Then: python3 scripts/dscs_convert.py --list
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GAME=${1:-$HOME/Games/dscs}
T=$ROOT/model-sources/tools
D=$ROOT/model-sources/dscs
mkdir -p "$T" "$D"
step() { echo "=== $*"; }

step "Python venv: CMake, Ninja, numpy, Pillow (nothing system-wide)"
[ -x "$T/venv/bin/cmake" ] || { python3 -m venv "$T/venv" && "$T/venv/bin/pip" install -q cmake ninja numpy pillow; }

step "MVGLTools v2.2.0"
if [ ! -x "$T/mvgltools/build/MVGLToolsCLI/MVGLToolsCLI" ]; then
  [ -d "$T/mvgltools" ] || git clone -q --depth 1 --branch v2.2.0 https://github.com/SydMontague/MVGLTools "$T/mvgltools"
  # Apple's libc++ has views::zip but not views::zip_transform (C++23): use zip | transform
  python3 - "$T/mvgltools/MVGLTools/EXPA.cpp" <<'EOF'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"std::views::zip_transform\(\[\]\(const auto& val, const auto& val2\) \{ return (\w+)\(val\.type, val2\); \},\s*structure,\s*(\w+)\)",
           r"std::views::zip(structure, \2) | std::views::transform([](const auto& p) { return \1(std::get<0>(p).type, std::get<1>(p)); })", s)
open(p, "w").write(s)
EOF
  # its table patterns use Windows separators (text\\...): accept both
  python3 - "$T/mvgltools/structures/dscs/structure.json" <<'EOF'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
fix = lambda k: k if "[\\\\/]" in k else k.replace("\\\\", "[\\\\/]")  # once only
json.dump({fix(k): v for k, v in d.items()}, open(p, "w"), indent=2)
EOF
  [ -d "$T/boost-1.89.0" ] || { curl -sSL https://github.com/boostorg/boost/releases/download/boost-1.89.0/boost-1.89.0-cmake.tar.xz | tar -xJ -C "$T"; }
  PATH="$T/venv/bin:$PATH" cmake -S "$T/mvgltools" -B "$T/mvgltools/build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCPM_Boost_SOURCE="$T/boost-1.89.0" -DBOOST_INCLUDE_LIBRARIES="property_tree;multiprecision;crc;regex;asio;program_options" >/dev/null
  PATH="$T/venv/bin:$PATH" cmake --build "$T/mvgltools/build" -j 8 >/dev/null
fi
MVGL=$T/mvgltools/build/MVGLToolsCLI/MVGLToolsCLI

step "Blender-Tools-for-DSCS (its readers)"
[ -d "$T/Blender-Tools-for-DSCS" ] || git clone -q --depth 1 https://github.com/Pherakki/Blender-Tools-for-DSCS "$T/Blender-Tools-for-DSCS"

step "Unpack the game's main archive"
[ -d "$D/DSDB" ] || "$MVGL" --game=dscs --mode=unpack-mvgl "$GAME/resources/DSDB.steam.mvgl" "$D/DSDB" >/dev/null

step "Tables: names, shared clips"
for t in text/charname data/same_animation_data; do
  [ -d "$D/tables/$(basename $t)" ] || (cd "$T/mvgltools" && "$MVGL" --game=dscs --mode=unpack-mbe "$D/DSDB/$t.mbe" "$D/tables/$(basename $t)" >/dev/null)
done
echo "ready: $(ls "$D/DSDB" | grep -cE '^chr[0-9]+\.name$') models — python3 scripts/dscs_convert.py --list"
