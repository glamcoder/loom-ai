# AtlasCart AI Agent Handbook

Service: `checkout-risk-api`
Owner: Revenue Platform
Language: JavaScript
Primary entrypoint: `src/checkout.js`
Required verification: `npm test`

## Operating rules

- Preserve checkout decisions unless the task explicitly changes risk policy.
- Treat checkout risk scoring and payment authorization as a regulated surface.
- Keep risk reasons explainable; never collapse them into opaque scores.
- Add or update tests for every behavior change.
- Regenerate Loom-managed AI guidance before opening a PR.

## Agent scope

Agents may edit implementation and tests, but must not bypass verification or
remove risk explanations from customer-impacting decisions.
