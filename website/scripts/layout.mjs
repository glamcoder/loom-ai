/** Shared HTML chrome: <head>, nav, footer, and the page shell. */

export const SITE = {
  name: "Loom",
  tagline: "Make for AI workflows.",
  description:
    "Loom is a Git-native workflow language for packaging reusable AI work as code. It compiles parameterized .loom programs into agent-ready artifacts, traces, and deterministic tests — no LLM calls, no network.",
  url: "https://glamcoder.github.io/loom-ai",
  repo: "https://github.com/glamcoder/loom-ai",
  npm: "https://www.npmjs.com/package/loom-ai",
  version: "0.1.0",
};

const LOGO = `<svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFCE6B"/><stop offset="0.5" stop-color="#F5A623"/><stop offset="1" stop-color="#FF7A59"/>
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="url(#lg)" stroke-width="1.6" opacity="0.5"/>
  <path d="M8 9V23M13 9V23M19 9V23M24 9V23" stroke="url(#lg)" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M6 13.5H26M6 18.5H26" stroke="#7C8CFF" stroke-width="1.7" stroke-linecap="round" opacity="0.9"/>
</svg>`;

/**
 * @param {object} opts
 * @param {string} opts.title    full <title>
 * @param {string} opts.desc     meta description
 * @param {string} opts.path     site-root-relative path of this page (e.g. "docs/getting-started.html")
 * @param {string} opts.body     inner HTML for <body> (excluding nav/footer)
 * @param {string} [opts.active] nav key to mark active: home|docs|examples|roadmap
 * @param {string} [opts.extraHead]
 * @param {string} [opts.bodyClass]
 */
export function page(opts) {
  const {
    title,
    desc,
    path,
    body,
    active = "",
    extraHead = "",
    bodyClass = "",
  } = opts;
  const depth = path.split("/").length - 1;
  const root = depth === 0 ? "./" : "../".repeat(depth);
  const canonical = `${SITE.url}/${path}`;
  const ogImage = `${SITE.url}/assets/og.png`;

  const navlink = (key, href, label) =>
    `<a href="${root}${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta name="theme-color" content="#0a0b0f" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Loom" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${ogImage}" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${root}assets/styles.css" />
${extraHead}
</head>
<body class="${bodyClass}">
<header class="nav">
  <div class="container nav-inner">
    <a class="brand" href="${root}index.html">
      ${LOGO}
      <span>Loom</span>
      <span class="tag">v${SITE.version}</span>
    </a>
    <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
    <nav class="nav-links">
      ${navlink("docs", "docs/getting-started.html", "Docs")}
      ${navlink("examples", "examples.html", "Examples")}
      ${navlink("language", "docs/language-v0.html", "Language")}
      ${navlink("roadmap", "docs/roadmap.html", "Roadmap")}
      <a href="${SITE.npm}" target="_blank" rel="noopener">npm</a>
      <a class="nav-gh" href="${SITE.repo}" target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
    </nav>
  </div>
</header>

${body}

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="brand" href="${root}index.html">${LOGO}<span>Loom</span></a>
        <p class="blurb">The build layer beneath your AI tooling. Reusable prompt logic as code — imported across repos, tested in CI, compiled to the artifacts your agents consume.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="${root}docs/getting-started.html">Getting started</a></li>
          <li><a href="${root}docs/concepts.html">Concepts</a></li>
          <li><a href="${root}docs/cli.html">CLI reference</a></li>
          <li><a href="${root}docs/language-v0.html">Language reference</a></li>
          <li><a href="${root}examples.html">Examples</a></li>
        </ul>
      </div>
      <div>
        <h4>Learn</h4>
        <ul>
          <li><a href="${root}docs/tutorials/generate-agents-md.html">Generate AGENTS.md</a></li>
          <li><a href="${root}docs/tutorials/reusable-pr-review.html">Reusable PR review</a></li>
          <li><a href="${root}docs/tutorials/build-a-prompt-library.html">Prompt library</a></li>
          <li><a href="${root}docs/tutorials/ci-checks.html">CI checks</a></li>
          <li><a href="${root}docs/comparisons.html">Comparisons</a></li>
        </ul>
      </div>
      <div>
        <h4>Project</h4>
        <ul>
          <li><a href="${root}docs/roadmap.html">Roadmap</a></li>
          <li><a href="${root}docs/architecture.html">Architecture</a></li>
          <li><a href="${SITE.repo}" target="_blank" rel="noopener">GitHub</a></li>
          <li><a href="${SITE.npm}" target="_blank" rel="noopener">npm package</a></li>
          <li><a href="${SITE.repo}/blob/main/LICENSE" target="_blank" rel="noopener">License (Apache-2.0)</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} Loom contributors. Apache-2.0 licensed. <strong>Loom is a working name</strong> and may change before a stable release.</p>
      <span class="footer-note">v${SITE.version} · deterministic developer preview · no LLM calls</span>
    </div>
  </div>
</footer>
<script src="${root}assets/site.js" defer></script>
</body>
</html>`;
}

export { LOGO };
