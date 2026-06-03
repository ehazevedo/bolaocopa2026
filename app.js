(function () {
  let data = window.BOLAO_DATA || { matches: [], participants: [], rules: {} };
  const publishedResults = window.BOLAO_RESULTS || {};
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isAdmin = isLocalHost || new URLSearchParams(window.location.search).get("admin") === "1";
  const storageKey = "bolao-2026-resultados";
  const results = isAdmin ? { ...publishedResults, ...loadResults() } : { ...publishedResults };

  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");
  const leaderboardBody = document.querySelector("#leaderboard tbody");
  const resultsGrid = document.querySelector("#resultsGrid");
  const participantSelect = document.querySelector("#participantSelect");
  const participantBetsBody = document.querySelector("#participantBets tbody");
  const statusMessage = document.querySelector("#statusMessage");
  const resultsStatusMessage = document.querySelector("#resultsStatusMessage");
  const resultsHelpText = document.querySelector("#resultsHelpText");

  document.body.classList.toggle("admin-mode", isAdmin);
  if (resultsHelpText && isAdmin) {
    resultsHelpText.textContent = "Digite o resultado final considerado pelo regulamento e salve o arquivo de publicação.";
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      views.forEach((view) => view.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("resetResults").addEventListener("click", () => {
    if (!confirm("Limpar todos os resultados digitados neste navegador?")) return;
    Object.keys(results).forEach((key) => delete results[key]);
    saveResults();
    renderAll();
  });

  document.getElementById("refreshScores").addEventListener("click", () => {
    renderMetrics();
    renderLeaderboard();
    renderParticipantBets();
    showStatus(resultsStatusMessage, "Classificação e pontuação dos palpites atualizadas.", "success");
  });

  document.getElementById("savePublishedResults").addEventListener("click", async () => {
    await savePublishedResults();
  });

  document.getElementById("refreshBets").addEventListener("click", async () => {
    await refreshBetsFromFolder();
  });

  participantSelect.addEventListener("change", renderParticipantBets);

  renderAll();

  function renderAll() {
    renderMetrics();
    renderLeaderboard();
    renderResultsGrid();
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

  async function savePublishedResults() {
    const cleanResults = normalizedResults();
    const js = "window.BOLAO_RESULTS = " + JSON.stringify(cleanResults, null, 2) + ";\n";

    if (isLocalHost) {
      try {
        const response = await fetch("/api/save-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: cleanResults }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível salvar.");
        showStatus(resultsStatusMessage, "Arquivo data/results.js salvo. Agora é só publicar no GitHub.", "success");
        return;
      } catch (error) {
        downloadResultsFile(js);
        showStatus(resultsStatusMessage, `Não consegui salvar direto; baixei o results.js para você. Detalhe: ${error.message}`, "error");
        return;
      }
    }

    downloadResultsFile(js);
    showStatus(resultsStatusMessage, "Arquivo results.js baixado. Substitua data/results.js e publique no GitHub.", "success");
  }

  function normalizedResults() {
    return Object.fromEntries(
      Object.entries(results)
        .filter(([, value]) => value && value.g1 !== "" && value.g2 !== "" && value.g1 !== null && value.g2 !== null)
        .map(([matchId, value]) => [matchId, { g1: Number(value.g1), g2: Number(value.g2) }])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    );
  }

  function downloadResultsFile(js) {
    const blob = new Blob([js], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "results.js";
    link.click();
    URL.revokeObjectURL(url);
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

  function loadResults() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function saveResults() {
    localStorage.setItem(storageKey, JSON.stringify(results));
  }

  function resultCode(g1, g2) {
    if (g1 > g2) return "H";
    if (g1 < g2) return "A";
    return "D";
  }

  function matchResult(matchId) {
    const value = results[String(matchId)];
    if (!value || value.g1 === "" || value.g2 === "" || value.g1 === null || value.g2 === null) {
      return null;
    }
    return { g1: Number(value.g1), g2: Number(value.g2) };
  }

  function scoreBet(bet, actual) {
    if (!actual || !bet) return { points: 0, exact: false, simple: false };
    const simple = resultCode(bet.g1, bet.g2) === resultCode(actual.g1, actual.g2);
    const exact = bet.g1 === actual.g1 && bet.g2 === actual.g2;
    return {
      points: (simple ? data.rules.simpleResultPoints || 2 : 0) + (exact ? data.rules.exactScoreBonus || 3 : 0),
      exact,
      simple,
    };
  }

  function participantStats(participant) {
    const byMatch = new Map(participant.bets.map((bet) => [bet.matchId, bet]));
    const completed = data.matches.filter((match) => matchResult(match.id));
    let points = 0;
    let exact = 0;
    let simple = 0;
    let scoredMatches = 0;
    const phaseTotals = {};

    completed.forEach((match) => {
      const bet = byMatch.get(match.id) || { matchId: match.id, g1: 0, g2: 0 };
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

  function leaderboardRows() {
    return data.participants
      .map((participant) => ({ participant, stats: participantStats(participant) }))
      .sort((a, b) => {
        if (b.stats.weighted !== a.stats.weighted) return b.stats.weighted - a.stats.weighted;
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        if (b.stats.exact !== a.stats.exact) return b.stats.exact - a.stats.exact;
        return a.participant.name.localeCompare(b.participant.name, "pt-BR");
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

  function renderLeaderboard() {
    const rows = leaderboardRows();
    if (!rows.length) {
      leaderboardBody.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma aposta importada ainda.</td></tr>`;
      return;
    }

    let previousKey = null;
    let rank = 0;
    leaderboardBody.innerHTML = rows
      .map((row, index) => {
        const key = `${row.stats.weighted.toFixed(8)}|${row.stats.points}|${row.stats.exact}`;
        if (key !== previousKey) rank = index + 1;
        previousKey = key;
        return `
          <tr>
            <td><span class="rank-badge">${rank}</span></td>
            <td><strong>${escapeHtml(row.participant.name)}</strong></td>
            <td>${row.stats.points}</td>
            <td>${row.stats.weighted.toFixed(2)}</td>
            <td>${row.stats.exact}</td>
            <td>${row.stats.simple}</td>
            <td>${row.stats.scoredMatches}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderResultsGrid() {
    if (!data.matches.length) {
      resultsGrid.innerHTML = `<div class="empty">Nenhum jogo importado ainda.</div>`;
      return;
    }

    resultsGrid.innerHTML = data.matches
      .map((match) => {
        const actual = matchResult(match.id) || { g1: "", g2: "" };
        return `
          <article class="match-card">
            <div class="match-meta">
              <span>#${match.id} · Grupo ${escapeHtml(match.group || "-")}</span>
              <span>${escapeHtml(formatDate(match.date))}</span>
            </div>
            <div class="score-row">
              <strong class="team-right">${escapeHtml(match.team1)}</strong>
              <input class="score-input" type="number" min="0" inputmode="numeric"
                value="${actual.g1}" aria-label="${escapeHtml(match.team1)}"
                data-match="${match.id}" data-side="g1" ${isAdmin ? "" : "disabled"}>
              <span class="versus">x</span>
              <input class="score-input" type="number" min="0" inputmode="numeric"
                value="${actual.g2}" aria-label="${escapeHtml(match.team2)}"
                data-match="${match.id}" data-side="g2" ${isAdmin ? "" : "disabled"}>
              <strong>${escapeHtml(match.team2)}</strong>
            </div>
          </article>
        `;
      })
      .join("");

    resultsGrid.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        if (!isAdmin) return;
        const matchId = input.dataset.match;
        const side = input.dataset.side;
        results[matchId] = results[matchId] || { g1: "", g2: "" };
        results[matchId][side] = input.value === "" ? "" : Number(input.value);
        saveResults();
        renderMetrics();
        renderLeaderboard();
        renderParticipantBets();
      });
    });
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
        const bet = bets.get(match.id) || { g1: 0, g2: 0 };
        const actual = matchResult(match.id);
        const scored = scoreBet(bet, actual);
        const pointClass = scored.exact ? "points-exact" : scored.points > 0 ? "points-good" : "";
        return `
          <tr>
            <td>${match.id}</td>
            <td>${escapeHtml(match.group || "-")}</td>
            <td>${escapeHtml(match.team1)} x ${escapeHtml(match.team2)}</td>
            <td>${bet.g1} x ${bet.g2}</td>
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
