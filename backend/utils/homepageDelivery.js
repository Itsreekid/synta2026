import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip, constants } from "node:zlib";
import { createHash } from "node:crypto";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

async function versionHomepageAssets(content, publicDir) {
  const html = content.toString("utf8");
  const references = [...html.matchAll(/(?:src|href)="([^":?]+)\?v=[a-f0-9]{12}"/g)];
  const versions = new Map();
  await Promise.all([...new Set(references.map(match => match[1]))].map(async asset => {
    const file = path.resolve(publicDir, asset);
    if (!file.startsWith(path.resolve(publicDir) + path.sep)) throw new Error("Invalid public asset path");
    const bytes = await readFile(file);
    versions.set(asset, createHash("sha256").update(bytes).digest("hex").slice(0, 12));
  }));
  return Buffer.from(html.replace(/((?:src|href)=")([^":?]+)\?v=[a-f0-9]{12}"/g,
    (match, attribute, asset) => `${attribute}${asset}?v=${versions.get(asset)}"`));
}

export function setPublicAssetCache(res, filePath) {
  if (path.extname(filePath).toLowerCase() === ".html") {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  } else if (/^[a-f0-9]{12}$/.test(String(res.req.query.v || ""))) {
    // Homepage references carry content hashes. A changed file gets a new URL.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
}

export function createHomepageDelivery(publicDir) {
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]],
    ["/main.js", ["main.js", "application/javascript; charset=utf-8"]],
  ]);
  const cachedFiles = new Map();

  return async (req, res, next) => {
    const asset = files.get(req.path);
    if (!asset || !["GET", "HEAD"].includes(req.method) || req.headers.range) return next();
    const filePath = path.join(publicDir, asset[0]);
    try {
      const metadata = await stat(filePath);
      const revision = `${metadata.mtimeMs}:${metadata.size}`;
      let cached = cachedFiles.get(filePath);
      if (!cached || cached.revision !== revision) {
        let content = await readFile(filePath);
        if (asset[0] === "index.html") content = await versionHomepageAssets(content, publicDir);
        cached = {
          revision,
          identity: content,
        };
        cachedFiles.set(filePath, cached);
      }
      const encoding = req.acceptsEncodings("br", "gzip", "identity") || "identity";
      if (!cached[encoding]) {
        cached[encoding] = encoding === "br"
          ? compressBrotli(cached.identity, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
          : compressGzip(cached.identity);
      }
      const content = await cached[encoding];
      res.vary("Accept-Encoding");
      res.set("Content-Type", asset[1]);
      if (asset[0] !== "index.html") res.set("Last-Modified", metadata.mtime.toUTCString());
      setPublicAssetCache(res, filePath);
      if (encoding !== "identity") res.set("Content-Encoding", encoding);
      // Express handles ETags, conditional 304 responses and HEAD bodies.
      return res.send(content);
    } catch (error) {
      cachedFiles.delete(filePath);
      return error.code === "ENOENT" ? next() : next(error);
    }
  };
}
