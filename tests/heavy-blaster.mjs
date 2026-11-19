// Drill's tale must hand Skippy the Heavy Laser Blaster.
// Every finish (moon teller, academy radio, chapter-list replay),
// a continue after that finish, and an older save that finished
// before the blaster was stored.
import { createRequire } from "node:module";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const URL = process.env.SQURL || pathToFileURL(path.resolve("index.html")).href;
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } console.log((c ? "PASS " : "FAIL ") + m); };

function ride(extra) {
  return JSON.stringify(Object.assign({
    z: "missile", v: 1, area: "moon", x: 88, y: 140, dir: 1,
    hp: 10, maxHp: 10, pieces: 0, coins: 55, arrows: 8,
    items: { baton: true, bow: true, sword: true, raygun: true, missile: true, armor: true },
    keys: { station: 2 }, bigKeys: { station: true },
    flags: { woke: true, ch1_done: true, ch2_done: true, ch3_done: true, ch4_done: true, ch5_done: true, oe_moon: true, drill_joined: true },
    party: [], shards: 5, time: 400,
    visited: { moon: true, desert: true },
    pri: "bow", sec: "missile", melee: "sword",
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
  await page.evaluate(() => __SQ.setManual(true));
  if (!opts.phone) await page.locator("#game").focus();
  return { ctx, page, errors };
}
async function tap(page, button, frames = 3) {
  await page.evaluate((b) => { __SQ.press(b, true); __SQ.step(1); __SQ.press(b, false); }, button);
  await page.evaluate((n) => __SQ.step(n), frames);
}

async function enterTale(page, area, x, y, dir) {
  await page.evaluate(({ area, x, y, dir }) => { __SQ.warp(area, x, y, dir); __SQ.step(2); }, { area, x, y, dir });
  await tap(page, "talk", 4);
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => __SQ.story() === "drill")) return;
    await tap(page, "attack", 4);
  }
  const why = await page.evaluate(() => ({
    area: __SQ.A.id, x: __SQ.P.x, y: __SQ.P.y, dir: __SQ.P.dir,
    story: __SQ.story(), dlg: __SQ.dlg && __SQ.dlg.raw, script: __SQ.script, npcs: __SQ.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y, vis: n.vis, talk: n.talk })),
  }));
  throw new Error("tale did not start " + JSON.stringify(why));
}

async function finishPortal(page) {
  await page.evaluate(() => {
    if (__SQ.story() !== "drill") return;
    __SQ.flag("ds_ready", true);
    __SQ.flag("ds_moon", true);
    __SQ.flag("ds_mars", true);
    __SQ.flag("ds_candy", true);
    __SQ.flag("ds_pluto", true);
    __SQ.warp("ds_elite", 9, 5, 1);
  });
  for (let i = 0; i < 50; i++) {
    const done = await page.evaluate(() => __SQ.story() === "skippy" && __SQ.A.id === "moon" && __SQ.getPop && __SQ.getPop.item === "heavy" && __SQ.P.hold === "heavy");
    if (done) return;
    await page.evaluate(() => {
      if (__SQ.story() === "drill") {
        __SQ.flag("ds_ready", true);
        __SQ.flag("ds_moon", true);
        __SQ.flag("ds_mars", true);
        __SQ.flag("ds_candy", true);
        __SQ.flag("ds_pluto", true);
        if (__SQ.dlg || __SQ.script || __SQ.G.choice) __SQ.press("attack", true);
        if (!__SQ.script && !__SQ.dlg && !__SQ.G.choice) {
          if (__SQ.A.id !== "ds_elite") __SQ.warp("ds_elite", 9, 5, 1);
          __SQ.P.x = (9 + 0.5) * 16;
          __SQ.P.y = (5 + 0.5) * 16;
        }
      }
      __SQ.step(4);
      __SQ.press("attack", false);
    });
  }
  const why = await page.evaluate(() => ({ story: __SQ.story(), area: __SQ.A && __SQ.A.id, x: __SQ.P.x, y: __SQ.P.y, ready: !!__SQ.flags.ds_ready, state: __SQ.G.state, paused: !!__SQ.G.paused, pop: __SQ.getPop, script: __SQ.script, dlg: !!__SQ.dlg }));
  throw new Error("portal did not finish the tale " + JSON.stringify(why));
}

function equipped(hands, items) {
  return !!(items && items.heavy && hands && hands.item === "heavy" && (hands.sec === "heavy" || hands.pri === "heavy"));
}

