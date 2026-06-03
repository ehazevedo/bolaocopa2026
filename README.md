# Bolão Copa do Mundo FIFA 2026

Dashboard estático para acompanhar palpites, resultados e classificação do bolão.

## Atualizar palpites

Coloque os arquivos Excel recebidos na pasta `apostas/` e rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/import_bets.py --input apostas --output data/bolao-data.js
```

## Atualizar resultados

Os resultados oficiais são lidos de uma Google Sheet configurada em `data/config.js`.

A planilha deve estar compartilhada como **qualquer pessoa com o link pode visualizar** e precisa ter as colunas:

| matchId | g1 | g2 |
| --- | --- | --- |
| 1 | 2 | 0 |
| 2 | 1 | 1 |

Para atualizar pelo celular, edite os placares na Google Sheet. O dashboard público recalcula quando a página é aberta ou recarregada.

`data/results.js` fica como fallback caso a planilha esteja indisponível.

Para editar placares localmente e salvar `data/results.js` manualmente, rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/server.py
```

Abra `http://127.0.0.1:8000/index.html`, digite os placares na aba **Placar final** e clique em **Salvar para publicação**.

No GitHub Pages, visitantes veem o dashboard em modo somente leitura. Os botões administrativos aparecem apenas em `localhost`.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Faça commit dos arquivos do dashboard.
3. Envie para o GitHub.
4. Em **Settings > Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/root`.
5. O GitHub Pages publicará o link do dashboard.

Não publique os Excel brutos da pasta `apostas/`; eles são ignorados pelo Git. O site usa apenas os arquivos consolidados em `data/`.
