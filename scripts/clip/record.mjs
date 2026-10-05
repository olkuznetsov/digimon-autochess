// Records the frames of the social clip (vertical 1080×1920, 30 fps) from the dev server:
// a run's final round — Agumon digivolves, the FINAL BATTLE cut-in, the fight against
// Lucemon with the camera pulled in (DEV `__cam`), the run report — then the title screen
// as the end card. Time is virtual (./vtime.js), so every frame lands exactly 1/30 s apart
// however slow the capture. Then `python3 scripts/clip/assemble.py` cuts the MP4.
//   npm run dev   (http://localhost:5180, or set CLIP_URL)
//   npm run clip
// Offline from the live services: the worker and Google sign-in are blocked, so nothing
// reaches the leaderboard (the dev build keeps runs off it anyway).
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const URL_ = process.env.CLIP_URL ?? "http://localhost:5180/";
const OUT = new URL("../../clips/", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 30;
/** how far the camera pulls in on the fight (0…1) */
const K = 0.5;
const VTIME = fs.readFileSync(new URL("./vtime.js", import.meta.url), "utf8");

// the board: Adventure's eight, Agumon still a Rookie
const units = [
  ["agumon", 3, 3], ["garurumon", 2, 3], ["ikkakumon", 4, 3], ["metalgarurumon", 1, 2],
  ["wargreymon", 4, 2], ["kabuterimon", 5, 2], ["togemon", 2, 1], ["angemon", 3, 1],
].map(([formId, col, row], i) => ({ uid: `u${101 + i}`, formId, placement: { kind: "board", col, row }, items: [] }));
const SAVE = {
  gold: 23, level: 8, xp: 4, health: 58, round: 15, runSeed: 1, difficulty: "normal", village: false, streak: 4,
  units, inventory: [], shop: ["birdramon", "angewomon", "zudomon", "lillymon", "gatomon"],
  discovered: [...units.map((u) => u.formId), "greymon"], shopLocked: false, uidCounter: 1200,
};
const PROFILE = {
  v: 1, xp: 5200, partner: { formId: "agumon", star: 1, since: Date.now() - 86400000 * 9, history: ["botamon", "koromon", "agumon"], xp: 5200 },
  others: [], meat: 4,
  stats: { runs: 6, runsWon: 1, bestRound: 15, battles: 80, battlesWon: 61, bosses: 7, vsMatches: 3, vsWins: 1, ghostWins: 0, elements: {}, attributes: {}, fielded: {}, raised: [] },
  crests: [],
};

async function open(seed) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio"],
    defaultViewport: { width: 432, height: 768, deviceScaleFactor: 2.5 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.setRequestInterception(true);
  page.on("request", (r) => (/workers\.dev|accounts\.google|googleapis/.test(r.url()) ? r.abort() : r.continue()));
  if (seed)
    await page.evaluateOnNewDocument((save, profile) => {
      try {
        localStorage.setItem("dac-save-v3", save);
        localStorage.setItem("dac-profile-v1", profile);
        localStorage.setItem("dac-speed", "1");
      } catch {}
    }, JSON.stringify(SAVE), JSON.stringify(PROFILE));
  await page.evaluateOnNewDocument(VTIME);
  await page.goto(URL_, { waitUntil: "networkidle2", timeout: 90000 });
  return { browser, page };
}
const click = (page, text) => page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t))?.click(), text);
const shot = (page, dir, f) => page.screenshot({ path: `${dir}/f${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93, optimizeForSpeed: true });

// ---- the final round ----
{
  const dir = OUT + "frames";
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await open(true);
  await click(page, "PLAY AS GUEST");
  await page.waitForFunction(() => !!window.__moment, { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  await click(page, "CONTINUE");
  await page.waitForNetworkIdle({ idleTime: 2500, timeout: 90000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  await page.addStyleTag({ content: ".topbar .brand-wrap{visibility:hidden!important} body.clip-battle .dmg-meter{opacity:0!important}" });
  await page.evaluate(() => window.__vt.start());
  let resultAt = -1;
  for (let f = 0; f < 22 * FPS; f++) {
    const s = await page.evaluate(async (f, K) => {
      const G = window.__moment.useGame, M = window.__moment.useMoment;
      // the timeline, in frames
      if (f === 6) G.setState({ evoFlash: { from: "agumon", to: "greymon", uid: "u101", key: Date.now() } });
      if (f === 33) G.setState({ units: G.getState().units.map((u) => (u.uid === "u101" ? { ...u, formId: "greymon" } : u)) });
      if (f === 87) M.setState({ intro: { kind: "final", formId: "lucemonfm", round: 15, key: Date.now() } });
      // the camera pulls in once the fight starts and follows its centre
      const g = G.getState();
      const cam = window.__cam;
      const fighting = g.phase === "battle" || g.phase === "result";
      document.body.classList.toggle("clip-battle", fighting);
      const alive = g.fighters.filter((x) => x.hp > 0);
      let tx = 0, tz = 0;
      if (fighting && alive.length) {
        const cx = alive.reduce((a, x) => a + (x.col - 3) * 1.1, 0) / alive.length;
        const cz = alive.reduce((a, x) => a + (x.row - 3.5) * 1.1, 0) / alive.length;
        tx = Math.max(-1, Math.min(1, cx * 0.5));
        tz = Math.max(-1, Math.min(1, (cz - 1.0) * 0.4));
      }
      const e = 1 - Math.exp(-(1 / 30) * 2.2);
      cam.k += ((fighting ? K : 0) - cam.k) * e;
      cam.x += (tx - cam.x) * e;
      cam.z += (tz - cam.z) * e;
      window.__vt.step(1000 / 30);
      await window.__vt.settle();
      return { phase: G.getState().phase, result: G.getState().result };
    }, f, K);
    if (resultAt < 0 && s.phase === "result") {
      resultAt = f;
      console.log(`result: ${s.result} at frame ${f}`);
    }
    await shot(page, dir, f);
    if (resultAt >= 0 && f - resultAt >= 2.2 * FPS) break;
  }
  await browser.close();
}

// ---- the end card: the title screen and where to play ----
{
  const dir = OUT + "end";
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await open(false);
  await new Promise((r) => setTimeout(r, 2500));
  await page.addStyleTag({
    content: `
.ts-panel{display:none!important}
.clip-cta{position:fixed;left:0;right:0;bottom:12%;display:flex;flex-direction:column;align-items:center;gap:12px;color:#fff;text-align:center;z-index:99999;animation:ctaIn .7s cubic-bezier(.2,.9,.3,1.15) .15s both;font-family:var(--font-body)}
.clip-cta::before{content:'';position:absolute;inset:-56px -10px -40px;background:radial-gradient(closest-side,rgba(12,8,34,.62),rgba(12,8,34,0));z-index:-1}
.clip-cta .k{font-weight:800;font-size:15px;letter-spacing:.24em;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.clip-cta .url{font-weight:900;font-size:22px;padding:11px 20px 13px;background:linear-gradient(180deg,#ffc04d,#ff7a1f);color:#1b1446;border-radius:14px;box-shadow:0 10px 34px rgba(255,130,40,.5),inset 0 -3px 0 rgba(0,0,0,.18);letter-spacing:.01em}
.clip-cta .modes{font-weight:700;font-size:14px;letter-spacing:.05em;opacity:.92;text-shadow:0 2px 10px rgba(0,0,0,.7)}
.clip-cta .fine{font-weight:600;font-size:11px;opacity:.6;letter-spacing:.04em}
@keyframes ctaIn{from{opacity:0;transform:translateY(28px) scale(.94)}to{opacity:1;transform:none}}`,
  });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.className = "clip-cta";
    d.innerHTML = `<span class="k">PLAY FREE · IN YOUR BROWSER</span><span class="url">digimon-autochess.pages.dev</span><span class="modes">Solo runs · VS with friends · Ghost ladder</span><span class="fine">Non-commercial fan project</span>`;
    document.body.appendChild(d);
  });
  await page.evaluate(() => window.__vt.start());
  for (let f = 0; f < 2.5 * FPS; f++) {
    await page.evaluate(async () => {
      window.__vt.step(1000 / 30);
      await window.__vt.settle();
    });
    await shot(page, dir, f);
  }
  await browser.close();
}
console.log("frames in", OUT);
