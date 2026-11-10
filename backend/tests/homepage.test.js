import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import http from "node:http";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { createHomepageDelivery, setPublicAssetCache } from "../utils/homepageDelivery.js";
import vm from "node:vm";

test("homepage delivery compresses public text, versions assets and preserves HTTP cache semantics", async t => {
  const publicDir = await mkdtemp(path.join(tmpdir(), "synta-homepage-test-"));
  t.after(async () => {
    assert.equal(path.dirname(publicDir), tmpdir());
    assert.ok(path.basename(publicDir).startsWith("synta-homepage-test-"));
    await rm(publicDir, { recursive: true, force: true });
  });
  const css = "body { color: #013047; }";
  const cssHash = createHash("sha256").update(css).digest("hex").slice(0, 12);
  const html = '<!doctype html><html><head><link rel="stylesheet" href="style.css?v=000000000000"></head><body>Homepage</body></html>';
  await Promise.all([
    writeFile(path.join(publicDir, "index.html"), html),
    writeFile(path.join(publicDir, "style.css"), css),
    writeFile(path.join(publicDir, "main.js"), "console.log('fixture');"),
    writeFile(path.join(publicDir, "image.webp"), "synthetic-image"),
  ]);
  const app = express();
  app.use(createHomepageDelivery(publicDir));
  app.use(express.static(publicDir, { setHeaders: setPublicAssetCache }));
  app.get("/api/private", (req, res) => res.set("Cache-Control", "no-store").json({ private: true }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const request = (url, headers = {}, method = "GET") => new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.address().port, path: url, headers, method,
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });

  const identity = await request("/", { "Accept-Encoding": "identity" });
  assert.equal(identity.status, 200);
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.match(identity.body.toString(), new RegExp("style.css\\?v=" + cssHash));
  assert.match(identity.headers["cache-control"], /must-revalidate/);
  assert.match(identity.headers.vary, /Accept-Encoding/);
  assert.match(identity.headers["content-type"], /text\/html; charset=utf-8/);

  for (const [encoding, decode] of [["br", brotliDecompressSync], ["gzip", gunzipSync]]) {
    const compressed = await request("/", { "Accept-Encoding": encoding });
    assert.equal(compressed.headers["content-encoding"], encoding);
    assert.deepEqual(decode(compressed.body), identity.body);
    const conditional = await request("/", { "Accept-Encoding": encoding, "If-None-Match": compressed.headers.etag });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.body.length, 0);
    const head = await request("/", { "Accept-Encoding": encoding }, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers["content-length"]), compressed.body.length);
    assert.equal(head.body.length, 0);
  }

  const weighted = await request("/", { "Accept-Encoding": "br;q=0,gzip;q=1" });
  assert.equal(weighted.headers["content-encoding"], "gzip");
  const stylesheet = await request("/style.css?v=" + cssHash, { "Accept-Encoding": "gzip" });
  assert.match(stylesheet.headers["cache-control"], /max-age=31536000, immutable/);
  assert.equal(gunzipSync(stylesheet.body).toString(), css);
  const image = await request("/image.webp?v=123456789abc", { "Accept-Encoding": "br" });
  assert.equal(image.headers["content-encoding"], undefined);
  assert.match(image.headers["cache-control"], /immutable/);
  const range = await request("/style.css", { "Accept-Encoding": "br", Range: "bytes=0-3" });
  assert.equal(range.status, 206);
  assert.equal(range.headers["content-encoding"], undefined);
  const privateResponse = await request("/api/private?v=123456789abc", { "Accept-Encoding": "br" });
  assert.equal(privateResponse.headers["cache-control"], "no-store");
  assert.equal(privateResponse.headers["content-encoding"], undefined);
  assert.equal((await request("/missing-file.css")).status, 404);
});

test("mobile navigation preserves scroll, excludes closed links, supports Escape and resets on resize", async () => {
  const documentEvents = new Map();
  const windowEvents = new Map();
  const mediaEvents = new Map();
  const scrolls = [];
  const document = {
    addEventListener: (event, handler) => documentEvents.set(event, handler),
  };
  function element() {
    const events = new Map();
    const attributes = new Map();
    const classes = new Set();
    return {
      events, attributes, inert: false, style: {},
      addEventListener: (event, handler) => events.set(event, handler),
      classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: (name, value) => attributes.set(name, value),
      getClientRects: () => [{}],
      focus() { document.activeElement = this; },
    };
  }
  const button = element();
  const links = [element(), element()];
  const accountLink = element();
  const nav = Object.assign(element(), { querySelector: () => links[0], querySelectorAll: () => links });
  const accounts = Object.assign(element(), { querySelectorAll: () => [accountLink] });
  document.body = element();
  document.querySelector = selector => ({
    ".mobile-menu-btn": button, "header nav": nav, ".auth-buttons": accounts,
  })[selector];
  document.querySelectorAll = () => [...links, accountLink];
  const media = { matches: true, addEventListener: (event, handler) => mediaEvents.set(event, handler) };
  const window = {
    scrollY: 731, matchMedia: () => media, scrollTo: options => scrolls.push(options.top),
    addEventListener: (event, handler) => windowEvents.set(event, handler),
  };
  const source = await readFile(new URL("../public/main.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { document, window });
  documentEvents.get("DOMContentLoaded")();
  assert.equal(nav.inert, true);
  button.events.get("click")();
  assert.equal(nav.inert, false);
  assert.equal(button.attributes.get("aria-expanded"), "true");
  assert.equal(document.body.style.top, "-731px");
  assert.equal(document.activeElement, links[0]);
  let prevented = 0;
  accountLink.focus();
  documentEvents.get("keydown")({ key: "Tab", preventDefault: () => prevented++ });
  assert.equal(document.activeElement, button);
  documentEvents.get("keydown")({ key: "Escape", preventDefault: () => prevented++ });
  assert.equal(prevented, 2);
  assert.deepEqual(scrolls, [731]);
  assert.equal(document.body.style.top, "");
  assert.equal(nav.inert, true);
  button.events.get("click")();
  media.matches = false;
  mediaEvents.get("change")();
  assert.equal(button.attributes.get("aria-expanded"), "false");
  assert.equal(nav.inert, false);
  assert.equal(accounts.inert, false);
});