async function expectGift(page, label, shot) {
  const snap = await page.evaluate(() => ({
    story: __SQ.story(),
    area: __SQ.A.id,
    build: __SQ.build(),
    hands: __SQ.hands(),
    items: __SQ.P.items,
    pop: __SQ.getPop,
    hold: __SQ.P.hold,
    coins: __SQ.P.coins,
    keys: __SQ.P.keys,
    big: __SQ.P.bigKeys,
    tale: !!__SQ.flags.tale_drill,
    ink: (__SQ.worldInk() || []).map((w) => w.t).join("|"),
    chapters: __SQ.chapters(),
  }));
  ok(snap.build === "b47", label + " build b47 (" + snap.build + ")");
  ok(snap.story === "skippy" && snap.area === "moon", label + " returns to the moon plaza " + snap.story + " " + snap.area);
  ok(snap.pop && snap.pop.item === "heavy" && snap.hold === "heavy", label + " holds the blaster up " + JSON.stringify({ pop: snap.pop, hold: snap.hold }));
  ok(equipped(snap.hands, snap.items), label + " equips the blaster " + JSON.stringify(snap.hands));
  ok(snap.items.sword && snap.items.missile && snap.items.bow && snap.coins === 55, label + " keeps the rest of the ride");
  ok(snap.keys && snap.keys.station === 2 && snap.big && snap.big.station === true, label + " keeps keys");
  ok(snap.tale === true, label + " marks the tale complete");
  ok(!/HEAVY|BLASTER/.test(snap.ink), label + " no floating blaster words");
  const drill = snap.chapters.filter((c) => c.id === "drill")[0];
  const spike = snap.chapters.filter((c) => c.id === "spike")[0];
  ok(drill && drill.open === true, label + " chapter list remembers Drill");
  ok(spike && spike.open === false, label + " later chapters stay locked");
  if (shot) {
    await page.locator("#game").screenshot({ path: OUT + "/heavy-hold.png" });
    for (let i = 0; i < 20; i++) {
      const busy = await page.evaluate(() => !!(__SQ.getPop || __SQ.dlg || __SQ.script || __SQ.G.choice));
      if (!busy) break;
      await tap(page, "attack", 3);
    }
    await page.evaluate(() => __SQ.step(2));
    await page.locator("#game").screenshot({ path: OUT + "/heavy-slot.png" });
    const hud = await page.evaluate(() => ({
      hands: __SQ.hands(),
      z: (__SQ.hud().find((b) => b.id === "zname") || {}).text || "",
    }));
    ok(hud.hands.item === "heavy" && hud.hands.melee === "sword" && hud.z.indexOf("HEAV") >= 0, label + " item slot reads HEAVY and X stays the sword " + JSON.stringify(hud));
    await page.evaluate(() => { __SQ.shots.length = 0; __SQ.step(30); });
    await tap(page, "attack", 2);
    const swung = await page.evaluate(() => ({ melee: __SQ.melee(), kinds: __SQ.shots.map((s) => s.kind) }));
    ok(swung.melee === "sword" && swung.kinds.indexOf("heavy") < 0, label + " X swings melee and does not fire the blaster " + JSON.stringify(swung));
    await page.evaluate(() => { __SQ.shots.length = 0; __SQ.step(30); });
    await tap(page, "item", 3);
    const zshot = await page.evaluate(() => __SQ.shots.map((s) => s.kind));
    ok(zshot.indexOf("heavy") >= 0, label + " Z fires the blaster " + JSON.stringify(zshot));
    const giftSave = await page.evaluate(() => localStorage.getItem("sq_save_v1"));
    await page.evaluate(() => __SQ.warp("saloon", 8.5, 6.4, 1));
    await page.evaluate(() => { __SQ.shots.length = 0; __SQ.step(30); });
    await tap(page, "item", 2);
    await page.evaluate(() => __SQ.step(40));
    const poured = await page.evaluate(() => !!__SQ.flags.pour_box);
    ok(poured, label + " heavy shot opens the Pour stairs");
    const swapped = [];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => __SQ.step(8));
      await tap(page, "swap", 2);
      swapped.push(await page.evaluate(() => __SQ.hands().item));
    }
    const kept = await page.evaluate(() => ({ melee: __SQ.melee(), missile: !!__SQ.P.items.missile, raygun: !!__SQ.P.items.raygun }));
    ok(swapped.indexOf("heavy") >= 0 && swapped.some((id) => id && id !== "heavy") && kept.missile && kept.raygun && kept.melee === "sword", label + " SWAP cycles the blaster with the other items " + JSON.stringify(swapped));
    return giftSave;
  }
  return null;
}

