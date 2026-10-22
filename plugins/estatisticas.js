// Plugin de exemplo: estatísticas da nota ativa, num painel da barra direita.

import { extractMetadata, parseFrontmatter } from "../src/markdown.js";

export default {
  onload(api) {
    api.addPanel({
      id: "estatisticas",
      title: "Estatísticas",
      render(el) {
        const note = api.activeNote();
        if (!note) {
          el.innerHTML = `<p class="muted">Nenhuma nota ativa.</p>`;
          return;
        }
        const { body } = parseFrontmatter(note.content);
        const words = (body.match(/\S+/g) || []).length;
        const meta = extractMetadata(note.content);
        const wpm = api.settings.get("ppm", 200);
        const minutes = Math.max(1, Math.round(words / wpm));
        el.innerHTML = `
          <dl class="stats">
            <dt>Palavras</dt><dd>${words}</dd>
            <dt>Caracteres</dt><dd>${body.length}</dd>
            <dt>Títulos</dt><dd>${meta.headings.length}</dd>
            <dt>Links</dt><dd>${meta.links.length}</dd>
            <dt>Tempo de leitura</dt><dd>${minutes} min</dd>
          </dl>`;
      },
    });
  },
};
