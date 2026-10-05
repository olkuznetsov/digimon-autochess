"""Cuts clips/threads-final-battle.mp4 from the frames scripts/clip/record.mjs captured: the
digivolution, the FINAL BATTLE cut-in (its long hold trimmed), the fight and the run report,
crossfading into the end card — over the final boss's theme, its section break timed so the
music drops on 「…グレイモン！」."""
import os, subprocess, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
CLIPS = os.path.join(ROOT, "clips")
MUSIC = os.path.join(ROOT, "public", "music", "fallen-angel-1.mp3")
# frames kept (record.mjs's timeline): the digivolution and the cut-in into its hold (A),
# then from late in the hold through the fight to the run report (B); then the end card
A0, A1, B0, B1 = 4, 145, 161, 560
END_N = 75
# crossfades: over the trimmed hold, into the end card
X1, X2 = 0.133, 0.4
L1 = (A1 - A0 + 1) / 30
L2 = (B1 - B0 + 1) / 30
O1 = L1 - X1
O2 = L1 + L2 - X1 - X2
TOT = O2 + END_N / 30
FO = TOT - 1.3
# the theme's section break (137.9–138.85 s): the drop lands on the digivolution's flash
MUSIC_AT = float(sys.argv[1]) if len(sys.argv) > 1 else 137.88
print(f"total {TOT:.2f}s, cut at {O1:.2f}s, end card at {O2:.2f}s")
fc = (
    f"[0]format=yuv420p,split[a][b];"
    f"[a]select='between(n\\,{A0}\\,{A1})',setpts=N/30/TB,settb=AVTB,fps=30[s1];"
    f"[b]select='between(n\\,{B0}\\,{B1})',setpts=N/30/TB,settb=AVTB,fps=30[s2];"
    f"[1]format=yuv420p,setpts=N/30/TB,settb=AVTB,fps=30[s3];"
    f"[s1][s2]xfade=transition=fade:duration={X1}:offset={O1:.4f}[m];"
    f"[m][s3]xfade=transition=fade:duration={X2}:offset={O2:.4f}[v];"
    f"[2]atrim=0:{TOT:.4f},asetpts=PTS-STARTPTS,afade=t=in:d=0.08,afade=t=out:st={FO:.4f}:d=1.3[au]"
)
cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", "30", "-i", os.path.join(CLIPS, "frames", "f%05d.jpg"), "-framerate", "30", "-i", os.path.join(CLIPS, "end", "f%05d.jpg"),
       "-ss", str(MUSIC_AT), "-i", MUSIC, "-filter_complex", fc, "-map", "[v]", "-map", "[au]",
       "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", os.path.join(CLIPS, "threads-final-battle.mp4")]
subprocess.run(cmd, check=True)