// Moon colony, after chapter 5.
{
  const moon = await pageWith((raw) => { window.__SQ_DEBUG = true; localStorage.clear(); localStorage.setItem("sq_save_v1", raw); }, ride());
  await moon.page.evaluate(() => __SQ.loadChapter("skippy"));
  const locked = await moon.page.evaluate(() => __SQ.chapters().filter((c) => c.id === "drill")[0]);
  ok(locked && locked.open === false, "before the tale Drill stays locked on the chapter list");
  await enterTale(moon.page, "moon", 5, 8, 1);
  ok(await moon.page.evaluate(() => __SQ.story()) === "drill", "moon teller starts Drill's tale");
  await finishPortal(moon.page);
  moon.page.errors = moon.errors;
  const saved = await expectGift(moon.page, "moon", true);
  ok(moon.errors.length === 0, "moon page errors " + moon.errors.join(" | "));
  await moon.ctx.close();

  const again = await pageWith((raw) => { window.__SQ_DEBUG = true; localStorage.clear(); localStorage.setItem("sq_save_v1", raw); }, saved);
  await again.page.evaluate(() => __SQ.loadChapter("skippy"));
  const cont = await again.page.evaluate(() => ({
    area: __SQ.A.id, coins: __SQ.P.coins, hands: __SQ.hands(), items: __SQ.P.items,
    pop: __SQ.getPop, keys: __SQ.P.keys, tale: !!__SQ.flags.tale_drill,
  }));
  ok(cont.area === "moon" && cont.coins === 55 && cont.tale && !cont.pop && equipped(cont.hands, cont.items), "continue after the tale still has the blaster " + JSON.stringify(cont));
  ok(cont.keys && cont.keys.station === 2, "continue keeps the station key");
  ok(again.errors.length === 0, "continue page errors " + again.errors.join(" | "));
  await again.ctx.close();
}

// Academy radio, same ride, fresh tale.
{
  const radio = await pageWith((raw) => { window.__SQ_DEBUG = true; localStorage.clear(); localStorage.setItem("sq_save_v1", raw); }, ride());
  await radio.page.evaluate(() => __SQ.loadChapter("skippy"));
  await enterTale(radio.page, "ac_camp", 2.1, 8, 3);
  ok(await radio.page.evaluate(() => __SQ.story()) === "drill", "academy radio starts Drill's tale");
  await finishPortal(radio.page);
  radio.page.errors = radio.errors;
  await expectGift(radio.page, "radio", false);
  ok(radio.errors.length === 0, "radio page errors " + radio.errors.join(" | "));
  await radio.ctx.close();
}

// Replay from the chapter list, then the portal.
{
  const ds = JSON.stringify({
    z: "bow", v: 1, area: "ds_camp", x: 136, y: 120, dir: 0,
    hp: 10, maxHp: 10, pieces: 0, coins: 4, arrows: 0,
    items: { blast: true }, keys: {}, bigKeys: {},
    flags: { ds_board: true, ds_moon: true }, party: [], shards: 0, time: 20,
    visited: { ds_camp: true }, pri: "blast", sec: "",
  });
  const menu = await pageWith((pair) => {
    window.__SQ_DEBUG = true;
    localStorage.clear();
    localStorage.setItem("sq_save_v1", pair[0]);
    localStorage.setItem("sq_save_ds_v1", pair[1]);
  }, [ride(), ds]);
  await menu.page.evaluate(() => __SQ.step(30));
  for (let i = 0; i < 3; i++) await tap(menu.page, "down", 2);
  await tap(menu.page, "attack", 5);
  const titled = await menu.page.evaluate(() => ({ state: __SQ.G.state, story: __SQ.story(), menu: __SQ.G.menu }));
  ok(titled.state === "title" && titled.story === "drill", "chapter list opens Drill " + JSON.stringify(titled));
  await menu.page.evaluate(() => __SQ.step(30));
  await menu.page.waitForTimeout(320);
  await tap(menu.page, "attack", 8);
  await finishPortal(menu.page);
  menu.page.errors = menu.errors;
  await expectGift(menu.page, "chapter list", false);
  ok(menu.errors.length === 0, "chapter list page errors " + menu.errors.join(" | "));
  await menu.ctx.close();
}

