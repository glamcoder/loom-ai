import { highlight } from "./highlight.mjs";
import { SITE } from "./layout.mjs";

const win = (title, lang, code, extra = "") =>
  `<div class="window">
  <div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span class="title">${title}</span>${extra}</div>
  <pre><code>${highlight(code, lang)}</code></pre>
</div>`;

const HELLO = `module "workflows.agents" {
  version = "0.1.0"
}

import "./prompts/common.loom" as common

export program "GenerateAgentsFile" {
  param "area" {
    type     = Text
    required = true
  }

  effects = ["fs.write"]

  step "render" {
    use  = common.AgentBrief
    with = { area = param.area }
  }

  step "write" {
    use  = fs.write
    with = {
      path    = "AGENTS.md"
      content = step.render.output
    }
  }

  output "instructions" {
    type = Markdown
    from = step.render.output
  }
}

test "writes_agents_file_for_area" {
  program = GenerateAgentsFile
  with    = { area = "billing" }

  expect {
    output "instructions" contains "billing"
    writes file "AGENTS.md"
    effects = ["fs.write"]
  }
}`;

const TAB_VALIDATE = `$ loom validate examples/refactor.loom
module: workflows.refactor
imports:
  refactor -> prompts.refactor
exported programs:
  PrepareRefactor
tests:
  prepare_refactor_renders_agent_file`;

const TAB_RUN = `$ loom run examples/refactor.loom PrepareRefactor \\
    --method calculateTotalCost --file src/billing/costs.ts

Files written:
  src/billing/AGENTS.md
Trace: .loom/runs/1780148539674-4y0ddh/trace.json`;

const TAB_TEST = `$ loom test examples/refactor.loom
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed`;

const PROBLEMS = [
  ["Copy-pasted prompts", "scattered across wikis, Slack, and people's heads."],
  [
    "Manual placeholder swaps",
    "&ldquo;remember to substitute the file name&rdquo; — every single time.",
  ],
  [
    "Duplicated agent instructions",
    "AGENTS.md, Claude, Copilot, and Cursor files drift out of sync across repos.",
  ],
  ["No import / export boundary", "no clean way to share prompt logic between projects."],
  ["No deterministic tests", "for the workflows that generate your prompts."],
  ["No trace", "of what generated a given artifact, or from which inputs."],
];

const FEATURES = [
  {
    weft: false,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>`,
    title: "Prompts as code",
    body: "Write declarative <code>.loom</code> programs with typed params, modules, and imports. Diff them, review them, and reuse them across every repo.",
  },
  {
    weft: false,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    title: "Deterministic by design",
    body: "Same inputs, same files, same trace — every time. v0 makes <strong>no LLM calls and no network calls</strong>, so your build is reproducible and your tests never flake.",
  },
  {
    weft: true,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    title: "Tests in CI",
    body: "Declare <code>expect</code> assertions on outputs, files, and effects. Tests run in an in-memory filesystem and exit non-zero on failure — drop them straight into CI.",
  },
  {
    weft: false,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v6H4zM4 14h16v6H4z"/><path d="M8 7h.01M8 17h.01"/></svg>`,
    title: "Explicit effects",
    body: "Programs must declare what they touch. <code>fs.write</code> is opt-in; render and emit are pure. Side effects stay auditable, and the compiler enforces it.",
  },
  {
    weft: true,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>`,
    title: "Provider-neutral IR",
    body: "Compile to a plain-JSON Program IR — no vendor, no model, no network. It's the seam that lets future versions add LLM providers without changing the language.",
  },
  {
    weft: false,
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6"/></svg>`,
    title: "Traceable artifacts",
    body: "Every run writes a trace recording the program, resolved params, each step's status, and the files written — so you always know what produced an artifact.",
  },
];

const STEPS = [
  [
    "01",
    "loom <b>validate</b>",
    "Parse, resolve imports, and run type / effect / reference checks. Writes nothing — a fast CI gate.",
  ],
  [
    "02",
    "loom <b>compile</b>",
    "Lower a program to its provider-neutral Program IR and print it as JSON. Read-only; inspect the plan before you run.",
  ],
  [
    "03",
    "loom <b>run</b>",
    "Render prompts, write the files steps declare, and record a trace under .loom/runs/&lt;run-id&gt;/.",
  ],
  [
    "04",
    "loom <b>test</b>",
    "Run every test block in memory with output, file, and effect assertions. Exits non-zero on failure.",
  ],
];

