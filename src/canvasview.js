// Tela do Canvas: quadro infinito com notas, textos, links, grupos, formas e desenhos, ligados por setas.
// Ferramentas flutuantes no alto (selecionar, mover a vista, texto, nota, link, grupo, formas, seta, linha, lápis), uma barra de
// estilo que aparece junto da seleção (cor, preenchimento, tracejado, copiar, ordem, excluir), zoom no canto e desfazer/refazer.
// Arrastar o fundo desloca, a roda aproxima, os pontos nas bordas ligam cartões e duplo clique edita o texto.
// O arquivo .canvas guarda só os cartões e as setas; o viewport é estado do espaço de trabalho (onViewport).

import {
  parseCanvas, serializeCanvas, addNode, addLineNode, addEdge, removeNode, removeEdge, moveNode, resizeNode, findNode, edgePath,
  normalizeViewport, zoomAt, panBy, toWorld, toScreen, fitViewport, SIDES, anchor, normalizeRect, simplifyPoints, arrowHead,
  bringToFront, sendToBack, setLineEndpoint, nearestSide, duplicateNode, styleNode, smoothPath, History, LINE_SHAPES, SHAPE_SIZE, DEFAULT_SIZE,
  addTableNode, tableHeight, newId, autoSides,
} from "./canvas.js";
import { tablesOf } from "./dbdiagram.js";
import { linksAmong, settleGraph, placeOnCanvas, separateCards } from "./canvasgraph.js";
const GRAPH_LIMIT = 200; // acima disso o grafo fica pesado para desenhar de uma vez
import { openTableEditor } from "./tableeditor.js";
const TYPE_SHORT = { texto: "texto", inteiro: "inteiro", decimal: "decimal", data: "data", logico: "sim/não", longo: "texto longo" };
import { readImage, displaySize, isImageFile } from "./canvasimage.js";
import { renderMarkdown, renderInline, escapeHtml, parseFrontmatter } from "./markdown.js";
import { stripExt, baseName } from "./vault.js";
import { icon } from "./icons.js";
import { openAtEvent } from "./contextmenu.js";

