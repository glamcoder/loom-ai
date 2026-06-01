import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "dist");
const PORT = process.env.PORT ? Number(process.env.PORT) : 4321;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  let file = path.join(ROOT, urlPath);

  // try .html fallback for extensionless paths
  if (!fs.existsSync(file) && !path.extname(file)) file += ".html";

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const nf = path.join(ROOT, "404.html");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "Not found");
    return;
  }

  const type = TYPES[path.extname(file)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`Loom site serving at http://localhost:${PORT}`);
});