// Older saves: tale complete, blaster missing or stuck on the hidden primary.
{
  const old = {
    z: "bow", v: 1, area: "desert", x: 200, y: 200, dir: 3,
    hp: 8, maxHp: 8, pieces: 1, coins: 77, arrows: 4,
    items: { bow: true, sword: true, missile: true },
    keys: { sand: 1 }, bigKeys: {},
    flags: { woke: true, tale_drill: true, ch5_done: true, santt_met: true, oe_desert: true },
    party: [], shards: 5, time: 900,
    visited: { desert: true },
    pri: "bow", sec: "missile", melee: "sword",
  };
  const ros = JSON.stringify({
    z: "lasso", v: 1, area: "ros_pour", x: 160, y: 140, dir: 1,
    hp: 6, maxHp: 6, pieces: 0, coins: 3, arrows: 0,
    items: { lasso: true }, keys: {}, bigKeys: {},
    flags: { lasso_got: true, woke: true }, party: [], shards: 0, time: 12,
    visited: { ros_pour: true }, pri: "lasso", sec: "",
  });
  const ram = JSON.stringify({
    z: "bow", v: 1, area: "ram_dock", x: 160, y: 140, dir: 3,
    hp: 6, maxHp: 6, pieces: 0, coins: 7, arrows: 0,
    items: { hatchet: true }, keys: {}, bigKeys: {},
    flags: { ram_woke: true }, party: [], shards: 0, time: 12,
    visited: { ram_dock: true }, pri: "", sec: "", melee: "hatchet",
  });
  const doneDs = JSON.stringify({
    z: "bow", v: 1, area: "ds_camp", x: 136, y: 120, dir: 0,
    hp: 10, maxHp: 10, pieces: 0, coins: 11, arrows: 0,
    items: { blast: true }, keys: { dsm: 1 }, bigKeys: {},
    flags: { ds_home_end: true, ds_ready: true, ds_board: true }, party: [], shards: 0, time: 40,
    visited: { ds_camp: true }, pri: "blast", sec: "",
  });
  const mig = await pageWith((rows) => {
    window.__SQ_DEBUG = true;
    localStorage.clear();
    for (const [k, v] of rows) localStorage.setItem(k, v);
  }, [
    ["sq_save_v1", JSON.stringify(old)],
    ["sq_save_ros_v1", ros],
    ["sq_save_ram_v1", ram],
    ["sq_save_ds_v1", doneDs],
  ]);
  await mig.page.evaluate(() => __SQ.loadChapter("skippy"));
  const now = await mig.page.evaluate(() => ({
    area: __SQ.A.id, coins: __SQ.P.coins, hands: __SQ.hands(), items: __SQ.P.items,
    pop: __SQ.getPop, keys: __SQ.P.keys, santt: !!__SQ.flags.santt_met, melee: __SQ.melee(),
  }));
  const disk = await mig.page.evaluate(() => ({
    ros: localStorage.getItem("sq_save_ros_v1"),
    ram: localStorage.getItem("sq_save_ram_v1"),
    ds: JSON.parse(localStorage.getItem("sq_save_ds_v1")),
    skip: JSON.parse(localStorage.getItem("sq_save_v1")),
  }));
  ok(now.area === "desert" && now.coins === 77 && !now.pop, "migration stays on the saved spot with no fanfare " + now.area + " " + now.coins);
  ok(equipped(now.hands, now.items) && now.items.missile && now.items.sword && now.melee === "sword", "migration equips the missing blaster " + JSON.stringify(now.hands));
  ok(now.keys && now.keys.sand === 1 && now.santt, "migration keeps keys and flags");
  ok(disk.ros === ros && disk.ram === ram, "ros and ram saves are left untouched");
  ok(disk.ds && disk.ds.area === "ds_camp" && disk.ds.coins === 11 && disk.ds.pri === "blast" && disk.ds.items.blast && disk.ds.items.heavy && disk.ds.keys.dsm === 1, "drill save gains the blaster without losing blast " + JSON.stringify({ area: disk.ds.area, coins: disk.ds.coins, pri: disk.ds.pri, items: disk.ds.items }));
  ok(disk.skip && disk.skip.v === 1 && disk.skip.flags.tale_drill && disk.skip.items.heavy && disk.skip.sec === "heavy", "skippy save keeps v1 and records the blaster");
  ok(mig.errors.length === 0, "migration page errors " + mig.errors.join(" | "));
  await mig.ctx.close();

  const stuckRaw = JSON.stringify(Object.assign({}, old, {
    area: "seaport", coins: 61, x: 200, y: 180,
    items: { bow: true, sword: true, missile: true, heavy: true },
    flags: Object.assign({}, old.flags, { oe_seaport: true, heavy_got: true }),
    pri: "heavy", sec: "missile",
  }));
  const stuck = await pageWith((raw) => { window.__SQ_DEBUG = true; localStorage.clear(); localStorage.setItem("sq_save_v1", raw); }, stuckRaw);
  await stuck.page.evaluate(() => __SQ.loadChapter("skippy"));
  const belt = await stuck.page.evaluate(() => ({
    area: __SQ.A.id, coins: __SQ.P.coins, hands: __SQ.hands(), items: __SQ.P.items, pop: __SQ.getPop,
  }));
  ok(belt.area === "seaport" && belt.coins === 61 && !belt.pop && belt.hands.item === "heavy" && belt.items.missile && belt.items.heavy, "stuck primary moves onto the item slot " + JSON.stringify(belt));
  ok(stuck.errors.length === 0, "stuck save page errors " + stuck.errors.join(" | "));
  await stuck.ctx.close();
}

