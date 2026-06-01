# Loom website

The static marketing + documentation site for Loom, served at
**https://glamcoder.github.io/loom-ai/**.

It is a small, dependency-light static-site generator. The landing page and
examples page are hand-authored; every page under `/docs` is generated from the
repo's existing Markdown in [`../docs`](../docs), so the docs have a single
source of truth and never drift from the site.

## Develop

```bash
cd website
npm install
npm run dev      # builds to dist/ and serves at http://localhost:4321
```

Other scripts:

```bash
npm run build        # generate the static site into website/dist/
npm run check        # verify every internal link + anchor resolves
npm run build:check  # build, then check (what CI runs)
npm run serve        # serve an already-built dist/
```

## How it works

| File                       | Role                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `scripts/build.mjs`        | Orchestrator. Renders Markdown, builds docs nav/prev-next, writes pages. |
| `scripts/layout.mjs`       | Shared `<head>`, nav, footer, and the HTML shell + site metadata.       |
| `scripts/page-home.mjs`    | The landing page.                                                       |
| `scripts/page-examples.mjs`| The examples page (reads real `.loom` files from `../examples`).        |
| `scripts/docs-config.mjs`  | Which `../docs/*.md` become pages, and how they're grouped in the nav.  |
| `scripts/highlight.mjs`    | Dependency-free syntax highlighter for `.loom` / HCL / bash / json / diff. |
| `scripts/check-links.mjs`  | Internal link + anchor checker (fails the build on a broken link).      |
| `assets/`                  | CSS, client JS, favicon, and the social/OG image.                       |

The only runtime dependencies are `markdown-it` and `markdown-it-anchor`. They
live in this directory's own `package.json` and are **not** part of the
published `loom-ai` npm package.

## Adding a docs page

1. Add the Markdown file under [`../docs`](../docs).
2. Register it in `scripts/docs-config.mjs` (group, slug, title, description).
3. `npm run build:check`.

Cross-document `.md` links are rewritten to `.html` automatically, and links to
unpublished repo files (LICENSE, CONTRIBUTING, etc.) are pointed at GitHub.

## Deployment

`.github/workflows/website.yml` builds the site on every push and PR (and runs
the link check). On a push to `main` it deploys `website/dist` to GitHub Pages.

To enable Pages once: repo **Settings → Pages → Build and deployment →
Source: GitHub Actions**.
