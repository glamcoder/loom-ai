/**
 * A tiny, dependency-free syntax highlighter for the Loom AI language (and the
 * HCL-ish `hcl` fences the docs use), plus passable highlighting for bash,
 * json/jsonc and diff. It emits <span class="tok-*"> wrapped HTML.
 *
 * This is intentionally small and forgiving: it is a presentation aid, not a
 * parser. The real lexer/parser lives in ../../src/language.
 */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LOOM_KEYWORDS = new Set([
  "module",
  "import",
  "as",
  "export",
  "prompt",
  "program",
  "step",
  "test",
  "param",
  "output",
  "use",
  "with",
  "from",
  "returns",
  "effects",
  "type",
  "default",
  "required",
  "version",
  "template",
  "expect",
  "writes",
  "file",
  "contains",
  "program",
]);

const LOOM_TYPES = new Set([
  "Text",
  "String",
  "Symbol",
  "Path",
  "Markdown",
  "Boolean",
  "Integer",
  "Number",
  "Artifact",
]);

const LOOM_BUILTINS = new Set([
  "fs",
  "write",
  "dirname",
  "basename",
  "prompt",
  "render",
  "artifact",
  "emit",
]);

/**
 * Highlight Loom AI / HCL source. Handles:
 *  - # line comments
 *  - triple-quoted templates """ ... """ with {{ interpolation }}
 *  - double-quoted strings
 *  - keywords, types, numbers, booleans
 */
function highlightLoom(src) {
  let out = "";
  let i = 0;
  const n = src.length;

  const isIdentChar = (c) => /[A-Za-z0-9_.]/.test(c);

  while (i < n) {
    const c = src[i];

    // line comment
    if (c === "#") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out += `<span class="tok-comment">${esc(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // triple-quoted template
    if (src.startsWith('"""', i)) {
      let j = i + 3;
      while (j < n && !src.startsWith('"""', j)) j++;
      const end = Math.min(n, j + 3);
      const body = src.slice(i, end);
      // highlight {{ ... }} interpolation inside the string
      let rendered = "";
      let k = 0;
      while (k < body.length) {
        const open = body.indexOf("{{", k);
        if (open === -1) {
          rendered += esc(body.slice(k));
          break;
        }
        rendered += esc(body.slice(k, open));
        const close = body.indexOf("}}", open);
        if (close === -1) {
          rendered += esc(body.slice(open));
          break;
        }
        rendered += `<span class="tok-interp">${esc(body.slice(open, close + 2))}</span>`;
        k = close + 2;
      }
      out += `<span class="tok-str">${rendered}</span>`;
      i = end;
      continue;
    }

    // double-quoted string
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      out += `<span class="tok-str">${esc(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // number
    if (/[0-9]/.test(c) && !isIdentChar(src[i - 1] || "")) {
      let j = i;
      while (j < n && /[0-9._]/.test(src[j])) j++;
      out += `<span class="tok-num">${esc(src.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // identifier / keyword / type
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      const head = word.split(".")[0];

      if (word === "true" || word === "false") {
        out += `<span class="tok-num">${esc(word)}</span>`;
      } else if (LOOM_TYPES.has(word)) {
        out += `<span class="tok-type">${esc(word)}</span>`;
      } else if (LOOM_KEYWORDS.has(word)) {
        out += `<span class="tok-kw">${esc(word)}</span>`;
      } else if (
        word.startsWith("param.") ||
        word.startsWith("step.") ||
        head === "param" ||
        head === "step"
      ) {
        out += `<span class="tok-var">${esc(word)}</span>`;
      } else if (word.includes(".") || LOOM_BUILTINS.has(head)) {
        out += `<span class="tok-fn">${esc(word)}</span>`;
      } else {
        out += esc(word);
      }
      i = j;
      continue;
    }

    // punctuation we want to dim
    if ("{}[]()=+,".includes(c)) {
      out += `<span class="tok-punc">${esc(c)}</span>`;
      i++;
      continue;
    }

    out += esc(c);
    i++;
  }
  return out;
}

function highlightBash(src) {
  const lines = src.split("\n").map((line) => {
    // comment
    const cidx = line.indexOf("#");
    let codePart = line;
    let comment = "";
    // naive: only treat # as comment if not inside obvious url; good enough
    if (cidx !== -1 && !line.slice(0, cidx).includes("://")) {
      codePart = line.slice(0, cidx);
      comment = line.slice(cidx);
    }
    let html = esc(codePart);
    // strings
    html = html.replace(
      /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|"[^"]*"|'[^']*')/g,
      (m) => `<span class="tok-str">${m}</span>`,
    );
    // leading command word(s): loom, npm, git, node, cd, cat, rm, tar...
    html = html.replace(
      /^(\s*)(loom|npm|npx|git|node|cd|cat|rm|tar|curl|echo|mkdir|export)\b/,
      (m, ws, cmd) => `${ws}<span class="tok-kw">${cmd}</span>`,
    );
    // subcommands / flags
    html = html.replace(
      /(\s)(--?[A-Za-z][\w-]*)/g,
      (m, ws, flag) => `${ws}<span class="tok-attr">${flag}</span>`,
    );
    if (comment) html += `<span class="tok-comment">${esc(comment)}</span>`;
    return html;
  });
  return lines.join("\n");
}

function highlightJson(src) {
  let html = esc(src);
  // comments (jsonc)
  html = html.replace(/(\/\/[^\n]*)/g, (m) => `<span class="tok-comment">${m}</span>`);
  html = html.replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)/g,
    (m, key, colon) => `<span class="tok-attr">${key}</span>${colon}`,
  );
  html = html.replace(
    /:(\s*)(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g,
    (m, ws, val) => `:${ws}<span class="tok-str">${val}</span>`,
  );
  html = html.replace(/\b(true|false|null)\b/g, (m) => `<span class="tok-num">${m}</span>`);
  html = html.replace(
    /([:[,]\s*)(-?\d+(?:\.\d+)?)/g,
    (m, pre, num) => `${pre}<span class="tok-num">${num}</span>`,
  );
  return html;
}

function highlightDiff(src) {
  return src
    .split("\n")
    .map((line) => {
      const e = esc(line);
      if (line.startsWith("+")) return `<span class="tok-str">${e}</span>`;
      if (line.startsWith("-")) return `<span class="tok-comment">${e}</span>`;
      if (line.startsWith("@")) return `<span class="tok-fn">${e}</span>`;
      return e;
    })
    .join("\n");
}

export function highlight(src, lang) {
  const l = (lang || "").toLowerCase();
  if (l === "loom" || l === "hcl" || l === "tf") return highlightLoom(src);
  if (l === "bash" || l === "sh" || l === "shell" || l === "console") return highlightBash(src);
  if (l === "json" || l === "jsonc") return highlightJson(src);
  if (l === "diff") return highlightDiff(src);
  // markdown / text / unknown
  return esc(src);
}
