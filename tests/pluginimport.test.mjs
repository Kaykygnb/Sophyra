import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePluginFile, validateManifest, scanRisks, sanitizeImported, addImported, removeImported, hostManifest, MAX_CODE_CHARS, MAX_IMPORTED,
} from "../src/pluginimport.js";

const manifest = { id: "meu-plugin", nome: "Meu plugin", versao: "1.2.0", descricao: "Faz uma coisa", permissoes: ["painel", "comandos"] };
const arquivo = (m = manifest, corpo = "export default { onload(api) { api.notify('oi'); } };") => `/* sophyra-plugin\n${JSON.stringify(m)}\n*/\n${corpo}`;

test("Arquivo: lê o manifesto do comentário e devolve o código inteiro", () => {
  const r = parsePluginFile(arquivo());
  assert.equal(r.ok, true);
  assert.deepEqual(r.manifest, manifest);
  assert.match(r.code, /onload/);
});

test("Arquivo: erros claros para vazio, sem manifesto, JSON ruim, grande e binário", () => {
  assert.match(parsePluginFile("").error, /vazio/);
  assert.match(parsePluginFile("export default { onload() {} }").error, /comentário/);
  assert.match(parsePluginFile("/* sophyra-plugin\n{ id: \n*/\nonload").error, /JSON/);
  assert.match(parsePluginFile(arquivo(manifest, "x".repeat(MAX_CODE_CHARS))).error, /passa de/);
  assert.match(parsePluginFile(arquivo(manifest, "onload \u0000")).error, /binário/);
  assert.match(parsePluginFile(arquivo(manifest, "export default {};")).error, /onload/);
});

test("Arquivo: recusa importar código de endereço remoto", () => {
  assert.match(parsePluginFile(arquivo(manifest, "import x from 'https://exemplo.com/x.js'; export default { onload() {} };")).error, /remoto/);
  assert.match(parsePluginFile(arquivo(manifest, "export default { async onload() { await import('//cdn.exemplo.com/x.js'); } };")).error, /remoto/);
  assert.equal(parsePluginFile(arquivo(manifest, "export default { onload() {} };")).ok, true);
});

test("Manifesto: id, nome, versão, descrição e permissões obrigatórias", () => {
  assert.equal(validateManifest(manifest).ok, true);
  assert.match(validateManifest({ ...manifest, id: "Maiúscula" }).error, /id inválido/);
  assert.match(validateManifest({ ...manifest, id: "a" }).error, /id inválido/);
  assert.match(validateManifest({ ...manifest, nome: "" }).error, /nome/);
  assert.match(validateManifest({ ...manifest, descricao: "x".repeat(301) }).error, /descricao/);
  const { permissoes: _p, ...semPerm } = manifest;
  assert.match(validateManifest(semPerm).error, /declarar permissoes/);
  assert.equal(validateManifest({ ...manifest, permissoes: [] }).ok, true, "lista vazia vale");
  assert.match(validateManifest({ ...manifest, permissoes: ["rede"] }).error, /desconhecida: rede/);
  assert.match(validateManifest(null).error, /objeto/);
  assert.deepEqual(validateManifest({ ...manifest, permissoes: ["painel", "painel"] }).manifest.permissoes, ["painel"]);
  assert.equal(validateManifest({ id: "ok-1", nome: "N", permissoes: [] }).manifest.versao, "0.0.0");
});

test("Riscos: aponta rede, eval, armazenamento, HTML e outros", () => {
  assert.equal(scanRisks("export default { onload(api) { api.notify('x'); } };").length, 0);
  assert.match(scanRisks("fetch('https://a.com')")[0], /rede/);
  assert.match(scanRisks("new WebSocket('wss://x')")[0], /rede/);
  assert.match(scanRisks("eval(x)")[0], /Executa texto/);
  assert.match(scanRisks("new Function('return 1')")[0], /Executa texto/);
  assert.match(scanRisks("localStorage.getItem('sophyra.vault.v1')")[0], /armazenamento/);
  assert.match(scanRisks("el.innerHTML = x")[0], /HTML/);
  assert.match(scanRisks("navigator.clipboard.readText()")[0], /área de transferência/);
  assert.equal(scanRisks("fetch(a); eval(b); localStorage.x").length, 3);
});

test("Lista: adicionar, recusar id repetido ou de plugin do projeto, remover", () => {
  const parsed = parsePluginFile(arquivo());
  let r = addImported([], parsed, ["estatisticas"], 5);
  assert.equal(r.ok, true);
  assert.equal(r.list[0].importedAt, 5);
  assert.match(addImported(r.list, parsed).error, /já importou/);
  assert.match(addImported([], parsed, ["meu-plugin"]).error, /Já existe um plugin/);
  assert.deepEqual(removeImported(r.list, "meu-plugin"), []);
  assert.deepEqual(removeImported(r.list, "nada"), r.list);
  assert.equal(hostManifest(r.list[0]).main, "local:meu-plugin");
  assert.equal(hostManifest(r.list[0]).importado, true);
});

test("Lista: limite de quantidade e de tamanho total", () => {
  let list = [];
  for (let i = 0; i < MAX_IMPORTED; i++) list = addImported(list, { manifest: { ...manifest, id: `p-${i}` }, code: "onload" }).list;
  assert.match(addImported(list, { manifest: { ...manifest, id: "extra" }, code: "onload" }).error, /limite/);
  const grande = [{ id: "g", manifest: { ...manifest, id: "g" }, code: "x".repeat(900_000), importedAt: 0 }];
  assert.match(addImported(grande, { manifest: { ...manifest, id: "h" }, code: "y".repeat(200_000) }).error, /espaço/);
});

test("Lista salva: dados estragados são limpos", () => {
  const bom = { id: "meu-plugin", manifest, code: "onload", importedAt: 3 };
  const limpo = sanitizeImported([bom, bom, { id: "x", manifest: { id: "x" }, code: "onload" }, null, { manifest, code: 5 }, { id: "g", manifest: { ...manifest, id: "grande" }, code: "x".repeat(MAX_CODE_CHARS + 1) }]);
  assert.deepEqual(limpo.map((p) => p.id), ["meu-plugin"]);
  assert.deepEqual(sanitizeImported("lixo"), []);
});
