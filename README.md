# Bolão Copa do Mundo FIFA 2026

Dashboard estático para acompanhar palpites, resultados e classificação do bolão.

## Atualizar palpites

Coloque os arquivos Excel recebidos na pasta `apostas/` e rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/import_bets.py --input apostas --output data/bolao-data.js
```

## Atualizar resultados

Para editar placares e salvar `data/results.js` automaticamente, rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/server.py
```

Abra `http://127.0.0.1:8000/index.html`, digite os placares na aba **Placar final** e clique em **Salvar para publicação**.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Faça commit dos arquivos do dashboard.
3. Envie para o GitHub.
4. Em **Settings > Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/root`.
5. O GitHub Pages publicará o link do dashboard.

Não publique os Excel brutos da pasta `apostas/`; eles são ignorados pelo Git. O site usa apenas os arquivos consolidados em `data/`.
