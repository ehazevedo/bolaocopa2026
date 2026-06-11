# Bolão Copa do Mundo FIFA 2026

Dashboard estático para acompanhar palpites, resultados e classificação do bolão.

## Atualizar palpites

### Fonte oficial atual: PDF consolidado

Quando receber o PDF consolidado com todos os palpites, rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/import_pdf_bets.py --pdf "/Users/ehazevedo/Downloads/Bolao Copa do Mundo Fifa 2026.pdf" --base data/bolao-data.js --output data/bolao-data.js --audit data/pdf-bets-audit.csv
```

O importador valida:

- 22 participantes.
- 72 jogos por participante.
- 1.584 palpites no total.
- Placar suspeito fora do intervalo esperado.

Correções manuais auditáveis ficam em `scripts/import_pdf_bets.py`.

### Planilhas individuais

Coloque os arquivos Excel recebidos na pasta `apostas/` e rode:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/import_bets.py --input apostas --output data/bolao-data.js
```

## Atualizar resultados

Os resultados oficiais são lidos de uma Google Sheet configurada em `data/config.js`.

A planilha usada atualmente é:

- ID: `15I2_YnnCAKrU2UleQjE3Q40tGK87FSYL`
- Aba/GID: `0`
- URL: `https://docs.google.com/spreadsheets/d/15I2_YnnCAKrU2UleQjE3Q40tGK87FSYL/edit`

A planilha deve estar compartilhada como **qualquer pessoa com o link pode visualizar** e precisa ter as colunas:

| matchId | g1 | g2 |
| --- | --- | --- |
| 1 | 2 | 0 |
| 2 | 1 | 1 |

Para atualizar pelo celular, edite os placares na Google Sheet. O dashboard público recalcula quando a página é aberta ou recarregada.

`data/results.js` fica como fallback caso a planilha esteja indisponível.

No GitHub Pages, visitantes veem o dashboard em modo somente leitura. Os botões administrativos aparecem apenas em `localhost`.

## Fuso horário

As datas da aba **Jogos** usam o fuso `America/Sao_Paulo` para separar:

- Jogos do dia.
- Próximos 3 dias.
- Jogos futuros.
- Jogos passados.

## Cache

O `index.html` carrega CSS, dados, configuração e JavaScript com um cache-buster automático por abertura de página. Assim, depois de publicar no GitHub Pages, o navegador tende a buscar a versão mais recente dos arquivos auxiliares sem precisar editar `?v=` manualmente.

## Checklist de atualização

1. Atualize os palpites via PDF consolidado ou planilhas individuais.
2. Verifique se a saída mostra o número esperado de participantes, jogos e palpites.
3. Rode as validações:

```bash
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m py_compile scripts/import_bets.py scripts/import_pdf_bets.py scripts/server.py
/Users/ehazevedo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check app.js
```

4. Faça commit dos arquivos alterados.
5. Envie para `main`:

```bash
git push
```

6. Abra `https://ehazevedo.github.io/bolaocopa2026/` e confirme participantes, placares e aba **Jogos**.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Faça commit dos arquivos do dashboard.
3. Envie para o GitHub.
4. Em **Settings > Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/root`.
5. O GitHub Pages publicará o link do dashboard.

Não publique os Excel brutos da pasta `apostas/`; eles são ignorados pelo Git. O site usa apenas os arquivos consolidados em `data/`.