// Phone: ATTACK stays melee, ITEM fires the blaster, SWAP cycles.
{
  const phoneSave = JSON.stringify(Object.assign(JSON.parse(ride()), {
    items: { baton: true, bow: true, sword: true, raygun: true, missile: true, armor: true, heavy: true },
    flags: { woke: true, ch5_done: true, tale_drill: true, heavy_got: true, oe_moon: true },
    pri: "bow", sec: "heavy", melee: "sword", area: "moon",
  }));
  for (const [w, h, name] of [[844, 390, "landscape"], [390, 844, "portrait"]]) {
    const phone = await pageWith((raw) => { window.__SQ_DEBUG = true; localStorage.clear(); localStorage.setItem("sq_save_v1", raw); }, phoneSave, { phone: true, viewport: { width: w, height: h } });
    await phone.page.evaluate(() => __SQ.loadChapter("skippy"));
    await phone.page.waitForTimeout(300);
    await phone.page.locator("#game").screenshot({ path: OUT + "/heavy-phone-" + name + ".png" });
    const hud = await phone.page.evaluate(() => ({
      item: __SQ.hands().item,
      z: (__SQ.hud().find((b) => b.id === "zname") || {}).text || "",
    }));
    ok(hud.item === "heavy" && hud.z.indexOf("HEAV") >= 0, name + " phone item slot shows the blaster " + JSON.stringify(hud));
    await phone.page.evaluate(() => { __SQ.shots.length = 0; __SQ.step(30); });
    await phone.page.locator("[data-b=attack]").tap();
    await phone.page.evaluate(() => __SQ.step(3));
    const attack = await phone.page.evaluate(() => ({ melee: __SQ.melee(), kinds: __SQ.shots.map((s) => s.kind) }));
    ok(attack.melee === "sword" && attack.kinds.indexOf("heavy") < 0, name + " phone ATTACK stays melee " + JSON.stringify(attack));
    await phone.page.evaluate(() => { __SQ.shots.length = 0; __SQ.step(30); });
    await phone.page.locator("[data-b=item]").tap();
    await phone.page.evaluate(() => __SQ.step(4));
    const itemKinds = await phone.page.evaluate(() => __SQ.shots.map((s) => s.kind));
    ok(itemKinds.indexOf("heavy") >= 0, name + " phone ITEM fires the blaster " + JSON.stringify(itemKinds));
    await phone.page.evaluate(() => __SQ.step(30));
    await phone.page.locator("[data-b=swap]").tap();
    await phone.page.evaluate(() => __SQ.step(4));
    const cycled = await phone.page.evaluate(() => ({ item: __SQ.hands().item, missile: !!__SQ.P.items.missile, melee: __SQ.melee() }));
    ok(cycled.item !== "heavy" && cycled.missile && cycled.melee === "sword", name + " phone SWAP keeps the other item " + JSON.stringify(cycled));
    ok(phone.errors.length === 0, name + " phone errors " + phone.errors.join(" | "));
    await phone.ctx.close();
  }
}

await browser.close();
console.log("RESULT heavy " + pass + "/" + (pass + fail));
if (failures.length) console.log(failures.join("\n"));
process.exit(fail ? 1 : 0);
