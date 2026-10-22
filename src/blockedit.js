// Motor do editor de blocos: a árvore de blocos com as operações de edição (dividir, juntar, aninhar, mover, converter,
// colar, apagar entre blocos) e um histórico de desfazer/refazer por transações. Não toca no DOM: a vista só traduz
// o que a pessoa faz em chamadas daqui e redesenha o resultado.
//
// Cada operação valida antes de mexer e devolve `false` se não puder; só o que de fato mudou entra no histórico.

import {
  parseBlocks, serializeBlocks, makeBlock, locate, flatten, cloneBlocks, canHaveChildren, canNest, hasText, isRawType, LIST_TYPES, newBlockId, normalizeBlocks,
} from "./blocks.js";

const emptyText = (b) => !b.text || b.text.trim() === "";

export class BlockEditor {
  constructor(markdown = "", { limit = 100, onChange = () => {}, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.onChange = onChange;
    this.now = now;
    this.blocks = parseBlocks(markdown);
    this.ensureOne();
    this.undoStack = [];
    this.redoStack = [];
    this.caret = null; // { id, offset } — onde o cursor está (a vista informa e lê)
    this.journal = []; // registro das transações: { t, label }
  }

  ensureOne() {
    normalizeBlocks(this.blocks);
    if (this.blocks.length === 0) this.blocks.push(makeBlock("paragraph"));
  }

  markdown() {
    return serializeBlocks(this.blocks);
  }

  get(id) {
    return locate(this.blocks, id);
  }

  // Troca o conteúdo todo (nota aberta de novo ou mudada por fora). O histórico recomeça.
  load(markdown) {
    this.blocks = parseBlocks(markdown);
    this.ensureOne();
    this.undoStack = [];
    this.redoStack = [];
    this.caret = null;
  }

  setCaret(id, offset = 0) {
    this.caret = id ? { id, offset } : null;
  }

  // --- Transações e histórico ----------------------------------------------------------------------------------------

  // Executa `fn` como uma transação. `fn` devolve `false` (sem ter mexido em nada) para recusar. Com `key`, edições
  // seguidas da mesma coisa (digitar num bloco) dentro de 1 s viram um passo só no histórico.
  transact(label, fn, { key = null } = {}) {
    const before = JSON.stringify(this.blocks);
    const caretBefore = this.caret ? { ...this.caret } : null;
    const result = fn();
    if (result === false) return false;
    this.ensureOne();
    const after = JSON.stringify(this.blocks);
    if (after === before) return result ?? true;
    const t = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (key && top && top.key === key && t - top.t < 1000) {
      top.after = after;
      top.caretAfter = this.caret ? { ...this.caret } : null;
      top.t = t;
    } else {
      this.undoStack.push({ before, after, key, label, t, caretBefore, caretAfter: this.caret ? { ...this.caret } : null });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.journal.push({ t, label });
    if (this.journal.length > 500) this.journal.shift();
    this.onChange();
    return result ?? true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.blocks = JSON.parse(e.before);
    this.ensureOne();
    this.redoStack.push(e);
    this.caret = e.caretBefore;
    this.onChange();
    return { caret: e.caretBefore, label: e.label };
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.blocks = JSON.parse(e.after);
    this.ensureOne();
    this.undoStack.push(e);
    this.caret = e.caretAfter;
    this.onChange();
    return { caret: e.caretAfter, label: e.label };
  }

  // --- Texto e propriedades ------------------------------------------------------------------------------------------

  setText(id, text) {
    const loc = this.get(id);
    if (!loc || loc.block.text === text) return false;
    return this.transact("texto", () => {
      loc.block.text = text;
    }, { key: `texto:${id}` });
  }

  // Troca o texto inteiro do bloco como um passo próprio do histórico (operações de estrutura, como as de uma tabela).
  replaceText(id, text, label = "tabela") {
    const loc = this.get(id);
    if (!loc || loc.block.text === text) return false;
    return this.transact(label, () => {
      loc.block.text = text;
    });
  }

  setProps(id, props, label = "propriedades") {
    const loc = this.get(id);
    if (!loc) return false;
    return this.transact(label, () => {
      Object.assign(loc.block, props);
    });
  }

  toggleChecked(id) {
    const loc = this.get(id);
    if (!loc || loc.block.type !== "todo") return false;
    return this.transact("tarefa", () => {
      loc.block.checked = !loc.block.checked;
    });
  }

  toggleOpen(id) {
    const loc = this.get(id);
    if (!loc || loc.block.type !== "toggle") return false;
    return this.transact("toggle", () => {
      loc.block.open = !loc.block.open;
    });
  }

  // Converte o bloco para outro tipo, mantendo o texto. Filhos que o novo tipo não aceita sobem para irmãos, e um item
  // aninhado que virou outra coisa sai da lista (a estrutura nunca fica inválida).
  setType(id, type, props = {}, text = undefined) {
    const loc = this.get(id);
    if (!loc) return false;
    const b = loc.block;
    return this.transact("tipo", () => {
      const fresh = makeBlock(type, props);
      const keep = { id: b.id, text: b.text, children: b.children };
      for (const k of Object.keys(b)) delete b[k];
      Object.assign(b, fresh, keep, props);
      b.type = type;
      if (text !== undefined) b.text = text;
      if (type === "divider") b.text = "";
      if (type === "heading" && !b.level) b.level = 1;
      if (!canHaveChildren(type) && b.children.length) {
        const kids = b.children;
        b.children = [];
        loc.siblings.splice(loc.index + 1, 0, ...kids);
      }
      this.settle(b.id);
    });
  }

  // Se o bloco está dentro de um pai que não aceita o tipo dele, sai para fora até caber.
  settle(id) {
    for (let guard = 0; guard < 50; guard++) {
      const loc = this.get(id);
      if (!loc || !loc.parent || canNest(loc.parent.type, loc.block.type)) return;
      this.outdentRaw(id);
    }
  }

  // --- Criar, dividir, juntar, apagar -----------------------------------------------------------------------------------

  insertAfter(id, block, { child = false } = {}) {
    const loc = this.get(id);
    if (!loc) return null;
    const nb = block.id ? block : makeBlock(block.type || "paragraph", block);
    const ok = this.transact("inserir", () => {
      if (child && canHaveChildren(loc.block.type) && canNest(loc.block.type, nb.type)) {
        loc.block.children.unshift(nb);
        if (loc.block.type === "toggle") loc.block.open = true;
      } else {
        loc.siblings.splice(loc.index + 1, 0, nb);
        this.settle(nb.id);
      }
      this.caret = { id: nb.id, offset: 0 };
    });
    return ok === false ? null : nb;
  }

  // Enter no meio (ou no fim) de um bloco: `before` fica nele, `after` vai para um bloco novo logo abaixo.
  split(id, before, after) {
    const loc = this.get(id);
    if (!loc) return null;
    const b = loc.block;
    let created = null;
    const ok = this.transact("dividir", () => {
      b.text = before;
      const type = LIST_TYPES.includes(b.type) ? b.type : "paragraph";
      created = makeBlock(type, { text: after });
      if (LIST_TYPES.includes(b.type)) {
        // o resto do item leva os filhos junto: é o que se espera ao apertar Enter no meio de um item
        created.children = b.children;
        b.children = [];
        loc.siblings.splice(loc.index + 1, 0, created);
      } else if (b.type === "toggle" && b.open) {
        b.children.unshift(created);
      } else {
        loc.siblings.splice(loc.index + 1, 0, created);
      }
      this.caret = { id: created.id, offset: 0 };
    });
    return ok === false ? null : created;
  }

  // Backspace no começo do bloco: junta com o bloco de cima. `joinOffset` é o tamanho do texto do bloco de cima, para a
  // vista pôr o cursor no ponto da junção. Devolve o bloco onde o cursor fica, ou null.
  mergeBack(id, joinOffset = 0) {
    const order = flatten(this.blocks, { visibleOnly: true });
    const at = order.findIndex((b) => b.id === id);
    if (at <= 0) return null;
    const prev = order[at - 1];
    const loc = this.get(id);
    const b = loc.block;
    if (prev.type === "column" || prev.type === "columns") return null; // o começo de uma coluna não junta com o que está fora dela
    if (!hasText(prev.type)) {
      // o de cima não tem texto (divisor, imagem, código…): só some o bloco vazio
      if (!emptyText(b) || b.children.length) return null;
      this.transact("apagar", () => {
        loc.siblings.splice(loc.index, 1);
        this.caret = { id: prev.id, offset: 0 };
      });
      return prev;
    }
    this.transact("juntar", () => {
      const kids = b.children;
      loc.siblings.splice(loc.index, 1);
      prev.text = `${prev.text}${b.text}`;
      if (kids.length) {
        const hold = locate(this.blocks, prev.id);
        if (canHaveChildren(prev.type) && kids.every((k) => canNest(prev.type, k.type))) prev.children.push(...kids);
        else hold.siblings.splice(hold.index + 1, 0, ...kids);
      }
      this.caret = { id: prev.id, offset: joinOffset };
    });
    return prev;
  }

  // Delete no fim do bloco: puxa o de baixo para dentro deste.
  mergeForward(id, joinOffset = 0) {
    const order = flatten(this.blocks, { visibleOnly: true });
    const at = order.findIndex((b) => b.id === id);
    if (at === -1 || at >= order.length - 1) return null;
    const next = order[at + 1];
    if (!hasText(next.type) || !hasText(this.get(id).block.type)) return null;
    const merged = this.mergeBack(next.id, joinOffset);
    if (merged) this.caret = { id, offset: joinOffset };
    return merged;
  }

  remove(id) {
    const loc = this.get(id);
    if (!loc) return false;
    return this.transact("apagar", () => {
      loc.siblings.splice(loc.index, 1);
    });
  }

  // Apaga uma seleção que atravessa blocos: o começo (`head`) do primeiro e o fim (`tail`) do último se juntam, e o que
  // estava no meio some. Os filhos do último bloco, que ficaram fora da seleção, continuam logo abaixo.
  deleteBetween(startId, head, endId, tail) {
    const order = flatten(this.blocks, { visibleOnly: false });
    const a = order.findIndex((b) => b.id === startId);
    const z = order.findIndex((b) => b.id === endId);
    if (a === -1 || z === -1 || a >= z) return false;
    return this.transact("apagar seleção", () => {
      const start = locate(this.blocks, startId);
      const end = locate(this.blocks, endId);
      const orphans = end.block.children;
      end.block.children = [];
      const doomed = new Set(order.slice(a + 1, z + 1).map((b) => b.id));
      const strip = (list) => {
        for (let i = list.length - 1; i >= 0; i--) {
          if (doomed.has(list[i].id)) list.splice(i, 1);
          else strip(list[i].children);
        }
      };
      strip(this.blocks);
      const s = locate(this.blocks, startId);
      s.block.text = `${head}${tail}`;
      if (orphans.length) s.siblings.splice(s.index + 1, 0, ...orphans);
      this.settle(startId);
      this.caret = { id: startId, offset: null };
    });
  }

  // --- Estrutura -----------------------------------------------------------------------------------------------------------

  indent(id) {
    const loc = this.get(id);
    if (!loc || loc.index === 0) return false;
    const prev = loc.siblings[loc.index - 1];
    if (!canHaveChildren(prev.type) || !canNest(prev.type, loc.block.type)) return false;
    return this.transact("recuar", () => {
      loc.siblings.splice(loc.index, 1);
      prev.children.push(loc.block);
      if (prev.type === "toggle") prev.open = true;
    });
  }

  outdent(id) {
    const loc = this.get(id);
    if (!loc || !loc.parent) return false;
    return this.transact("desrecuar", () => this.outdentRaw(id));
  }

  // Sai do pai: o bloco vem para logo depois dele e os irmãos que vinham depois seguem com ele (como filhos, se couber).
  outdentRaw(id) {
    const loc = this.get(id);
    if (!loc || !loc.parent) return false;
    const parentLoc = this.get(loc.parent.id);
    const later = loc.siblings.splice(loc.index + 1);
    loc.siblings.splice(loc.index, 1);
    const b = loc.block;
    const fits = later.length && canHaveChildren(b.type) && later.every((l) => canNest(b.type, l.type));
    if (fits) b.children.push(...later);
    parentLoc.siblings.splice(parentLoc.index + 1, 0, b, ...(fits ? [] : later));
    return true;
  }

  // Move um bloco para dentro de `parentId` (ou para a raiz, com null) na posição `index`.
  moveBlock(id, parentId, index) {
    const loc = this.get(id);
    if (!loc) return false;
    let parent = null;
    if (parentId) {
      parent = this.get(parentId);
      if (!parent) return false;
      if (parentId === id || locate(loc.block.children, parentId)) return false; // não vai para dentro de si mesmo
      if (!canHaveChildren(parent.block.type) || !canNest(parent.block.type, loc.block.type)) return false;
    }
    return this.transact("mover", () => {
      const target = parent ? parent.block.children : this.blocks;
      let at = Math.max(0, Math.min(index, target.length)); // posição na lista de antes da remoção
      loc.siblings.splice(loc.index, 1);
      if (target === loc.siblings && at > loc.index) at--; // a remoção deslocou os índices
      target.splice(at, 0, loc.block);
    });
  }

  // Coloca o bloco antes ou depois de outro (usado ao arrastar). `where`: "before" | "after" | "inside".
  moveRelative(id, targetId, where) {
    if (id === targetId) return false;
    const target = this.get(targetId);
    const loc = this.get(id);
    if (!target || !loc || locate(loc.block.children, targetId)) return false;
    if (where === "inside") return this.moveBlock(id, targetId, target.block.children.length);
    const parentId = target.parent ? target.parent.id : null;
    if (target.parent && !canNest(target.parent.type, loc.block.type)) return false;
    return this.moveBlock(id, parentId, target.index + (where === "after" ? 1 : 0));
  }

  // Sobe ou desce entre os irmãos.
  move(id, dir) {
    const loc = this.get(id);
    if (!loc) return false;
    const j = loc.index + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= loc.siblings.length) return false;
    return this.transact("mover", () => {
      [loc.siblings[loc.index], loc.siblings[j]] = [loc.siblings[j], loc.siblings[loc.index]];
    });
  }

  duplicate(id) {
    const loc = this.get(id);
    if (!loc) return null;
    const copy = cloneBlocks([loc.block])[0];
    const fresh = (b) => {
      b.id = newBlockId();
      b.children.forEach(fresh);
    };
    fresh(copy);
    this.transact("duplicar", () => {
      loc.siblings.splice(loc.index + 1, 0, copy);
      this.caret = { id: copy.id, offset: 0 };
    });
    return copy;
  }

  // Cola blocos depois de `id`. Se o bloco de destino está vazio, é substituído pelo primeiro colado.
  insertBlocks(id, blocks, { replaceEmpty = true } = {}) {
    const loc = this.get(id);
    if (!loc || blocks.length === 0) return null;
    this.transact("colar", () => {
      const list = [...blocks];
      let at = loc.index + 1;
      if (replaceEmpty && emptyText(loc.block) && hasText(loc.block.type) && !loc.block.children.length) {
        loc.siblings.splice(loc.index, 1, list.shift());
        at = loc.index + 1;
      }
      loc.siblings.splice(at, 0, ...list);
      const last = blocks[blocks.length - 1];
      this.settle(blocks[0].id);
      this.caret = { id: last.id, offset: null };
    });
    return blocks[blocks.length - 1];
  }

  // --- Colunas ---------------------------------------------------------------------------------------------------------------

  // Põe o bloco numa primeira coluna e acrescenta mais `count - 1` colunas vazias ao lado (2 a 5).
  wrapInColumns(id, count = 2) {
    const loc = this.get(id);
    if (!loc || loc.block.type === "column" || loc.block.type === "columns") return null;
    if (loc.parent && !canNest(loc.parent.type, "columns")) return null;
    const n = Math.max(2, Math.min(5, count));
    const cols = Array.from({ length: n }, (_, k) => makeBlock("column", { children: k === 0 ? [loc.block] : [makeBlock("paragraph")] }));
    const wrap = makeBlock("columns", { children: cols });
    const ok = this.transact("colunas", () => {
      loc.siblings.splice(loc.index, 1, wrap);
      this.caret = { id: cols[1].children[0].id, offset: 0 };
    });
    return ok === false ? null : wrap;
  }

  addColumn(columnsId) {
    const loc = this.get(columnsId);
    if (!loc || loc.block.type !== "columns" || loc.block.children.length >= 5) return null;
    const col = makeBlock("column", { children: [makeBlock("paragraph")] });
    this.transact("coluna", () => {
      loc.block.children.push(col);
      this.caret = { id: col.children[0].id, offset: 0 };
    });
    return col;
  }

  // Tira uma coluna: o conteúdo dela passa para o fim da coluna vizinha, então nada se perde.
  removeColumn(columnId) {
    const loc = this.get(columnId);
    if (!loc || loc.block.type !== "column" || !loc.parent) return false;
    return this.transact("coluna", () => {
      const keep = loc.siblings[loc.index === 0 ? 1 : loc.index - 1];
      const moved = loc.block.children.filter((c) => !(c.type === "paragraph" && emptyText(c) && !c.children.length));
      keep.children.push(...moved);
      loc.siblings.splice(loc.index, 1);
    });
  }

  // Desfaz as colunas: os blocos de cada uma ficam soltos, um depois do outro, no lugar delas.
  unwrapColumns(columnsId) {
    const loc = this.get(columnsId);
    if (!loc || loc.block.type !== "columns") return false;
    return this.transact("desfazer colunas", () => {
      const loose = loc.block.children.flatMap((c) => c.children.filter((x) => !(x.type === "paragraph" && emptyText(x) && !x.children.length)));
      loc.siblings.splice(loc.index, 1, ...loose);
    });
  }

  // Quantidade de blocos de texto e de palavras, para a barra de status.
  stats() {
    const text = flatten(this.blocks).map((b) => (isRawType(b.type) ? "" : b.text || "")).join(" ");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { blocks: flatten(this.blocks).length, words };
  }
}
