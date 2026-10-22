// Abas de Configurações ligadas a contas e servidor: Conta, Bibliotecas, Servidor e conexão, Agentes (MCP).
// Cada aba é desenhada por uma função assíncrona, porque parte dos dados vem do aplicativo desktop (IPC) ou do servidor.
// `net` (montado em app.js) reúne o que essas abas precisam: perfil, conexão, ponte do desktop e chamadas à API.

import { icon } from "./icons.js";
import { escapeHtml } from "./markdown.js";

const row = (title, sub, control = "") =>
  `<div class="form-row"><div class="grow"><div class="title">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${control}</div>`;

const ROLE_LABEL = { dono: "Dono", editor: "Editor", leitor: "Leitor" };
const roleSelect = (value, attrs = "") => `<select class="field" ${attrs} aria-label="Papel">${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`).join("")}</select>`;
const initial = (name) => escapeHtml((String(name || "?").trim()[0] || "?").toUpperCase());

function on(el, selector, handler, event = "click") {
  for (const node of el.querySelectorAll(selector)) node.addEventListener(event, (e) => handler(e, node));
}

// Roda uma ação, mostra o erro como aviso e redesenha a aba.
const guarded = (net, redraw) => async (fn) => {
  try {
    await fn();
  } catch (err) {
    net.toast(err.message || String(err), "error");
  }
  await redraw();
};

// --- Conta -------------------------------------------------------------------

export async function renderConta(el, net) {
  const p = net.profile();
  const r = net.remote();
  el.innerHTML = `
    <div class="rows">
      <div class="form-row profile-head">
        <span class="avatar" aria-hidden="true">${initial(p.name)}</span>
        <div class="grow"><div class="title">${escapeHtml(p.name || "Sem nome")}</div><div class="sub">${escapeHtml(p.bio || "Conta local deste aplicativo. Fica só neste computador.")}</div></div>
      </div>
      ${row("Nome", "Aparece nos seus comentários e nas menções.", `<input class="field" data-f="name" value="${escapeHtml(p.name)}" maxlength="60" placeholder="Seu nome" aria-label="Nome">`)}
      ${row("Sobre você", "Opcional. Até 280 caracteres.", `<input class="field" data-f="bio" value="${escapeHtml(p.bio)}" maxlength="280" placeholder="Uma linha sobre você" aria-label="Sobre você">`)}
      ${row("", "", `<button class="btn primary" data-save>${icon("check", 16)} Salvar perfil</button>`)}
    </div>
    ${r ? `<h3 class="sub-h">Conexão atual</h3><div class="rows">${row(r.kind === "rede" ? "Servidor" : "Biblioteca local", `${escapeHtml(r.name)}${r.kind === "rede" ? ` · ${escapeHtml(r.url)}` : ""}${r.user ? ` · você é ${escapeHtml(ROLE_LABEL[r.user.role] || r.user.role)} (${escapeHtml(r.user.name)})` : ""}`, r.kind === "rede" ? `<button class="btn" data-leave>${icon("disconnect", 16)} ${r.served ? "Sair" : "Sair do servidor"}</button>` : "")}</div>` : ""}`;
  on(el, "[data-save]", async () => {
    const patch = { name: el.querySelector('[data-f="name"]').value, bio: el.querySelector('[data-f="bio"]').value };
    await net.setProfile(patch);
    net.toast("Perfil salvo.", "success");
    await renderConta(el, net);
  });
  on(el, "[data-leave]", () => net.disconnect());
}

// --- Bibliotecas --------------------------------------------------------------

export async function renderBibliotecas(el, net) {
  const redraw = () => renderBibliotecas(el, net);
  const run = guarded(net, redraw);
  const d = net.desktop;
  if (!d) {
    el.innerHTML = `<div class="rows">
      ${row("Biblioteca atual", `${escapeHtml(net.libraryName())}. Neste navegador há uma biblioteca por vez; use a aba Biblioteca e pasta para ligá-la a uma pasta do disco.`)}
      ${row("Várias bibliotecas", "O aplicativo desktop guarda uma lista de bibliotecas (cada uma é uma pasta) e troca entre elas sem fechar.")}
    </div>`;
    return;
  }
  const st = await d.state();
  el.innerHTML = `
    <div class="rows">
      ${st.libraries.map((l) => row(
        `${escapeHtml(l.name)}${l.active ? ' <span class="chip">aberta</span>' : ""}`,
        escapeHtml(l.path),
        `<div class="toolbar-actions">
          ${l.active ? "" : `<button class="btn primary" data-open="${l.id}">Abrir</button>`}
          <button class="btn" data-rename="${l.id}" data-name="${escapeHtml(l.name)}">Renomear</button>
          <button class="btn" data-reveal="${l.id}">${icon("folder-open", 16)}</button>
          <button class="btn danger" data-remove="${l.id}" data-name="${escapeHtml(l.name)}" aria-label="Tirar da lista">${icon("x", 16)}</button>
        </div>`)).join("") || row("Nenhuma biblioteca", "Adicione uma pasta para começar.")}
      ${row("Adicionar biblioteca", "Escolha uma pasta com suas notas (ou uma pasta vazia para começar do zero).", `<button class="btn primary" data-add>${icon("folder-plus", 16)} Adicionar pasta…</button>`)}
    </div>
    <p class="small">Tirar da lista não apaga nada: os arquivos continuam na pasta.</p>`;
  on(el, "[data-add]", () => run(async () => {
    const lib = await d.addLibrary();
    if (lib) net.toast(`Biblioteca “${lib.name}” aberta.`, "success");
  }));
  on(el, "[data-open]", (_e, b) => run(() => d.useLibrary(b.dataset.open)));
  on(el, "[data-reveal]", (_e, b) => d.revealLibrary(b.dataset.reveal));
  on(el, "[data-rename]", (_e, b) => run(async () => {
    const name = await net.askText("Renomear biblioteca", b.dataset.name);
    if (name) await d.renameLibrary(b.dataset.rename, name);
  }));
  on(el, "[data-remove]", (_e, b) => run(async () => {
    if (await net.askConfirm(`Tirar “${b.dataset.name}” da lista? Os arquivos ficam na pasta.`, "Tirar da lista", "Tirar")) await d.removeLibrary(b.dataset.remove);
  }));
}

// --- Servidor e conexão -------------------------------------------------------

async function accountsBlock(net, canManage) {
  if (!canManage) return "";
  let users = [];
  try {
    users = (await net.api("/users")).users;
  } catch {
    return "";
  }
  return `<h3 class="sub-h">Contas de quem pode entrar</h3>
    <div class="rows">
      ${users.map((u) => row(escapeHtml(u.name), `desde ${escapeHtml(u.created.slice(0, 10))}`, `<div class="toolbar-actions">${roleSelect(u.role, `data-role="${u.id}"`)}<button class="btn danger" data-del-user="${u.id}" data-name="${escapeHtml(u.name)}" aria-label="Remover conta">${icon("x", 16)}</button></div>`)).join("") || row("Nenhuma conta ainda", "Crie primeiro a conta de dono.")}
      <form class="form-row new-user" data-new-user>
        <input class="field" name="name" placeholder="Nome" autocomplete="off" required aria-label="Nome da conta">
        <input class="field" name="password" type="password" placeholder="Senha (8+)" autocomplete="new-password" minlength="8" required aria-label="Senha da conta">
        ${roleSelect(users.length ? "editor" : "dono", 'name="role"')}
        <button class="btn primary" type="submit">${icon("plus", 16)} Criar conta</button>
      </form>
    </div>`;
}

export async function renderServidor(el, net) {
  const redraw = () => renderServidor(el, net);
  const run = guarded(net, redraw);
  const d = net.desktop;
  const r = net.remote();
  const st = d ? await d.state() : null;
  const serving = st?.server?.network;
  const canManage = !!(d || r?.user?.role === "dono");

  let serveHtml;
  if (d) {
    serveHtml = `<div class="rows">
      ${row("Servir esta biblioteca", serving ? "Outras pessoas podem entrar com uma conta, pelo navegador ou por outro Sophyra." : "Desligado. Ao ligar, quem tiver o endereço e uma conta poderá ler e, se o papel permitir, editar.", `<button class="btn ${serving ? "danger" : "primary"}" data-serve="${serving ? "stop" : "start"}">${icon("activity", 16)} ${serving ? "Parar de servir" : "Servir"}</button>`)}
      ${serving
        ? row("Endereços", `${serving.addresses.map((a) => `<code>${escapeHtml(a)}</code>`).join(" · ") || "Nenhuma rede encontrada."}<br>Sem HTTPS: use só em rede confiável, ou atrás de um proxy com TLS.`, `<button class="btn" data-copy="${escapeHtml(serving.addresses[0] || "")}">${icon("copy", 16)} Copiar</button>`)
        : `${row("Porta", "Entre 1024 e 65535.", `<input class="field" data-port type="number" min="1024" max="65535" value="${st.serve.port}" aria-label="Porta">`)}
           ${row("Quem alcança", "“Rede” abre para outros aparelhos; “Só aqui” limita a esta máquina.", `<select class="field" data-host aria-label="Quem alcança"><option value="0.0.0.0" ${st.serve.host === "0.0.0.0" ? "selected" : ""}>Rede</option><option value="127.0.0.1" ${st.serve.host === "127.0.0.1" ? "selected" : ""}>Só aqui</option></select>`)}`}
    </div>`;
  } else if (r?.kind === "rede" || r?.served) {
    serveHtml = `<div class="rows">${row("Esta página vem de um servidor Sophyra", "Quem administra o servidor controla quem entra. Contas e papéis aparecem abaixo se você for dono.")}</div>`;
  } else {
    serveHtml = `<div class="rows">${row("Servir esta biblioteca", "No navegador não dá para abrir uma porta. Use o aplicativo desktop (botão Servir) ou, em um servidor, <code>node bin/sophyra-server.mjs --pasta …</code>.")}</div>`;
  }

  const connectHtml = r?.served && r.kind === "rede"
    ? `<div class="rows">${row(`Sessão em ${escapeHtml(r.name)}`, `Você entrou como ${escapeHtml(r.user?.name || "")}.`, `<button class="btn" data-leave>${icon("disconnect", 16)} Sair</button>`)}</div>`
    : r?.kind === "rede"
    ? `<div class="rows">${row(`Conectado a ${escapeHtml(r.name)}`, `${escapeHtml(r.url)} · ${escapeHtml(r.user?.name || "")}`, `<button class="btn" data-leave>${icon("disconnect", 16)} Desconectar</button>`)}</div>`
    : `<form class="rows connect" data-connect>
        ${row("Endereço do servidor", "Por exemplo http://192.168.0.10:8787", `<input class="field" name="url" placeholder="http://…" autocomplete="url" required aria-label="Endereço do servidor">`)}
        ${row("Conta", "Nome e senha criados pelo dono do servidor.", `<div class="toolbar-actions"><input class="field" name="name" placeholder="Nome" autocomplete="username" required aria-label="Nome"><input class="field" name="password" type="password" placeholder="Senha" autocomplete="current-password" required aria-label="Senha"></div>`)}
        ${row("", "A biblioteca do servidor abre no lugar da atual. A sua continua guardada e volta quando você desconectar.", `<button class="btn primary" type="submit">${icon("link", 16)} Conectar</button>`)}
      </form>`;

  el.innerHTML = `${serveHtml}${await accountsBlock(net, canManage && (serving || !d))}<h3 class="sub-h">Conectar a outro servidor</h3>${connectHtml}`;

  on(el, "[data-serve]", (_e, b) => run(async () => {
    if (b.dataset.serve === "stop") return d.stopServing();
    const users = (await net.api("/users")).users;
    if (!users.some((u) => u.role === "dono")) throw new Error("Crie primeiro uma conta de dono (abaixo).");
    await d.startServing({ port: Number(el.querySelector("[data-port]").value), host: el.querySelector("[data-host]").value });
    net.toast("Servindo a biblioteca.", "success");
  }));
  on(el, "[data-copy]", async (_e, b) => {
    await navigator.clipboard?.writeText(b.dataset.copy).catch(() => {});
    net.toast("Endereço copiado.", "success");
  });
  on(el, "[data-role]", (_e, s) => run(() => net.api(`/users/${s.dataset.role}`, { method: "PATCH", body: { role: s.value } })), "change");
  on(el, "[data-del-user]", (_e, b) => run(async () => {
    if (await net.askConfirm(`Remover a conta “${b.dataset.name}”? A pessoa perde o acesso.`, "Remover conta", "Remover")) await net.api(`/users/${b.dataset.delUser}`, { method: "DELETE" });
  }));
  on(el, "[data-new-user]", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    run(async () => {
      await net.api("/users", { method: "POST", body: { name: f.get("name"), password: f.get("password"), role: f.get("role") } });
      net.toast("Conta criada.", "success");
    });
  }, "submit");
  on(el, "[data-connect]", (e, form) => {
    e.preventDefault();
    const f = new FormData(form);
    run(() => net.connect(String(f.get("url")), String(f.get("name")), String(f.get("password"))));
  }, "submit");
  on(el, "[data-leave]", () => net.disconnect());
}

// --- Agentes (MCP) ------------------------------------------------------------

export async function renderAgentes(el, net) {
  const r = net.remote();
  const st = net.desktop ? await net.desktop.state() : null;
  const mcp = st?.mcp;
  let tools = [];
  try {
    const out = await net.api("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    tools = out.result?.tools || [];
  } catch { /* sem servidor ligado */ }

  const config = mcp
    ? JSON.stringify({ mcpServers: { sophyra: { command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) } } }, null, 2)
    : JSON.stringify({ mcpServers: { sophyra: { command: "node", args: ["bin/sophyra-mcp.mjs", "--pasta", "/caminho/da/biblioteca"] } } }, null, 2);
  const httpUrl = st?.server?.network?.addresses?.[0] || (r?.kind === "rede" ? r.url : st?.server?.local || "");

  el.innerHTML = `
    <div class="rows">
      ${row("O que é", "O MCP deixa um agente (como o Claude) ler, buscar e escrever nas suas notas por ferramentas. Ele nunca apaga: “arquivar” só move para a pasta Arquivo.")}
      ${row("Conexão local (stdio)", mcp ? "Cole isto na configuração MCP do seu agente. Ele abre a biblioteca atual direto da pasta." : "Cole na configuração MCP do agente, trocando o caminho pela pasta da biblioteca.", `<button class="btn" data-copy-config>${icon("copy", 16)} Copiar</button>`)}
    </div>
    <pre class="code-block" tabindex="0">${escapeHtml(config)}</pre>
    <p class="small">Para só leitura, acrescente <code>"--somente-leitura"</code> aos argumentos.</p>
    ${httpUrl ? `<div class="rows">${row("Conexão por HTTP", `<code>${escapeHtml(httpUrl)}/api/mcp</code> · cabeçalho <code>Authorization: Bearer &lt;token&gt;</code> (token que a conta recebe ao entrar). Respeita o papel da conta: leitores não veem as ferramentas de escrita.`)}</div>` : ""}
    <h3 class="sub-h">Ferramentas (${tools.length})</h3>
    <div class="rows">${tools.map((t) => row(`<code>${escapeHtml(t.name)}</code>`, escapeHtml(t.description))).join("") || row("Indisponível", "As ferramentas aparecem quando o app está ligado a uma biblioteca servida (desktop ou servidor).")}</div>`;
  on(el, "[data-copy-config]", async () => {
    await navigator.clipboard?.writeText(config).catch(() => {});
    net.toast("Configuração copiada.", "success");
  });
}
