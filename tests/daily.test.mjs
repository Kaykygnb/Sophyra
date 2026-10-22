import test from "node:test";
import assert from "node:assert/strict";
import { adjacentDaily } from "../src/nav.js";
import { effectiveHotkeys, findCommand } from "../src/hotkeys.js";
import { sanitizeWorkspace } from "../src/workspace.js";

const paths = ["Diário/2026-10-19.md", "Diário/2026-10-21.md", "Diário/2026-10-20.md", "Outra.md", "Projetos/2026-10-25.md"];

test("Nota diária: anterior e seguinte à nota aberta, ordenadas pelo nome do arquivo", () => {
  assert.equal(adjacentDaily(paths, "Diário/2026-10-20.md", -1), "Diário/2026-10-19.md");
  assert.equal(adjacentDaily(paths, "Diário/2026-10-20.md", 1), "Diário/2026-10-21.md");
  assert.equal(adjacentDaily(paths, "Diário/2026-10-21.md", 1), "Projetos/2026-10-25.md");
  assert.equal(adjacentDaily(paths, "Diário/2026-10-19.md", -1), null);
  assert.equal(adjacentDaily(paths, "Projetos/2026-10-25.md", 1), null);
});

test("Nota diária: fora de uma diária, parte da data de hoje", () => {
  assert.equal(adjacentDaily(paths, "Outra.md", -1, "2026-10-21"), "Diário/2026-10-20.md");
  assert.equal(adjacentDaily(paths, "Outra.md", 1, "2026-10-21"), "Projetos/2026-10-25.md");
  assert.equal(adjacentDaily(paths, "@home", 1, "2026-10-19"), "Diário/2026-10-20.md");
  assert.equal(adjacentDaily(["A.md"], "A.md", 1, "2026-01-01"), null, "sem notas diárias");
});

test("Atalhos: voltar e avançar com Alt e as setas", () => {
  const eff = effectiveHotkeys();
  assert.equal(eff.voltar, "Alt+←");
  assert.equal(eff.avancar, "Alt+→");
  const ev = (key) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: true });
  assert.equal(findCommand(ev("ArrowLeft")), "voltar");
  assert.equal(findCommand(ev("ArrowRight")), "avancar");
});

test("Workspace: abas fixadas e favoritos são guardados e limpos", () => {
  const ok = sanitizeWorkspace({ tabs: ["A.md"], pinned: ["A.md", "A.md", 3], bookmarks: ["B.md", ""] });
  assert.deepEqual(ok.ws.pinned, ["A.md"]);
  assert.deepEqual(ok.ws.bookmarks, ["B.md"]);
  const bad = sanitizeWorkspace({ tabs: [], pinned: "x", bookmarks: {} });
  assert.deepEqual(bad.ws.pinned, []);
  assert.ok(bad.issues.length >= 2);
});
