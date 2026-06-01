# GitHub Copilot instructions for AtlasCart

When suggesting code:

- Start from `src/checkout.js` and matching tests.
- Prefer small, reviewable changes.
- Keep risk decisions deterministic and auditable.
- Run `npm test` before proposing completion.
- If generated guidance looks stale, run `npm run loom:generate`.
