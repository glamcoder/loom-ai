import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";

import { highlight } from "./highlight.mjs";
import { page, SITE } from "./layout.mjs";
import { homePage } from "./page-home.mjs";
import { examplesPage } from "./page-examples.mjs";
import { DOC_GROUPS, DOC_PAGES } from "./docs-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE = path.resolve(__dirname, "..");
const REPO = path.resolve(WEBSITE, "..");
const OUT = path.join(WEBSITE, "dist");

/* ----------------------------- markdown ----------------------------- */

const md = new MarkdownIt({
  html: true,
  // linkify off on purpose: docs reference bare filenames like AGENTS.md and
  // REVIEW.md in prose, which linkify would turn into bogus http:// links.
  linkify: false,
  typographer: true,
  highlight(code, lang) {
    const cls = lang ? ` data-lang="${lang}"` : "";
    return `<pre${cls}><code>${highlight(code, lang)}</code></pre>`;
  },
}).use(anchor, {
  level: [2, 3],
  permalink: anchor.permalink.linkInsideHeader({
    symbol: "#",
    placement: "after",
    class: "header-anchor",
  }),
  slugify: (s) =>
    s
      .toLowerCase()
      .trim()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\w一-龥\- ]/g, "")
      .replace(/\s+/g, "-"),
});

// Repo files that the website does NOT publish — link these to GitHub instead.
// Matched on the link's basename so it works regardless of ./ or ../ prefixes.
const GH_ONLY = new Set([
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "README.md",
  "ROADMAP.md",
]);

/** Rewrite intra-doc links: docs-relative .md → .html; unpublished repo files → GitHub. */
function rewriteLinks(html) {
  return html.replace(/href="([^"]+)"/g, (m, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return m;

    const hashIdx = href.indexOf("#");
    const hash = hashIdx === -1 ? "" : href.slice(hashIdx);
    const filepart = hashIdx === -1 ? href : href.slice(0, hashIdx);
    const base = filepart.split("/").pop();

    // Unpublished repo files → point at GitHub (resolve ../ against repo root).
    if (GH_ONLY.has(base)) {
      const ghPath = base === "LICENSE" ? "LICENSE" : base;
      return `href="${SITE.repo}/blob/main/${ghPath}"`;
    }

    // Docs cross-links: .md → .html, preserving the relative path + anchor.
    if (/\.md$/.test(filepart)) {
      return `href="${filepart.replace(/\.md$/, ".html")}${hash}"`;
    }
    return m;
  });
}

/** Build the docs sidebar HTML for a given active slug. */
function sidebar(activeSlug, depth) {
  const up = "../".repeat(depth);
  const groups = DOC_GROUPS.map((g) => {
    const items = g.items
      .map((it) => {
        const href = up + it.slug;
        const active = it.slug === activeSlug ? " class=active" : "";
        return `<a href="${href}"${active}>${it.nav}</a>`;
      })
      .join("");
    return `<div class="grp"><div class="grp-title">${g.title}</div>${items}</div>`;
  }).join("");
  return `<aside class="docs-side">${groups}</aside>`;
}

function prevNext(slug, depth) {
  const up = "../".repeat(depth);
  const idx = DOC_PAGES.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? DOC_PAGES[idx - 1] : null;
  const next = idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : null;
  const prevHtml = prev
    ? `<a href="${up}${prev.slug}"><span class="lbl">← Previous</span><span class="ttl">${prev.nav}</span></a>`
    : `<span></span>`;
  const nextHtml = next
    ? `<a class="next" href="${up}${next.slug}"><span class="lbl">Next →</span><span class="ttl">${next.nav}</span></a>`
    : `<span></span>`;
  return `<div class="doc-nextprev">${prevHtml}${nextHtml}</div>`;
}

/* ----------------------------- fs utils ----------------------------- */

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function write(rel, html) {
  const dest = path.join(OUT, rel);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, html);
  return rel;
}
function copyAssets() {
  const src = path.join(WEBSITE, "assets");
  const dest = path.join(OUT, "assets");
  ensureDir(dest);
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
}

