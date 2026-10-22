// Plugin de exemplo: cria (ou abre) a nota do dia numa pasta configurável.

function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default {
  onload(api) {
    api.addCommand({
      id: "criar-nota-diaria",
      name: "Criar nota diária",
      run() {
        const pasta = api.settings.get("pasta", "Diário");
        const nome = hoje();
        const path = `${pasta}/${nome}.md`;
        if (!api.readNote(path)) {
          api.createNote(path, `# ${nome}\n\n## Tarefas\n\n- [ ] \n\n## Notas\n\n`);
        }
        api.openNote(path);
        api.notify(`nota de ${nome} aberta`);
      },
    });
  },
};
