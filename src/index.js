// Índice derivado da biblioteca: links de saída, backlinks, tags, tarefas, grafo e busca.
// Tudo é recalculado a partir do conteúdo dos arquivos; nada aqui é fonte de verdade.

import { extractMetadata } from "./markdown.js";
import { extOf } from "./vault.js";

export class MetadataIndex {
  constructor(vault) {
    this.vault = vault;
    this.cache = new Map(); // path -> { content, meta }
  }

  meta(path) {
    const file = this.vault.get(path);
    if (!file || extOf(path) !== "md") return null;
    const hit = this.cache.get(path);
    if (hit && hit.content === file.content) return hit.meta;
    const meta = extractMetadata(file.content);
    this.cache.set(path, { content: file.content, meta });
    return meta;
  }

  // Remove entradas de arquivos apagados.
  prune() {
    for (const path of this.cache.keys()) if (!this.vault.has(path)) this.cache.delete(path);
  }

  outgoing(path) {
    const meta = this.meta(path);
    if (!meta) return [];
    return meta.links.map((l) => ({
      target: l.target,
      line: l.line,
      resolved: this.vault.resolveLink(l.target, path),
    }));
  }

  backlinks(path) {
    const result = [];
    for (const file of this.vault.markdownFiles()) {
      if (file.path === path) continue;
      const lines = [];
      for (const link of this.outgoing(file.path)) {
        if (link.resolved === path) lines.push(link.line);
      }
      if (lines.length) result.push({ source: file.path, lines });
    }
    return result;
  }

  unresolved() {
    const counts = new Map();
    for (const file of this.vault.markdownFiles()) {
      for (const link of this.outgoing(file.path)) {
        if (!link.resolved) counts.set(link.target, (counts.get(link.target) || 0) + 1);
      }
    }
    return [...counts.entries()].map(([target, count]) => ({ target, count })).sort((a, b) => b.count - a.count);
  }

  tags() {
    const map = new Map();
    for (const file of this.vault.markdownFiles()) {
      for (const tag of this.meta(file.path).tags) {
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag).push(file.path);
      }
    }
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")));
  }

  tasks() {
    const out = [];
    for (const file of this.vault.markdownFiles()) {
      for (const t of this.meta(file.path).tasks) out.push({ ...t, path: file.path });
    }
    return out;
  }

  // Grafo de notas: nós são notas, arestas são links resolvidos (sem duplicatas, sem laços).
  graph() {
    const nodes = this.vault.markdownFiles().map((f) => ({ id: f.path, label: f.path.replace(/\.md$/, "") }));
    const seen = new Set();
    const edges = [];
    for (const node of nodes) {
      for (const link of this.outgoing(node.id)) {
        if (!link.resolved || link.resolved === node.id) continue;
        const key = `${node.id}->${link.resolved}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: node.id, target: link.resolved });
      }
    }
    const degree = new Map(nodes.map((n) => [n.id, 0]));
    for (const e of edges) {
      degree.set(e.source, degree.get(e.source) + 1);
      degree.set(e.target, degree.get(e.target) + 1);
    }
    return { nodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) })), edges };
  }

  // Busca: termos separados por espaço (todos precisam aparecer), "frase exata",
  // tag:assunto, path:pasta e -termo para excluir.
  search(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    const tokens = [];
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(q))) tokens.push(m[1] || m[2]);

    const include = [];
    const exclude = [];
    const tagFilters = [];
    const pathFilters = [];
    for (const t of tokens) {
      if (/^tag:/i.test(t)) tagFilters.push(t.slice(4).replace(/^#/, "").toLowerCase());
      else if (/^path:/i.test(t)) pathFilters.push(t.slice(5).toLowerCase());
      else if (t.startsWith("-") && t.length > 1) exclude.push(t.slice(1).toLowerCase());
      else include.push(t.toLowerCase());
    }

    const results = [];
    for (const file of this.vault.list()) {
      const lower = file.content.toLowerCase();
      const path = file.path.toLowerCase();
      if (pathFilters.some((p) => !path.includes(p))) continue;
      if (include.some((term) => !lower.includes(term) && !path.includes(term))) continue;
      if (exclude.some((term) => lower.includes(term))) continue;
      if (extOf(file.path) === "md" && tagFilters.length) {
        const tags = this.meta(file.path).tags.map((t) => t.toLowerCase());
        if (tagFilters.some((t) => !tags.includes(t))) continue;
      } else if (tagFilters.length) continue;

      let score = 0;
      for (const term of include) {
        if (path.includes(term)) score += 5;
        score += countOccurrences(lower, term);
      }
      results.push({ path: file.path, score, snippet: snippetFor(file.content, include[0] || tagFilters[0] || "") });
    }
    return results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "pt-BR"));
  }
}

function countOccurrences(text, term) {
  if (!term) return 0;
  let count = 0;
  let idx = text.indexOf(term);
  while (idx !== -1 && count < 50) {
    count++;
    idx = text.indexOf(term, idx + term.length);
  }
  return count;
}

function snippetFor(content, term) {
  if (!term) return content.slice(0, 120).replace(/\s+/g, " ");
  const idx = content.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return content.slice(0, 120).replace(/\s+/g, " ");
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + content.slice(start, idx + term.length + 80).replace(/\s+/g, " ");
}
