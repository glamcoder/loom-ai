# Loom Website

This directory contains the source for the static public website.

Build it with:

```bash
npm run website:build
```

The generated deployable output is written to `site/`. The build script injects
package metadata, copies assets, and validates internal anchors plus local
assets so CI catches broken website output.

CI runs this build on pushes and pull requests. `.github/workflows/pages.yml`
also deploys `site/` to GitHub Pages on pushes to `main` once Pages is configured
to use GitHub Actions.
