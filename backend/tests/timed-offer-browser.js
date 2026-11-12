import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

export async function withTimedOfferBrowser(executable, origin, run) {
  const profile = await mkdtemp(join(tmpdir(), "synta-browser-qa-"));
  const browser = spawn(executable, ["--headless=new", "--disable-background-networking",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
  let socket;
  const until = async (read, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await read();
      if (result) return result;
      await wait(100);
    }
    assert.fail("Browser timeout: " + label);
  };
  try {
    const port = await until(async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")
      .catch(() => "")).split("\n")[0].trim(), "DevTools startup");
    const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error("DevTools command timed out: " + method));
      }, 5000);
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); }
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const handler = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) handler?.reject(new Error(message.error.message));
        else handler?.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(" "));
      }
    });
    await command("Runtime.enable");
    await command("Page.enable");
    await command("Network.enable");
    // The fixture is loopback-only. Stub the CDN global so the real template can boot offline.
    await command("Page.addScriptToEvaluateOnNewDocument", { source:
      "window.Turbo = { setProgressBarDelay() {} }; window.confirm = text => { window.lastConfirmation = text; return true; }; window.prompt = () => 'Synthetic reversal reason';" });
    const evaluate = async expression => {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const open = async (path, token, width) => {
      await command("Network.setCookie", { name: "synta_access", value: token, url: origin, httpOnly: true });
      await command("Emulation.setDeviceMetricsOverride", { width, height: width < 500 ? 844 : 900,
        deviceScaleFactor: 1, mobile: width < 500 });
      await command("Page.navigate", { url: origin + path });
      await until(async () => evaluate(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`), path);
    };
    await run({ open, evaluate, until, errors });
  } finally {
    socket?.close();
    if (browser.exitCode === null) browser.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }).catch(() => {});
  }
}
