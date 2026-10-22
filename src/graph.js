// Grafo de notas em canvas. A física está em layout.js; aqui ficam o desenho e a interação:
// arrastar uma nota, mover a vista, aproximar com a roda, destacar vizinhos e abrir com um clique.

import { Layout, fitTransform, toScreen, toWorld, zoomAt } from "./layout.js";

const DRAG_THRESHOLD = 4; // pixels: abaixo disso é clique, acima é arrasto
const FIT = { margin: 28, right: 84 }; // folga para o nome ao lado do ponto

export class GraphView {
  constructor(canvas, { onOpen, wheelZoom = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onOpen = onOpen || (() => {});
    this.wheelZoom = wheelZoom; // no grafo pequeno a roda continua rolando a página
    this.layout = new Layout();
    this.view = { x: 0, y: 0, scale: 1 };
    this.autoFit = true; // enquadra sozinho até a pessoa mexer na vista
    this.showAllLabels = false;
    this.hover = null;
    this.activeId = null;
    this.drag = null;
    this.running = false;
    this.colors = null;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onUp(e, true));
    canvas.addEventListener("pointerleave", () => { if (!this.drag) this.setHover(null); });
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("dblclick", () => this.fit());
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    // o canvas pode nascer escondido ou sem tamanho (painel recolhido, tela ainda montando): refaz quando ganhar medidas
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }

  get nodes() {
    return this.layout.nodes;
  }

  destroy() {
    this.observer?.disconnect();
    window.removeEventListener("resize", this.onResize);
  }

  setData(data, activeId = null) {
    this.layout.setData(data);
    const graus = this.nodes.map((n) => n.degree).sort((a, b) => b - a);
    this.hubMin = Math.max(3, graus[5] ?? 0); // só os 6 mais ligados ganham nome fixo
    this.activeId = activeId;
    this.hover = null;
    this.autoFit = true;
    this.resize();
    this.start();
  }

  setShowAllLabels(on) {
    this.showAllLabels = on;
    this.draw();
  }

