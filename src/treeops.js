// Operações da árvore de arquivos (mover e soltar): quais itens podem ir para uma pasta e quais caminhos novos eles
// terão. Funções puras, sem DOM nem biblioteca, para testar. `item` é { path, dir } (dir = pasta, senão arquivo).

export const nameOf = (path) => path.slice(path.lastIndexOf("/") + 1);
export const parentOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const isInside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

// Caminho novo de um item solto dentro de `dest` ("" = raiz da biblioteca).
export const destOf = (item, dest = "") => (dest ? `${dest}/` : "") + nameOf(item.path);

// Planeja a mudança de vários itens para `dest`. `taken(caminho, eDiretorio)` diz se o destino já está ocupado.
// Devolve { ok, moves: [{ from, to, dir }], reason }. Nada é alterado aqui.
export function planMove(items, dest, taken) {
  const moves = [];
  const seen = new Set();
  for (const item of items) {
    if (item.dir && isInside(dest, item.path)) {
      return { ok: false, moves: [], reason: `“${nameOf(item.path)}” não pode ir para dentro dela mesma.` };
    }
    const to = destOf(item, dest);
    if (to === item.path) continue; // já está nesse lugar
    if (seen.has(to) || taken(to, item.dir)) {
      return { ok: false, moves: [], reason: `Já existe “${nameOf(to)}” em ${dest || "a raiz"}.` };
    }
    seen.add(to);
    moves.push({ from: item.path, to, dir: !!item.dir });
  }
  return { ok: true, moves, reason: "" };
}

// Quando o item de origem é uma pasta, o destino também não pode ser um dos seus descendentes (já coberto por isInside).
// Sem `dest` (raiz) qualquer item cabe, então só as regras acima valem.
export const canDrop = (items, dest, taken) => planMove(items, dest, taken).ok;
