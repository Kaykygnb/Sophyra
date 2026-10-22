// Navegação entre abas: histórico (voltar e avançar), abas recém-fechadas, abas fixadas e troca de aba.
// Tudo puro (sem DOM). Os ids são caminhos de nota ou telas do app (@home, @graph…).

export class NavHistory {
  constructor(limit = 100) {
    this.limit = limit;
    this.entries = [];
    this.index = -1;
  }

  get current() {
    return this.entries[this.index] ?? null;
  }

  // Registra uma visita. Repetir o mesmo destino não duplica; visitar algo novo apaga o "avançar".
  push(id) {
    if (!id || id === this.current) return;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(id);
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }

  canBack(exists = () => true) {
    return this.entries.slice(0, this.index).some(exists);
  }

  canForward(exists = () => true) {
    return this.entries.slice(this.index + 1).some(exists);
  }

  // Anda no histórico pulando destinos que não existem mais. Devolve o id ou null.
  back(exists = () => true) {
    for (let i = this.index - 1; i >= 0; i--) {
      if (exists(this.entries[i])) {
        this.index = i;
        return this.entries[i];
      }
    }
    return null;
  }

  forward(exists = () => true) {
    for (let i = this.index + 1; i < this.entries.length; i++) {
      if (exists(this.entries[i])) {
        this.index = i;
        return this.entries[i];
      }
    }
    return null;
  }

  rename(from, to) {
    this.entries = this.entries.map((e) => (e === from ? to : e));
  }

  // Tira um destino apagado, mantendo a posição de quem está olhando.
  remove(id) {
    const before = this.entries.slice(0, this.index + 1).filter((e) => e !== id).length;
    this.entries = this.entries.filter((e) => e !== id);
    // junta vizinhos iguais que ficaram lado a lado
    const out = [];
    for (const e of this.entries) if (out[out.length - 1] !== e) out.push(e);
    this.entries = out;
    this.index = Math.min(this.entries.length - 1, Math.max(-1, before - 1));
  }
}

// Pilha de abas fechadas, para "reabrir a última".
export class ClosedTabs {
  constructor(limit = 20) {
    this.limit = limit;
    this.items = [];
  }

  push(id) {
    if (!id) return;
    this.items = [id, ...this.items.filter((x) => x !== id)].slice(0, this.limit);
  }

  pop(exists = () => true, open = []) {
    while (this.items.length) {
      const id = this.items.shift();
      if (exists(id) && !open.includes(id)) return id;
    }
    return null;
  }
}

// Próxima ou anterior aba, dando a volta.
export function cycleTab(tabs, active, step) {
  if (!tabs.length) return null;
  const i = tabs.indexOf(active);
  if (i === -1) return tabs[0];
  return tabs[(i + step + tabs.length) % tabs.length];
}

// Ir para a n-ésima aba (1 a 8); 9 vai para a última, como no original.
export function gotoTab(tabs, n) {
  if (!tabs.length) return null;
  if (n >= 9) return tabs[tabs.length - 1];
  return tabs[n - 1] ?? null;
}

// Fixar ou soltar uma aba. Devolve a nova lista de fixadas (sem repetir, só ids conhecidos).
export function togglePin(pinned, id) {
  const set = new Set(pinned);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

// Abas fixadas ficam à esquerda, mantendo a ordem de cada grupo.
export function orderTabs(tabs, pinned) {
  const pins = new Set(pinned);
  return [...tabs.filter((t) => pins.has(t)), ...tabs.filter((t) => !pins.has(t))];
}

// Notas diárias (AAAA-MM-DD.md): a anterior ou a próxima à nota aberta. Se a aberta não for diária, parte de `today`.
export function adjacentDaily(paths, activePath, step, today = "") {
  const daily = paths
    .filter((p) => /(^|\/)\d{4}-\d{2}-\d{2}\.md$/.test(p))
    .sort((a, b) => a.split("/").pop().localeCompare(b.split("/").pop()));
  if (!daily.length) return null;
  const name = (p) => (p || "").split("/").pop();
  const isDaily = daily.includes(activePath);
  const key = isDaily ? name(activePath) : `${today}.md`;
  if (step < 0) {
    for (let i = daily.length - 1; i >= 0; i--) if (name(daily[i]) < key) return daily[i];
    return null;
  }
  for (const p of daily) if (name(p) > key) return p;
  return null;
}
