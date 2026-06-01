import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "website");
const outputDir = path.join(rootDir, "site");
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));

const replacements = new Map([
  ["@@PACKAGE_VERSION@@", packageJson.version],
  ["@@PACKAGE_NAME@@", packageJson.name],
]);

await rm(outputDir, { recursive: true, force: true });
await copyDirectory(sourceDir, outputDir);
await validateSite(outputDir);

console.log(`Website generated at ${path.relative(rootDir, outputDir)}/`);

async function copyDirectory(from, to) {
  await mkdir(to, { recursive: true });

  for (const entry of await readdir(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await copyFileWithTemplate(sourcePath, targetPath);
    }
  }
}

async function copyFileWithTemplate(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });

  if (path.extname(sourcePath) !== ".html") {
    await writeFile(targetPath, await readFile(sourcePath));
    return;
  }

  let html = await readFile(sourcePath, "utf8");
  for (const [token, value] of replacements.entries()) {
    html = html.replaceAll(token, value);
  }
  await writeFile(targetPath, html);
}

async function validateSite(dir) {
  const html = await readFile(path.join(dir, "index.html"), "utf8");
  const css = await readFile(path.join(dir, "styles.css"), "utf8");
  const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));

  for (const match of html.matchAll(/\shref="#([^"]+)"/g)) {
    const anchor = match[1];
    if (!ids.has(anchor)) {
      throw new Error(`Broken internal anchor: #${anchor}`);
    }
  }

  const localRefs = [
    ...Array.from(html.matchAll(/\shref="([^":#][^"]*)"/g), (match) => match[1]),
    ...Array.from(html.matchAll(/\ssrc="([^":#][^"]*)"/g), (match) => match[1]),
    ...Array.from(css.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1]),
  ].filter((ref) => !ref.startsWith("mailto:"));

  for (const ref of localRefs) {
    if (ref.startsWith("http") || ref.startsWith("/")) {
      continue;
    }

    const cleanRef = ref.split("#")[0].split("?")[0];
    if (!cleanRef) {
      continue;
    }

    await stat(path.join(dir, cleanRef)).catch(() => {
      throw new Error(`Missing local website asset: ${ref}`);
    });
  }

  const requiredCopy = [
    "Make for AI workflows",
    "npm install -g loom-ai",
    "60-second quickstart",
    "Tutorials",
    "deterministic developer preview",
  ];

  for (const phrase of requiredCopy) {
    if (!html.includes(phrase)) {
      throw new Error(`Missing launch copy: ${phrase}`);
    }
  }
}
