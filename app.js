(function () {
  const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
  let data = window.BOLAO_DATA || { matches: [], participants: [], rules: {} };
  const publishedResults = window.BOLAO_RESULTS || {};
  const config = window.BOLAO_CONFIG || {};
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isAdmin = isLocalHost;
  let results = { ...publishedResults };
  let sheetLoadedAt = null;
  const matchFilters = { search: "", group: "" };
  const leaderboardFilters = { search: "", type: "all" };

  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");
  const lastUpdated = document.querySelector("#lastUpdated");
  const leaderboardList = document.querySelector("#leaderboard");
  const leaderboardSearch = document.querySelector("#leaderboardSearch");
  const leaderboardFilterButtons = document.querySelectorAll("[data-leaderboard-filter]");
  const matchBetsBoard = document.querySelector("#matchBetsBoard");
  const matchSearch = document.querySelector("#matchSearch");
  const matchGroupFilter = document.querySelector("#matchGroupFilter");
  const clearMatchFilters = document.querySelector("#clearMatchFilters");
  const participantSelect = document.querySelector("#participantSelect");
  const participantBetsBody = document.querySelector("#participantBets tbody");
  const statusMessage = document.querySelector("#statusMessage");

  document.body.classList.toggle("admin-mode", isAdmin);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
    });

    tab.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Array.from(tabs).indexOf(tab);
      const lastIndex = tabs.length - 1;
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") nextIndex = currentIndex > 0 ? currentIndex - 1 : lastIndex;
      if (event.key === "ArrowRight") nextIndex = currentIndex < lastIndex ? currentIndex + 1 : 0;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = lastIndex;
      tabs[nextIndex].focus();
      activateTab(tabs[nextIndex].dataset.tab);
    });
  });

  document.getElementById("refreshBets").addEventListener("click", async () => {
    await refreshBetsFromFolder();
  });

  leaderboardSearch?.addEventListener("input", () => {
    leaderboardFilters.search = leaderboardSearch.value.trim();
    renderLeaderboard();
  });

  leaderboardFilterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    button.addEventListener("click", () => {
      leaderboardFilters.type = button.dataset.leaderboardFilter || "all";
      leaderboardFilterButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      renderLeaderboard();
    });
  });

  participantSelect.addEventListener("change", renderParticipantBets);
  matchSearch?.addEventListener("input", () => {
    matchFilters.search = matchSearch.value.trim();
    renderMatchBetsBoard();
  });
  matchGroupFilter?.addEventListener("change", () => {
    matchFilters.group = matchGroupFilter.value;
    renderMatchBetsBoard();
  });
  clearMatchFilters?.addEventListener("click", () => {
    matchFilters.search = "";
    matchFilters.group = "";
    if (matchSearch) matchSearch.value = "";
    if (matchGroupFilter) matchGroupFilter.value = "";
    renderMatchBetsBoard();
  });

  activateTab("dashboard");
  renderAll();
  loadSheetResults();

  function activateTab(tabId) {
    tabs.forEach((item) => {
      const isActive = item.dataset.tab === tabId;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
      item.tabIndex = isActive ? 0 : -1;
    });
    views.forEach((view) => {
      const isActive = view.id === tabId;
      view.classList.toggle("active", isActive);
      view.setAttribute("aria-hidden", String(!isActive));
    });
  }

  function renderAll() {
    renderUpdateInfo();
    renderMetrics();
    renderPrizes();
    renderLeaderboard();
    renderMatchGroupFilter();
    renderMatchBetsBoard();
    renderParticipantSelect();
    renderParticipantBets();
  }

  async function refreshBetsFromFolder() {
    if (window.location.protocol === "file:") {
      showStatus(
        statusMessage,
        "Para ler novos arquivos da pasta apostas, abra pelo servidor local: python3 scripts/server.py",
        "error",
      );
      return;
    }

    showStatus(statusMessage, "Lendo a pasta apostas e atualizando a base...", "");
    try {
      const response = await fetch("/api/import-bets", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Não foi possível atualizar os palpites.");
      }
      data = payload.data;
      window.BOLAO_DATA = payload.data;
      renderAll();
      showStatus(statusMessage, `Palpites atualizados: ${data.participants.length} participante(s) e ${data.matches.length} jogo(s).`, "success");
    } catch (error) {
      showStatus(statusMessage, `Erro ao atualizar palpites: ${error.message}`, "error");
    }
  }

  async function loadSheetResults() {
    if (!config.googleSheetId) return;

    try {
      const sheetResults = await fetchGoogleSheetResults(config.googleSheetId, config.googleSheetGid || "0");
      results = sheetResults;
      sheetLoadedAt = new Date();
      renderAll();
    } catch (error) {
      console.warn(`Não consegui carregar o Google Sheets; usando fallback publicado. Detalhe: ${error.message}`);
    }
  }

  function fetchGoogleSheetResults(sheetId, gid) {
    return new Promise((resolve, reject) => {
      const callbackName = `__bolaoSheetCallback${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("tempo limite ao ler a planilha"));
      }, 12000);

      const script = document.createElement("script");
      const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq`);
      url.searchParams.set("gid", gid);
      url.searchParams.set("tqx", `out:json;responseHandler:${callbackName}`);
      url.searchParams.set("tq", "select *");
      script.src = url.toString();
      script.onerror = () => {
        cleanup();
        reject(new Error("a planilha não está pública ou não respondeu"));
      };

      window[callbackName] = (payload) => {
        cleanup();
        try {
          resolve(parseGoogleSheetPayload(payload));
        } catch (error) {
          reject(error);
        }
      };

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }

      document.head.appendChild(script);
    });
  }

  function parseGoogleSheetPayload(payload) {
    if (!payload || !payload.table) {
      throw new Error("resposta inválida da planilha");
    }

    const headers = (payload.table.cols || []).map((col, index) => normalizeHeader(col.label || col.id || `col${index}`));
    let matchIdIndex = findHeader(headers, ["matchid", "jogo", "match", "id"]);
    let g1Index = findHeader(headers, ["g1", "placar1", "gols1", "time1", "casa"]);
    let g2Index = findHeader(headers, ["g2", "placar2", "gols2", "time2", "fora"]);

    if (matchIdIndex < 0 || g1Index < 0 || g2Index < 0) {
      matchIdIndex = 0;
      g1Index = 1;
      g2Index = 2;
    }

    const nextResults = {};
    (payload.table.rows || []).forEach((row) => {
      const cells = row.c || [];
      const matchId = numberFromCell(cells[matchIdIndex]);
      const g1 = numberFromCell(cells[g1Index]);
      const g2 = numberFromCell(cells[g2Index]);
      if (!Number.isInteger(matchId)) return;
      if (!Number.isInteger(g1) || !Number.isInteger(g2)) return;
      nextResults[String(matchId)] = { g1, g2 };
    });

    return nextResults;
  }

  function normalizeHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  function findHeader(headers, candidates) {
    return headers.findIndex((header) => candidates.includes(header));
  }

  function numberFromCell(cell) {
    if (!cell || cell.v === null || cell.v === undefined || cell.v === "") return null;
    const value = Number(cell.v);
    return Number.isFinite(value) ? value : null;
  }

  function showStatus(target, message, kind) {
    if (!target) return;
    target.textContent = message;
    target.className = `status-message active ${kind || ""}`.trim();
    if (kind === "success") {
      window.setTimeout(() => {
        if (target.textContent === message) target.className = "status-message";
      }, 4000);
    }
  }

  function renderUpdateInfo() {
    if (!lastUpdated) return;
    const importedAt = data.generatedAt ? formatDateTime(data.generatedAt) : "sem registro";
    const resultsInfo = sheetLoadedAt
      ? `Resultados lidos do Google Sheets em ${formatDateTime(sheetLoadedAt.toISOString())}`
      : config.googleSheetId
        ? "Resultados conectados ao Google Sheets"
        : "Resultados usando fallback publicado";
    lastUpdated.textContent = `Palpites importados em ${importedAt}. ${resultsInfo}. Fuso: ${DISPLAY_TIME_ZONE}.`;
  }

  function resultCode(g1, g2) {
    if (g1 > g2) return "H";
    if (g1 < g2) return "A";
    return "D";
  }

  function hasCompleteScore(value) {
    return Boolean(value)
      && value.g1 !== null
      && value.g1 !== undefined
      && value.g1 !== ""
      && value.g2 !== null
      && value.g2 !== undefined
      && value.g2 !== ""
      && Number.isFinite(Number(value.g1))
      && Number.isFinite(Number(value.g2));
  }

  function matchResult(matchId) {
    const value = results[String(matchId)];
    if (!value || value.g1 === "" || value.g2 === "" || value.g1 === null || value.g2 === null) {
      return null;
    }
    return { g1: Number(value.g1), g2: Number(value.g2) };
  }

  function scoreBet(bet, actual) {
    if (!hasCompleteScore(actual) || !hasCompleteScore(bet)) return { points: 0, exact: false, simple: false };
    const betG1 = Number(bet.g1);
    const betG2 = Number(bet.g2);
    const actualG1 = Number(actual.g1);
    const actualG2 = Number(actual.g2);
    const simple = resultCode(betG1, betG2) === resultCode(actualG1, actualG2);
    const exact = betG1 === actualG1 && betG2 === actualG2;
    return {
      points: (simple ? data.rules.simpleResultPoints || 2 : 0) + (exact ? data.rules.exactScoreBonus || 3 : 0),
      exact,
      simple,
    };
  }

  function participantStats(participant, matchPredicate = () => true) {
    const byMatch = new Map(participant.bets.map((bet) => [bet.matchId, bet]));
    const completed = data.matches.filter((match) => matchResult(match.id) && matchPredicate(match));
    let points = 0;
    let exact = 0;
    let simple = 0;
    let scoredMatches = 0;
    const phaseTotals = {};

    completed.forEach((match) => {
      const bet = byMatch.get(match.id) || null;
      const score = scoreBet(bet, matchResult(match.id));
      points += score.points;
      exact += score.exact ? 1 : 0;
      simple += score.simple && !score.exact ? 1 : 0;
      scoredMatches += score.points > 0 ? 1 : 0;
      phaseTotals[match.phase] = (phaseTotals[match.phase] || 0) + score.points;
    });

    const weighted = Object.entries(phaseTotals).reduce((sum, [phase, phasePoints]) => {
      const phaseMatches = data.matches.filter((match) => match.phase === phase).length;
      const max = phaseMatches * (data.rules.maxPerMatch || 5);
      const weight = (data.rules.stageWeights || {})[phase] || 0;
      return sum + (max ? (phasePoints / max) * weight : 0);
    }, 0);

    return { points, weighted, exact, simple, scoredMatches };
  }

  function leaderboardRows(matchPredicate = () => true) {
    const rows = data.participants
      .map((participant) => ({ participant, stats: participantStats(participant, matchPredicate) }))
      .sort((a, b) => {
        if (b.stats.weighted !== a.stats.weighted) return b.stats.weighted - a.stats.weighted;
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        if (b.stats.exact !== a.stats.exact) return b.stats.exact - a.stats.exact;
        return a.participant.name.localeCompare(b.participant.name, "pt-BR");
      });
    return applyRanks(rows);
  }

  function applyRanks(rows) {
    let previousKey = null;
    let rank = 0;
    return rows.map((row, index) => {
      const key = `${row.stats.weighted.toFixed(8)}|${row.stats.points}|${row.stats.exact}`;
      if (key !== previousKey) rank = index + 1;
      previousKey = key;
      return { ...row, rank };
    });
  }

  function renderMetrics() {
    const completed = data.matches.filter((match) => matchResult(match.id)).length;
    const rows = leaderboardRows();
    document.getElementById("metricParticipants").textContent = data.participants.length;
    document.getElementById("metricMatches").textContent = data.matches.length;
    document.getElementById("metricCompleted").textContent = completed;
    document.getElementById("metricLeader").textContent = rows[0]?.participant.name || "-";
  }

  function renderPrizes() {
    const prizes = data.prizes || {};
    const participants = Number(prizes.participants || data.participants.length || 0);
    const entryFee = Number(prizes.entryFee || 150);
    const total = Number(prizes.total || participants * entryFee);
    document.getElementById("prizeTotal").textContent = brl(total);
    document.getElementById("prizeFirst").textContent = brl(prizes.first || total * 0.6);
    document.getElementById("prizeSecond").textContent = brl(prizes.second || total * 0.3);
    document.getElementById("prizeThird").textContent = brl(prizes.third || total * 0.1);
    document.getElementById("entryFee").textContent = `${participants} x ${brl(entryFee)}`;
  }

  function renderLeaderboard() {
    const movementByParticipant = dailyMovementByParticipant();
    let rows = leaderboardRows().map((row) => ({
      ...row,
      movement: movementByParticipant.get(row.participant.id) || { change: 0, hasComparison: false },
    }));

    const search = normalizeText(leaderboardFilters.search);
    if (search) {
      rows = rows.filter((row) => normalizeText(row.participant.name).includes(search));
    }
    if (leaderboardFilters.type === "top3") {
      rows = rows.filter((row) => row.rank <= 3);
    }
    if (leaderboardFilters.type === "up") {
      rows = rows.filter((row) => row.movement.change > 0);
    }

    if (!rows.length) {
      leaderboardList.innerHTML = `<div class="empty">Nenhuma classificação encontrada para esse filtro.</div>`;
      return;
    }

    leaderboardList.innerHTML = rows
      .map((row) => {
        const topClass = row.rank <= 3 ? ` top-${row.rank}` : "";
        return `
          <article class="leaderboard-card${topClass}">
            <div class="leaderboard-position">
              <span class="rank-badge">${row.rank}</span>
            </div>
            <div class="leaderboard-person">
              <strong>${escapeHtml(row.participant.name)}</strong>
              <span>${row.stats.exact} placar(es) exato(s) · ${row.stats.simple} acerto(s) de vencedor · ${row.stats.scoredMatches} jogo(s) pontuado(s)</span>
            </div>
            <div class="leaderboard-movement">
              ${renderMovement(row.movement)}
            </div>
            <div class="leaderboard-points">
              <strong>${row.stats.points}</strong>
              <span>pts</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function dailyMovementByParticipant() {
    const latestDate = latestCompletedMatchDate();
    if (!latestDate) return new Map();

    const currentRows = leaderboardRows();
    const previousRows = leaderboardRows((match) => (match.date || "") < latestDate);
    if (!previousRows.some((row) => row.stats.points > 0)) {
      return new Map(currentRows.map((row) => [row.participant.id, { change: 0, hasComparison: false }]));
    }

    const previousRankById = new Map(previousRows.map((row) => [row.participant.id, row.rank]));
    return new Map(
      currentRows.map((row) => {
        const previousRank = previousRankById.get(row.participant.id);
        const change = Number.isInteger(previousRank) ? previousRank - row.rank : 0;
        return [row.participant.id, { change, hasComparison: Number.isInteger(previousRank) }];
      }),
    );
  }

  function latestCompletedMatchDate() {
    return data.matches
      .filter((match) => matchResult(match.id) && match.date)
      .map((match) => match.date)
      .sort()
      .at(-1);
  }

  function renderMovement(movement) {
    if (!movement?.hasComparison) {
      return `<span class="movement-badge movement-flat">= sem dia anterior</span>`;
    }
    if (movement.change > 0) {
      return `<span class="movement-badge movement-up">▲ +${movement.change} hoje</span>`;
    }
    if (movement.change < 0) {
      return `<span class="movement-badge movement-down">▼ ${movement.change} hoje</span>`;
    }
    return `<span class="movement-badge movement-flat">= estável</span>`;
  }

  function renderMatchBetsBoard() {
    if (!matchBetsBoard) return;
    if (!data.matches.length) {
      matchBetsBoard.innerHTML = `<div class="empty">Nenhum jogo importado ainda.</div>`;
      return;
    }

    const categories = categorizeMatches(filteredMatches());
    matchBetsBoard.innerHTML = categories
      .map((category) => `
        <section class="match-bets-column">
          <div class="match-bets-column-heading">
            <h3>${escapeHtml(category.title)}</h3>
            <span>${category.matches.length}</span>
          </div>
          <div class="match-bets-list">
            ${
              category.matches.length
                ? category.matches.map(renderMatchBetsCard).join("")
                : `<div class="empty compact">${escapeHtml(category.emptyText)}</div>`
            }
          </div>
        </section>
      `)
      .join("");
  }

  function renderMatchGroupFilter() {
    if (!matchGroupFilter) return;
    const selected = matchGroupFilter.value || matchFilters.group;
    const groups = [...new Set(data.matches.map((match) => match.group).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    matchGroupFilter.innerHTML = [
      `<option value="">Todos os grupos</option>`,
      ...groups.map((group) => `<option value="${escapeHtml(group)}">Grupo ${escapeHtml(group)}</option>`),
    ].join("");
    if (groups.includes(selected)) {
      matchGroupFilter.value = selected;
      matchFilters.group = selected;
    }
  }

  function filteredMatches() {
    const search = normalizeText(matchFilters.search);
    return data.matches.filter((match) => {
      const matchesGroup = !matchFilters.group || match.group === matchFilters.group;
      if (!matchesGroup) return false;
      if (!search) return true;
      const haystack = normalizeText(
        `#${match.id} ${match.group || ""} ${formatDate(match.date)} ${match.team1} ${match.team2}`,
      );
      return haystack.includes(search);
    });
  }

  function categorizeMatches(matches = data.matches) {
    const today = getSaoPauloToday();
    const groups = { today: [], next: [], future: [], past: [] };

    matches.forEach((match) => {
      const matchDate = parseLocalDate(match.date);
      if (!matchDate) {
        groups.future.push(match);
        return;
      }
      const dayDelta = Math.round((matchDate - today) / 86400000);
      if (dayDelta === 0) groups.today.push(match);
      else if (dayDelta > 0 && dayDelta <= 3) groups.next.push(match);
      else if (dayDelta > 3) groups.future.push(match);
      else groups.past.push(match);
    });

    const byDateAsc = (a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id;
    const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "") || a.id - b.id;
    return [
      { title: "Jogos do dia", emptyText: "Nenhum jogo hoje.", matches: groups.today.sort(byDateAsc) },
      { title: "Próximos 3 dias", emptyText: "Nenhum jogo nos próximos 3 dias.", matches: groups.next.sort(byDateAsc) },
      { title: "Jogos futuros", emptyText: "Nenhum jogo futuro.", matches: groups.future.sort(byDateAsc) },
      { title: "Jogos passados", emptyText: "Nenhum jogo passado.", matches: groups.past.sort(byDateDesc) },
    ];
  }

  function renderMatchBetsCard(match) {
    const actual = matchResult(match.id);
    const resultLabel = actual ? `${actual.g1} x ${actual.g2}` : "Sem resultado";
    const betsByParticipant = data.participants
      .map((participant) => {
        const bet = participant.bets.find((item) => item.matchId === match.id);
        const scored = scoreBet(bet, actual);
        const pointClass = scored.exact ? "points-exact" : scored.points > 0 ? "points-good" : "";
        return `
          <tr>
            <td>${escapeHtml(participant.name)}</td>
            <td>${formatScore(bet)}</td>
            <td class="${pointClass}">${actual ? scored.points : "-"}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <details class="match-bets-card">
        <summary>
          <span class="match-bets-meta">#${match.id} · Grupo ${escapeHtml(match.group || "-")} · ${escapeHtml(formatDate(match.date))}</span>
          <strong>${escapeHtml(match.team1)} x ${escapeHtml(match.team2)}</strong>
          <span class="match-bets-result">${escapeHtml(resultLabel)}</span>
        </summary>
        <div class="match-bets-details">
          <table class="compact-table">
            <thead>
              <tr>
                <th>Participante</th>
                <th>Palpite</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>${betsByParticipant}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderParticipantSelect() {
    const selected = participantSelect.value;
    participantSelect.innerHTML = data.participants
      .map((participant) => `<option value="${escapeHtml(participant.id)}">${escapeHtml(participant.name)}</option>`)
      .join("");
    if (selected && data.participants.some((participant) => participant.id === selected)) {
      participantSelect.value = selected;
    }
  }

  function renderParticipantBets() {
    const participant = data.participants.find((item) => item.id === participantSelect.value) || data.participants[0];
    if (!participant) {
      participantBetsBody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum participante importado ainda.</td></tr>`;
      return;
    }

    const bets = new Map(participant.bets.map((bet) => [bet.matchId, bet]));
    participantBetsBody.innerHTML = data.matches
      .map((match) => {
        const bet = bets.get(match.id) || null;
        const actual = matchResult(match.id);
        const scored = scoreBet(bet, actual);
        const pointClass = scored.exact ? "points-exact" : scored.points > 0 ? "points-good" : "";
        return `
          <tr>
            <td>${match.id}</td>
            <td>${escapeHtml(match.group || "-")}</td>
            <td>${escapeHtml(match.team1)} x ${escapeHtml(match.team2)}</td>
            <td>${formatScore(bet)}</td>
            <td>${actual ? `${actual.g1} x ${actual.g2}` : "-"}</td>
            <td class="${pointClass}">${scored.points}</td>
          </tr>
        `;
      })
      .join("");
  }

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatScore(value) {
    if (!hasCompleteScore(value)) return "-";
    return `${Number(value.g1)} x ${Number(value.g2)}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "sem registro";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: DISPLAY_TIME_ZONE,
    }).format(date);
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function getSaoPauloToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function brl(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }
})();