const CMP_ROWS = [
  ["Calls an LLM (v0)", { loom: "no", baml: "yes", lg: "yes", pf: "yes", make: "no" }],
  ["Deterministic / reproducible", { loom: "yes", baml: "no", lg: "no", pf: "no", make: "yes" }],
  [
    "Prompts as version-controlled code",
    { loom: "yes", baml: "yes", lg: "no", pf: "no", make: "no" },
  ],
  ["Import / export across repos", { loom: "yes", baml: "yes", lg: "no", pf: "no", make: "no" }],
  ["Built-in tests for the workflow", { loom: "yes", baml: "no", lg: "no", pf: "yes", make: "no" }],
  ["Run trace per execution", { loom: "yes", baml: "no", lg: "no", pf: "no", make: "no" }],
  ["Generates file artifacts", { loom: "yes", baml: "no", lg: "no", pf: "no", make: "yes" }],
];

function cmpCell(v) {
  if (v === "yes") return `<td class="yes">✓</td>`;
  if (v === "no") return `<td class="no">—</td>`;
  return `<td>${v}</td>`;
}

export function homePage() {
  const problemCards = PROBLEMS.map(
    ([t, d]) =>
      `<div class="problem-card"><span class="x">✕</span><p><strong>${t}</strong> — ${d}</p></div>`,
  ).join("\n");

  const featureCards = FEATURES.map(
    (f) =>
      `<div class="feature${f.weft ? " weft" : ""}"><div class="ico">${f.icon}</div><h3>${f.title}</h3><p>${f.body}</p></div>`,
  ).join("\n");

  const stepCards = STEPS.map(
    ([n, cmd, p]) =>
      `<div class="step"><span class="num">${n}</span><div class="cmd">${cmd}</div><p>${p}</p></div>`,
  ).join("\n");

  const cmpBody = CMP_ROWS.map(
    ([feat, v], idx) =>
      `<tr${idx === 1 || idx === 5 ? ' class="highlight"' : ""}><td class="feat">${feat}</td>${cmpCell(v.loom)}${cmpCell(v.baml)}${cmpCell(v.lg)}${cmpCell(v.pf)}${cmpCell(v.make)}</tr>`,
  ).join("\n");

  const codeTabs = `<div class="window" data-tabs>
  <div class="window-bar">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="title">terminal</span>
    <span class="tabs">
      <button class="active">validate</button>
      <button>run</button>
      <button>test</button>
    </span>
  </div>
  <pre class="tab-panel active"><code>${highlight(TAB_VALIDATE, "bash")}</code></pre>
  <pre class="tab-panel"><code>${highlight(TAB_RUN, "bash")}</code></pre>
  <pre class="tab-panel"><code>${highlight(TAB_TEST, "bash")}</code></pre>
</div>`;

  return `
<section class="hero">
  <div class="container">
    <div class="hero-grid">
      <div>
        <span class="eyebrow"><span class="dot"></span> v${SITE.version} · deterministic developer preview</span>
        <h1>Make for <span class="thread-text">AI workflows</span>.</h1>
        <p class="lede">Loom AI is a Git-native workflow language for packaging reusable AI work as code. It compiles parameterized <code>.loom</code> programs into agent-ready artifacts, traces, and deterministic tests.</p>
        <p class="subline">Stop copy-pasting prompts and hand-maintaining <code>AGENTS.md</code> across repos. Write one source of truth, compile it, test it in CI, and trace exactly what produced every file. v0 makes no LLM calls and no network calls.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="docs/getting-started.html">Get started <span aria-hidden="true">→</span></a>
          <a class="btn btn-ghost" href="${SITE.repo}" target="_blank" rel="noopener">Star on GitHub</a>
        </div>
        <div class="install-line">
          <span><span class="prompt">$</span> npm install -g loom-ai</span>
          <button data-copy="npm install -g loom-ai">copy</button>
        </div>
      </div>
      <div>
        ${win("hello.loom", "loom", HELLO)}
      </div>
    </div>
  </div>
</section>

<section class="section-tight">
  <div class="container center">
    <div class="badges" style="justify-content:center">
      <span class="badge"><span class="g"></span> Apache-2.0</span>
      <span class="badge"><span class="g"></span> Zero LLM / network calls in v0</span>
      <span class="badge"><span class="g"></span> Node ≥ 20</span>
      <span class="badge"><span class="g"></span> Two dependencies</span>
      <span class="badge"><span class="g"></span> TypeScript</span>
    </div>
  </div>
</section>

<hr class="divider-rule" />

<section class="section">
  <div class="container">
    <div class="section-head">
      <div class="kicker">The problem</div>
      <h2>Feeding instructions to AI agents is a mess</h2>
      <p>Prompts and agent instructions are some of the highest-leverage text in your codebase. Most teams still manage them like sticky notes.</p>
    </div>
    <div class="problem-grid">
      ${problemCards}
    </div>
    <p class="center muted" style="margin-top:32px;max-width:62ch;margin-left:auto;margin-right:auto">
      Loom AI treats this as a <strong style="color:var(--fg)">build problem</strong>. You write declarative programs, compile them into artifacts, and get determinism, imports, tests, and traces for free.
    </p>
  </div>
</section>

<section class="section" style="background:var(--bg-soft);border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)">
  <div class="container">
    <div class="section-head">
      <div class="kicker">The workflow</div>
      <h2>Four commands, one source of truth</h2>
      <p>From a <code style="color:var(--thread-2)">.loom</code> file to tested, traceable artifacts — the whole loop runs locally and deterministically.</p>
    </div>
    <div class="steps">
      ${stepCards}
    </div>
    <div style="max-width:760px;margin:40px auto 0">
      ${codeTabs}
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div class="kicker">Why Loom AI</div>
      <h2>The build layer beneath your AI tooling</h2>
      <p>Everything you'd expect from a real toolchain — types, modules, tests, traces — applied to the prompts and artifacts your agents consume.</p>
    </div>
    <div class="features">
      ${featureCards}
    </div>
  </div>
</section>

<section class="section" style="background:var(--bg-soft);border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)">
  <div class="container">
    <div class="split">
      <div>
        <div class="kicker">In practice</div>
        <h3>Generate <code style="color:var(--thread-2)">AGENTS.md</code> instead of hand-maintaining it</h3>
        <p>Use Loom AI wherever AI-facing files should be generated, not edited by hand. One shared prompt plus repo-specific params produces every flavor of agent instruction you need — and a test proves it stays correct.</p>
        <ul>
          <li>Generate <code>AGENTS.md</code>, Copilot, Cursor, and Claude instructions from the same source.</li>
          <li>Generate PR-review checklists for sensitive areas like auth, billing, or migrations.</li>
          <li>Regenerate committed artifacts in CI and fail the build if they drift.</li>
          <li>Keep a trace of the exact inputs that produced each artifact.</li>
        </ul>
        <a class="btn btn-ghost btn-sm" href="docs/tutorials/generate-agents-md.html" style="margin-top:8px">Read the tutorial →</a>
      </div>
      <div class="split-media">
        ${win(
          "src/billing/AGENTS.md",
          "loom",
          `# Refactor method \`calculateTotalCost\`

You are refactoring \`calculateTotalCost\`
in \`src/billing/costs.ts\`.

## Goal

Improve readability without changing behavior.

## Scope

- Refactor only \`calculateTotalCost\` and the
  smallest necessary surrounding code.
- Preserve external behavior.
- Preserve the public API.
- Keep the diff small and reviewable.`.replace(/`/g, "`"),
        )}
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="split reverse">
      <div>
        <div class="kicker">Honest positioning</div>
        <h3>Not an agent runtime. A toolchain for the inputs.</h3>
        <p>Loom AI doesn't replace your agent loop, your eval harness, or your app's model-call site. It gives them clean, versioned, tested inputs — the place reusable prompt logic lives as code.</p>
        <p class="muted" style="font-size:14.5px">v0 is deliberately small and deterministic. It's <strong>not</strong> LangGraph, <strong>not</strong> BAML, <strong>not</strong> promptfoo, and <strong>not</strong> an LLM wrapper — yet. See the full, fair breakdown.</p>
        <a class="btn btn-ghost btn-sm" href="docs/comparisons.html" style="margin-top:8px">See comparisons →</a>
      </div>
      <div class="split-media">
        <div class="cmp-wrap">
          <table class="cmp">
            <thead>
              <tr><th>Capability</th><th>Loom AI</th><th>BAML</th><th>LangGraph</th><th>promptfoo</th><th>Make</th></tr>
            </thead>
            <tbody>
              ${cmpBody}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta">
      <div class="kicker">Ready in 60 seconds</div>
      <h2>Package your AI work as code.</h2>
      <p>Install the CLI, point it at a <code style="color:var(--thread-2)">.loom</code> file, and generate your first tested, traceable artifact in under a minute.</p>
      <div class="install-line" style="margin:0 auto 26px;display:inline-flex">
        <span><span class="prompt">$</span> npm install -g loom-ai</span>
        <button data-copy="npm install -g loom-ai">copy</button>
      </div>
      <div class="cta-row">
        <a class="btn btn-primary" href="docs/getting-started.html">Read the 5-minute quickstart →</a>
        <a class="btn btn-ghost" href="examples.html">Browse examples</a>
      </div>
    </div>
  </div>
</section>
`;
}
