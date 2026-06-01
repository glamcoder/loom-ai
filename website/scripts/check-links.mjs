// Verifies every internal href and asset src in dist/ resolves to a real file,
// and that in-page #anchors exist. Exits non-zero on any broken link.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const htmlFiles = walk(DIST);
const idCache = new Map();
function idsOf(file) {
  if (idCache.has(file)) return idCache.get(file);
  const html = fs.readFileSync(file, "utf8");
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/\sname="([^"]+)"/g)) ids.add(m[1]);
  idCache.set(file, ids);
  return ids;
}

let errors = 0;
let checked = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const attrs = [
    ...html.matchAll(/(?:href|src)="([^"]+)"/g),
  ].map((m) => m[1]);

  for (const ref of attrs) {
    if (/^(https?:|mailto:|data:|#)/.test(ref)) {
      // same-page anchor
      if (ref.startsWith("#") && ref !== "#") {
        const id = ref.slice(1);
        if (!idsOf(file).has(id)) {
          console.error(`✗ ${rel(file)} → missing anchor ${ref}`);
          errors++;
        }
      }
      continue;
    }
    checked++;
    const [p, hash] = ref.split("#");
    const target = path.resolve(dir, p);
    if (!fs.existsSync(target)) {
      console.error(`✗ ${rel(file)} → broken link "${ref}"`);
      errors++;
      continue;
    }
    if (hash && target.endsWith(".html")) {
      if (!idsOf(target).has(hash)) {
        console.error(`✗ ${rel(file)} → "${ref}" (anchor #${hash} not found)`);
        errors++;
      }
    }
  }
}

function rel(f) {
  return path.relative(DIST, f);
}

if (errors) {
  console.error(`\n✗ ${errors} broken link(s) across ${htmlFiles.length} pages.`);
  process.exit(1);
} else {
  console.log(
    `✓ Link check passed: ${checked} internal links across ${htmlFiles.length} pages OK.`,
  );
}
