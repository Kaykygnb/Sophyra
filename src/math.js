// Fórmulas em TeX → MathML. Cobre o subconjunto de uso comum em notas: frações, raízes, índices e expoentes,
// somatórios e integrais com limites, letras gregas, operadores, \text, \left/\right e matrizes simples.
// O navegador desenha MathML nativamente, então não precisa de biblioteca nem de rede.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const OPERATORS = {
  cdot: "⋅", times: "×", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼",
  infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔", mapsto: "↦",
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  partial: "∂", nabla: "∇", ldots: "…", cdots: "⋯", dots: "…", circ: "∘", ast: "∗", star: "⋆", angle: "∠", perp: "⊥", parallel: "∥", emptyset: "∅",
  prime: "′", degree: "°",
};

const BIG = { sum: "∑", prod: "∏", int: "∫", iint: "∬", oint: "∮", bigcup: "⋃", bigcap: "⋂", coprod: "∐" };
const LIMIT_OPS = new Set(["sum", "prod", "bigcup", "bigcap", "coprod", "lim", "max", "min", "sup", "inf"]);
const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "lim", "max", "min", "sup", "inf", "det", "gcd", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"]);
const SPACES = { ",": "0.17em", ";": "0.28em", ":": "0.22em", " ": "0.28em", quad: "1em", qquad: "2em", "!": "-0.17em" };
const STYLES = { mathbf: "bold", mathrm: "normal", mathit: "italic", mathbb: "double-struck", mathcal: "script", mathfrak: "fraktur", mathsf: "sans-serif", mathtt: "monospace" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tokenize(src) {
  const out = [];
  let i = 0;
  let space = false; // havia espaço antes do próximo símbolo (usado só para reconstruir texto cru, como em \text{ e })
  while (i < src.length) {
    const c = src[i];
    if (out.length && space) out[out.length - 1].after = true;
    space = false;
    if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      out.push({ t: "cmd", v: m[1] });
      i += m[0].length;
    } else if (/\s/.test(c)) {
      i++;
      space = true;
      continue;
    } else if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i));
      out.push({ t: "num", v: m[0] });
      i += m[0].length;
    } else if (/[A-Za-z]/.test(c)) {
      out.push({ t: "id", v: c });
      i++;
    } else {
      out.push({ t: "ch", v: c });
      i++;
    }
  }
  return out;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  isCh(v) {
    const t = this.peek();
    return !!t && t.t === "ch" && t.v === v;
  }

  // Lista de nós até o fim ou até um fechamento ("}" ou \right, \end, "&", "\\").
  parseList(stopAt = () => false) {
    const nodes = [];
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t.t === "ch" && t.v === "}") break;
      if (stopAt(t)) break;
      nodes.push(this.parseScripts());
    }
    return nodes;
  }

  parseScripts() {
    const op = this.peek();
    let base = this.parseAtom();
    let sub = null;
    let sup = null;
    while (this.peek() && this.peek().t === "ch" && (this.peek().v === "^" || this.peek().v === "_")) {
      const kind = this.next().v;
      const arg = this.parseAtom();
      if (kind === "^") sup = arg;
      else sub = arg;
    }
    if (!sub && !sup) return base;
    const limits = op && op.t === "cmd" && LIMIT_OPS.has(op.v);
    if (limits) {
      if (sub && sup) return `<munderover>${base}${sub}${sup}</munderover>`;
      return sub ? `<munder>${base}${sub}</munder>` : `<mover>${base}${sup}</mover>`;
    }
    if (sub && sup) return `<msubsup>${base}${sub}${sup}</msubsup>`;
    return sub ? `<msub>${base}${sub}</msub>` : `<msup>${base}${sup}</msup>`;
  }

  group() {
    // consome "{ ... }" (ou um único átomo, como no TeX) e devolve um <mrow>
    if (this.isCh("{")) {
      this.next();
      const inner = this.parseList();
      if (this.isCh("}")) this.next();
      return inner.length === 1 ? inner[0] : `<mrow>${inner.join("")}</mrow>`;
    }
    return this.parseAtom();
  }

  parseAtom() {
    const t = this.next();
    if (!t) return "<mrow></mrow>";
    if (t.t === "num") return `<mn>${esc(t.v)}</mn>`;
    if (t.t === "id") return `<mi>${esc(t.v)}</mi>`;
    if (t.t === "ch") {
      if (t.v === "{") {
        const inner = this.parseList();
        if (this.isCh("}")) this.next();
        return `<mrow>${inner.join("")}</mrow>`;
      }
      if (t.v === "}") return "";
      if ("()[]|".includes(t.v)) return `<mo stretchy="false">${esc(t.v)}</mo>`;
      if (t.v === "-") return "<mo>−</mo>";
      if (t.v === "'") return "<mo>′</mo>";
      if (t.v === "&" || t.v === "^" || t.v === "_") return "";
      return `<mo>${esc(t.v)}</mo>`;
    }
    return this.command(t.v);
  }

  command(name) {
    if (GREEK[name]) return `<mi>${GREEK[name]}</mi>`;
    if (OPERATORS[name]) return `<mo>${OPERATORS[name]}</mo>`;
    if (BIG[name]) return `<mo largeop="true">${BIG[name]}</mo>`;
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const a = this.group();
      const b = this.group();
      return `<mfrac>${a}${b}</mfrac>`;
    }
    if (name === "binom") {
      const a = this.group();
      const b = this.group();
      return `<mrow><mo>(</mo><mfrac linethickness="0">${a}${b}</mfrac><mo>)</mo></mrow>`;
    }
    if (name === "sqrt") {
      let index = null;
      if (this.isCh("[")) {
        this.next();
        const idx = this.parseList((t) => t.t === "ch" && t.v === "]");
        if (this.isCh("]")) this.next();
        index = `<mrow>${idx.join("")}</mrow>`;
      }
      const body = this.group();
      return index ? `<mroot>${body}${index}</mroot>` : `<msqrt>${body}</msqrt>`;
    }
    if (name === "substack") return this.stackRows();
    if (name === "xrightarrow" || name === "xleftarrow") {
      let below = null;
      if (this.isCh("[")) {
        this.next();
        const inner = this.parseList((t) => t.t === "ch" && t.v === "]");
        if (this.isCh("]")) this.next();
        below = `<mrow>${inner.join("")}</mrow>`;
      }
      const above = this.group();
      const arrow = `<mo stretchy="true">${name === "xrightarrow" ? "→" : "←"}</mo>`;
      return below ? `<munderover>${arrow}${below}${above}</munderover>` : `<mover>${arrow}${above}</mover>`;
    }
    if (name === "not") {
      const t = this.next();
      if (!t) return "";
      const NOT = { in: "∉", subset: "⊄", subseteq: "⊈", equiv: "≢", sim: "≁", approx: "≉", leq: "≰", geq: "≱", exists: "∄" };
      if (t.t === "ch" && t.v === "=") return "<mo>≠</mo>";
      if (t.t === "cmd" && NOT[t.v]) return `<mo>${NOT[t.v]}</mo>`;
      this.pos--;
      return "<mo>⧸</mo>";
    }
    if (name === "operatorname") return `<mi mathvariant="normal">${esc(this.rawGroup().replace(/\s+/g, ""))}</mi>`;
    if (name === "boldsymbol" || name === "bm") return `<mstyle mathvariant="bold-italic">${this.group()}</mstyle>`;
    if (name === "overbrace") return `<mover>${this.group()}<mo>⏞</mo></mover>`;
    if (name === "underbrace") return `<munder>${this.group()}<mo>⏟</mo></munder>`;
    if (name === "text" || name === "mbox" || name === "textrm") return `<mtext>${esc(this.rawGroup())}</mtext>`;
    if (STYLES[name]) {
      const body = this.group();
      return `<mstyle mathvariant="${STYLES[name]}">${body}</mstyle>`;
    }
    if (name === "overline" || name === "bar") return `<mover>${this.group()}<mo>―</mo></mover>`;
    if (name === "hat") return `<mover>${this.group()}<mo>^</mo></mover>`;
    if (name === "vec") return `<mover>${this.group()}<mo>→</mo></mover>`;
    if (name === "tilde") return `<mover>${this.group()}<mo>~</mo></mover>`;
    if (name === "dot") return `<mover>${this.group()}<mo>˙</mo></mover>`;
    if (name === "underline") return `<munder>${this.group()}<mo>_</mo></munder>`;
    if (name === "left" || name === "right") {
      const d = this.next();
      const v = d ? (d.t === "cmd" ? ({ "{": "{", "}": "}", lbrace: "{", rbrace: "}", langle: "⟨", rangle: "⟩", "|": "‖", lvert: "|", rvert: "|" }[d.v] || "") : d.v) : "";
      if (v === ".") return "";
      return v ? `<mo stretchy="true">${esc(v)}</mo>` : "";
    }
    if (name === "langle") return "<mo>⟨</mo>";
    if (name === "rangle") return "<mo>⟩</mo>";
    if (name === "lbrace" || name === "{") return "<mo>{</mo>";
    if (name === "rbrace" || name === "}") return "<mo>}</mo>";
    if (name === "|") return "<mo>‖</mo>";
    if (name === "begin") return this.environment();
    if (Object.prototype.hasOwnProperty.call(SPACES, name)) return `<mspace width="${SPACES[name]}"></mspace>`;
    if (FUNCTIONS.has(name)) return `<mi mathvariant="normal">${name}</mi>`;
    if (name === "%" || name === "$" || name === "#" || name === "_" || name === "&") return `<mo>${esc(name)}</mo>`;
    return `<mi>${esc(name)}</mi>`;
  }

  // {a \\ b \\ c}: linhas empilhadas em uma coluna (limites de somatório com várias condições)
  stackRows() {
    if (!this.isCh("{")) return this.group();
    this.next();
    const rows = [];
    let cell = [];
    const flush = () => {
      rows.push(`<mtr><mtd>${cell.join("")}</mtd></mtr>`);
      cell = [];
    };
    while (this.pos < this.tokens.length && !this.isCh("}")) {
      const t = this.peek();
      if (t.t === "cmd" && t.v === "\\") {
        this.next();
        flush();
        continue;
      }
      cell.push(this.parseScripts());
    }
    if (this.isCh("}")) this.next();
    if (cell.length) flush();
    return `<mtable>${rows.join("")}</mtable>`;
  }

  rawGroup() {
    // texto cru entre chaves, reconstruído a partir dos tokens
    let out = "";
    if (!this.isCh("{")) {
      const t = this.next();
      return t ? t.v : "";
    }
    this.next();
    let depth = 1;
    while (this.pos < this.tokens.length && depth > 0) {
      const t = this.next();
      if (t.t === "ch" && t.v === "{") depth++;
      else if (t.t === "ch" && t.v === "}") {
        depth--;
        if (depth === 0) break;
      }
      out += t.t === "cmd" ? "" : t.v;
      if (t.after) out += " ";
    }
    return out.replace(/\s+/g, " ").trim();
  }

  environment() {
    const name = this.rawGroup();
    const [open, close] = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], matrix: ["", ""], cases: ["{", ""] }[name] || ["", ""];
    if (name === "array") this.rawGroup(); // especificação das colunas ({cc}): o alinhamento é o padrão
    const rows = [[]];
    let cell = [];
    const flush = () => {
      rows[rows.length - 1].push(`<mtd>${cell.join("")}</mtd>`);
      cell = [];
    };
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t.t === "cmd" && t.v === "end") {
        this.next();
        this.rawGroup();
        break;
      }
      if (t.t === "ch" && t.v === "&") {
        this.next();
        flush();
        continue;
      }
      if (t.t === "cmd" && t.v === "\\") {
        this.next();
        flush();
        rows.push([]);
        continue;
      }
      cell.push(this.parseScripts());
    }
    if (cell.length || rows[rows.length - 1].length) flush();
    const align = name === "cases" ? ' columnalign="left"' : /^(aligned|align|split)\*?$/.test(name) ? ' columnalign="right left" columnspacing="0"' : name === "gathered" ? ' columnalign="center"' : "";
    const table = `<mtable${align}>${rows.filter((r) => r.length).map((r) => `<mtr>${r.join("")}</mtr>`).join("")}</mtable>`;
    return `<mrow>${open ? `<mo stretchy="true">${open}</mo>` : ""}${table}${close ? `<mo stretchy="true">${close}</mo>` : ""}</mrow>`;
  }
}

// Converte TeX em MathML. Se algo der errado, devolve o texto original num <code>, sem quebrar a nota.
export function texToMathML(src, { display = false } = {}) {
  const text = String(src).trim();
  if (!text) return "";
  try {
    const parser = new Parser(tokenize(text));
    const nodes = parser.parseList();
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ""}>${nodes.join("")}</math>`;
  } catch {
    return `<code>${esc(text)}</code>`;
  }
}

export function renderMath(src, { display = false } = {}) {
  const ml = texToMathML(src, { display });
  const label = esc(String(src).trim()).replace(/"/g, "&quot;");
  return display
    ? `<div class="math-block" role="math" aria-label="${label}">${ml}</div>`
    : `<span class="math" role="math" aria-label="${label}">${ml}</span>`;
}