const COLORS = { 1: "var(--danger)", 2: "var(--warning)", 3: "#c9a400", 4: "var(--success)", 5: "var(--info)", 6: "#7a4fa8" };
const COLOR_NAMES = { "": "Padrão", 1: "Vermelho", 2: "Laranja", 3: "Amarelo", 4: "Verde", 5: "Azul", 6: "Roxo" };
const colorOf = (c) => (c ? COLORS[c] || (/^#[0-9a-f]{3,8}$/i.test(c) ? c : null) : null);

const TOOLS = [
  { id: "select", icon: "cursor", name: "Selecionar", key: "v", hint: "Arraste o fundo para mover a vista · clique num cartão para selecionar" },
  { id: "hand", icon: "hand", name: "Mover a vista", key: "h", hint: "Arraste para mover o quadro (ou segure Espaço)" },
  null,
  { id: "text", icon: "type", name: "Texto", key: "t", hint: "Clique ou arraste para criar um cartão de texto" },
  { id: "note", icon: "file-text", name: "Nota da biblioteca", key: "n", hint: "Clique onde a nota deve entrar e escolha qual" },
  { id: "link", icon: "link", name: "Link", key: "k", hint: "Clique onde o link deve entrar" },
  { id: "table", icon: "columns", name: "Tabela", key: "b", hint: "Clique onde a tabela deve entrar (para diagramas de banco de dados)" },
  { id: "group", icon: "layers", name: "Grupo", key: "g", hint: "Arraste para desenhar a área do grupo" },
  null,
  { id: "rect", icon: "square", name: "Retângulo", key: "r", hint: "Arraste para desenhar um retângulo" },
  { id: "ellipse", icon: "circle", name: "Elipse", key: "o", hint: "Arraste para desenhar uma elipse" },
  { id: "diamond", icon: "diamond", name: "Losango", key: "d", hint: "Arraste para desenhar um losango" },
  { id: "triangle", icon: "triangle", name: "Triângulo", key: "y", hint: "Arraste para desenhar um triângulo" },
  { id: "sticky", icon: "sticky", name: "Nota adesiva", key: "s", hint: "Arraste para criar uma nota adesiva" },
  { id: "image", icon: "image", name: "Imagem", key: "i", hint: "Escolha imagens do computador (ou arraste arquivos até o quadro)" },
  null,
  { id: "line", icon: "minus", name: "Linha", key: "l", hint: "Arraste para desenhar uma linha (Shift trava o ângulo)" },
  { id: "draw", icon: "pencil", name: "Lápis", key: "p", hint: "Segure e arraste para desenhar à mão livre (Esc para sair)" },
  { id: "eraser", icon: "eraser", name: "Borracha", key: "e", hint: "Passe sobre desenhos e linhas para apagá-los" },
];
const TOOL_BY_KEY = Object.fromEntries(TOOLS.filter(Boolean).map((t) => [t.key, t.id]));
const BOX_TOOLS = new Set(["text", "note", "link", "group", "rect", "ellipse", "diamond", "triangle", "sticky"]);
const LINE_TOOLS = new Set(["line"]);
const PEN_TOOLS = new Set(["rect", "ellipse", "diamond", "triangle", "sticky", "line", "draw"]);
const STROKE_PX = { 1: 1.5, 2: 2.5, 4: 4.5 };
const STROKE_NAMES = { 1: "Traço fino", 2: "Traço médio", 4: "Traço grosso" };
const CREATE_TOOLS = new Set([...BOX_TOOLS, ...LINE_TOOLS, "draw", "eraser"]);
// Endereços soltos (https://…) no texto viram links, como nos outros lugares do app.
export function autolink(text) {
  return String(text ?? "").replace(/(^|[\s(])(https?:\/\/[^\s)<>\]]+)/g, (m, pre, raw) => {
    if (pre === "(") return m;
    const url = raw.replace(/[.,;:!?]+$/, "");
    return `${pre}[${url}](${url})${raw.slice(url.length)}`;
  });
}
const isLineNode = (n) => !!n?.shape && LINE_SHAPES.includes(n.shape);

export function mountCanvas(host, { vault, path, viewport, onViewport = () => {}, openNote = () => {}, fileMenu = null, followLink = null, onTag = null, pickNote = async () => null, toast = () => {}, diagram = null }) {
  const parsed = parseCanvas(vault.read(path));
  let data = parsed.data;
  let vp = viewport ? normalizeViewport(viewport) : null;
  let selected = null; // { kind: "node" | "edge", id }
  let editing = null;
  let drag = null;
  let tool = "select";
  let spaceDown = false;
  const pen = { color: null, stroke: 2 }; // cor e espessura das próximas formas, linhas e traços
  let saveTimer = null;
  let vpTimer = null;
  let dirty = false; // só regrava o arquivo depois de uma edição: um .canvas ilegível não é sobrescrito por abrir
  const hist = new History(serializeCanvas(data));

  host.innerHTML = `
    <div class="cv" data-canvas>
      ${parsed.error ? `<div class="cv-banner" role="alert">${icon("alert", 16)}<span>Este arquivo .canvas não pôde ser lido (${escapeHtml(parsed.error)}). Mostrando um quadro vazio — o arquivo só muda se você editar aqui.</span></div>` : ""}
      ${parsed.dropped ? `<div class="cv-banner" role="status">${icon("info", 16)}<span>${parsed.dropped} item(ns) inválido(s) foram ignorados ao abrir.</span></div>` : ""}
      <div class="cv-surface" tabindex="0" aria-label="Quadro do canvas" data-tool="select">
        <div class="cv-world"><svg class="cv-edges" width="1" height="1"></svg><div class="cv-nodes"></div></div>
        <div class="cv-empty" hidden><p><strong>Quadro vazio.</strong></p><p>Escolha uma ferramenta lá em cima, arraste imagens até aqui ou dê um duplo clique para escrever. Puxe os pontos das bordas de um cartão para ligá-lo a outro.</p></div>
        <div class="cv-ui cv-tools" role="toolbar" aria-label="Ferramentas do canvas">
          ${TOOLS.map((t) => (t ? `<button class="cv-tool" data-tool="${t.id}" aria-pressed="${t.id === "select"}" title="${t.name} (${t.key.toUpperCase()})" aria-label="${t.name}">${icon(t.icon, 18)}</button>` : `<span class="cv-sep" role="separator"></span>`)).join("")}
        </div>
        <div class="cv-ui cv-style" role="toolbar" aria-label="Estilo da seleção" hidden></div>
        <div class="cv-ui cv-history" role="group" aria-label="Desfazer e refazer">
          <button class="cv-tool" data-act="undo" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled>${icon("undo", 18)}</button>
          <button class="cv-tool" data-act="redo" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled>${icon("redo", 18)}</button>
        </div>
        <div class="cv-ui cv-zoom" role="group" aria-label="Zoom">
          <button class="cv-tool" data-act="zoom-out" title="Afastar (−)" aria-label="Afastar">−</button>
          <button class="cv-zoom-label" data-act="zoom-reset" title="Voltar a 100%" aria-label="Zoom 100%" id="cv-zoom">100%</button>
          <button class="cv-tool" data-act="zoom-in" title="Aproximar (+)" aria-label="Aproximar">+</button>
          <span class="cv-sep" role="separator"></span>
          <button class="cv-tool" data-act="fit" title="Enquadrar tudo (0)" aria-label="Enquadrar tudo">${icon("maximize", 18)}</button>
        </div>
        <div class="cv-hint" id="cv-hint" aria-live="polite"></div>
        <input type="file" class="cv-file-input" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      </div>
    </div>`;
  const root = host.querySelector(".cv");
  const surface = root.querySelector(".cv-surface");
  const world = root.querySelector(".cv-world");
  const svg = root.querySelector(".cv-edges");
  const layer = root.querySelector(".cv-nodes");
  const zoomLabel = root.querySelector("#cv-zoom");
  const emptyBox = root.querySelector(".cv-empty");
  const styleBar = root.querySelector(".cv-style");
  const hint = root.querySelector("#cv-hint");
  const undoBtn = root.querySelector('[data-act="undo"]');
  const redoBtn = root.querySelector('[data-act="redo"]');
  const fileInput = root.querySelector(".cv-file-input");

  const size = () => ({ w: surface.clientWidth || 800, h: surface.clientHeight || 500 });
  const esc = escapeHtml;

  // --- Vista e gravação -----------------------------------------------------------------------------------------------

  function applyViewport(notify = true) {
    world.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
    surface.style.backgroundSize = `${24 * vp.zoom}px ${24 * vp.zoom}px`;
    surface.style.backgroundPosition = `${vp.x}px ${vp.y}px`;
    zoomLabel.textContent = `${Math.round(vp.zoom * 100)}%`;
    placeStyleBar();
    if (notify) {
      clearTimeout(vpTimer);
      vpTimer = setTimeout(() => onViewport({ ...vp }), 200);
    }
  }

  function writeNow() {
    clearTimeout(saveTimer);
    if (dirty && vault.has(path)) {
      try {
        vault.write(path, serializeCanvas(data));
      } catch {
        toast("Não coube no armazenamento do navegador: use imagens menores ou menos imagens.", "error");
        return;
      }
    }
    dirty = false;
  }

  function save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 250);
  }

  // Marca um ponto do histórico (depois de cada ação concluída) e agenda a gravação.
  function commit() {
    hist.push(serializeCanvas(data));
    updateHistoryUi();
    save();
  }

  function updateHistoryUi() {
    undoBtn.disabled = !hist.canUndo;
    redoBtn.disabled = !hist.canRedo;
  }

  function restore(state) {
    if (state === null) return;
    data = parseCanvas(state).data;
    if (selected && !(selected.kind === "node" ? findNode(data, selected.id) : data.edges.find((e) => e.id === selected.id))) selected = null;
    editing = null;
    renderAll();
    updateHistoryUi();
    save();
  }

  // --- Desenho dos cartões -----------------------------------------------------------------------------------------------

  function nodeBody(n) {
    if (n.type === "text") return `<div class="cv-text note-body">${renderMarkdown(autolink(n.text), (t) => ({ exists: !!vault.resolveLink(t, path) }))}</div>`;
    if (n.type === "file") {
      const f = vault.get(n.file || "");
      if (!f) return `<div class="cv-file missing">${icon("link-broken", 16)}<span>${esc(n.file || "arquivo")}</span><small>O arquivo não existe mais.</small></div>`;
      if (/\.canvas$/i.test(f.path)) return `<div class="cv-file cv-canvas-link"><div class="cv-file-head">${icon("layers", 15)}<strong>${esc(stripExt(baseName(f.path)))}</strong><small>Canvas</small></div><button class="cv-open" data-open="${esc(f.path)}">Abrir canvas</button></div>`;
      const body = /\.md$/i.test(f.path) ? parseFrontmatter(f.content).body : f.content;
      const html = /\.md$/i.test(f.path) ? renderMarkdown(body.slice(0, 1200), () => ({ exists: true })) : `<pre>${esc(body.slice(0, 600))}</pre>`;
      return `<div class="cv-file"><div class="cv-file-head">${icon("file-text", 15)}<strong>${esc(stripExt(baseName(f.path)))}</strong><button class="cv-open" data-open="${esc(f.path)}" aria-label="Abrir ${esc(stripExt(baseName(f.path)))}">${icon("external-link", 14)}</button></div><div class="cv-file-body note-body">${html}</div></div>`;
    }
    if (n.type === "table") {
      const fields = Array.isArray(n.fields) ? n.fields : [];
      const rows = fields.length
        ? fields.map((f) => `<div class="cv-table-row${f.pk ? " pk" : ""}"><span class="cv-fname">${f.pk ? icon("check", 12) : ""}${esc(f.name || "(sem nome)")}</span><small>${esc(TYPE_SHORT[f.type] || f.type)}${f.nn ? " · obrigatório" : ""}</small></div>`).join("")
        : `<div class="cv-table-row empty">Dê duplo clique para adicionar campos</div>`;
      return `<div class="cv-table"><div class="cv-table-head">${icon("columns", 15)}<strong>${esc(n.name || "Tabela")}</strong></div>${rows}</div>`;
    }
    if (n.type === "link") {
      let host_ = n.url || "";
      try {
        host_ = new URL(n.url).hostname;
      } catch {
        /* mantém o texto */
      }
      return `<div class="cv-link">${icon("link", 16)}<a href="${esc(n.url || "#")}" target="_blank" rel="noopener">${esc(host_ || "link")}</a><small>${esc(n.url || "")}</small></div>`;
    }
    return `<div class="cv-group-label">${esc(n.label || "Grupo")}</div>`;
  }

  const SHAPE_SVG = {
    ellipse: '<ellipse cx="50" cy="50" rx="49" ry="49"/>',
    diamond: '<polygon points="50,1 99,50 50,99 1,50"/>',
    triangle: '<polygon points="50,2 98,98 2,98"/>',
  };

  function shapeBody(n) {
    const bg = SHAPE_SVG[n.shape] ? `<svg class="cv-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${SHAPE_SVG[n.shape]}</svg>` : "";
    return `${bg}<div class="cv-shape-text"><span>${renderInline(autolink(n.text), (t) => ({ exists: !!vault.resolveLink(t, path) }))}</span></div>`;
  }

  function imageBody(n) {
    return `<img class="cv-img" src="${n.image}" alt="${esc(n.text || "Imagem")}" draggable="false">`;
  }

  function lineBody(n) {
    const pts = n.points || [];
    const d = n.shape === "draw" ? smoothPath(pts) : pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
    const head = n.shape === "arrow" && pts.length >= 2 ? `<polygon class="cv-line-head" points="${arrowHead(pts[pts.length - 2], pts[pts.length - 1], 13).map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}"/>` : "";
    return `<svg class="cv-line-svg" viewBox="0 0 ${n.width} ${n.height}" preserveAspectRatio="none" aria-hidden="true"><path class="cv-line-hit" d="${d}"/><path class="cv-line-path" d="${d}"/>${head}</svg>`;
  }

  function nodeHtml(n) {
    const c = colorOf(n.color);
    const sel = selected?.kind === "node" && selected.id === n.id;
    const shape = n.type === "text" ? n.shape : null;
    const isLine = !!shape && LINE_SHAPES.includes(shape);
    const cls = ["cv-node", `cv-${n.type}`];
    if (shape) cls.push("cv-shape", `cv-shape-${shape}`);
    if (isLine) cls.push("cv-line");
    const fill = n.fill || (shape === "sticky" ? "solid" : shape && !isLine ? "soft" : null);
    if (fill) cls.push(`fill-${fill}`);
    if (n.dashed) cls.push("dashed");
    if (sel) cls.push("selected");
    const body = isLine ? lineBody(n) : shape === "image" ? imageBody(n) : shape ? shapeBody(n) : nodeBody(n);
    const ends = isLine && sel && n.shape !== "draw" && n.points?.length >= 2
      ? [0, 1].map((i) => { const q = n.points[i ? n.points.length - 1 : 0]; return `<span class="cv-end" data-end="${i}" data-id="${esc(n.id)}" style="left:${q[0]}px;top:${q[1]}px" title="Arraste a ponta"></span>`; }).join("")
      : "";
    const handles = isLine ? ends : SIDES.map((s) => `<span class="cv-handle ${s}" data-handle="${s}" data-id="${esc(n.id)}" title="Arraste para ligar"></span>`).join("");
    return `<div class="${cls.join(" ")}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px${c ? `;--cv-color:${c}` : ""}${n.stroke ? `;--stroke:${STROKE_PX[n.stroke]}px` : ""}">
      ${body}${handles}${isLine ? "" : `<span class="cv-resize" data-resize="${esc(n.id)}" aria-hidden="true"></span>`}
    </div>`;
  }

  function renderNodes() {
    const order = [...data.nodes].sort((a, b) => (a.type === "group" ? 0 : 1) - (b.type === "group" ? 0 : 1));
    layer.innerHTML = order.map(nodeHtml).join("");
    emptyBox.hidden = data.nodes.length > 0;
  }

  function renderEdges() {
    const paths = data.edges
      .map((e) => {
        const g = edgePath(data, e);
        if (!g) return "";
        const sel = selected?.kind === "edge" && selected.id === e.id;
        const c = colorOf(e.color);
        const ax = g.p2.x;
        const ay = g.p2.y;
        const a = g.angle;
        const head = `M${ax},${ay} L${ax - 12 * Math.cos(a - 0.42)},${ay - 12 * Math.sin(a - 0.42)} L${ax - 12 * Math.cos(a + 0.42)},${ay - 12 * Math.sin(a + 0.42)} Z`;
        const label = e.label ? `<text class="cv-edge-label" x="${g.mid.x}" y="${g.mid.y - 6}" text-anchor="middle">${esc(e.label)}</text>` : "";
        return `<g class="cv-edge${sel ? " selected" : ""}" data-edge="${esc(e.id)}"${c ? ` style="--cv-color:${c}"` : ""}><path class="cv-edge-hit" d="${g.d}"/><path class="cv-edge-line" d="${g.d}"/><path class="cv-edge-head" d="${head}"/>${label}</g>`;
      })
      .join("");
    const penLive = drag && (drag.kind === "draw" || drag.kind === "line");
    const live = drag?.preview ? `<path class="cv-edge-line preview${penLive ? " pen" : ""}" d="${drag.preview}"${penLive ? ` style="stroke:${colorOf(pen.color) || "var(--text)"};stroke-width:${STROKE_PX[pen.stroke]}"` : ""}/>` : "";
    svg.innerHTML = paths + live;
  }

  function renderAll() {
    renderNodes();
    renderEdges();
    updateStyleBar();
  }

  // Troca a seleção sem recriar os cartões: recriar no meio do clique descartava o alvo e o navegador deixava de
  // entregar o duplo clique. Só as classes mudam; a estrutura é refeita quando algo de fato muda.
  function select(next) {
    selected = next;
    for (const el of layer.querySelectorAll(".cv-node")) el.classList.toggle("selected", selected?.kind === "node" && selected.id === el.dataset.id);
    for (const g of svg.querySelectorAll(".cv-edge")) g.classList.toggle("selected", selected?.kind === "edge" && selected.id === g.dataset.edge);
    updateStyleBar();
  }

  // --- Barra de estilo da seleção --------------------------------------------------------------------------------------------

  function styleBarHtml() {
    const colors = ["", 1, 2, 3, 4, 5, 6]
      .map((c) => {
        const cur = selected.kind === "node" ? findNode(data, selected.id)?.color : data.edges.find((e) => e.id === selected.id)?.color;
        const on = String(cur ?? "") === String(c);
        return `<button class="cv-swatch${on ? " on" : ""}" data-color="${c}" style="--sw:${c ? COLORS[c] : "var(--muted)"}" title="${COLOR_NAMES[c]}" aria-label="${COLOR_NAMES[c]}" aria-pressed="${on}"></button>`;
      })
      .join("");
    if (selected.kind === "edge") {
      return `${colors}<span class="cv-sep" role="separator"></span><button class="cv-tool" data-act="label" title="Rótulo da seta" aria-label="Rótulo da seta">${icon("edit", 17)}</button><button class="cv-tool danger" data-act="delete" title="Excluir (Delete)" aria-label="Excluir">${icon("trash", 17)}</button>`;
    }
    const n = findNode(data, selected.id);
    const isLine = n.shape && LINE_SHAPES.includes(n.shape);
    const common = `<button class="cv-tool" data-act="front" title="Trazer para a frente (])" aria-label="Trazer para a frente">${icon("chevrons-up", 17)}</button><button class="cv-tool flip" data-act="back" title="Enviar para trás ([)" aria-label="Enviar para trás">${icon("chevrons-up", 17)}</button><button class="cv-tool" data-act="duplicate" title="Duplicar (Ctrl+D)" aria-label="Duplicar">${icon("copy", 17)}</button><button class="cv-tool danger" data-act="delete" title="Excluir (Delete)" aria-label="Excluir">${icon("trash", 17)}</button>`;
    if (n.shape === "image") return common;
    const fill = n.fill || (n.shape === "sticky" ? "solid" : n.shape && !isLine ? "soft" : "none");
    const fills = isLine || n.type === "file" || n.type === "link"
      ? ""
      : `<span class="cv-sep" role="separator"></span>${"none soft solid".split(" ").map((f) => `<button class="cv-fill${fill === f ? " on" : ""}" data-fill="${f}" title="${{ none: "Sem preenchimento", soft: "Preenchimento suave", solid: "Preenchimento cheio" }[f]}" aria-label="${{ none: "Sem preenchimento", soft: "Preenchimento suave", solid: "Preenchimento cheio" }[f]}" aria-pressed="${fill === f}"><i class="cv-fill-icon f-${f}"></i></button>`).join("")}`;
    const strokes = n.shape ? `<span class="cv-sep" role="separator"></span>${strokeButtons(n.stroke || 2)}` : "";
    const dash = n.type === "file" || n.type === "link" ? "" : `<button class="cv-tool${n.dashed ? " on" : ""}" data-act="dash" title="Traço tracejado" aria-label="Traço tracejado" aria-pressed="${!!n.dashed}"><i class="cv-dash-icon"></i></button>`;
    return `${colors}${fills}${strokes}<span class="cv-sep" role="separator"></span>${dash}${common}`;
  }

  function strokeButtons(cur) {
    return [1, 2, 4].map((k) => `<button class="cv-stroke${cur === k ? " on" : ""}" data-stroke="${k}" title="${STROKE_NAMES[k]}" aria-label="${STROKE_NAMES[k]}" aria-pressed="${cur === k}"><i style="height:${STROKE_PX[k]}px"></i></button>`).join("");
  }

  // Barra das próximas formas e traços (sem nada selecionado): cor e espessura.
  function penBarHtml() {
    const colors = ["", 1, 2, 3, 4, 5, 6]
      .map((c) => {
        const on = String(pen.color ?? "") === String(c);
        return `<button class="cv-swatch${on ? " on" : ""}" data-color="${c}" style="--sw:${c ? COLORS[c] : "var(--text)"}" title="${COLOR_NAMES[c]}" aria-label="${COLOR_NAMES[c]}" aria-pressed="${on}"></button>`;
      })
      .join("");
    return `${colors}${tool === "sticky" ? "" : `<span class="cv-sep" role="separator"></span>${strokeButtons(pen.stroke)}`}`;
  }

  function updateStyleBar() {
    const valid = selected && !editing && !drag && (selected.kind === "node" ? findNode(data, selected.id) : data.edges.some((e) => e.id === selected.id));
    if (!valid) {
      const showPen = !selected && !editing && !drag && PEN_TOOLS.has(tool);
      styleBar.hidden = !showPen;
      if (showPen) {
        styleBar.innerHTML = penBarHtml();
        placeStyleBar();
      }
      return;
    }
    styleBar.hidden = false;
    styleBar.innerHTML = styleBarHtml();
    placeStyleBar();
  }

  // Põe a barra acima do cartão (ou abaixo, se não couber), sempre dentro do quadro.
  function placeStyleBar() {
    if (styleBar.hidden) return;
    if (!selected) {
      // barra da ferramenta: fixa, logo abaixo das ferramentas
      styleBar.style.left = `${size().w / 2}px`;
      styleBar.style.top = "70px";
      return;
    }
    let box;
    if (selected.kind === "node") {
      const n = findNode(data, selected.id);
      if (!n) return;
      const a = toScreen(vp, n.x, n.y);
      box = { x: a.x, y: a.y, w: n.width * vp.zoom, h: n.height * vp.zoom };
    } else {
      const e = data.edges.find((x) => x.id === selected.id);
      const g = e && edgePath(data, e);
      if (!g) return;
      const m = toScreen(vp, g.mid.x, g.mid.y);
      box = { x: m.x, y: m.y, w: 0, h: 0 };
    }
    const { w, h } = size();
    const bw = styleBar.offsetWidth || 300;
    const bh = styleBar.offsetHeight || 40;
    let left = box.x + box.w / 2;
    left = Math.min(w - bw / 2 - 8, Math.max(bw / 2 + 8, left));
    let top = box.y - bh - 12;
    if (top < 64) top = box.y + box.h + 12; // sem espaço em cima (a barra de ferramentas ocupa o alto)
    top = Math.min(h - bh - 8, Math.max(64, top));
    styleBar.style.left = `${left}px`;
    styleBar.style.top = `${top}px`;
  }

  // --- Ferramentas ---------------------------------------------------------------------------------------------------------------

  function setTool(id) {
    tool = id;
    surface.dataset.tool = id;
    for (const b of root.querySelectorAll(".cv-tools .cv-tool")) b.setAttribute("aria-pressed", String(b.dataset.tool === id));
    hint.textContent = TOOLS.find((t) => t && t.id === id)?.hint || "";
    hint.classList.toggle("show", id !== "select");
    if (id !== "select" && selected) select(null);
    else updateStyleBar();
  }

  function startEdit(id) {
    const n = findNode(data, id);
    if (!n || (n.type !== "text" && n.type !== "group")) return;
    if ((n.shape && LINE_SHAPES.includes(n.shape)) || n.shape === "image") return;
    const el = layer.querySelector(`.cv-node[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    editing = id;
    styleBar.hidden = true;
    const field = n.type === "text" ? "text" : "label";
    const ta = document.createElement("textarea");
    ta.className = `cv-edit${n.shape ? " centered" : ""}`;
    ta.value = n[field] || "";
    ta.setAttribute("aria-label", n.type === "text" ? "Texto do cartão" : "Nome do grupo");
    el.querySelector(".cv-text, .cv-group-label, .cv-shape-text")?.replaceWith(ta);
    ta.focus();
    ta.select();
    const finish = (commitIt) => {
      if (editing !== id) return;
      editing = null;
      if (commitIt && n[field] !== ta.value) {
        n[field] = ta.value;
        commit();
      }
      renderAll();
      surface.focus();
    };
    ta.addEventListener("blur", () => finish(true));
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finish(true);
    });
    ta.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  function viewCenterWorld() {
    const { w, h } = size();
    return toWorld(vp, w / 2, h / 2);
  }

  const SHAPE_OF_TOOL = { rect: "rect", ellipse: "ellipse", diamond: "diamond", triangle: "triangle", sticky: "sticky" };

  // Cria o que a ferramenta desenha, no retângulo arrastado (ou no tamanho padrão, centrado no clique).
  async function createFromBox(rect, tiny, at) {
    const defSize = SHAPE_OF_TOOL[tool] ? SHAPE_SIZE[tool] : tool === "link" ? DEFAULT_SIZE.link : tool === "group" ? DEFAULT_SIZE.group : tool === "note" ? DEFAULT_SIZE.file : DEFAULT_SIZE.text;
    const w = tiny ? defSize[0] : Math.max(rect.width, 40);
    const h = tiny ? defSize[1] : Math.max(rect.height, 30);
    const x = tiny ? at.x - w / 2 : rect.x;
    const y = tiny ? at.y - h / 2 : rect.y;
    let node = null;
    if (SHAPE_OF_TOOL[tool]) node = addNode(data, { type: "text", shape: SHAPE_OF_TOOL[tool], x, y, width: w, height: h, color: pen.color || undefined, stroke: pen.stroke !== 2 && tool !== "sticky" ? pen.stroke : undefined });
    else if (tool === "text") node = addNode(data, { type: "text", x, y, width: w, height: h });
    else if (tool === "group") node = addNode(data, { type: "group", x, y, width: w, height: h, label: "Grupo" });
    else if (tool === "table") node = addTableNode(data, { x, y, name: "Tabela" });
    else if (tool === "link") {
      const url = window.prompt("Endereço do link (https://…)", "https://");
      if (!url || !/^https?:\/\//i.test(url)) return setTool("select");
      node = addNode(data, { type: "link", x, y, width: w, height: h, url });
    } else if (tool === "note") {
      const file = await pickNote();
      if (!file) return setTool("select");
      node = addNode(data, { type: "file", x, y, width: w, height: h, file });
    }
    const wasText = tool === "text" || tool === "group";
    const wasTable = tool === "table";
    setTool("select");
    if (!node) return;
    selected = { kind: "node", id: node.id };
    renderAll();
    commit();
    if (wasText) startEdit(node.id);
    if (wasTable) editTable(node.id);
  }

  function removeSelected() {
    if (!selected) return;
    if (selected.kind === "node") removeNode(data, selected.id);
    else removeEdge(data, selected.id);
    selected = null;
    renderAll();
    commit();
  }

  function fit() {
    const { w, h } = size();
    vp = fitViewport(data, w, h, { padding: 96 });
    applyViewport();
  }

  function applyStyle(patch) {
    if (!selected) {
      if ("color" in patch) pen.color = patch.color || null;
      if (patch.stroke) pen.stroke = patch.stroke;
      updateStyleBar();
      return;
    }
    if (selected.kind === "node") styleNode(data, selected.id, patch);
    else {
      const e = data.edges.find((x) => x.id === selected.id);
      if (e && "color" in patch) {
        if (patch.color) e.color = patch.color;
        else delete e.color;
      }
    }
    renderAll();
    commit();
  }

  function duplicateSelected() {
    if (selected?.kind !== "node") return;
    const copy = duplicateNode(data, selected.id);
    if (!copy) return;
    selected = { kind: "node", id: copy.id };
    renderAll();
    commit();
  }

  // --- Ponteiro ------------------------------------------------------------------------------------------------------------------------

  const local = (e) => {
    const r = surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldPoint = (p) => toWorld(vp, p.x, p.y);

  // Borracha: apaga o desenho ou a linha sob o cursor, e confere o caminho entre dois movimentos para não deixar buracos.
  function eraseAt(cx, cy) {
    const last = drag?.last || { x: cx, y: cy };
    const steps = Math.max(1, Math.ceil(Math.hypot(cx - last.x, cy - last.y) / 6));
    for (let i = 1; i <= steps; i++) {
      const x = last.x + ((cx - last.x) * i) / steps;
      const y = last.y + ((cy - last.y) * i) / steps;
      const el = document.elementFromPoint(x, y)?.closest(".cv-node.cv-line");
      if (el && removeNode(data, el.dataset.id)) {
        el.remove();
        drag.removed++;
      }
    }
    drag.last = { x: cx, y: cy };
  }

  function ghostHtml(rect) {
    return `<div class="cv-ghost cv-ghost-${tool}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px"></div>`;
  }

  surface.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".cv-ui")) return;
    if (editing || (e.button !== 0 && e.button !== 1)) return;
    if (e.target.closest("a, .cv-open")) return;
    const p = local(e);
    const now = e.timeStamp;
    const twice = e.button === 0 && !CREATE_TOOLS.has(tool) && tool !== "hand" && !spaceDown
      && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = twice ? { t: 0, x: 0, y: 0 } : { t: now, x: e.clientX, y: e.clientY };
    if (twice) {
      e.preventDefault();
      handledAt = now;
      drag = null;
      const { clientX, clientY } = e;
      setTimeout(() => openAt(clientX, clientY), 0);
      return;
    }
    surface.setPointerCapture(e.pointerId);
    surface.focus();
    // mover a vista: botão do meio, ferramenta mão ou Espaço apertado
    if (e.button === 1 || tool === "hand" || spaceDown) {
      e.preventDefault();
      drag = { kind: "pan", last: p };
      surface.classList.add("panning");
      return;
    }
    if (tool === "eraser") {
      drag = { kind: "erase", removed: 0, last: { x: e.clientX, y: e.clientY } };
      eraseAt(e.clientX, e.clientY);
      return;
    }
    if (CREATE_TOOLS.has(tool)) {
      const w = worldPoint(p);
      styleBar.hidden = true;
      if (tool === "draw") drag = { kind: "draw", points: [[w.x, w.y]], preview: null };
      else if (LINE_TOOLS.has(tool)) drag = { kind: "line", start: w, cur: w, preview: null };
      else drag = { kind: "box", start: w, cur: w, moved: false };
      if (selected) select(null);
      return;
    }
    const end = e.target.closest("[data-end]");
    const handle = e.target.closest("[data-handle]");
    const resize = e.target.closest("[data-resize]");
    const nodeEl = e.target.closest(".cv-node");
    const edgeEl = e.target.closest("[data-edge]");
    if (end) {
      drag = { kind: "end", id: end.dataset.id, which: Number(end.dataset.end), moved: false };
      select({ kind: "node", id: end.dataset.id });
    } else if (handle) {
      drag = { kind: "connect", id: handle.dataset.id, side: handle.dataset.handle, start: p, preview: null };
      select({ kind: "node", id: handle.dataset.id });
    } else if (resize) {
      const n = findNode(data, resize.dataset.resize);
      drag = { kind: "resize", id: n.id, start: p, w: n.width, h: n.height, points: n.points ? n.points.map((q) => [...q]) : null };
      select({ kind: "node", id: n.id });
    } else if (nodeEl) {
      const n = findNode(data, nodeEl.dataset.id);
      drag = { kind: "move", id: n.id, last: p, moved: false };
      if (!(selected?.kind === "node" && selected.id === n.id)) select({ kind: "node", id: n.id });
    } else if (edgeEl) {
      select({ kind: "edge", id: edgeEl.dataset.edge });
      drag = null;
    } else {
      drag = { kind: "pan", last: p };
      surface.classList.add("panning");
      if (selected) select(null);
    }
  });

  surface.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = local(e);
    if (drag.kind === "pan") {
      vp = panBy(vp, p.x - drag.last.x, p.y - drag.last.y);
      drag.last = p;
      applyViewport();
    } else if (drag.kind === "move") {
      if (!drag.moved && Math.hypot(p.x - drag.last.x, p.y - drag.last.y) < 3) return;
      if (!drag.moved) styleBar.hidden = true;
      drag.moved = true;
      moveNode(data, drag.id, (p.x - drag.last.x) / vp.zoom, (p.y - drag.last.y) / vp.zoom);
      drag.last = p;
      const n = findNode(data, drag.id);
      const el = layer.querySelector(`.cv-node[data-id="${CSS.escape(drag.id)}"]`);
      if (el) {
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
      }
      renderEdges();
    } else if (drag.kind === "resize") {
      styleBar.hidden = true;
      const n = findNode(data, drag.id);
      if (drag.points) n.points = drag.points.map((q) => [...q]); // parte sempre dos pontos de antes do gesto, sem acumular arredondamento
      n.width = drag.w;
      n.height = drag.h;
      const rw = drag.w + (p.x - drag.start.x) / vp.zoom;
      // imagens mantêm a proporção; Shift libera
      const rh = n.shape === "image" && !e.shiftKey ? (rw * drag.h) / drag.w : drag.h + (p.y - drag.start.y) / vp.zoom;
      resizeNode(data, drag.id, rw, rh);
      const el = layer.querySelector(`.cv-node[data-id="${CSS.escape(drag.id)}"]`);
      if (el) {
        el.style.width = `${n.width}px`;
        el.style.height = `${n.height}px`;
      }
      renderEdges();
    } else if (drag.kind === "erase") {
      eraseAt(e.clientX, e.clientY);
    } else if (drag.kind === "end") {
      let w = worldPoint(p);
      const n = findNode(data, drag.id);
      if (e.shiftKey && n) {
        // trava o ângulo em múltiplos de 15° em relação à outra ponta
        const o = n.points[drag.which === 0 ? n.points.length - 1 : 0];
        const ox = n.x + o[0];
        const oy = n.y + o[1];
        const len = Math.hypot(w.x - ox, w.y - oy);
        const ang = Math.round(Math.atan2(w.y - oy, w.x - ox) / (Math.PI / 12)) * (Math.PI / 12);
        w = { x: ox + len * Math.cos(ang), y: oy + len * Math.sin(ang) };
      }
      if (!drag.moved) styleBar.hidden = true;
      drag.moved = true;
      setLineEndpoint(data, drag.id, drag.which, [w.x, w.y]);
      renderNodes();
      renderEdges();
    } else if (drag.kind === "connect") {
      const a = findNode(data, drag.id);
      const from = anchor(a, drag.side);
      const to = toWorld(vp, p.x, p.y);
      drag.preview = `M${from.x},${from.y} L${to.x},${to.y}`;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cv-node");
      const ok = over && over.dataset.id !== drag.id && !isLineNode(findNode(data, over.dataset.id)) ? over : null;
      for (const el of layer.querySelectorAll(".cv-target")) if (el !== ok) el.classList.remove("cv-target");
      ok?.classList.add("cv-target");
      renderEdges();
    } else if (drag.kind === "box") {
      const w = worldPoint(p);
      drag.cur = w;
      const r = normalizeRect(drag.start, w);
      drag.moved = r.width > 6 || r.height > 6;
      layer.querySelector(".cv-ghost")?.remove();
      if (drag.moved) layer.insertAdjacentHTML("beforeend", ghostHtml(r));
    } else if (drag.kind === "line") {
      let w = worldPoint(p);
      if (e.shiftKey) {
        // trava o ângulo em múltiplos de 15°
        const dx = w.x - drag.start.x;
        const dy = w.y - drag.start.y;
        const len = Math.hypot(dx, dy);
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        w = { x: drag.start.x + len * Math.cos(ang), y: drag.start.y + len * Math.sin(ang) };
      }
      drag.cur = w;
      drag.preview = `M${drag.start.x},${drag.start.y} L${w.x},${w.y}`;
      renderEdges();
    } else if (drag.kind === "draw") {
      const w = worldPoint(p);
      const last = drag.points[drag.points.length - 1];
      if (Math.hypot(w.x - last[0], w.y - last[1]) * vp.zoom < 2) return;
      drag.points.push([w.x, w.y]);
      drag.preview = smoothPath(drag.points);
      renderEdges();
    }
  });

  const endDrag = async (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    surface.classList.remove("panning");
    try {
      surface.releasePointerCapture(e.pointerId);
    } catch {
      /* já solto */
    }
    layer.querySelector(".cv-ghost")?.remove();
    // o último movimento pode não ter sido entregue: usa a posição do próprio soltar
    if ((d.kind === "box" || d.kind === "line") && e.type === "pointerup") {
      d.cur = worldPoint(local(e));
      if (d.kind === "box") d.moved = Math.abs(d.cur.x - d.start.x) > 6 || Math.abs(d.cur.y - d.start.y) > 6;
    }
    if (d.kind === "connect") {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cv-node");
      const target = under && under.dataset.id !== d.id ? findNode(data, under.dataset.id) : null;
      if (target && !isLineNode(target)) {
        const edge = addEdge(data, d.id, target.id, { fromSide: d.side, toSide: nearestSide(target, worldPoint(local(e))) });
        if (edge) {
          selected = { kind: "edge", id: edge.id };
          commit();
          if (d.fromTool) setTool("select");
        } else {
          toast("Esses cartões já estão ligados.", "info");
        }
      } else if (d.fromTool) {
        toast("Solte a seta em cima de outro cartão para ligá-los.", "info");
      }
      renderAll();
    } else if (d.kind === "erase") {
      if (d.removed) commit();
      renderAll();
    } else if (d.kind === "move" || d.kind === "resize" || d.kind === "end") {
      if (d.moved || d.kind === "resize") commit();
      renderAll();
    } else if (d.kind === "box") {
      const r = normalizeRect(d.start, d.cur);
      await createFromBox(r, !d.moved, d.start);
    } else if (d.kind === "line") {
      renderEdges();
      if (Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y) * vp.zoom < 6) return updateStyleBar();
      const node = addLineNode(data, tool, [[d.start.x, d.start.y], [d.cur.x, d.cur.y]], { color: pen.color || undefined, stroke: pen.stroke !== 2 ? pen.stroke : undefined });
      setTool("select");
      if (node) {
        selected = { kind: "node", id: node.id };
        commit();
      }
      renderAll();
    } else if (d.kind === "draw") {
      renderEdges();
      const pts = simplifyPoints(d.points, 0.8 / vp.zoom);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      const tiny = pts.length < 2 || (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3);
      // o lápis continua ativo para o próximo traço (Esc ou V voltam a selecionar)
      if (!tiny && addLineNode(data, "draw", pts, { color: pen.color || undefined, stroke: pen.stroke !== 2 ? pen.stroke : undefined })) commit();
      renderAll();
    }
  };
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);

  surface.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e);
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
    vp = zoomAt(vp, factor, p.x, p.y);
    applyViewport();
  }, { passive: false });

  // Duplo clique: o navegador não entrega `dblclick` quando o ponteiro está capturado, então o par de cliques é
  // detectado no pointerdown (mesmo lugar, até 400 ms) e o `dblclick` nativo só vale se isso não tiver tratado.
  let lastDown = { t: 0, x: 0, y: 0 };
  let handledAt = 0;

  // Editor da tabela (nome, campos e relações). As relações viram arestas entre as tabelas, com o campo e a cardinalidade.
  async function editTable(id) {
    const node = findNode(data, id);
    if (!node || node.type !== "table") return;
    const tables = tablesOf(data).map((t) => ({ id: t.id, name: t.name, fields: t.fields }));
    const relations = data.edges
      .filter((e) => e.fromNode === id && e.fromField)
      .map((e) => ({ fromField: e.fromField, toTableId: e.toNode, toField: e.toField, cardinality: e.cardinality || "1:N" }));
    const result = await openTableEditor({ table: { id, name: node.name || "", fields: node.fields || [] }, tables, relations });
    if (!result) return;
    applyTable(id, result);
  }

  function applyTable(id, result) {
    const node = findNode(data, id);
    node.name = result.name;
    node.fields = result.fields;
    node.height = tableHeight(result.fields);
    data.edges = data.edges.filter((e) => !(e.fromNode === id && e.fromField));
    for (const r of result.relations) {
      const target = findNode(data, r.toTableId);
      if (!target || !r.fromField || !r.toField) continue;
      const [fromSide, toSide] = autoSides(node, target);
      data.edges.push({ id: newId("e"), fromNode: id, toNode: r.toTableId, fromSide, toSide, fromField: r.fromField, toField: r.toField, cardinality: r.cardinality, label: r.cardinality });
    }
    renderAll();
    commit();
  }

  // Seta de link entre duas notas do canvas. É marcada como `auto: "link"` para o grafo saber que é dele, e o rótulo é o apelido.
  function ensureLinkEdge(a, b, label) {
    const existing = data.edges.find((x) => (x.fromNode === a.id && x.toNode === b.id) || (x.fromNode === b.id && x.toNode === a.id));
    if (existing) {
      if (existing.auto === "link") {
        if (label) existing.label = label;
        else delete existing.label;
      }
      return existing;
    }
    const [fromSide, toSide] = autoSides(a, b);
    const edge = { id: newId("e"), fromNode: a.id, toNode: b.id, fromSide, toSide, auto: "link" };
    if (label) edge.label = label;
    data.edges.push(edge);
    return edge;
  }

  // Mantém as setas do grafo iguais aos links atuais das notas: cria as novas, troca rótulos e tira as que sumiram.
  // Não mexe em posição nem em setas feitas à mão. Devolve true se algo mudou.
  function syncGraphLinks() {
    const fileNodes = data.nodes.filter((n) => n.type === "file" && n.file && vault.has(n.file));
    if (!fileNodes.length) return false;
    const byPath = new Map(fileNodes.map((n) => [n.file, n]));
    const wanted = linksAmong([...byPath.keys()], (p2) => vault.read(p2), (name, from) => vault.resolveLink(name, from));
    const keep = new Set();
    let changed = false;
    for (const w of wanted) {
      const a = byPath.get(w.source);
      const b = byPath.get(w.target);
      const before = data.edges.find((x) => x.auto === "link" && ((x.fromNode === a.id && x.toNode === b.id) || (x.fromNode === b.id && x.toNode === a.id)));
      const edge = ensureLinkEdge(a, b, w.label);
      if (!before) changed = true;
      else if ((before.label || "") !== (edge.label || "")) changed = true;
      keep.add(edge.id);
    }
    const count = data.edges.length;
    data.edges = data.edges.filter((e) => e.auto !== "link" || keep.has(e.id));
    if (data.edges.length !== count) changed = true;
    return changed;
  }

  // Grafo ao vivo: quando uma nota muda, as setas do canvas acompanham. Espera um instante para não refazer a cada tecla.
  let liveTimer = null;
  const liveRefresh = () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (syncGraphLinks()) {
        renderAll();
        commit();
      }
    }, 250);
  };
  const liveUnsubs = ["create", "modify", "delete", "rename"].map((ev) => vault.on(ev, liveRefresh));

  // Grafo: "build" põe um cartão para cada nota da pasta desta nota; "organize" reposiciona as notas que já estão no canvas.
  // As setas são os links internos entre elas. A posição vem da física do grafo da biblioteca.
  function buildGraph(mode) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const onCanvas = new Map(data.nodes.filter((n) => n.type === "file" && n.file).map((n) => [n.file, n]));
    let paths;
    if (mode === "build") {
      paths = vault.markdownFiles().map((f) => f.path).filter((p2) => (dir ? p2.startsWith(`${dir}/`) : true));
      if (paths.length > GRAPH_LIMIT) toast(`A pasta tem ${paths.length} notas; monto o grafo com as ${GRAPH_LIMIT} primeiras.`, "info");
      paths = paths.slice(0, GRAPH_LIMIT);
    } else {
      paths = [...onCanvas.keys()].filter((p2) => vault.has(p2));
    }
    if (paths.length === 0) return toast("Não há notas para montar o grafo.", "info");
    const edges = linksAmong(paths, (p2) => vault.read(p2), (name, from) => vault.resolveLink(name, from));
    const { w, h } = size();
    const center = toWorld(vp, w / 2, h / 2);
    const inGraph = new Set(paths);
    const obstacles = data.nodes
      .filter((n) => !(n.type === "file" && inGraph.has(n.file)))
      .map((n) => ({ x: n.x, y: n.y, w: n.width, h: n.height }));
    const positions = separateCards(placeOnCanvas(settleGraph(paths, edges), { cx: center.x, cy: center.y }), { obstacles });
    const nodeOf = new Map();
    for (const p2 of paths) {
      let node = onCanvas.get(p2);
      if (!node) node = addNode(data, { type: "file", x: 0, y: 0, width: 320, height: 240, file: p2 });
      const at = positions.get(p2);
      node.x = at.x;
      node.y = at.y;
      nodeOf.set(p2, node);
    }
    for (const e of edges) {
      const a = nodeOf.get(e.source);
      const b = nodeOf.get(e.target);
      if (a && b) ensureLinkEdge(a, b, e.label);
    }
    selected = null;
    renderAll();
    commit();
    fit();
  }

  // Exportações e importação do diagrama (DBML, SQL e esquema para agentes). O app faz o arquivo ou a cópia.
  async function diagramAction(kind) {
    if (!diagram) return toast("Esta ação não está disponível aqui.", "info");
    const next = await diagram(kind, data);
    if (next) {
      data = next;
      selected = null;
      renderAll();
      commit();
    }
  }

  function openAt(clientX, clientY) {
    const under = document.elementFromPoint(clientX, clientY);
    if (!under || under.closest(".cv-ui, a, .cv-open, .cv-handle, .cv-resize, .cv-end")) return;
    const nodeEl = under.closest(".cv-node");
    if (nodeEl) {
      const n = findNode(data, nodeEl.dataset.id);
      if (n && (n.type === "text" || n.type === "group")) startEdit(n.id);
      else if (n?.type === "table") editTable(n.id);
      else if (n?.type === "file") openNote(n.file);
      return;
    }
    if (under.closest("[data-edge]")) return editEdgeLabel(under.closest("[data-edge]").dataset.edge);
    // duplo clique no fundo: cartão de texto novo
    const w = worldPoint(local({ clientX, clientY }));
    const node = addNode(data, { type: "text", x: w.x - 130, y: w.y - 60 });
    selected = { kind: "node", id: node.id };
    renderAll();
    commit();
    startEdit(node.id);
  }

  surface.addEventListener("dblclick", (e) => {
    if (e.timeStamp - handledAt < 600) return;
    openAt(e.clientX, e.clientY);
  });

  function editEdgeLabel(id) {
    const edge = data.edges.find((x) => x.id === id);
    const label = window.prompt("Rótulo da seta (vazio remove)", edge?.label || "");
    if (!edge || label === null) return;
    if (label.trim()) edge.label = label.trim();
    else delete edge.label;
    renderAll();
    commit();
  }

  // Botão direito: cartão, seta ou fundo do quadro.
  surface.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".cv-ui") || editing) return;
    const at = worldPoint(local(e));
    const colors = ["", 1, 2, 3, 4, 5, 6].map((c) => ({ label: COLOR_NAMES[c], checked: false, run: () => applyStyle({ color: c || null }) }));
    const nodeEl = e.target.closest(".cv-node");
    const edgeEl = e.target.closest("[data-edge]");
    if (nodeEl) {
      const n = findNode(data, nodeEl.dataset.id);
      if (!n) return;
      select({ kind: "node", id: n.id });
      const isLine = n.shape && LINE_SHAPES.includes(n.shape);
      const textual = (n.type === "text" || n.type === "group") && !isLine && n.shape !== "image";
      return openAtEvent(e, [
        { label: "Editar texto", icon: "edit", hidden: !textual, run: () => startEdit(n.id) },
        { label: "Abrir nota", icon: "file-text", hidden: n.type !== "file", run: () => openNote(n.file) },
        { label: "Menu da nota…", icon: "sliders", hidden: n.type !== "file" || !fileMenu, run: () => fileMenu(n.file, e.clientX, e.clientY) },
        { label: "Abrir link", icon: "external-link", hidden: n.type !== "link", run: () => window.open(n.url, "_blank", "noopener") },
        { sep: true },
        { label: "Cor", icon: "pencil", hidden: n.shape === "image", items: colors },
        { label: "Duplicar", icon: "copy", hint: "Ctrl+D", run: duplicateSelected },
        { label: "Trazer para a frente", icon: "chevrons-up", hint: "]", run: () => { if (bringToFront(data, n.id)) { renderAll(); commit(); } } },
        { label: "Enviar para trás", icon: "chevron-down", hint: "[", run: () => { if (sendToBack(data, n.id)) { renderAll(); commit(); } } },
        { sep: true },
        { label: "Excluir", icon: "trash", danger: true, hint: "Del", run: removeSelected },
      ]);
    }
    if (edgeEl) {
      select({ kind: "edge", id: edgeEl.dataset.edge });
      return openAtEvent(e, [
        { label: "Rótulo…", icon: "edit", run: () => editEdgeLabel(edgeEl.dataset.edge) },
        { label: "Cor", icon: "pencil", items: colors },
        { sep: true },
        { label: "Excluir", icon: "trash", danger: true, run: removeSelected },
      ]);
    }
    if (selected) select(null);
    const make = (kind) => () => {
      setTool(kind);
      createFromBox({ x: at.x, y: at.y, width: 0, height: 0 }, true, at);
    };
    openAtEvent(e, [
      { label: "Novo cartão de texto", icon: "type", run: make("text") },
      { label: "Nova nota da biblioteca…", icon: "file-text", run: make("note") },
      { label: "Novo link…", icon: "link", run: make("link") },
      { label: "Novo grupo", icon: "layers", run: make("group") },
      { label: "Nova tabela", icon: "columns", run: make("table") },
      { label: "Montar grafo desta pasta", icon: "graph", run: () => buildGraph("build") },
      { label: "Organizar notas por links", icon: "refresh", hidden: !data.nodes.some((n) => n.type === "file"), run: () => buildGraph("organize") },
      { label: "Diagrama", icon: "database", items: [
        { label: "Exportar DBML…", icon: "download", run: () => diagramAction("dbml") },
        { label: "Exportar SQL…", icon: "download", run: () => diagramAction("sql") },
        { label: "Copiar esquema para agentes", icon: "file-text", run: () => diagramAction("agent") },
        { label: "Importar esquema de agente…", icon: "file-plus", run: () => diagramAction("import") },
      ] },
      { label: "Nova forma", icon: "square", items: [["rect", "Retângulo", "square"], ["ellipse", "Elipse", "circle"], ["diamond", "Losango", "diamond"], ["triangle", "Triângulo", "triangle"], ["sticky", "Nota adesiva", "sticky"]].map(([k, l, ic]) => ({ label: l, icon: ic, run: make(k) })) },
      { label: "Adicionar imagem…", icon: "image", run: () => { imageAt = at; pickImages(); } },
      { sep: true },
      { label: "Enquadrar tudo", icon: "maximize", hint: "0", run: fit },
      { label: "Voltar a 100%", icon: "search", run: () => { const { w, h } = size(); vp = zoomAt(vp, 1 / vp.zoom, w / 2, h / 2); applyViewport(); } },
    ]);
  });

  surface.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openNote(open.dataset.open);
    const wl = e.target.closest("a.wikilink");
    if (wl) {
      e.preventDefault();
      if (followLink) return followLink(wl.dataset.target);
      const target = vault.resolveLink(wl.dataset.target, path);
      if (target) openNote(target);
      else toast("Essa nota ainda não existe.", "info");
      return;
    }
    const tag = e.target.closest(".tag");
    if (tag && onTag) onTag(tag.dataset.tag);
  });

  // --- Teclado e botões flutuantes -----------------------------------------------------------------------------------------

  surface.addEventListener("keydown", (e) => {
    if (editing) return;
    if (e.key === " " && !e.repeat) {
      spaceDown = true;
      surface.classList.add("space");
      e.preventDefault();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      return restore(e.shiftKey ? hist.redo() : hist.undo());
    }
    if (mod && key === "y") {
      e.preventDefault();
      return restore(hist.redo());
    }
    if (mod && key === "d") {
      e.preventDefault();
      return duplicateSelected();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      return removeSelected();
    }
    if (e.key === "Escape") {
      if (tool !== "select") setTool("select");
      else if (selected) select(null);
      return;
    }
    if (mod || e.altKey) return;
    if (TOOL_BY_KEY[key]) {
      e.preventDefault();
      return TOOL_BY_KEY[key] === "image" ? pickImages() : setTool(TOOL_BY_KEY[key]);
    }
    if (e.key === "Enter" && selected?.kind === "node") {
      e.preventDefault();
      return startEdit(selected.id);
    }
    if (e.key === "0") return fit();
    if (e.key === "+" || e.key === "=") {
      const { w, h } = size();
      vp = zoomAt(vp, 1.2, w / 2, h / 2);
      return applyViewport();
    }
    if (e.key === "-") {
      const { w, h } = size();
      vp = zoomAt(vp, 1 / 1.2, w / 2, h / 2);
      return applyViewport();
    }
    if (e.key === "]" && selected?.kind === "node") {
      if (bringToFront(data, selected.id)) {
        renderAll();
        commit();
      }
      return;
    }
    if (e.key === "[" && selected?.kind === "node") {
      if (sendToBack(data, selected.id)) {
        renderAll();
        commit();
      }
      return;
    }
    if (selected?.kind === "node" && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 40 : 8;
      moveNode(data, selected.id, e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0, e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0);
      renderAll();
      commit();
    }
  });

  surface.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      spaceDown = false;
      surface.classList.remove("space");
    }
  });

  surface.addEventListener("click", (e) => {
    const ui = e.target.closest(".cv-ui");
    if (!ui) return;
    const toolBtn = e.target.closest("[data-tool]");
    if (toolBtn && ui.classList.contains("cv-tools")) return toolBtn.dataset.tool === "image" ? pickImages() : setTool(toolBtn.dataset.tool);
    const strokeBtn = e.target.closest("[data-stroke]");
    if (strokeBtn) return applyStyle({ stroke: Number(strokeBtn.dataset.stroke) });
    const sw = e.target.closest("[data-color]");
    if (sw) return applyStyle({ color: sw.dataset.color || null });
    const fillBtn = e.target.closest("[data-fill]");
    if (fillBtn) return applyStyle({ fill: fillBtn.dataset.fill });
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    const { w, h } = size();
    if (act === "undo") restore(hist.undo());
    else if (act === "redo") restore(hist.redo());
    else if (act === "fit") fit();
    else if (act === "zoom-in") {
      vp = zoomAt(vp, 1.25, w / 2, h / 2);
      applyViewport();
    } else if (act === "zoom-out") {
      vp = zoomAt(vp, 0.8, w / 2, h / 2);
      applyViewport();
    } else if (act === "zoom-reset") {
      vp = zoomAt(vp, 1 / vp.zoom, w / 2, h / 2);
      applyViewport();
    } else if (act === "delete") removeSelected();
    else if (act === "duplicate") duplicateSelected();
    else if (act === "label" && selected?.kind === "edge") editEdgeLabel(selected.id);
    else if (act === "dash" && selected?.kind === "node") applyStyle({ dashed: !findNode(data, selected.id)?.dashed });
    else if (act === "front" && selected?.kind === "node" && bringToFront(data, selected.id)) {
      renderAll();
      commit();
    } else if (act === "back" && selected?.kind === "node" && sendToBack(data, selected.id)) {
      renderAll();
      commit();
    }
  });

  // --- Imagens ------------------------------------------------------------------------------------------------------------------------

  function pickImages() {
    fileInput.value = "";
    fileInput.click();
  }

  // Reduz e embute as imagens no quadro, centradas em `at` (ponto do mundo); várias imagens saem escalonadas.
  async function addImages(files, at) {
    let last = null;
    let i = 0;
    for (const f of files) {
      try {
        const img = await readImage(f);
        const [w, h] = displaySize(img.width, img.height);
        const off = i * 28;
        last = addNode(data, { type: "text", shape: "image", image: img.src, x: at.x - w / 2 + off, y: at.y - h / 2 + off, width: w, height: h });
        i++;
      } catch (err) {
        toast(`${f.name || "Imagem"}: ${err.message}`, "error");
      }
    }
    if (!last) return;
    setTool("select");
    selected = { kind: "node", id: last.id };
    renderAll();
    commit();
  }

  let imageAt = null; // onde a imagem escolhida pelo menu de contexto deve entrar
  fileInput.addEventListener("change", () => {
    const at = imageAt || viewCenterWorld();
    imageAt = null;
    addImages([...fileInput.files].filter(isImageFile), at);
  });
  surface.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
    e.preventDefault();
    surface.classList.add("dropping");
  });
  surface.addEventListener("dragleave", (e) => {
    if (!surface.contains(e.relatedTarget)) surface.classList.remove("dropping");
  });
  surface.addEventListener("drop", (e) => {
    surface.classList.remove("dropping");
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
    if (!files.length) return; // outros arquivos seguem para a importação do app
    e.preventDefault();
    e.stopPropagation();
    addImages(files, worldPoint(local(e)));
  });
  surface.addEventListener("paste", (e) => {
    if (editing) return;
    const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    addImages(files, viewCenterWorld());
  });

  // O primeiro enquadramento só acontece quando a tela já tem tamanho; sem viewport salvo, enquadra tudo.
  renderAll();
  if (!vp) {
    const { w, h } = size();
    vp = fitViewport(data, w, h, { padding: 96 });
  }
  applyViewport(false);
  updateHistoryUi();
  setTool("select");
  surface.focus({ preventScroll: true }); // os atalhos de ferramenta (V, R, O…) valem logo ao abrir

  return {
    data: () => data,
    viewport: () => ({ ...vp }),
    selected: () => selected,
    tool: () => tool,
    flush() {
      writeNow();
      clearTimeout(vpTimer);
      onViewport({ ...vp });
    },
    destroy() {
      clearTimeout(saveTimer);
      clearTimeout(vpTimer);
      clearTimeout(liveTimer);
      for (const off of liveUnsubs) off();
      host.innerHTML = "";
    },
  };
}