/* ----------------------------- build ----------------------------- */

function buildDocPage(doc) {
  const mdSrc = fs.readFileSync(path.join(REPO, doc.from), "utf8");
  // Drop the first H1 — we render our own doc hero — to avoid duplicate titles.
  const withoutH1 = mdSrc.replace(/^#\s+.*\n/, "");
  let rendered = md.render(withoutH1);
  rendered = rewriteLinks(rendered);

  const depth = doc.slug.split("/").length - 1;
  const ghPath = doc.from;

  const body = `
<div class="docs-hero">
  <div class="container">
    <div class="kicker">Documentation</div>
    <h1>${escapeHtml(doc.title)}</h1>
    <p>${escapeHtml(doc.desc)}</p>
  </div>
</div>
<div class="container">
  <div class="docs">
    ${sidebar(doc.slug, depth)}
    <article class="prose">
      <div class="doc-meta">
        <span class="pill">${doc.group}</span>
        <a class="edit-link" href="${SITE.repo}/blob/main/${ghPath}" target="_blank" rel="noopener">Edit this page on GitHub ↗</a>
      </div>
      ${rendered}
      ${prevNext(doc.slug, depth)}
    </article>
  </div>
</div>`;

  return page({
    title: `${doc.title} · Loom`,
    desc: doc.desc,
    path: doc.slug,
    active: navActiveFor(doc.slug),
    body,
  });
}

function navActiveFor(slug) {
  if (slug === "docs/language-v0.html") return "language";
  if (slug === "docs/roadmap.html") return "roadmap";
  return "docs";
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function build() {
  // clean dist
  fs.rmSync(OUT, { recursive: true, force: true });
  ensureDir(OUT);

  const written = [];

  // Home
  written.push(
    write(
      "index.html",
      page({
        title: "Loom — Make for AI workflows",
        desc: SITE.description,
        path: "index.html",
        active: "home",
        body: homePage(),
      }),
    ),
  );

  // Examples
  written.push(
    write(
      "examples.html",
      page({
        title: "Examples · Loom",
        desc: "Runnable .loom example programs: refactor briefs, PR-review instructions, and a shared prompt library.",
        path: "examples.html",
        active: "examples",
        body: examplesPage(REPO),
      }),
    ),
  );

  // Docs
  for (const doc of DOC_PAGES) {
    written.push(write(doc.slug, buildDocPage(doc)));
  }

  // 404
  written.push(
    write(
      "404.html",
      page({
        title: "Not found · Loom",
        desc: "Page not found.",
        path: "404.html",
        body: `<section class="container notfound">
          <h1 class="thread-text">404</h1>
          <p class="muted" style="font-size:18px">That thread came loose. The page you're after isn't here.</p>
          <div class="cta-row" style="margin-top:24px">
            <a class="btn btn-primary" href="index.html">Back home</a>
            <a class="btn btn-ghost" href="docs/getting-started.html">Read the docs</a>
          </div>
        </section>`,
      }),
    ),
  );

  // Assets
  copyAssets();

  // .nojekyll so GitHub Pages serves /assets and dotfiles as-is
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

  // sitemap + robots
  writeSitemap(written);
  fs.writeFileSync(
    path.join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`,
  );

  console.log(`✓ Built ${written.length} pages → ${path.relative(REPO, OUT)}`);
  for (const w of written) console.log(`  · ${w}`);
}

function writeSitemap(pages) {
  const urls = pages
    .filter((p) => p.endsWith(".html") && p !== "404.html")
    .map((p) => {
      const loc = `${SITE.url}/${p === "index.html" ? "" : p}`;
      const pri = p === "index.html" ? "1.0" : "0.7";
      return `  <url><loc>${loc}</loc><priority>${pri}</priority></url>`;
    })
    .join("\n");
  fs.writeFileSync(
    path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
}

build();
