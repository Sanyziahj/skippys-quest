// Landscape story list: every chapter row stays fully on screen and off the canvas.
import { createRequire } from "node:module";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const URL = process.env.SQURL || pathToFileURL(path.resolve("index.html")).href;
const OUT = "/opt/cursor/artifacts/skippy-story-rows";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } console.log((c ? "PASS " : "FAIL ") + m); };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
for (const [w, h, name] of [[844, 390, "landscape"], [390, 844, "portrait"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__SQ_DEBUG = true; localStorage.clear(); });
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll("#srml-rows button").length >= 7);
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  const info = await page.evaluate(() => {
    const cv = document.getElementById("game").getBoundingClientRect();
    const rows = document.getElementById("srml-rows").getBoundingClientRect();
    return {
      canvas: { x: cv.x, r: cv.right, y: cv.y, b: cv.bottom },
      box: { y: rows.y, b: rows.bottom, h: rows.height },
      btns: [...document.querySelectorAll("#srml-rows button")].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          t: e.textContent.trim().slice(0, 32),
          x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height,
          clipX: e.scrollWidth > e.clientWidth + 2,
          clipY: e.scrollHeight > e.clientHeight + 2,
        };
      }),
    };
  });
  ok(info.btns.length >= 7, name + ": story rows present (" + info.btns.length + ")");
  for (const b of info.btns) {
    const inside = b.x >= -0.5 && b.y >= -0.5 && b.r <= w + 0.5 && b.b <= h + 0.5;
    const over = b.x < info.canvas.r - 1 && b.r > info.canvas.x + 1 && b.y < info.canvas.b - 1 && b.b > info.canvas.y + 1;
    const minH = name === "landscape" ? 48 : 52;
    ok(inside, name + ": " + b.t + " fully on screen (" + Math.round(b.x) + "," + Math.round(b.y) + " " + Math.round(b.b) + ")");
    ok(!over, name + ": " + b.t + " does not cover the canvas");
    ok(!b.clipX && !b.clipY, name + ": " + b.t + " label fits the row");
    ok(b.h + 0.5 >= minH, name + ": " + b.t + " is at least " + minH + "px tall (" + b.h.toFixed(1) + ")");
  }
  await ctx.close();
}
await browser.close();
console.log("RESULT story-rows " + pass + "/" + (pass + fail));
if (failures.length) console.log(failures.join("\n"));
process.exit(fail ? 1 : 0);
