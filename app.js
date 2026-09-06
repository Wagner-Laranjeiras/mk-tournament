/* =====================================================================
   Kart Tournament — vanilla JS
   Phases: setup → qualifying → final → celebration
   All state persisted to localStorage after every action.
   ===================================================================== */

(() => {
  "use strict";

  const STATE_KEY = "kartTournament.state.v1";
  const CHAR_CACHE_KEY = "kartTournament.characters.v1";
  const DRIVERS_URL = "https://mario-kart-tour-api.herokuapp.com/api/drivers";
  const FETCH_TIMEOUT_MS = 7000;

  // Built-in fallback roster (used offline / if the API is unreachable).
  const FALLBACK_CHARACTERS = [
    { name: "Red Racer", emoji: "🔴" },
    { name: "Blue Racer", emoji: "🔵" },
    { name: "Green Racer", emoji: "🟢" },
    { name: "Yellow Racer", emoji: "🟡" },
    { name: "Purple Racer", emoji: "🟣" },
    { name: "Orange Racer", emoji: "🟠" },
    { name: "Star", emoji: "⭐" },
    { name: "Mushroom", emoji: "🍄" },
    { name: "Shell", emoji: "🐢" },
    { name: "Banana", emoji: "🍌" },
    { name: "Lightning", emoji: "⚡" },
    { name: "Fireball", emoji: "🔥" },
    { name: "Boo", emoji: "👻" },
    { name: "Crown", emoji: "👑" },
    { name: "Rocket", emoji: "🚀" },
    { name: "Trophy", emoji: "🏆" },
    { name: "Bomb", emoji: "💣" },
    { name: "Cloud", emoji: "☁️" },
    { name: "Gem", emoji: "💎" },
    { name: "Race Car", emoji: "🏎️" },
  ];

  // ---------- App state ----------
  let state = null;          // persisted tournament state
  let characters = [];       // available character roster [{name, image?, emoji?}]
  let charTarget = null;     // participant id currently choosing a character

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const uid = () => Math.random().toString(36).slice(2, 9);

  const screens = {
    setup: $("#screen-setup"),
    qualifying: $("#screen-qualifying"),
    final: $("#screen-final"),
    celebration: $("#screen-celebration"),
  };

  // =====================================================================
  // Persistence
  // =====================================================================
  function save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state:", e);
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function freshState() {
    return {
      phase: "setup",
      config: { rounds: 4, points: [4, 3, 2, 1] },
      participants: [], // {id, name, charName, image, emoji, points}
      currentRound: 1,
      races: [],        // current round races: {id, playerIds:[], order:[], done}
      history: [],      // [{round, races:[{playerIds, order}]}]
      final: null,      // {playerIds:[], order:[], done}
    };
  }

  // =====================================================================
  // Character roster (fetch + cache + fallback)
  // =====================================================================
  async function loadCharacters() {
    const statusEl = $("#charStatus");

    // 1. Try cache first (instant, avoids refetch every load).
    try {
      const cached = JSON.parse(localStorage.getItem(CHAR_CACHE_KEY) || "null");
      if (cached && Array.isArray(cached.list) && cached.list.length) {
        characters = cached.list;
        statusEl.textContent = `🎮 ${characters.length} characters ready (cached).`;
        statusEl.classList.add("ok");
        return;
      }
    } catch { /* ignore bad cache */ }

    statusEl.textContent = "🎮 Loading characters…";

    // 2. Try the live API with a timeout.
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(DRIVERS_URL, { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const list = (Array.isArray(data) ? data : [])
        .filter((d) => d && d.name)
        .map((d) => ({ name: d.name, image: d.image || null }));
      if (!list.length) throw new Error("empty roster");

      characters = list;
      localStorage.setItem(CHAR_CACHE_KEY, JSON.stringify({ list, ts: Date.now() }));
      statusEl.textContent = `🎮 ${list.length} characters loaded from the roster API.`;
      statusEl.classList.add("ok");
      return;
    } catch (e) {
      console.warn("Character API unavailable, using fallback:", e.message);
    }

    // 3. Fallback set so selection still works offline.
    characters = FALLBACK_CHARACTERS.slice();
    statusEl.textContent = "🎮 Roster API unavailable — using built-in racer icons.";
    statusEl.classList.add("ok");
  }

  function charByName(name) {
    return characters.find((c) => c.name === name) || null;
  }

  // Render a character avatar (image if available, else emoji, else initial).
  function avatarInto(node, p) {
    node.innerHTML = "";
    node.style.backgroundImage = "";
    if (p && p.image) {
      const img = new Image();
      img.src = p.image;
      img.alt = p.charName || "";
      img.loading = "lazy";
      img.onerror = () => {
        node.textContent = p.emoji || (p.name ? p.name[0].toUpperCase() : "🏎️");
      };
      node.appendChild(img);
    } else if (p && p.emoji) {
      node.textContent = p.emoji;
    } else if (p && p.charName) {
      node.textContent = p.charName[0].toUpperCase();
    } else {
      node.textContent = "🏎️";
    }
  }

  // =====================================================================
  // Screen routing
  // =====================================================================
  function show(phase) {
    Object.entries(screens).forEach(([k, node]) => (node.hidden = k !== phase));
    $("#resetBtn").hidden = phase === "setup" && state.participants.length === 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    switch (state.phase) {
      case "setup": renderSetup(); show("setup"); break;
      case "qualifying": renderQualifying(); show("qualifying"); break;
      case "final": renderFinal(); show("final"); break;
      case "celebration": renderCelebration(); show("celebration"); break;
    }
    $("#resetBtn").hidden = state.phase === "setup" && state.participants.length === 0;
  }

  // =====================================================================
  // SETUP
  // =====================================================================
  function renderSetup() {
    $("#cfgRounds").value = state.config.rounds;
    $("#cfgPoints").value = state.config.points.join(", ");

    const list = $("#participantList");
    list.innerHTML = "";
    state.participants.forEach((p, i) => list.appendChild(participantRow(p, i)));

    updateSetupState();
  }

  function participantRow(p, i) {
    const row = el("div", "p-row");

    const num = el("span", "p-num", String(i + 1));

    const charBtn = el("button", "p-char");
    charBtn.type = "button";
    charBtn.title = "Choose character";
    avatarInto(charBtn, p.charName ? p : null);
    if (!p.charName) charBtn.textContent = "＋";
    charBtn.addEventListener("click", () => openCharPicker(p.id));

    const nameInput = el("input", "p-name");
    nameInput.type = "text";
    nameInput.value = p.name;
    nameInput.placeholder = `Racer ${i + 1}`;
    nameInput.maxLength = 24;
    nameInput.addEventListener("input", () => {
      p.name = nameInput.value;
      updateSetupState();
      save();
    });

    const del = el("button", "p-del", "🗑");
    del.type = "button";
    del.title = "Remove";
    del.addEventListener("click", () => {
      state.participants = state.participants.filter((x) => x.id !== p.id);
      save();
      renderSetup();
    });

    row.append(num, charBtn, nameInput, del);
    return row;
  }

  function addParticipant() {
    if (state.participants.length >= 20) return;
    state.participants.push({ id: uid(), name: "", charName: null, image: null, emoji: null, points: 0 });
    save();
    renderSetup();
    // focus the new name input
    const inputs = document.querySelectorAll(".p-name");
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function readConfig() {
    let rounds = parseInt($("#cfgRounds").value, 10);
    if (!Number.isFinite(rounds) || rounds < 1) rounds = 1;
    if (rounds > 12) rounds = 12;
    state.config.rounds = rounds;

    const pts = $("#cfgPoints").value
      .split(/[,\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n));
    state.config.points = pts.length ? pts : [4, 3, 2, 1];
  }

  function namedParticipants() {
    return state.participants.filter((p) => p.name.trim().length > 0);
  }

  function updateSetupState() {
    const n = namedParticipants().length;
    const total = state.participants.length;
    const hint = $("#countHint");
    hint.textContent = `${n} named · ${total} rows`;

    const startBtn = $("#startBtn");
    const ok = n >= 8 && n <= 20;
    startBtn.disabled = !ok;
    startBtn.textContent = ok
      ? `Start tournament (${n} racers)`
      : n < 8
      ? `Need ${8 - n} more racer${8 - n === 1 ? "" : "s"} (min 8)`
      : "Too many — max 20 racers";

    $("#addParticipantBtn").disabled = total >= 20;
    $("#resetBtn").hidden = total === 0;
  }

  function startTournament() {
    readConfig();
    // Keep only named racers; trim names.
    state.participants = namedParticipants().map((p) => ({ ...p, name: p.name.trim(), points: 0 }));
    if (state.participants.length < 8 || state.participants.length > 20) return;

    state.phase = "qualifying";
    state.currentRound = 1;
    state.history = [];
    state.final = null;
    state.races = buildRaces(shuffle(state.participants.map((p) => p.id)));
    save();
    render();
  }

  // =====================================================================
  // CHARACTER PICKER
  // =====================================================================
  function openCharPicker(participantId) {
    charTarget = participantId;
    $("#charSearch").value = "";
    renderCharGrid("");
    $("#charModal").hidden = false;
    setTimeout(() => $("#charSearch").focus(), 50);
  }
  function closeCharPicker() {
    $("#charModal").hidden = true;
    charTarget = null;
  }
  function renderCharGrid(query) {
    const grid = $("#charGrid");
    grid.innerHTML = "";
    const p = state.participants.find((x) => x.id === charTarget);
    const q = query.trim().toLowerCase();
    const matches = characters.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 120);

    // "None" option to clear.
    grid.appendChild(charOption({ name: "No character", clear: true }, p));
    matches.forEach((c) => grid.appendChild(charOption(c, p)));

    if (!matches.length) {
      const none = el("p", "muted", "No characters match that search.");
      none.style.gridColumn = "1 / -1";
      grid.appendChild(none);
    }
  }
  function charOption(c, p) {
    const opt = el("div", "char-opt");
    if (c.clear && p && !p.charName) opt.classList.add("selected");
    if (!c.clear && p && p.charName === c.name) opt.classList.add("selected");

    const av = el("div", "avatar");
    if (c.clear) av.textContent = "🚫";
    else avatarInto(av, { charName: c.name, image: c.image, emoji: c.emoji });

    const label = el("small", null, c.clear ? "None" : c.name);
    opt.append(av, label);
    opt.addEventListener("click", () => {
      if (!p) return;
      if (c.clear) {
        p.charName = null; p.image = null; p.emoji = null;
      } else {
        p.charName = c.name; p.image = c.image || null; p.emoji = c.emoji || null;
      }
      save();
      closeCharPicker();
      renderSetup();
    });
    return opt;
  }

  // =====================================================================
  // RACE GROUPING
  // =====================================================================
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Split an ordered id list into evenly-sized groups, none larger than 4,
  // and (for 8+ racers) never leaving a lone racer in a size-1 race.
  function groupSizes(n) {
    const races = Math.ceil(n / 4);
    const base = Math.floor(n / races);
    let remainder = n % races;
    const sizes = [];
    for (let i = 0; i < races; i++) {
      sizes.push(base + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder--;
    }
    return sizes; // e.g. 10 -> [4,3,3]; 9 -> [3,3,3]; 11 -> [4,4,3]
  }

  // Build races from an ordered array of participant ids.
  // Round 1 passes a shuffled order; later rounds pass a points-seeded order.
  function buildRaces(orderedIds) {
    const sizes = groupSizes(orderedIds.length);
    const races = [];
    let idx = 0;
    sizes.forEach((size) => {
      const playerIds = orderedIds.slice(idx, idx + size);
      idx += size;
      races.push({ id: uid(), playerIds, order: [], done: false });
    });
    return races;
  }

  // Seed the next round by current standings (Swiss-style): sort by points desc,
  // tie-break with a little randomness so equal-point racers get mixed grouping.
  function seededOrder() {
    return state.participants
      .map((p) => ({ id: p.id, points: p.points, r: Math.random() }))
      .sort((a, b) => b.points - a.points || a.r - b.r)
      .map((x) => x.id);
  }

  // =====================================================================
  // QUALIFYING
  // =====================================================================
  function participant(id) {
    return state.participants.find((p) => p.id === id);
  }

  function renderQualifying() {
    $("#roundTitle").textContent = `Round ${state.currentRound} of ${state.config.rounds}`;
    const remaining = state.races.filter((r) => !r.done).length;
    $("#roundSub").textContent = remaining === 0
      ? "All races scored — ready for the next round."
      : `${state.races.length} race${state.races.length === 1 ? "" : "s"} · enter each finishing order. Points: ${state.config.points.join("/")}`;

    const cont = $("#racesContainer");
    cont.innerHTML = "";
    state.races.forEach((race, i) => cont.appendChild(raceCard(race, i)));

    const allDone = state.races.every((r) => r.done);
    const btn = $("#nextRoundBtn");
    btn.disabled = !allDone;
    const isLast = state.currentRound >= state.config.rounds;
    btn.textContent = !allDone
      ? "Score every race to continue"
      : isLast
      ? "🏆 Go to the Final Four"
      : `Start Round ${state.currentRound + 1}`;
  }

  function raceCard(race, i) {
    const card = el("div", "race-card");
    if (race.done) card.classList.add("done");

    const title = el("div", "race-title");
    title.appendChild(el("h3", null, `Race ${i + 1}`));
    title.appendChild(el("span", "race-badge", race.done ? "✓ Scored" : `${race.playerIds.length} racers`));
    card.appendChild(title);

    card.appendChild(el("p", "race-hint",
      race.done
        ? "Tap Edit to re-enter the finishing order."
        : "Tap racers in the order they finished — 1st first."));

    // ordered display: picked racers in finish order, then the rest.
    const orderedIds = race.done ? race.order : race.order.slice();
    const pending = race.playerIds.filter((id) => !orderedIds.includes(id));
    const displayIds = orderedIds.concat(pending);

    displayIds.forEach((id) => {
      const p = participant(id);
      const pickedPos = race.order.indexOf(id); // -1 if not yet picked
      const isPicked = pickedPos >= 0;
      const rowr = el("div", "racer" + (isPicked ? " picked" : ""));

      const pos = el("div", "racer-pos");
      if (isPicked) {
        pos.textContent = pickedPos + 1;
        if (pickedPos === 0) pos.classList.add("p1");
        else if (pickedPos === 1) pos.classList.add("p2");
        else if (pickedPos === 2) pos.classList.add("p3");
      } else {
        pos.textContent = "•";
      }

      const av = el("div", "avatar");
      avatarInto(av, p.charName ? p : null);

      const name = el("span", "racer-name", p.name);
      const pts = el("span", "racer-pts", `${p.points} pts`);

      rowr.append(pos, av, name, pts);

      if (!race.done && !isPicked) {
        rowr.addEventListener("click", () => {
          race.order.push(id);
          if (race.order.length === race.playerIds.length) finalizeRace(race);
          save();
          renderQualifying();
        });
      }
      card.appendChild(rowr);
    });

    // actions
    const actions = el("div", "race-actions");
    if (race.order.length > 0 && !race.done) {
      const undo = el("button", "btn btn-ghost btn-sm", "↶ Undo last");
      undo.addEventListener("click", () => {
        race.order.pop();
        save();
        renderQualifying();
      });
      actions.appendChild(undo);
    }
    if (race.done) {
      const edit = el("button", "btn btn-ghost btn-sm", "Edit");
      edit.addEventListener("click", () => {
        clearRacePoints(race);
        race.done = false;
        race.order = [];
        save();
        renderQualifying();
      });
      actions.appendChild(edit);
    }
    if (actions.children.length) card.appendChild(actions);

    return card;
  }

  function awardPoints(order) {
    order.forEach((id, pos) => {
      const p = participant(id);
      if (p) p.points += (state.config.points[pos] || 0);
    });
  }
  function clearRacePoints(race) {
    // subtract the points this race previously awarded
    race.order.forEach((id, pos) => {
      const p = participant(id);
      if (p) p.points -= (state.config.points[pos] || 0);
    });
  }
  function finalizeRace(race) {
    awardPoints(race.order);
    race.done = true;
  }

  function nextRound() {
    if (!state.races.every((r) => r.done)) return;

    // archive this round
    state.history.push({
      round: state.currentRound,
      races: state.races.map((r) => ({ playerIds: r.playerIds.slice(), order: r.order.slice() })),
    });

    if (state.currentRound >= state.config.rounds) {
      // advance to final four
      const top4 = standings().slice(0, 4).map((p) => p.id);
      state.final = { playerIds: top4, order: [], done: false };
      state.phase = "final";
      save();
      render();
      return;
    }

    state.currentRound += 1;
    state.races = buildRaces(seededOrder());
    save();
    render();
  }

  // Sorted standings (points desc). Stable tie-break by name for display.
  function standings() {
    return state.participants
      .slice()
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }

  // =====================================================================
  // LEADERBOARD MODAL
  // =====================================================================
  function openBoard() {
    const list = $("#boardList");
    list.innerHTML = "";
    const ranked = standings();
    ranked.forEach((p, i) => {
      const li = el("li");
      if (i < 3) li.classList.add("top" + (i + 1));
      if (i === 3) li.classList.add("cut-line"); // 4th = last of Final Four
      li.appendChild(el("span", "board-rank", String(i + 1)));

      const av = el("div", "avatar");
      avatarInto(av, p.charName ? p : null);
      li.appendChild(av);

      li.appendChild(el("span", "board-name", p.name));
      li.appendChild(el("span", "board-pts", `${p.points} pts`));
      list.appendChild(li);
    });
    $("#boardModal").hidden = false;
  }
  function closeBoard() { $("#boardModal").hidden = true; }

  // =====================================================================
  // FINAL FOUR
  // =====================================================================
  function renderFinal() {
    const race = state.final;
    const wrap = $("#finalRace");
    wrap.innerHTML = "";

    const hint = el("p", "race-hint",
      race.done ? "Re-tap Edit to change the podium." : "Tap the finalists in finishing order — winner first.");
    wrap.appendChild(hint);

    const orderedIds = race.order.slice();
    const pending = race.playerIds.filter((id) => !orderedIds.includes(id));
    const displayIds = orderedIds.concat(pending);

    displayIds.forEach((id) => {
      const p = participant(id);
      const pickedPos = race.order.indexOf(id);
      const isPicked = pickedPos >= 0;
      const rowr = el("div", "racer" + (isPicked ? " picked" : ""));

      const pos = el("div", "racer-pos");
      if (isPicked) {
        pos.textContent = pickedPos + 1;
        if (pickedPos === 0) pos.classList.add("p1");
        else if (pickedPos === 1) pos.classList.add("p2");
        else if (pickedPos === 2) pos.classList.add("p3");
      } else pos.textContent = "•";

      const av = el("div", "avatar");
      avatarInto(av, p.charName ? p : null);
      const name = el("span", "racer-name", p.name);
      const pts = el("span", "racer-pts", `${p.points} pts`);
      rowr.append(pos, av, name, pts);

      if (!isPicked) {
        rowr.addEventListener("click", () => {
          race.order.push(id);
          race.done = race.order.length === race.playerIds.length;
          save();
          renderFinal();
        });
      }
      wrap.appendChild(rowr);
    });

    const actions = el("div", "race-actions");
    if (race.order.length > 0) {
      const undo = el("button", "btn btn-ghost btn-sm", "↶ Undo last");
      undo.addEventListener("click", () => {
        race.order.pop();
        race.done = false;
        save();
        renderFinal();
      });
      actions.appendChild(undo);
    }
    if (actions.children.length) wrap.appendChild(actions);

    $("#finishFinalBtn").disabled = !race.done;
  }

  function finishFinal() {
    if (!state.final.done) return;
    state.phase = "celebration";
    save();
    render();
  }

  // =====================================================================
  // CELEBRATION
  // =====================================================================
  // Final ranking: the 4 finalists in their race-finish order, then everyone
  // else by qualifying points.
  function finalRanking() {
    const finalists = state.final.order.slice(); // ids, 1st..4th
    const rest = standings()
      .filter((p) => !finalists.includes(p.id))
      .map((p) => p.id);
    return finalists.concat(rest);
  }

  const WINNER_MSGS = [
    (n) => `👑 ${n} is the Grand Champion! A flawless run to the top of the podium — absolutely untouchable today.`,
    (n) => `🥈 So close! ${n} fought to the very last corner and takes a brilliant 2nd place. A true contender.`,
    (n) => `🥉 ${n} rounds out the podium in 3rd — clutch racing under pressure to grab that final trophy spot.`,
  ];

  function restMessage(rank, total) {
    if (rank === 4) {
      return "The 4th finalist — you made the Final Four and raced with the best. Podium next time!";
    }
    if (rank === 5) {
      return "Agonizingly close — just missed the Final Four cut. You were knocking on the door all night.";
    }
    if (rank <= Math.ceil(total * 0.5)) {
      return "A strong, steady campaign right in the thick of the action. A racer to watch.";
    }
    if (rank < total) {
      return "Plenty of grit out there and some great moments — the racing line is coming together.";
    }
    return "Last on points, first in spirit — you kept the grid smiling all night. Legend of the party! 🎉";
  }

  function renderCelebration() {
    const wrap = $("#celebration");
    wrap.innerHTML = "";

    const ranking = finalRanking();
    const podiumIds = ranking.slice(0, 3);

    wrap.appendChild(el("h2", "celebrate-title", "🎉 Champions! 🎉"));
    const sub = el("p", "muted confetti-note", "The checkered flag is out — here's how the grid finished.");
    wrap.appendChild(sub);

    // Podium: order visually 2nd, 1st, 3rd
    const podium = el("div", "podium");
    const layout = [
      { idx: 1, cls: "podium-2", medal: "🥈" },
      { idx: 0, cls: "podium-1", medal: "🥇" },
      { idx: 2, cls: "podium-3", medal: "🥉" },
    ];
    layout.forEach(({ idx, cls, medal }) => {
      const id = podiumIds[idx];
      if (!id) return;
      const p = participant(id);
      const spot = el("div", "podium-spot " + cls);

      const av = el("div", "podium-av");
      avatarInto(av, p.charName ? p : null);
      spot.appendChild(av);

      const block = el("div", "podium-block");
      block.appendChild(el("span", "podium-medal", medal));
      block.appendChild(el("span", "podium-name", p.name));
      spot.appendChild(block);

      const msg = el("p", "podium-msg", messageForPodium(idx, p));
      spot.appendChild(msg);
      podium.appendChild(spot);
    });
    wrap.appendChild(podium);

    // Everyone else
    if (ranking.length > 3) {
      wrap.appendChild(el("div", "section-label", "The rest of the grid"));
      const rest = el("div", "rest-list");
      ranking.slice(3).forEach((id, i) => {
        const rank = i + 4;
        const p = participant(id);
        const row = el("div", "rest-row");
        row.appendChild(el("span", "rest-rank", "#" + rank));

        const av = el("div", "avatar");
        avatarInto(av, p.charName ? p : null);
        row.appendChild(av);

        const body = el("div", "rest-body");
        body.appendChild(el("div", "rest-name", p.name));
        body.appendChild(el("div", "rest-msg", restMessage(rank, ranking.length)));
        row.appendChild(body);

        row.appendChild(el("span", "rest-pts", `${p.points} pts`));
        rest.appendChild(row);
      });
      wrap.appendChild(rest);
    }

    launchConfetti();
  }

  function messageForPodium(idx, p) {
    const who = p.charName ? `${p.name} (${p.charName})` : p.name;
    return WINNER_MSGS[idx](who);
  }

  function launchConfetti() {
    const colors = ["#e52521", "#ffd21e", "#0d5fb3", "#43a047", "#f6b73c"];
    for (let i = 0; i < 80; i++) {
      const c = el("div", "confetti");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
      c.style.animationDelay = Math.random() * 1.5 + "s";
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  // =====================================================================
  // RESET
  // =====================================================================
  function resetTournament(confirmFirst = true) {
    if (confirmFirst && state.participants.length &&
        !confirm("Start a brand-new tournament? Current progress will be cleared.")) {
      return;
    }
    state = freshState();
    save();
    // add 8 empty rows to start
    for (let i = 0; i < 8; i++) {
      state.participants.push({ id: uid(), name: "", charName: null, image: null, emoji: null, points: 0 });
    }
    save();
    render();
  }

  // =====================================================================
  // WIRE UP
  // =====================================================================
  function wire() {
    $("#addParticipantBtn").addEventListener("click", addParticipant);
    $("#startBtn").addEventListener("click", startTournament);
    $("#cfgRounds").addEventListener("change", () => { readConfig(); save(); });
    $("#cfgPoints").addEventListener("change", () => { readConfig(); save(); });
    $("#resetBtn").addEventListener("click", () => resetTournament(true));
    $("#newTournamentBtn").addEventListener("click", () => resetTournament(false));

    $("#nextRoundBtn").addEventListener("click", nextRound);
    $("#showBoardBtn").addEventListener("click", openBoard);
    $("#finishFinalBtn").addEventListener("click", finishFinal);

    $("[data-close-board]").addEventListener("click", closeBoard);
    $("#boardModal").addEventListener("click", (e) => { if (e.target.id === "boardModal") closeBoard(); });

    $("[data-close-char]").addEventListener("click", closeCharPicker);
    $("#charModal").addEventListener("click", (e) => { if (e.target.id === "charModal") closeCharPicker(); });
    $("#charSearch").addEventListener("input", (e) => renderCharGrid(e.target.value));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeCharPicker(); closeBoard(); }
    });
  }

  // =====================================================================
  // INIT
  // =====================================================================
  async function init() {
    wire();
    state = load() || freshState();

    // Seed empty setup rows on a truly fresh start.
    if (state.phase === "setup" && state.participants.length === 0) {
      for (let i = 0; i < 8; i++) {
        state.participants.push({ id: uid(), name: "", charName: null, image: null, emoji: null, points: 0 });
      }
    }
    render();
    await loadCharacters();
    // Re-render so cached/loaded images/emoji appear on existing rows.
    render();
  }

  init();
})();
