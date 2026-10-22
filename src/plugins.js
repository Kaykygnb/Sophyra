// Sistema de plugins locais.
// Ciclo de vida: manifesto → importar o módulo → onload(api) → ativo → onunload() → limpeza.
// A limpeza remove comandos, painéis e assinaturas de eventos que o plugin registrou.
// Não há sandbox: plugins rodam com os mesmos privilégios da página. Use só código que você conhece.

// Permissões que um plugin pode pedir no manifesto (`permissoes`). É controle da API que o app entrega: não isola o
// código do plugin, que continua rodando na página e pode, por exemplo, usar a rede por conta própria.
export const PERMISSOES = {
  "notas:ler": "Ler notas e acompanhar mudanças na biblioteca",
  "notas:escrever": "Criar notas",
  editor: "Ler e alterar o texto da nota aberta",
  painel: "Criar painéis, telas e janelas",
  comandos: "Registrar comandos na paleta",
  navegar: "Abrir notas e telas",
};

// Conjunto de permissões declaradas, ou null quando o manifesto não declara nenhuma (compatibilidade: acesso total).
export function permissionsOf(manifest) {
  return Array.isArray(manifest?.permissoes) ? new Set(manifest.permissoes) : null;
}

export function validatePermissions(manifest) {
  if (manifest.permissoes === undefined) return;
  if (!Array.isArray(manifest.permissoes)) throw new Error("Manifesto inválido: permissoes deve ser uma lista");
  for (const p of manifest.permissoes) {
    if (!Object.prototype.hasOwnProperty.call(PERMISSOES, p)) throw new Error(`Permissão desconhecida: ${p}`);
  }
}

export class PluginHost {
  constructor({ vault, storage, importer, onChange = () => {}, dialog = null } = {}) {
    this.vault = vault;
    this.storage = storage; // { get(key, fallback), set(key, value) }
    this.importer = importer || ((path) => import(path));
    this.onChange = onChange;
    this.dialog = dialog; // (opções) => void, abre uma caixa de diálogo do app
    this.registry = new Map(); // id -> manifesto
    this.active = new Map(); // id -> { cleanups: [], error: null }
    this.commandsMap = new Map(); // chave global -> comando
    this.panelsMap = new Map(); // chave global -> painel
    this.viewsMap = new Map(); // chave global -> tela própria do plugin
    this.getActiveNote = () => null;
    // Editor da nota aberta, fornecido pelo app: { getValue, getSelection, insertAtCursor, replaceSelection } ou null
    // quando não há editor disponível (nenhuma nota aberta, ou modo de leitura).
    this.editorApi = () => null;
    // Porta de consentimento (como o "Trust author" do original): recebe o manifesto e devolve um texto de recusa, ou null.
    this.gate = () => null;
  }

  // Registra manifestos (sem ativar). Cada manifesto: { id, nome, versao, descricao, main }.
  register(manifests) {
    for (const m of manifests) {
      if (!m || !m.id || !m.main) throw new Error("Manifesto inválido: falta id ou main");
      if (this.registry.has(m.id)) throw new Error(`Plugin duplicado: ${m.id}`);
      validatePermissions(m);
      this.registry.set(m.id, { ...m });
    }
    this.onChange();
  }

  // Ativa plugins que estavam ligados na última sessão (ou todos, se nunca foram configurados).
  async restore() {
    const saved = this.storage.get("plugins.ativos", null);
    // importado só liga com consentimento; `padrao: false` fica desligado até a pessoa ligar (ferramentas internas do projeto)
    const wanted = saved ?? [...this.registry.keys()].filter((id) => !this.registry.get(id).importado && this.registry.get(id).padrao !== false);
    for (const id of wanted) {
      if (this.registry.has(id)) await this.enable(id, { persist: false });
    }
    this.persist();
  }

  async enable(id, { persist = true } = {}) {
    const manifest = this.registry.get(id);
    if (!manifest) throw new Error(`Plugin desconhecido: ${id}`);
    if (this.active.has(id)) return;
    const entry = { cleanups: [], error: null };
    this.active.set(id, entry);
    try {
      const refused = this.gate(manifest);
      if (refused) throw new Error(refused);
      const mod = await this.importer(manifest.main);
      const plugin = mod.default ?? mod;
      if (!plugin || typeof plugin.onload !== "function") {
        throw new Error("o módulo precisa exportar um objeto com onload(api)");
      }
      entry.plugin = plugin;
      await plugin.onload(this.makeApi(id, entry));
    } catch (err) {
      entry.error = err.message;
      this.cleanup(id, entry);
    }
    if (persist) this.persist();
    this.onChange();
    return this.status(id);
  }

  // Tira um plugin da lista (usado ao remover um importado): desativa primeiro, para limpar comandos, painéis e eventos.
  async unregister(id) {
    await this.disable(id, { persist: false });
    this.registry.delete(id);
    this.persist();
    this.onChange();
  }

  async disable(id, { persist = true } = {}) {
    const entry = this.active.get(id);
    if (!entry) return;
    try {
      await entry.plugin?.onunload?.();
    } catch (err) {
      entry.error = `onunload: ${err.message}`;
    }
    this.cleanup(id, entry);
    this.active.delete(id);
    if (persist) this.persist();
    this.onChange();
  }

