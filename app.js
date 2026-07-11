(function () {
  const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
  let data = window.BOLAO_DATA || { matches: [], participants: [], rules: {} };
  const publishedResults = window.BOLAO_RESULTS || {};
  const config = window.BOLAO_CONFIG || {};
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isAdmin = isLocalHost;
  let results = { ...publishedResults };
  let sheetLoadedAt = null;
  const matchFilters = { search: "", group: "", phase: "" };
  const leaderboardFilters = { stage: "all" };
  let expandedParticipantId = "";

  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");
  const lastUpdated = document.querySelector("#lastUpdated");
  const leaderboardList = document.querySelector("#leaderboard");
  const leaderboardStageButtons = document.querySelectorAll("[data-leaderboard-stage]");
  const matchBetsBoard = document.querySelector("#matchBetsBoard");
  const matchSearch = document.querySelector("#matchSearch");
  const matchGroupFilter = document.querySelector("#matchGroupFilter");
  const matchPhaseFilter = document.querySelector("#matchPhaseFilter");
  const clearMatchFilters = document.querySelector("#clearMatchFilters");
  const participantSelect = document.querySelector("#participantSelect");
  const participantBetsBody = document.querySelector("#participantBets tbody");
  const participantBracket = document.querySelector("#participantBracket");
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

  leaderboardStageButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    button.addEventListener("click", () => {
      leaderboardFilters.stage = button.dataset.leaderboardStage || "all";
      leaderboardStageButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      expandedParticipantId = "";
      renderLeaderboard();
    });
  });

  leaderboardList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-expand-participant]");
    if (!button) return;
    const participantId = button.dataset.expandParticipant || "";
    expandedParticipantId = expandedParticipantId === participantId ? "" : participantId;
    renderLeaderboard();
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
  matchPhaseFilter?.addEventListener("change", () => {
    matchFilters.phase = matchPhaseFilter.value;
    renderMatchBetsBoard();
  });
  clearMatchFilters?.addEventListener("click", () => {
    matchFilters.search = "";
    matchFilters.group = "";
    matchFilters.phase = "";
    if (matchSearch) matchSearch.value = "";
    if (matchGroupFilter) matchGroupFilter.value = "";
    if (matchPhaseFilter) matchPhaseFilter.value = "";
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
    renderMatchPhaseFilter();
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
    let team1Index = findHeader(headers, ["selecao1", "team1", "equipe1"]);
    let team2Index = findHeader(headers, ["selecao2", "team2", "equipe2"]);

    if (matchIdIndex < 0 || g1Index < 0 || g2Index < 0) {
      matchIdIndex = 0;
      g1Index = 1;
      g2Index = 2;
      team1Index = 6;
      team2Index = 10;
    }

    const nextResults = {};
    (payload.table.rows || []).forEach((row) => {
      const cells = row.c || [];
      const matchId = numberFromCell(cells[matchIdIndex]);
      const g1 = numberFromCell(cells[g1Index]);
      const g2 = numberFromCell(cells[g2Index]);
      if (!Number.isInteger(matchId)) return;
      if (!Number.isInteger(g1) || !Number.isInteger(g2)) return;
      nextResults[String(matchId)] = {
        g1,
        g2,
        team1: textFromCell(cells[team1Index]),
        team2: textFromCell(cells[team2Index]),
      };
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

  function textFromCell(cell) {
    return String(cell?.v ?? cell?.f ?? "").trim();
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

  function resultForMatch(match) {
    const direct = results[String(match.id || match.matchId)];
    if (hasCompleteScore(direct) && (!direct.team1 || !direct.team2 || !match.team1 || !match.team2 || teamsMatchSameOrder(direct, match))) {
      return { g1: Number(direct.g1), g2: Number(direct.g2) };
    }
    if (hasCompleteScore(direct) && teamsMatchReverseOrder(direct, match)) {
      return { g1: Number(direct.g2), g2: Number(direct.g1) };
    }

    const sameOrder = Object.values(results).find((candidate) => teamsMatchSameOrder(candidate, match));
    if (hasCompleteScore(sameOrder)) {
      return { g1: Number(sameOrder.g1), g2: Number(sameOrder.g2) };
    }

    const reverseOrder = Object.values(results).find((candidate) => teamsMatchReverseOrder(candidate, match));
    if (hasCompleteScore(reverseOrder)) {
      return { g1: Number(reverseOrder.g2), g2: Number(reverseOrder.g1) };
    }

    return null;
  }

  function teamsMatchSameOrder(result, match) {
    return sameTeam(result?.team1, match?.team1) && sameTeam(result?.team2, match?.team2);
  }

  function teamsMatchReverseOrder(result, match) {
    return sameTeam(result?.team1, match?.team2) && sameTeam(result?.team2, match?.team1);
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

  function matchStageKey(match) {
    const phase = normalizeText(match.phase || "");
    if (phase.includes("fase de grupos") || phase.includes("grupo")) return "Fase de Grupos";
    if (phase.includes("rodada de 32") || phase.includes("16 avos") || phase.includes("round of 32")) return "Rodada de 32";
    if (
      phase.includes("oitavas")
      || phase.includes("round of 16")
      || phase.includes("quartas")
      || phase.includes("quarter")
      || phase.includes("semifinal")
      || phase.includes("semi")
      || phase.includes("final")
      || phase.includes("3 lugar")
      || phase.includes("terceiro")
    ) {
      return "Oitavas à Final";
    }

    const matchId = Number(match.id);
    if (matchId >= 73 && matchId <= 88) return "Rodada de 32";
    if (matchId >= 89 && matchId <= 104) return "Oitavas à Final";
    return "Fase de Grupos";
  }

  function stageWeights() {
    return {
      "Fase de Grupos": 35,
      "Rodada de 32": 25,
      "Oitavas à Final": 40,
      ...(data.rules.stageWeights || {}),
    };
  }

  function stageMaxPoints(stage) {
    const maxPerMatch = data.rules.maxPerMatch || 5;
    const matches = data.matches.filter((match) => matchStageKey(match) === stage);
    const bracketSlots = (data.bracketSlots || []).filter((slot) => matchStageKey(slot) === stage);
    return matches.length * maxPerMatch + bracketSlots.length * finalStageMaxPerMatch();
  }

  function weightedPoints(phaseTotals, matchPredicate = () => true) {
    return stageBreakdown(phaseTotals, matchPredicate).reduce((sum, stage) => sum + stage.weighted, 0);
  }

  function stageBreakdown(phaseTotals, matchPredicate = () => true) {
    const weights = stageWeights();
    return Object.entries(weights)
      .sort(([stageA], [stageB]) => stageOrder(stageA) - stageOrder(stageB))
      .map(([stage, weight]) => {
        const factor = stageWeightFactor(weight);
        const points = phaseTotals[stage] || 0;
        const weighted = points * factor;
        return { stage, weight, factor, max: stageMaxPoints(stage), points, weighted };
      });
  }

  function stageWeightFactor(weight) {
    const value = Number(weight || 0);
    return value > 1 ? value / 100 : value;
  }

  function formatWeightedPoints(value) {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function participantStats(participant, matchPredicate = () => true) {
    const byMatch = new Map(participant.bets.map((bet) => [bet.matchId, bet]));
    const completed = data.matches.filter((match) => resultForMatch(match) && matchPredicate(match));
    const completedBracket = (data.bracketSlots || []).filter((slot) => resultForMatch(slot) && matchPredicate(slot));
    let points = 0;
    let exact = 0;
    let simple = 0;
    let scoredMatches = 0;
    const phaseTotals = {};

    completed.forEach((match) => {
      const bet = byMatch.get(match.id) || null;
      const score = scoreBet(bet, resultForMatch(match));
      points += score.points;
      exact += score.exact ? 1 : 0;
      simple += score.simple && !score.exact ? 1 : 0;
      scoredMatches += score.points > 0 ? 1 : 0;
      const stage = matchStageKey(match);
      phaseTotals[stage] = (phaseTotals[stage] || 0) + score.points;
    });

    completedBracket.forEach((slot) => {
      const bet = bracketBetForSlot(participant, slot.slot);
      const score = scoreBracketBet(bet, slot, resultForMatch(slot));
      points += score.points;
      exact += score.exact ? 1 : 0;
      simple += score.simple && !score.exact ? 1 : 0;
      scoredMatches += score.points > 0 ? 1 : 0;
      const stage = matchStageKey(slot);
      phaseTotals[stage] = (phaseTotals[stage] || 0) + score.points;
    });

    const stages = stageBreakdown(phaseTotals, matchPredicate);
    const weighted = stages.reduce((sum, stage) => sum + stage.weighted, 0);

    return { points, weighted, exact, simple, scoredMatches, stages };
  }

  function bracketBetForSlot(participant, slotId) {
    return (participant.bracketBets || []).find((bet) => bet.slot === slotId) || null;
  }

  function scoreBracketBet(bet, slot, actual) {
    if (!bet || !actual || !hasCompleteScore(actual) || !hasCompleteScore(bet) || !hasOfficialSlotTeams(slot)) {
      return { points: 0, exact: false, simple: false, advanced: false, eligible: false };
    }

    const score = scoreBet({ g1: bet.g1, g2: bet.g2 }, actual);
    const officialWinner = officialAdvancingTeam(slot, actual);
    const predictedWinner = bet.winner || predictedWinnerFromScore(bet);
    const advanced = Boolean(officialWinner && predictedWinner && sameTeam(predictedWinner, officialWinner));
    const advancePoints = advanced ? finalStageAdvanceBonus() : 0;

    return {
      points: score.points + advancePoints,
      exact: score.exact,
      simple: score.simple,
      advanced,
      advancePoints,
      eligible: true,
    };
  }

  function finalStageAdvanceBonus() {
    return Number(data.rules.finalStageAdvanceBonus || 3);
  }

  function finalStageMaxPerMatch() {
    return Number(data.rules.finalStageMaxPerMatch || (
      (data.rules.simpleResultPoints || 2) + (data.rules.exactScoreBonus || 3) + finalStageAdvanceBonus()
    ));
  }

  function predictedWinnerFromScore(bet) {
    if (!hasCompleteScore(bet)) return "";
    if (Number(bet.g1) > Number(bet.g2)) return bet.team1 || "";
    if (Number(bet.g2) > Number(bet.g1)) return bet.team2 || "";
    return "";
  }

  function officialAdvancingTeam(slot, actual) {
    if (!slot || !hasCompleteScore(actual)) return "";
    if (Number(actual.g1) > Number(actual.g2)) return slot.team1 || "";
    if (Number(actual.g2) > Number(actual.g1)) return slot.team2 || "";
    return inferOfficialAdvancingTeamFromNextSlot(slot);
  }

  function inferOfficialAdvancingTeamFromNextSlot(slot) {
    const nextSlot = officialNextSlot(slot.slot);
    if (!nextSlot) return "";
    if (sameTeam(slot.team1, nextSlot.team1) || sameTeam(slot.team1, nextSlot.team2)) return slot.team1;
    if (sameTeam(slot.team2, nextSlot.team1) || sameTeam(slot.team2, nextSlot.team2)) return slot.team2;
    return "";
  }

  function officialNextSlot(slotId) {
    const nextBySlot = {
      "OIT-1": "QF-1",
      "OIT-2": "QF-1",
      "OIT-3": "QF-3",
      "OIT-4": "QF-3",
      "OIT-5": "QF-2",
      "OIT-6": "QF-2",
      "OIT-7": "QF-4",
      "OIT-8": "QF-4",
      "QF-1": "SF-1",
      "QF-2": "SF-1",
      "QF-3": "SF-2",
      "QF-4": "SF-2",
      "SF-1": "FINAL",
      "SF-2": "FINAL",
    };
    const nextSlotId = nextBySlot[slotId];
    return nextSlotId ? bracketSlotById(nextSlotId) : null;
  }

  function hasOfficialSlotTeams(slot) {
    return slot?.team1 && slot?.team2 && !isPlaceholderTeam(slot.team1) && !isPlaceholderTeam(slot.team2);
  }

  function isPlaceholderTeam(team) {
    return /^(vencedor|perdedor)\s+/i.test(String(team || ""));
  }

  function sameTeam(teamA, teamB) {
    return teamKey(teamA) === teamKey(teamB);
  }

  function teamKey(team) {
    const key = normalizeText(team)
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    return {
      "coreia do sul": "coreia",
      "costa do marfim": "costa do marfin",
      "egiito": "egito",
      "estados unidos": "eua",
      "holanda": "paises baixos",
      "paises baixos": "paises baixos",
      "rep tcheca": "republica tcheca",
      "rd congo": "congo",
      "usa": "eua",
    }[key] || key;
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
    const rows = leaderboardRows();
    document.getElementById("metricParticipants").textContent = data.participants.length;
    document.getElementById("metricMatches").textContent = officialRegisteredMatches().length;
    document.getElementById("metricCompleted").textContent = officialCompletedMatches().length;
    document.getElementById("metricLeader").textContent = rows[0]?.participant.name || "-";
  }

  function officialRegisteredMatches() {
    return [...data.matches, ...officialBracketSlots()];
  }

  function officialCompletedMatches() {
    return officialRegisteredMatches().filter((match) => resultForMatch(match));
  }

  function officialBracketSlots() {
    return (data.bracketSlots || []).filter((slot) => hasOfficialSlotTeams(slot));
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
    const matchPredicate = leaderboardMatchPredicate();
    const movementByParticipant = dailyMovementByParticipant(matchPredicate);
    let rows = leaderboardRows(matchPredicate).map((row) => ({
      ...row,
      movement: movementByParticipant.get(row.participant.id) || { change: 0, hasComparison: false },
    }));

    if (!rows.some((row) => row.participant.id === expandedParticipantId)) {
      expandedParticipantId = "";
    }

    if (!rows.length) {
      leaderboardList.innerHTML = `<div class="empty">Nenhuma classificação encontrada para esse filtro.</div>`;
      return;
    }

    leaderboardList.innerHTML = `
      <div class="leaderboard-mode">
        <span>${escapeHtml(leaderboardModeLabel())}</span>
      </div>
      ${rows
      .map((row) => {
        const topClass = row.rank <= 3 ? ` top-${row.rank}` : "";
        const isExpanded = row.participant.id === expandedParticipantId;
        const chartId = `ranking-evolution-${safeId(row.participant.id)}`;
        const score = leaderboardDisplayScore(row.stats);
        return `
          <article class="leaderboard-card${topClass}${isExpanded ? " expanded" : ""}">
            <button class="leaderboard-card-button" type="button"
              data-expand-participant="${escapeHtml(row.participant.id)}"
              aria-expanded="${String(isExpanded)}"
              aria-controls="${chartId}">
              <span class="leaderboard-position">
                <span class="rank-badge">${row.rank}</span>
              </span>
              <span class="leaderboard-person">
                <strong>${escapeHtml(row.participant.name)}</strong>
                <span>${row.stats.exact} placar(es) exato(s) · ${row.stats.simple} acerto(s) de vencedor · ${row.stats.scoredMatches} jogo(s) pontuado(s)</span>
              </span>
              <span class="leaderboard-movement">
                ${renderMovement(row.movement)}
              </span>
              <span class="leaderboard-points">
                <strong>${score.value}</strong>
                <span>${escapeHtml(score.label)}</span>
                ${score.detail ? `<small>${escapeHtml(score.detail)}</small>` : ""}
              </span>
              <span class="leaderboard-expand-icon" aria-hidden="true">${isExpanded ? "▲" : "▼"}</span>
            </button>
            ${isExpanded ? renderLeaderboardDetails(row.participant, row.stats, chartId) : ""}
          </article>
        `;
      })
      .join("")}
    `;
  }

  function renderLeaderboardDetails(participant, stats, chartId) {
    if (leaderboardFilters.stage !== "all") {
      return renderRankingEvolution(participant, chartId);
    }
    return `
      <div class="leaderboard-details">
        ${renderStageBreakdown(stats.stages)}
        ${renderRankingEvolution(participant, chartId)}
      </div>
    `;
  }

  function leaderboardMatchPredicate() {
    if (!leaderboardFilters.stage || leaderboardFilters.stage === "all") return () => true;
    return (match) => matchStageKey(match) === leaderboardFilters.stage;
  }

  function leaderboardModeLabel() {
    if (!leaderboardFilters.stage || leaderboardFilters.stage === "all") return "Pontuação geral ponderada";
    return `Pontos brutos: ${stageLabel(leaderboardFilters.stage)}`;
  }

  function leaderboardDisplayScore(stats) {
    if (!leaderboardFilters.stage || leaderboardFilters.stage === "all") {
      return {
        value: formatWeightedPoints(stats.weighted),
        label: "pts ponderados",
        detail: `${stats.points} pts brutos`,
      };
    }
    return {
      value: String(stats.points),
      label: "pts brutos",
      detail: "",
    };
  }

  function renderStageBreakdown(stages = []) {
    return `
      <div class="stage-breakdown" aria-label="Pontuação por etapa">
        ${stages.map((stage) => {
          return `
            <div class="stage-score stage-score-${safeId(stage.stage)}">
              <div class="stage-score-top">
                <span>${escapeHtml(stageLabel(stage.stage))}</span>
                <strong>${formatWeightedPoints(stage.weighted)}</strong>
              </div>
              <small>${stage.points} pts brutos x ${stage.factor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function stageLabel(stage) {
    return {
      "Fase de Grupos": "Grupos",
      "Rodada de 32": "16 avos",
      "Oitavas à Final": "Oitavas-Final",
    }[stage] || stage;
  }

  function dailyMovementByParticipant(matchPredicate = () => true) {
    const latestDate = latestDailyCompletedMatchDate();
    if (!latestDate) return new Map();

    const currentRows = leaderboardRows((match) => matchPredicate(match) && (match.date || "") <= latestDate);
    const previousRows = leaderboardRows((match) => matchPredicate(match) && (match.date || "") < latestDate);
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

  function latestDailyCompletedMatchDate() {
    return completedDates().at(-1);
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

  function renderRankingEvolution(participant, chartId) {
    const series = rankingEvolution(participant.id);
    if (series.length < 2) {
      return `
        <div id="${chartId}" class="ranking-evolution">
          <div class="ranking-evolution-heading">
            <span>Evolução no ranking</span>
          </div>
          <div class="empty compact">Ainda não há dias suficientes com resultado para desenhar a evolução.</div>
        </div>
      `;
    }

    const startRank = series[0].rank;
    const current = series.at(-1);
    return `
      <div id="${chartId}" class="ranking-evolution">
        <div class="ranking-evolution-heading">
          <span>Evolução no ranking por dia</span>
          <strong>Atual: ${ordinal(current.rank)}</strong>
        </div>
        ${renderRankingChart(series, chartId)}
        <div class="ranking-chart-legend" aria-label="Resumo da evolução">
          <span><i class="legend-start"></i>Início: ${ordinal(startRank)}</span>
          <span><i class="legend-current"></i>Atual: ${ordinal(current.rank)}</span>
        </div>
      </div>
    `;
  }

  function rankingEvolution(participantId) {
    return completedDates().map((date) => {
      const rows = leaderboardRows((match) => (match.date || "") <= date);
      const row = rows.find((item) => item.participant.id === participantId);
      return {
        date,
        label: formatShortDate(date),
        rank: row?.rank || data.participants.length,
      };
    });
  }

  function completedDates() {
    const cutoffDate = dailySnapshotCutoffDate();
    return [...new Set(
      data.matches
        .filter((match) => resultForMatch(match) && match.date && match.date <= cutoffDate)
        .map((match) => match.date),
    )].sort();
  }

  function renderRankingChart(series, chartId) {
    const width = 560;
    const height = 360;
    const padding = { top: 34, right: 24, bottom: 54, left: 44 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxRank = Math.max(data.participants.length, ...series.map((item) => item.rank), 1);
    const yTicks = rankTicks(maxRank);
    const x = (index) => padding.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
    const y = (rank) => padding.top + ((rank - 1) / Math.max(maxRank - 1, 1)) * innerHeight;
    const points = series.map((item, index) => ({ ...item, x: x(index), y: y(item.rank) }));
    const pointList = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const areaList = [
      `${padding.left},${padding.top + innerHeight}`,
      pointList,
      `${padding.left + innerWidth},${padding.top + innerHeight}`,
    ].join(" ");
    const labelIndexes = chartLabelIndexes(series.length);
    const current = points.at(-1);
    const titleId = `${chartId}-title`;
    const descId = `${chartId}-desc`;

    return `
      <div class="ranking-chart-wrap">
        <svg class="ranking-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}">
          <title id="${titleId}">Evolução diária da posição no ranking</title>
          <desc id="${descId}">Linha com a posição no ranking ao final de cada dia com jogos finalizados.</desc>
          <rect class="ranking-chart-bg" x="0" y="0" width="${width}" height="${height}" rx="8"></rect>
          ${yTicks.map((tick) => `
            <line class="ranking-chart-grid" x1="${padding.left}" x2="${padding.left + innerWidth}" y1="${y(tick)}" y2="${y(tick)}"></line>
            <text class="ranking-chart-y-label" x="${padding.left - 12}" y="${y(tick) + 4}" text-anchor="end">${ordinal(tick)}</text>
          `).join("")}
          ${labelIndexes.map((index) => `
            <line class="ranking-chart-grid soft" x1="${x(index)}" x2="${x(index)}" y1="${padding.top}" y2="${padding.top + innerHeight}"></line>
            <text class="ranking-chart-x-label" x="${x(index)}" y="${height - 14}" text-anchor="middle">${escapeHtml(points[index].label)}</text>
          `).join("")}
          <polygon class="ranking-chart-area" points="${areaList}"></polygon>
          <polyline class="ranking-chart-line" points="${pointList}"></polyline>
          ${points.map((point, index) => `
            <circle class="ranking-chart-point${index === points.length - 1 ? " current" : ""}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 6 : 4}">
              <title>${escapeHtml(point.label)}: ${ordinal(point.rank)}</title>
            </circle>
          `).join("")}
          <circle class="ranking-chart-current-ring" cx="${current.x}" cy="${current.y}" r="14"></circle>
        </svg>
      </div>
    `;
  }

  function rankTicks(maxRank) {
    const middle = Math.max(1, Math.ceil(maxRank / 2));
    return [...new Set([1, middle, maxRank])].sort((a, b) => a - b);
  }

  function chartLabelIndexes(length) {
    if (length <= 4) return Array.from({ length }, (_, index) => index);
    return [...new Set([0, Math.floor((length - 1) / 3), Math.floor(((length - 1) * 2) / 3), length - 1])];
  }

  function renderMatchBetsBoard() {
    if (!matchBetsBoard) return;
    if (!data.matches.length) {
      matchBetsBoard.innerHTML = `<div class="empty">Nenhum jogo importado ainda.</div>`;
      return;
    }

    const matches = filteredMatches();
    const bracketSlots = filteredBracketSlots();
    const playoffMatches = matches.filter(isPlayoffMatch);
    const otherMatches = matches.filter((match) => !isPlayoffMatch(match));

    matchBetsBoard.innerHTML = `
      ${data.bracketSlots?.length ? `
        <section class="match-bets-feature final-slots-feature">
          <div class="match-bets-section-heading">
            <div>
              <h3>Fase final projetada</h3>
              <p>Slots das oitavas à final, comparando as chaves previstas por todos os participantes.</p>
            </div>
            <span>${bracketSlots.length}</span>
          </div>
          ${renderBracketSlotColumns(bracketSlots)}
        </section>
      ` : ""}
      <section class="match-bets-feature">
        <div class="match-bets-section-heading">
          <div>
            <h3>Jogos dos playoffs</h3>
            <p>Rodada de 32 em diante, com palpites e pontuação por jogo.</p>
          </div>
          <span>${playoffMatches.length}</span>
        </div>
        ${renderMatchCategoryColumns(categorizeMatches(playoffMatches))}
      </section>
      <details class="other-matches-panel">
        <summary>
          <span>Demais jogos</span>
          <strong>${otherMatches.length}</strong>
        </summary>
        ${renderMatchCategoryColumns(categorizeMatches(otherMatches))}
      </details>
    `;
  }

  function renderBracketSlotColumns(slots) {
    const groups = bracketSlotGroups(slots);
    return `
      <div class="match-bets-board-grid bracket-slot-board">
        ${groups.map((group) => `
          <section class="match-bets-column">
            <div class="match-bets-column-heading">
              <h3>${escapeHtml(group.title)}</h3>
              <span>${group.slots.length}</span>
            </div>
            <div class="match-bets-list">
              ${
                group.slots.length
                  ? group.slots.map(renderBracketSlotCard).join("")
                  : `<div class="empty compact">${escapeHtml(group.emptyText)}</div>`
              }
            </div>
          </section>
        `).join("")}
      </div>
    `;
  }

  function bracketSlotGroups(slots) {
    const phases = ["Oitavas de Final", "Quartas de Final", "Semifinal", "Terceiro Lugar", "Final"];
    return phases.map((phase) => ({
      title: phase,
      emptyText: `Nenhum slot de ${phase.toLowerCase()} neste filtro.`,
      slots: slots.filter((slot) => slot.phase === phase).sort((a, b) => a.matchId - b.matchId),
    }));
  }

  function renderBracketSlotCard(slot) {
    const actual = resultForMatch(slot);
    const resultLabel = actual ? `${actual.g1} x ${actual.g2}` : "Sem resultado";
    const teamsLabel = hasOfficialSlotTeams(slot)
      ? `${slot.team1} x ${slot.team2}`
      : `${slot.team1} x ${slot.team2}`;
    const rows = data.participants.map((participant) => {
      const bet = bracketBetForSlot(participant, slot.slot);
      const score = scoreBracketBet(bet, slot, actual);
      const status = bracketBetStatus(bet, slot, actual, score);
      const pointClass = score.exact ? "points-exact" : score.points > 0 ? "points-good" : "";
      return `
        <tr>
          <td>${escapeHtml(participant.name)}</td>
          <td>${bet ? `${escapeHtml(bet.team1)} ${bet.g1} x ${bet.g2} ${escapeHtml(bet.team2)}` : "-"}</td>
          <td>${bet?.winner ? escapeHtml(bet.winner) : "-"}</td>
          <td class="${pointClass}">${actual ? score.points : "-"}</td>
          <td><span class="slot-status ${status.className}">${escapeHtml(status.label)}</span></td>
        </tr>
      `;
    }).join("");

    return `
      <details class="match-bets-card bracket-slot-card">
        <summary>
          <span class="match-bets-meta">#${slot.matchId} · ${escapeHtml(slot.slot)} · ${escapeHtml(slot.phase)}</span>
          <strong>${escapeHtml(teamsLabel)}</strong>
          <span class="match-bets-result">${escapeHtml(resultLabel)}</span>
        </summary>
        <div class="match-bets-details">
          <table class="compact-table slot-table">
            <thead>
              <tr>
                <th>Participante</th>
                <th>Palpite</th>
                <th>Avança</th>
                <th>Pontos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
    `;
  }

  function renderMatchCategoryColumns(categories) {
    return `
      <div class="match-bets-board-grid">
        ${categories
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
      .join("")}
      </div>
    `;
  }

  function renderMatchGroupFilter() {
    if (!matchGroupFilter) return;
    const selected = matchGroupFilter.value || matchFilters.group;
    const groups = [...new Set([
      ...data.matches.map((match) => match.group).filter(Boolean),
      ...(data.bracketSlots || []).map((slot) => slot.group).filter(Boolean),
    ])].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    matchGroupFilter.innerHTML = [
      `<option value="">Todos os grupos</option>`,
      ...groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(groupLabel(group))}</option>`),
    ].join("");
    if (groups.includes(selected)) {
      matchGroupFilter.value = selected;
      matchFilters.group = selected;
    }
  }

  function groupLabel(group) {
    return group === "Fase Final" ? "Fase Final" : `Grupo ${group}`;
  }

  function renderMatchPhaseFilter() {
    if (!matchPhaseFilter) return;
    const selected = matchPhaseFilter.value || matchFilters.phase;
    const phases = [...new Set([
      ...data.matches.map((match) => matchStageKey(match)).filter(Boolean),
      ...(data.bracketSlots || []).map((slot) => matchStageKey(slot)).filter(Boolean),
    ])]
      .sort((a, b) => stageOrder(a) - stageOrder(b) || a.localeCompare(b, "pt-BR"));
    matchPhaseFilter.innerHTML = [
      `<option value="">Todas as fases</option>`,
      ...phases.map((phase) => `<option value="${escapeHtml(phase)}">${escapeHtml(phase)}</option>`),
    ].join("");
    if (phases.includes(selected)) {
      matchPhaseFilter.value = selected;
      matchFilters.phase = selected;
    }
  }

  function filteredMatches() {
    const search = normalizeText(matchFilters.search);
    return data.matches.filter((match) => {
      const matchesGroup = !matchFilters.group || match.group === matchFilters.group;
      if (!matchesGroup) return false;
      const matchesPhase = !matchFilters.phase || matchStageKey(match) === matchFilters.phase;
      if (!matchesPhase) return false;
      if (!search) return true;
      const haystack = normalizeText(
        `#${match.id} ${match.group || ""} ${matchStageKey(match)} ${formatDate(match.date)} ${match.team1} ${match.team2}`,
      );
      return haystack.includes(search);
    });
  }

  function filteredBracketSlots() {
    const search = normalizeText(matchFilters.search);
    return (data.bracketSlots || []).filter((slot) => {
      const matchesGroup = !matchFilters.group || slot.group === matchFilters.group;
      if (!matchesGroup) return false;
      const matchesPhase = !matchFilters.phase || matchStageKey(slot) === matchFilters.phase;
      if (!matchesPhase) return false;
      if (!search) return true;
      const participantBets = data.participants
        .map((participant) => bracketBetForSlot(participant, slot.slot))
        .filter(Boolean)
        .map((bet) => `${bet.team1} ${bet.team2} ${bet.winner || ""}`)
        .join(" ");
      const haystack = normalizeText(
        `#${slot.matchId} ${slot.slot} ${slot.group || ""} ${matchStageKey(slot)} ${slot.phase} ${slot.team1} ${slot.team2} ${participantBets}`,
      );
      return haystack.includes(search);
    });
  }

  function isPlayoffMatch(match) {
    return matchStageKey(match) !== "Fase de Grupos";
  }

  function stageOrder(stage) {
    return {
      "Fase de Grupos": 1,
      "Rodada de 32": 2,
      "Oitavas à Final": 3,
    }[stage] || 99;
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
    const actual = resultForMatch(match);
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
          <span class="match-bets-meta">#${match.id} · ${escapeHtml(matchStageKey(match))} · ${escapeHtml(formatDate(match.date))}</span>
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
      if (participantBracket) participantBracket.innerHTML = "";
      return;
    }

    const bets = new Map(participant.bets.map((bet) => [bet.matchId, bet]));
    participantBetsBody.innerHTML = data.matches
      .map((match) => {
        const bet = bets.get(match.id) || null;
        const actual = resultForMatch(match);
        const scored = scoreBet(bet, actual);
        const pointClass = scored.exact ? "points-exact" : scored.points > 0 ? "points-good" : "";
        return `
          <tr>
            <td>${match.id}</td>
            <td>${escapeHtml(matchStageKey(match))}</td>
            <td>${escapeHtml(match.team1)} x ${escapeHtml(match.team2)}</td>
            <td>${formatScore(bet)}</td>
            <td>${actual ? `${actual.g1} x ${actual.g2}` : "-"}</td>
            <td class="${pointClass}">${scored.points}</td>
          </tr>
        `;
      })
      .join("");

    if (participantBracket) {
      participantBracket.innerHTML = renderParticipantBracket(participant);
    }
  }

  function renderParticipantBracket(participant) {
    const bets = participant.bracketBets || [];
    if (!bets.length) {
      return `
        <section class="bracket-panel">
          <div class="empty compact">Nenhuma chave projetada importada para este participante.</div>
        </section>
      `;
    }

    const finalBet = bets.find((bet) => bet.slot === "FINAL");
    const champion = finalBet?.winner || "campeão não definido";
    const runnerUp = finalBet?.winner
      ? (sameTeam(finalBet.winner, finalBet.team1) ? finalBet.team2 : finalBet.team1)
      : "";
    const thirdPlaceBet = bets.find((bet) => bet.slot === "TERCEIRO");

    return `
      <section class="bracket-panel" aria-label="Chave projetada por participante">
        <div class="bracket-heading">
          <div>
            <h3>Chave projetada até a final</h3>
            <p>Quartas em diante usam os times previstos por ${escapeHtml(participant.name)}.</p>
          </div>
          <div class="bracket-summary">
            <span>Campeão</span>
            <strong>${escapeHtml(champion)}</strong>
            ${runnerUp ? `<small>Finalista: ${escapeHtml(runnerUp)}</small>` : ""}
          </div>
        </div>
        ${thirdPlaceBet?.winner ? `
          <div class="bracket-note">
            <span>3º lugar previsto</span>
            <strong>${escapeHtml(thirdPlaceBet.winner)}</strong>
          </div>
        ` : ""}
        <div class="bracket-phase-grid">
          ${bracketPhaseGroups(bets).map(renderBracketPhase).join("")}
        </div>
      </section>
    `;
  }

  function bracketPhaseGroups(bets) {
    const order = ["Oitavas de Final", "Quartas de Final", "Semifinal", "Terceiro Lugar", "Final"];
    return order
      .map((phase) => ({
        phase,
        bets: bets.filter((bet) => bet.phase === phase).sort((a, b) => a.matchId - b.matchId),
      }))
      .filter((group) => group.bets.length);
  }

  function renderBracketPhase(group) {
    return `
      <section class="bracket-phase">
        <div class="bracket-phase-heading">
          <h4>${escapeHtml(group.phase)}</h4>
          <span>${group.bets.length}</span>
        </div>
        <div class="bracket-match-list">
          ${group.bets.map(renderBracketBetCard).join("")}
        </div>
      </section>
    `;
  }

  function renderBracketBetCard(bet) {
    const slot = bracketSlotById(bet.slot);
    const actual = slot ? resultForMatch(slot) : null;
    const score = scoreBracketBet(bet, slot, actual);
    const status = bracketBetStatus(bet, slot, actual, score);
    return `
      <article class="bracket-match-card">
        <div class="bracket-match-meta">
          <span>${escapeHtml(bet.slot)}</span>
          <strong class="${status.className}">${escapeHtml(status.label)}</strong>
        </div>
        <div class="bracket-score-row">
          <span>${escapeHtml(bet.team1)}</span>
          <strong>${bet.g1} x ${bet.g2}</strong>
          <span>${escapeHtml(bet.team2)}</span>
        </div>
        <div class="bracket-winner">
          <span>Avança</span>
          <strong>${bet.winner ? escapeHtml(bet.winner) : "desempate pendente"}</strong>
        </div>
      </article>
    `;
  }

  function bracketBetStatus(bet, slot, actual, score) {
    if (!slot) return { label: "slot não encontrado", className: "status-waiting" };
    if (!hasOfficialSlotTeams(slot)) return { label: "aguardando times oficiais", className: "status-waiting" };
    if (!actual) return { label: "aguardando resultado", className: "status-waiting" };
    if (!score.eligible) return { label: "não pontuou", className: "status-missed" };
    if (score.exact && score.advanced) return { label: `${score.points} pts · exato + país`, className: "status-hit" };
    if (score.exact) return { label: `${score.points} pts · placar exato`, className: "status-hit" };
    if (score.simple && score.advanced) return { label: `${score.points} pts · resultado + país`, className: "status-hit" };
    if (score.advanced) return { label: `${score.points} pts · país avançou`, className: "status-good" };
    if (score.points > 0) return { label: `${score.points} pts · placar`, className: "status-good" };
    return { label: "0 pts", className: "status-missed" };
  }

  function bracketSlotById(slotId) {
    return (data.bracketSlots || []).find((slot) => slot.slot === slotId) || null;
  }

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatShortDate(value) {
    if (!value) return "";
    const [, month, day] = value.split("-");
    return `${day}/${month}`;
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

  function dailySnapshotCutoffDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localDate = new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
    const daysBack = Number(values.hour) >= 3 ? 1 : 2;
    localDate.setDate(localDate.getDate() - daysBack);
    return dateKey(localDate);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  function safeId(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  function ordinal(value) {
    return `${Number(value || 0)}º`;
  }
})();