  // Volta a enquadrar todas as notas.
  fit() {
    this.autoFit = true;
    this.start();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.autoFit) this.snapToFit();
    this.draw();
  }

  snapToFit() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return false;
    this.view = fitTransform(this.layout.bounds(), w, h, { ...FIT, right: Math.min(FIT.right, w * 0.2) });
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const step = () => {
      if (!this.layout.settled) this.layout.step();
      if (this.autoFit) this.easeToFit();
      this.draw();
      if (!this.layout.settled || this.drag || this.autoFitMoving) requestAnimationFrame(step);
      else this.running = false;
    };
    requestAnimationFrame(step);
  }

  // Aproxima a vista do enquadramento aos poucos, para não "pular".
  easeToFit() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) {
      this.autoFitMoving = false;
      return;
    }
    const target = fitTransform(this.layout.bounds(), w, h, { ...FIT, right: Math.min(FIT.right, w * 0.2) });
    const v = this.view;
    const k = 0.16;
    const next = { scale: v.scale + (target.scale - v.scale) * k, x: v.x + (target.x - v.x) * k, y: v.y + (target.y - v.y) * k };
    this.autoFitMoving = Math.abs(target.scale - v.scale) > 0.002 || Math.abs(target.x - v.x) > 0.4 || Math.abs(target.y - v.y) > 0.4;
    this.view = next;
  }

  // --- Interação ---------------------------------------------------------------------------

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  pickNode(screen) {
    const world = toWorld(this.view, screen);
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - world.x, n.y - world.y) * this.view.scale;
      const reach = this.radius(n) + 6;
      if (d < reach && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  setHover(node) {
    if (this.hover === node) return;
    this.hover = node;
    this.canvas.style.cursor = node ? "pointer" : "grab";
    this.draw();
  }

  onDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const p = this.point(event);
    const node = this.pickNode(p);
    this.canvas.setPointerCapture?.(event.pointerId);
    this.drag = { node, start: p, view: { ...this.view }, moved: false };
    this.canvas.style.cursor = node ? "grabbing" : "grabbing";
  }

  onMove(event) {
    const p = this.point(event);
    if (!this.drag) {
      this.setHover(this.pickNode(p));
      return;
    }
    const d = this.drag;
    const dist = Math.hypot(p.x - d.start.x, p.y - d.start.y);
    if (!d.moved && dist < DRAG_THRESHOLD) return;
    d.moved = true;
    if (d.node) {
      const w = toWorld(this.view, p);
      d.node.x = w.x;
      d.node.y = w.y;
      d.node.vx = 0;
      d.node.vy = 0;
      d.node.pinned = true;
      this.autoFit = false;
      this.layout.reheat(0.35);
      this.start();
    } else {
      this.autoFit = false;
      this.view = { ...this.view, x: d.view.x + (p.x - d.start.x), y: d.view.y + (p.y - d.start.y) };
      this.draw();
    }
  }

  onUp(event, cancelled = false) {
    const d = this.drag;
    this.drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    if (!d) return;
    if (d.node) d.node.pinned = false;
    const p = this.point(event);
    if (!cancelled && !d.moved && d.node) this.onOpen(d.node.id);
    this.setHover(this.pickNode(p));
    this.canvas.style.cursor = this.hover ? "pointer" : "grab";
  }

  onWheel(event) {
    if (!this.wheelZoom) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.autoFit = false;
    this.view = zoomAt(this.view, this.point(event), factor);
    this.draw();
  }

  // --- Desenho -----------------------------------------------------------------------------

  radius(n) {
    return 4 + Math.min(8, (n.degree || 0) * 1.2);
  }

  readColors() {
    const s = getComputedStyle(this.canvas);
    const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    this.colors = {
      edge: get("--graph-edge", "#8a8a8a"),
      node: get("--graph-node", "#0b6e6e"),
      accent: get("--accent", "#0b6e6e"),
      text: get("--text", "#222"),
      muted: get("--muted", "#666"),
      paper: get("--paper", "#fff"),
    };
  }

  draw() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.readColors();
    const ctx = this.ctx;
    const c = this.colors;
    const view = this.view;
    ctx.clearRect(0, 0, w, h);

    const hover = this.hover;
    const near = hover ? this.layout.neighbors.get(hover.id) : null;
    const dim = (id) => hover && id !== hover.id && !near.has(id);

    ctx.lineWidth = 1;
    for (const e of this.layout.edges) {
      const a = toScreen(view, e.a);
      const b = toScreen(view, e.b);
      const lit = hover && (e.a === hover || e.b === hover);
      ctx.globalAlpha = hover ? (lit ? 0.95 : 0.12) : 0.55;
      ctx.strokeStyle = lit ? c.accent : c.edge;
      ctx.lineWidth = lit ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const many = this.nodes.length > 14;
    const labels = [];
    for (const n of this.nodes) {
      const p = toScreen(view, n);
      const r = this.radius(n) * Math.min(1.4, Math.max(0.8, Math.sqrt(view.scale)));
      ctx.globalAlpha = dim(n.id) ? 0.22 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.id === this.activeId ? c.accent : c.node;
      ctx.fill();
      if (n.id === this.activeId) {
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // quais nomes aparecem: tudo se houver poucas notas; senão, a nota sob o mouse, as vizinhas,
      // a ativa, as mais ligadas e, com zoom, as demais. A ordem define quem ganha o espaço.
      let priority = 0;
      if (n === hover) priority = 5;
      else if (n.id === this.activeId) priority = 4;
      else if (near && near.has(n.id)) priority = 3;
      else if (this.showAllLabels || !many || view.scale > 1.5) priority = 1;
      else if (n.degree >= this.hubMin) priority = 2;
      if (priority && !dim(n.id)) labels.push({ n, p, r, priority });
    }
    // nomes sem sobreposição: o mais importante primeiro; se bater num já desenhado, fica de fora
    labels.sort((a, b) => b.priority - a.priority || b.n.degree - a.n.degree);
    const placed = [];
    ctx.globalAlpha = 1;
    for (const { n, p, r, priority } of labels) {
      const text = n.label.split("/").pop();
      const width = ctx.measureText(text).width;
      // a nota ativa tem um anel de r + 4: o nome começa depois dele, sem encostar
      const box = { x: p.x + r + (n.id === this.activeId ? 10 : 5), y: p.y - 8, w: width, h: 16 };
      const clash = placed.some((q) => box.x < q.x + q.w + 3 && box.x + box.w + 3 > q.x && box.y < q.y + q.h && box.y + box.h > q.y);
      if (clash && priority < 4) continue;
      placed.push(box);
      ctx.fillStyle = priority >= 4 ? c.text : c.muted;
      ctx.fillText(text, box.x, p.y);
    }
  }
}
