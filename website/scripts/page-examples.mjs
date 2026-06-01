import fs from "node:fs";
import path from "node:path";
import { highlight } from "./highlight.mjs";

const EXAMPLES = [
  {
    file: "examples/refactor.loom",
    name: "Refactor brief",
    desc: "Imports a prompt module, takes a method / file / goal, and writes an <code>AGENTS.md</code> refactoring brief next to the target file. Ships with a deterministic test.",
    run: "loom run examples/refactor.loom PrepareRefactor \\\n  --method calculateTotalCost --file src/billing/costs.ts",
    generates: "src/billing/AGENTS.md + a trace",
    tutorial: ["Generate an AGENTS.md", "docs/tutorials/generate-agents-md.html"],
    tags: ["import", "fs.write", "test"],
  },
  {
    file: "examples/review.loom",
    name: "PR review brief",
    desc: "Generates agent-agnostic pull-request review instructions from a diff and a path, then writes <code>REVIEW.md</code>. The review prompt lives in its own importable module.",
    run: 'loom run examples/review.loom PrepareReview \\\n  --diff "$(git diff HEAD~1)" --path ".github/pull_request_template.md"',
    generates: ".github/REVIEW.md + a trace",
    tutorial: ["Reusable PR review", "docs/tutorials/reusable-pr-review.html"],
    tags: ["import", "fs.write", "test"],
  },
  {
    file: "examples/prompt-library.loom",
    name: "Shared prompt library",
    desc: "Composes <strong>two</strong> programs (<code>TeamGuide</code>, <code>OnboardingDoc</code>) from one shared prompt library, with an aliased import, a module-local helper prompt, and chained prompt outputs.",
    run: "loom run examples/prompt-library.loom TeamGuide --team Billing\nloom run examples/prompt-library.loom OnboardingDoc",
    generates: "GUIDE.md / ONBOARDING.md + a trace",
    tutorial: ["Build a prompt library", "docs/tutorials/build-a-prompt-library.html"],
    tags: ["compose", "alias", "multi-program"],
  },
];

export function examplesPage(repoRoot) {
  const cards = EXAMPLES.map((ex) => {
    const src = fs.readFileSync(path.join(repoRoot, ex.file), "utf8").trimEnd();
    const tags = ex.tags
      .map((t) => `<span class="badge"><code style="font-size:11px">${t}</code></span>`)
      .join("");
    return `<article class="window" style="margin-bottom:36px">
  <div class="window-bar">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="title"><span class="ext">${ex.file}</span></span>
  </div>
  <div style="padding:22px 24px 8px">
    <h3 style="margin:0 0 8px;font-size:20px">${ex.name}</h3>
    <p class="muted" style="margin:0 0 14px;font-size:15px">${ex.desc}</p>
    <div class="badges" style="margin:0 0 6px">${tags}</div>
  </div>
  <pre style="border-top:1px solid var(--border);border-radius:0"><code>${highlight(src, "loom")}</code></pre>
  <div style="padding:18px 24px 22px;border-top:1px solid var(--border)">
    <div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;font-weight:700">Run it</div>
    <div class="term" style="margin-bottom:14px">${highlight(ex.run, "bash")}</div>
    <p class="muted" style="margin:0;font-size:14px"><strong style="color:var(--fg)">Generates:</strong> <code>${ex.generates}</code> &nbsp;·&nbsp; <a href="${ex.tutorial[1]}">${ex.tutorial[0]} tutorial →</a></p>
  </div>
</article>`;
  }).join("\n");

  const body = `
<section class="docs-hero">
  <div class="container">
    <div class="kicker">Examples</div>
    <h1>Runnable <span class="thread-text">.loom</span> programs</h1>
    <p>Every example below ships in the <code>examples/</code> directory and is plain <code>.loom</code> source you can validate, test, compile, and run. Clone the repo to follow along.</p>
    <div class="badges">
      <span class="badge"><span class="g"></span> git clone &amp; <code style="font-size:11px">npm install</code></span>
      <a class="badge" href="https://github.com/glamcoder/loom-ai/tree/main/examples" target="_blank" rel="noopener">View on GitHub →</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container" style="max-width:860px">
    ${cards}

    <div class="cta" style="margin-top:24px">
      <h2 style="font-size:26px">Want the prompt modules too?</h2>
      <p style="font-size:16px">The examples import small, exported prompt modules from <code style="color:var(--thread-2)">examples/prompts/</code> — <code>refactor.loom</code>, <code>review.loom</code>, and a shared <code>common.loom</code> library. Browse the full catalog for what each file demonstrates.</p>
      <div class="cta-row">
        <a class="btn btn-primary" href="docs/examples-catalog.html">Full examples catalog →</a>
        <a class="btn btn-ghost" href="docs/getting-started.html">Getting started</a>
      </div>
    </div>
  </div>
</section>`;

  return body;
}
