// Coleções: as pastas da biblioteca tratadas como cadernos (com capa, ícone, tarefas e subcoleções). Funções puras, sem DOM.

// Endereço de capa: só https (ou http) de imagem. Qualquer outra coisa é recusada.
export const isCoverUrl = (s) => /^https?:\/\/[^\s"'<>]+$/i.test(String(s ?? "").trim());

export function setCover(map, dir, url) {
  const u = String(url ?? "").trim();
  if (!u) return removeCover(map, dir);
  if (!isCoverUrl(u)) throw new Error("A capa precisa de um endereço que comece com http:// ou https://.");
  return { ...map, [dir]: u };
}

export function removeCover(map, dir) {
  if (!(dir in map)) return map;
  const { [dir]: _gone, ...rest } = map;
  return rest;
}

// Renomear uma pasta leva a capa dela e das subcoleções junto.
export function renameCovers(map, from, to) {
  if (!from || from === to) return map;
  const hit = (p) => p === from || p.startsWith(`${from}/`);
  if (!Object.keys(map).some(hit)) return map;
  const out = {};
  for (const [p, url] of Object.entries(map)) out[hit(p) ? `${to}${p.slice(from.length)}` : p] = url;
  return out;
}

// Tarefas de uma coleção: as das notas dentro dela, em qualquer subnível. Sem coleção, todas.
export function tasksInFolder(tasks, dir = "") {
  if (!dir) return tasks;
  return tasks.filter((t) => t.path.startsWith(`${dir}/`));
}

// Pastas filhas diretas de `dir` (ou da raiz), a partir da árvore da biblioteca: { path, name }.
export function childFolders(node, dir = "") {
  let at = node;
  for (const part of dir ? dir.split("/") : []) {
    at = [...(at?.folders?.values() || [])].find((f) => f.name === part);
    if (!at) return [];
  }
  return [...(at.folders?.values() || [])].map((f) => ({ path: f.path, name: f.name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const folderName = (dir) => (dir ? dir.split("/").pop() : "Raiz");
export const folderOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
