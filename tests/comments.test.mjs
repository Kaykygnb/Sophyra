import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeComments, addDiscussion, addReply, setResolved, removeDiscussion, removeComment, renamePath, countOpen, forNote, findQuote, MAX_QUOTE,
} from "../src/comments.js";

test("Comentários: criar uma discussão presa a um trecho", () => {
  const { state, id } = addDiscussion({}, "A.md", "  um   trecho \n do texto ", " Revisar isto ", 1000);
  const d = forNote(state, "A.md")[0];
  assert.equal(d.id, id);
  assert.equal(d.quote, "um trecho do texto");
  assert.equal(d.resolved, false);
  assert.equal(d.comments.length, 1);
  assert.equal(d.comments[0].text, "Revisar isto");
  assert.equal(d.comments[0].at, 1000);
  assert.equal(addDiscussion({}, "A.md", "", "x").id, null, "sem trecho não cria");
  assert.equal(addDiscussion({}, "A.md", "x", "  ").id, null, "sem texto não cria");
  assert.equal(addDiscussion({}, "A.md", "x".repeat(500), "ok").state["A.md"][0].quote.length, MAX_QUOTE);
});

test("Comentários: responder, resolver, reabrir e apagar", () => {
  let { state, id } = addDiscussion({}, "A.md", "trecho", "primeiro");
  const before = state;
  state = addReply(state, "A.md", id, "resposta");
  assert.equal(forNote(state, "A.md")[0].comments.length, 2);
  assert.equal(forNote(before, "A.md")[0].comments.length, 1, "o estado antigo não muda");
  assert.equal(addReply(state, "A.md", id, "  "), state, "resposta vazia é ignorada");
  assert.equal(addReply(state, "A.md", "nada", "x"), state);
  assert.equal(countOpen(state, "A.md"), 1);
  state = setResolved(state, "A.md", id, true);
  assert.equal(countOpen(state, "A.md"), 0);
  assert.equal(setResolved(state, "A.md", id, true), state, "já resolvida: nada muda");
  state = setResolved(state, "A.md", id, false);
  assert.equal(countOpen(state, "A.md"), 1);
  state = removeDiscussion(state, "A.md", id);
  assert.deepEqual(state, {}, "sem discussões a nota some do estado");
});

test("Comentários: apagar o último comentário apaga a discussão", () => {
  let { state, id } = addDiscussion({}, "A.md", "trecho", "um");
  state = addReply(state, "A.md", id, "dois");
  const [c1, c2] = forNote(state, "A.md")[0].comments;
  state = removeComment(state, "A.md", id, c1.id);
  assert.equal(forNote(state, "A.md")[0].comments.length, 1);
  state = removeComment(state, "A.md", id, c2.id);
  assert.deepEqual(state, {});
});

test("Comentários: renomear a nota leva os comentários junto", () => {
  const { state } = addDiscussion({}, "A.md", "t", "x");
  const moved = renamePath(state, "A.md", "B.md");
  assert.equal(forNote(moved, "A.md").length, 0);
  assert.equal(forNote(moved, "B.md").length, 1);
  assert.equal(renamePath(state, "nada.md", "B.md"), state);
});

test("Comentários: dados guardados estragados são limpos ao ler", () => {
  const raw = {
    "A.md": [
      { id: "d1", quote: "ok", comments: [{ text: "a" }, { text: "  " }, null] },
      { id: "d2", quote: 5, comments: [] },
      { quote: "sem id", comments: [{ text: "x" }] },
      { id: "d3", quote: "vazia", comments: [] },
    ],
    "B.md": "nada",
  };
  const out = sanitizeComments(raw);
  assert.deepEqual(Object.keys(out), ["A.md"]);
  assert.equal(out["A.md"].length, 1);
  assert.equal(out["A.md"][0].comments.length, 1);
  assert.deepEqual(sanitizeComments(null), {});
  assert.deepEqual(sanitizeComments([1]), {});
});

test("Comentários: achar o trecho comentado no texto", () => {
  assert.equal(findQuote("um parágrafo com texto", "com texto"), 13);
  assert.equal(findQuote("abc", "xyz"), -1);
  assert.equal(findQuote("abc", "  "), -1);
});