  cleanup(id, entry) {
    for (const fn of entry.cleanups) {
      try {
        fn();
      } catch {
        // limpeza nunca deve impedir a desativação
      }
    }
    entry.cleanups = [];
    for (const [key, cmd] of this.commandsMap) if (cmd.plugin === id) this.commandsMap.delete(key);
    for (const [key, panel] of this.panelsMap) if (panel.plugin === id) this.panelsMap.delete(key);
    for (const [key, view] of this.viewsMap) if (view.plugin === id) this.viewsMap.delete(key);
  }

  // Troca a biblioteca usado pelos plugins. Os plugins ativos são desativados e ativados de novo,
  // para que assinaturas de eventos apontem para a biblioteca novo.
  async setVault(vault) {
    const ids = [...this.active.keys()];
    for (const id of ids) await this.disable(id, { persist: false });
    this.vault = vault;
    for (const id of ids) await this.enable(id, { persist: false });
  }

  persist() {
    this.storage.set("plugins.ativos", [...this.active.keys()]);
  }

  status(id) {
    const m = this.registry.get(id);
    const e = this.active.get(id);
    return {
      id,
      nome: m?.nome || id,
      versao: m?.versao || "",
      descricao: m?.descricao || "",
      permissoes: m?.permissoes ?? null,
      importado: !!m?.importado,
      ativo: !!e && !e.error,
      erro: e?.error || null,
    };
  }

  list() {
    return [...this.registry.keys()].map((id) => this.status(id));
  }

  commands() {
    return [...this.commandsMap.values()];
  }

  panels() {
    return [...this.panelsMap.values()];
  }

  views() {
    return [...this.viewsMap.values()];
  }

  makeApi(id, entry) {
    const host = this;
    const track = (fn) => {
      entry.cleanups.push(fn);
      return fn;
    };
    const api = {
      id,
      notify(text) {
        host.onChange({ notice: `${host.registry.get(id)?.nome || id}: ${text}` });
      },
      addCommand({ id: cmdId, name, run }) {
        const key = `${id}:${cmdId}`;
        host.commandsMap.set(key, { key, name, run, plugin: id });
        track(() => host.commandsMap.delete(key));
        host.onChange();
      },
      addPanel({ id: panelId, title, render, icon = "puzzle" }) {
        const key = `${id}:${panelId}`;
        host.panelsMap.set(key, { key, title, render, icon, plugin: id });
        track(() => host.panelsMap.delete(key));
        host.onChange();
      },
      // Tela própria: aparece como item da ribbon e abre numa aba. render(el) desenha o conteúdo.
      addView({ id: viewId, title, icon = "puzzle", render }) {
        const key = `${id}:${viewId}`;
        host.viewsMap.set(key, { key, title, icon, render, plugin: id });
        track(() => host.viewsMap.delete(key));
        host.onChange();
      },
      openView(viewId) {
        host.onChange({ view: `${id}:${viewId}` });
      },
      onVault(event, fn) {
        const off = host.vault.on(event, fn);
        track(() => off());
        return off;
      },
      activeNote() {
        const path = host.getActiveNote();
        if (!path || !host.vault.has(path)) return null;
        return { path, content: host.vault.read(path) };
      },
      listNotes() {
        return host.vault.markdownFiles().map((f) => ({ path: f.path, content: f.content }));
      },
      readNote(path) {
        return host.vault.has(path) ? host.vault.read(path) : null;
      },
      createNote(path, content) {
        return host.vault.create(path, content);
      },
      openNote(path) {
        host.onChange({ open: path });
      },
      openDialog(opts) {
        if (host.dialog) host.dialog({ ...opts, plugin: id });
      },
      // Editor da nota aberta. Cada chamada confere se há editor; sem ele, lê vazio e as escritas devolvem false.
      editor: {
        available: () => !!host.editorApi(),
        getValue: () => host.editorApi()?.getValue() ?? "",
        getSelection: () => host.editorApi()?.getSelection() ?? "",
        insertAtCursor(text) {
          const ed = host.editorApi();
          if (!ed || typeof text !== "string") return false;
          ed.insertAtCursor(text);
          return true;
        },
        replaceSelection(text) {
          const ed = host.editorApi();
          if (!ed || typeof text !== "string") return false;
          ed.replaceSelection(text);
          return true;
        },
      },
      settings: {
        get: (key, fallback) => host.storage.get(`plugin.${id}.${key}`, fallback),
        set: (key, value) => host.storage.set(`plugin.${id}.${key}`, value),
      },
    };
    return restrictApi(api, id, host.registry.get(id));
  }
}

// Embrulha as funções da API que exigem permissão: sem ela, a chamada lança um erro que diz o que faltou.
function restrictApi(api, id, manifest) {
  const declared = permissionsOf(manifest);
  if (!declared) return api;
  const nome = manifest.nome || id;
  const guard = (perm, label, fn) => (...args) => {
    if (!declared.has(perm)) throw new Error(`O plugin “${nome}” não tem a permissão “${perm}” (${label}). Declare-a em permissoes no manifesto.`);
    return fn(...args);
  };
  const table = {
    "notas:ler": ["activeNote", "listNotes", "readNote", "onVault"],
    "notas:escrever": ["createNote"],
    painel: ["addPanel", "addView", "openView", "openDialog"],
    comandos: ["addCommand"],
    navegar: ["openNote"],
  };
  for (const [perm, names] of Object.entries(table)) for (const n of names) api[n] = guard(perm, n, api[n]);
  for (const n of Object.keys(api.editor)) api.editor[n] = guard("editor", `editor.${n}`, api.editor[n]);
  return api;
}
