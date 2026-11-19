// Regression after the story list became the first screen.
// Confirm Skippy's Quest on that list before NEW GAME or CONTINUE.
// One keypress is not a new game. Continue must restore the desert
// save. The preloaded dream world is not that save.
import { createRequire } from "node:module";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const URL = process.env.SQURL || pathToFileURL(path.resolve("index.html")).href;
const OUT = "/opt/cursor/artifacts/skippy-regress";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } console.log((c ? "PASS " : "FAIL ") + m); };

const DESERT = JSON.stringify({
  z: "bow", v: 1, area: "desert", x: 200, y: 200, dir: 3,
  hp: 6, maxHp: 6, pieces: 0, coins: 42, arrows: 3,
  items: { baton: true, bow: true }, keys: {}, bigKeys: {},
  flags: { woke: true, santt_met: true, oe_desert: true },
  party: [], shards: 1, time: 88,
  visited: { desert: true, home: true },
});
function chapterSave(area, extra) {
  return JSON.stringify(Object.assign({
    z: "bow", v: 1, area, x: 160, y: 140, dir: 1,
    hp: 6, maxHp: 6, pieces: 0, coins: 9, arrows: 1,
    items: { baton: true }, keys: {}, bigKeys: {},
    flags: { woke: true }, party: [], shards: 0, time: 12,
    visited: { [area]: true },
  }, extra));
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function pageWith(init, arg, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    isMobile: !!opts.phone,
    hasTouch: !!opts.phone,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(init, arg);
  await page.goto(URL);
  await page.waitForFunction(() => window.__SQ);
  if (!opts.phone) await page.locator("#game").focus();
  return { ctx, page, errors };
}

const desk = await pageWith(() => { window.__SQ_DEBUG = true; localStorage.clear(); });
const boot = await desk.page.evaluate(() => [__SQ.A.id, __SQ.P.dir, __SQ.party.slice(), __SQ.G.state]);
ok(JSON.stringify(boot) === JSON.stringify(["dream", 0, [], "stories"]), "boot world is the preloaded dream, not a save " + JSON.stringify(boot));
await desk.page.keyboard.press("KeyX");
let early = "stories";
try {
  await desk.page.waitForFunction(() => __SQ.G.state === "play", null, { timeout: 3000 });
  early = "play";
} catch { early = await desk.page.evaluate(() => __SQ.G.state); }
ok(early !== "play", "one press then a 3s wait does not start NEW GAME (" + early + ")");
await desk.ctx.close();

const fresh = await pageWith(() => { window.__SQ_DEBUG = true; localStorage.clear(); });
await fresh.page.waitForFunction(() => __SQ.G.state === "stories" && __SQ.G.st > 0.35);
await fresh.page.keyboard.press("KeyX");
await fresh.page.waitForFunction(() => __SQ.G.state === "title" && __SQ.story() === "skippy");
const titled = await fresh.page.evaluate(() => ({ story: __SQ.story(), menu: __SQ.G.menu, hasSave: __SQ.G.hasSave }));
ok(titled.story === "skippy" && titled.menu === 0 && titled.hasSave === false, "story list confirm opens Skippy NEW GAME " + JSON.stringify(titled));
await fresh.page.waitForFunction(() => __SQ.G.st > 0.35);
const tNew = Date.now();
await fresh.page.keyboard.press("KeyX");
let started = false;
try {
  await fresh.page.waitForFunction(() => __SQ.G.state === "play" && __SQ.A.id === "dream" && __SQ.story() === "skippy", null, { timeout: 3000 });
  started = true;
} catch { started = false; }
const newGame = await fresh.page.evaluate(() => ({ state: __SQ.G.state, area: __SQ.A.id, story: __SQ.story(), script: __SQ.script }));
newGame.ms = Date.now() - tNew;
ok(started && newGame.ms < 3000 && newGame.script === true, "NEW GAME is playable inside 3s " + JSON.stringify(newGame));
ok(fresh.errors.length === 0, "NEW GAME page errors " + fresh.errors.join(" | "));
await fresh.ctx.close();

const saved = await pageWith((raw) => {
  window.__SQ_DEBUG = true;
  localStorage.clear();
  localStorage.setItem("sq_save_v1", raw);
}, DESERT);
const before = await saved.page.evaluate(() => ({
  world: [__SQ.A.id, __SQ.P.dir, __SQ.party.slice()],
  save: JSON.parse(localStorage.getItem("sq_save_v1")),
}));
ok(JSON.stringify(before.world) === JSON.stringify(["dream", 0, []]), "before continue the live world is still [\"dream\",0,[]] " + JSON.stringify(before.world));
ok(before.save && before.save.area === "desert" && before.save.coins === 42 && before.save.flags.santt_met === true, "sq_save_v1 still holds the desert save");
await saved.page.waitForFunction(() => __SQ.G.st > 0.35);
await saved.page.keyboard.press("KeyX");
await saved.page.waitForFunction(() => __SQ.G.state === "title" && __SQ.story() === "skippy" && __SQ.G.menu === 1);
await saved.page.waitForFunction(() => __SQ.G.st > 0.35);
await saved.page.keyboard.press("KeyX");
await saved.page.waitForFunction(() => __SQ.G.state === "play" && __SQ.A.id === "desert", null, { timeout: 3000 });
const loaded = await saved.page.evaluate(() => ({
  area: __SQ.A.id, coins: __SQ.P.coins, santt: !!__SQ.flags.santt_met, bow: !!__SQ.P.items.bow,
  save: JSON.parse(localStorage.getItem("sq_save_v1")),
}));
ok(loaded.area === "desert" && loaded.coins === 42 && loaded.santt === true && loaded.bow === true, "CONTINUE restores the desert " + JSON.stringify(loaded));
ok(loaded.save.area === "desert" && loaded.save.coins === 42, "CONTINUE does not rewrite sq_save_v1");
ok(saved.errors.length === 0, "CONTINUE page errors " + saved.errors.join(" | "));
await saved.ctx.close();

const keys = await pageWith((rows) => {
  window.__SQ_DEBUG = true;
  localStorage.clear();
  for (const [k, v] of rows) localStorage.setItem(k, v);
}, [
  ["sq_save_v1", chapterSave("desert", { coins: 42, flags: { woke: true, santt_met: true } })],
  ["sq_save_ros_v1", chapterSave("ros_pour", { coins: 3, flags: { lasso_got: true, woke: true } })],
  ["sq_save_ram_v1", chapterSave("ram_dock", { coins: 7, flags: { ram_woke: true } })],
  ["sq_save_ds_v1", chapterSave("ds_camp", { coins: 1, flags: { ds_board: true } })],
]);
const loads = await keys.page.evaluate(() => ["skippy", "ros", "ramshackle", "drill"].map((id) => {
  const okLoad = __SQ.loadChapter(id);
  return { id, ok: okLoad, state: __SQ.G.state, story: __SQ.story(), area: __SQ.A.id, coins: __SQ.P.coins };
}));
const expectLoad = { skippy: ["desert", 42], ros: ["ros_pour", 3], ramshackle: ["ram_dock", 7], drill: ["ds_camp", 1] };
for (const row of loads) {
  const [area, coins] = expectLoad[row.id];
  ok(row.ok === true && row.state === "play" && row.story === row.id && row.area === area && row.coins === coins, row.id + " save loads " + JSON.stringify(row));
}
ok(keys.errors.length === 0, "save load page errors " + keys.errors.join(" | "));
await keys.ctx.close();

const play = await pageWith(() => { window.__SQ_DEBUG = true; localStorage.clear(); });
await play.page.evaluate(() => {
  const S = __SQ;
  S.G.state = "play";
  S.G.story = "skippy";
  S.G.paused = false;
  S.flag("oe_desert");
  S.flag("woke");
  S.flag("santt_met");
  S.warp("desert", 16, 16, 3);
  S.setManual(false);
});
await play.page.waitForTimeout(2500);
const fps = await play.page.evaluate(() => {
  const work = __SQ.work();
  const raf = __SQ.frames();
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return {
    workN: work.length, workAvg: +avg(work).toFixed(3),
    rafN: raf.length, rafAvg: +avg(raf).toFixed(3),
    rafOver32: raf.filter((x) => x > 32).length,
  };
});
fs.writeFileSync(OUT + "/frames.json", JSON.stringify(fps, null, 2));
ok(fps.workN > 20 && fps.workAvg < 16, "gameplay work stays inside a 60fps frame " + JSON.stringify(fps));
ok(fps.rafN > 60 && fps.rafAvg < 20, "gameplay frame interval holds 60fps " + JSON.stringify(fps));
ok(play.errors.length === 0, "play page errors " + play.errors.join(" | "));
await play.ctx.close();

for (const [w, h, name] of [[844, 390, "landscape"], [390, 844, "portrait"]]) {
  const phone = await pageWith(() => { window.__SQ_DEBUG = true; localStorage.clear(); }, undefined, { phone: true, viewport: { width: w, height: h } });
  await phone.page.waitForFunction(() => document.querySelectorAll("#srml-rows button").length >= 7);
  const label = (await phone.page.locator("#srml-rows button").first().innerText()).replace(/\s+/g, " ");
  ok(label.includes("SKIPPY"), name + " first touch row is Skippy (" + label + ")");
  await phone.page.locator("#srml-rows button").first().tap();
  await phone.page.waitForFunction(() => __SQ.G.state === "title" && __SQ.story() === "skippy");
  const touched = await phone.page.evaluate(() => ({ state: __SQ.G.state, story: __SQ.story(), menu: __SQ.G.menu }));
  ok(touched.state === "title" && touched.story === "skippy" && touched.menu === 0, name + " touch confirms Skippy " + JSON.stringify(touched));
  ok(phone.errors.length === 0, name + " touch page errors " + phone.errors.join(" | "));
  await phone.ctx.close();
}

await browser.close();
console.log("RESULT regress " + pass + "/" + (pass + fail));
if (failures.length) console.log(failures.join("\n"));
process.exit(fail ? 1 : 0);
