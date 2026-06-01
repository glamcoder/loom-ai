# AtlasCart

AtlasCart is a standalone GTM demo for Loom. It is a small checkout-risk
service that shows where Loom creates real business value: keeping AI coding
agent instructions, PR review guidance, and release readiness artifacts
consistent, testable, and regenerated from one source of truth.

## Why this matters

Teams adopting AI coding agents quickly accumulate scattered instructions:
`AGENTS.md`, Copilot rules, PR templates, release checklists, and Slack snippets.
Those instructions drift across repos and become impossible to test. AtlasCart
uses Loom to make those artifacts deterministic build outputs.

## Demo flow

```bash
npm run demo:check
npm run loom:generate
npm run loom:cleanup
```

The Loom workflow writes:

- `ai/agent-handbook.md`
- `.github/copilot-instructions.md`
- `.github/pull_request_template.md`
- `docs/release-readiness.md`
- `demo/generated-manifest.json`

Open `demo/index.html` in a browser for the visual GTM/investor demo.

`npm run loom:cleanup` removes generated artifacts and traces so the project is
back to its pre-generation demo state.

## CI integration

`.github/workflows/ai-governance.yml` runs the app test, validates the Loom
module graph, runs deterministic Loom tests, regenerates the AI-governance
artifacts, and fails if the checked-in artifacts are stale.

That turns prompt governance into a normal CI contract.
