// Subsets the Japanese the UI actually shows (scanned from src/) into two small fonts in
// public/fonts/, instead of fontsource's ~1 MB of Japanese per weight. Runs before every
// build (prebuild), so new Japanese text is picked up automatically.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";

const JP = /[　-ヿ㐀-䶿一-鿿＀-￯]/g;
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
};
const chars = new Set();
for (const f of walk("src")) for (const c of readFileSync(f, "utf8").match(JP) ?? []) chars.add(c);
const text = [...chars].sort().join("");

const FONTS = [
  ["m-plus-rounded-1c/files/m-plus-rounded-1c-japanese-800-normal.woff2", "mplus-rounded-jp.woff2"],
  ["dela-gothic-one/files/dela-gothic-one-japanese-400-normal.woff2", "dela-gothic-jp.woff2"],
];
mkdirSync("public/fonts", { recursive: true });
for (const [src, out] of FONTS) {
  const buf = await subsetFont(readFileSync(join("node_modules/@fontsource", src)), text, { targetFormat: "woff2" });
  const path = join("public/fonts", out);
  const old = (() => {
    try {
      return readFileSync(path);
    } catch {
      return null;
    }
  })();
  if (!old || !old.equals(buf)) writeFileSync(path, buf);
  console.log(`jp fonts: ${out} ${chars.size} glyphs, ${(buf.length / 1024).toFixed(1)} KB`);
}
