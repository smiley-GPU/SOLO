// game.js — phase state machine + rendering, per gamedesc.md §3 (Job phases)
// and §9 (App Architecture Notes).

const G = {
  character: null,
  job: null,       // the accepted job, once one of the Board's two offers is taken
  board: null,     // §19.3 — the two not-yet-accepted job candidates shown at Briefing
  boardRerolled: false, // Coffin Hotel's once-per-search gate, now board-level (was job.rerolled)
  restFlow: null,  // §19.3 — Rest sub-flow scratch state (was job.restStage/pendingResult/lastResult)
  phase: "create"
};

const els = {
  sheet: document.getElementById("sheet"),
  main: document.getElementById("main"),
  factions: document.getElementById("factions"),
  downtime: document.getElementById("downtime")
};

function init() {
  const loaded = load();
  if (loaded) {
    G.character = loaded;
    G.phase = nextHubPhase();
  } else {
    G.phase = "create";
  }
  render();
}

// 20 BONDS = game win (todo3.md) — call after anything that can push bonds
// up, at whatever point control next reaches the Hub. Returns whether the
// win condition is met (callers use this to pick "win" vs "hub").
function checkWinCondition() {
  return !!G.character && G.character.bonds >= 20;
}

// §17.2/§19.8 — the Corpo category reduced to one survivor ends the game in
// a loss instead. Checked at every point control would otherwise route to
// the Hub, alongside the win condition (win is checked first if somehow
// both are true in the same tick — vanishingly unlikely, but a runner would
// rather retire than watch MULTI-CORP take over on their way out the door).
function nextHubPhase() {
  if (checkWinCondition()) return "win";
  if (G.character && checkMultiCorpLoss(G.character)) return "loss";
  return "hub";
}

function persist() {
  if (G.character) save(G.character);
}

function render() {
  renderSheet();
  renderMain();
  renderFactions();
  renderDowntime();
}

// Journal, appended into #main below the phase card — newest line on top,
// old ones pushed down (todo2.md INTERFACE). No auto-scroll needed since the
// newest entry is always the first thing visible.
function renderJournal() {
  const journal = document.createElement("div");
  journal.id = "journal";
  if (G.character) {
    G.character.log.slice().reverse().forEach(line => {
      const p = document.createElement("div");
      p.className = "log-line";
      p.textContent = line;
      journal.appendChild(p);
    });
  }
  return journal;
}

// Right-hand panel: every faction in the game (todo2.md INTERFACE/Factions),
// grouped by type, with its current Wealth/R&D/Power standing.
// Grouped by each faction's current *dynamic* category (§19.6 — Wealth can
// jump a Nomad/Crime faction up into Crime/Corpo, so this is no longer
// always DATA.factions' static `type`), with its Tier and Wealth/R&D/Power,
// or a greyed-out DESTROYED marker (§19.7) instead.
function renderFactions() {
  els.factions.innerHTML = "";
  if (!G.character) return;
  const standings = G.character.factionStandings;
  const types = ["Corpo", "Crime", "Nomad", "Authority"];
  const html = types.map(type => {
    const rows = DATA.factions.filter(f => (standings[f.name] || {}).category === type).map(f => {
      const s = standings[f.name] || { wealth: 0, rnd: 0, power: 0, tier: 1, destroyed: false };
      if (s.destroyed) {
        return `<li class="faction-row destroyed"><span>${f.name}</span><span class="faction-stats">DESTROYED</span></li>`;
      }
      return `<li class="faction-row"><span>${f.name} <em>(T${s.tier})</em></span><span class="faction-stats">
        <em title="Wealth">¥${s.wealth}</em><em title="R&D">🔬${s.rnd}</em><em title="Power">⚔${s.power}</em>
      </span></li>`;
    }).join("");
    return `<div class="section"><h3>${type}</h3><ul>${rows}</ul></div>`;
  }).join("");
  els.factions.innerHTML = `<h2>Factions</h2>${html}`;
}

// ---------- DOWNTIME (§20.5) ----------
// Three always-visible panels — Shop, Training, EuroStoxx — that replace
// the old per-job Gear Up buy screen and the Hub's inline Training/Sell
// sections. Always rendered (todo3.md: "except during missions... closed,
// all grey font"), just greyed out and inert once G.phase leaves "hub".
function renderDowntime() {
  const el = els.downtime;
  if (!el) return;
  el.innerHTML = "";
  if (!G.character) return;
  const active = G.phase === "hub";
  const header = document.createElement("h2");
  header.textContent = "Downtime";
  el.appendChild(header);
  el.appendChild(renderShopBox(active));
  el.appendChild(renderTrainingBox(active));
  el.appendChild(renderStocksBox(active));
}

// "GEAR, GUNS AND GENERAL GOODNESS" — buy from the Reputation-Tier-scaled
// offer pool (genShopOffers, engine.js), sell owned gear, and buy/upgrade
// an Apartment (renderApartmentSection below).
function renderShopBox(active) {
  const c = G.character;
  const box = document.createElement("div");
  box.className = `downtime-box${active ? "" : " disabled"}`;
  box.innerHTML = `<h3>Gear, Guns &amp; General Goodness</h3>`;
  if (!active) {
    box.innerHTML += `<p class="muted">Closed for the duration of the job.</p>`;
    return box;
  }
  if (!c.shopOffers) c.shopOffers = genShopOffers(reputationTier(c));

  c.shopOffers.forEach(item => {
    const price = item.price;
    const row = document.createElement("div");
    row.className = "offer";
    const kind = item.attr ? item.attr : item.heal ? "heal" : `armor x${item.armor}`;
    const tagsHtml = item.tags ? ` <em>[${item.tags.join(", ")}]</em>` : "";
    row.innerHTML = `<span>${item.name} <em>(${item.tier}, ${kind})</em>${tagsHtml}</span><span>${price} BOND${price === 1 ? "" : "S"}</span>`;
    const btn = document.createElement("button");
    btn.textContent = item.bought ? "Bought" : "Buy";
    btn.disabled = c.bonds < price || item.bought;
    btn.addEventListener("click", () => {
      c.bonds -= price;
      c.gear.push({ name: item.name, attr: item.attr, heal: item.heal, armor: item.armor, tier: item.tier, tags: item.tags });
      item.bought = true;
      addLog(c, `You pick up a ${item.name} — yours to keep.`);
      persist(); render();
    });
    row.appendChild(btn);
    box.appendChild(row);
  });

  // Sell Gear (todo3.md Items) — 2 Street items = 1 BOND, 1 higher-tier item
  // = 1 BOND; a Fixer contact at relationship ≥3 adds +1 BOND per sale.
  if (c.gear.length) {
    const sellSection = document.createElement("div");
    sellSection.className = "section";
    const hasFixerDeal = c.contacts.some(p => p.profession === "Fixer" && p.relationship >= 3);
    const bankNote = c.pendingSaleItem ? `<p class="muted">Banked: ${c.pendingSaleItem} — sell one more Street item to cash in.</p>` : "";
    sellSection.innerHTML = `<h4>Sell Gear</h4><p class="muted">2 Street items = 1 BOND. 1 higher-tier item = 1 BOND.${hasFixerDeal ? " Your fixer kicks in +1 BOND per sale." : ""}</p>${bankNote}`;
    c.gear.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "offer";
      row.innerHTML = `<span>${item.name} <em>(${item.tier || "Street"})</em></span>`;
      const btn = document.createElement("button");
      btn.textContent = "Sell";
      btn.addEventListener("click", () => sellGearItem(idx));
      row.appendChild(btn);
      sellSection.appendChild(row);
    });
    box.appendChild(sellSection);
  }

  box.appendChild(renderApartmentSection(c));
  return box;
}

// Apartments (§20.5) — Tier-gated (Reputation Tier, §19.1): nothing at
// Tier 1, then a bigger place with more Security slots at each Tier up.
// Price is 2×Tier BONDS, +1 if the chosen Location's faction is
// Corpo-category. Buying again at a higher Tier than the one you own
// replaces it (an upgrade); Security options install free, capped at the
// apartment's slot count — their defensive payoff belongs to the
// Archenemy home-invasion/EurCop raid mechanics (§20, later phases).
function renderApartmentSection(c) {
  const wrap = document.createElement("div");
  wrap.className = "section";
  wrap.innerHTML = "<h4>Apartments</h4>";
  const repTier = reputationTier(c);

  if (c.apartment) {
    const def = DATA.apartments[c.apartment.tier];
    const secList = c.apartment.security.length ? c.apartment.security.join(", ") : "none installed";
    wrap.innerHTML += `<p class="muted">${def.name} at ${c.apartment.location} (Tier ${c.apartment.tier}). Security: ${secList}.</p>`;
    const options = (DATA.securityOptions[c.apartment.tier] || []).filter(o => !c.apartment.security.includes(o));
    if (c.apartment.security.length < def.securitySlots) {
      options.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = `Install ${opt}`;
        btn.addEventListener("click", () => {
          c.apartment.security.push(opt);
          addLog(c, `${opt} goes in at your place.`);
          persist(); render();
        });
        wrap.appendChild(btn);
      });
    }
    if (repTier <= c.apartment.tier) return wrap; // nothing better available yet
  }

  if (repTier < 2) {
    wrap.innerHTML += `<p class="muted">${DATA.apartmentTier1Flavor}</p>`;
    return wrap;
  }

  const def = DATA.apartments[repTier];
  const known = Object.keys(c.locations);
  if (!known.length) {
    wrap.innerHTML += `<p class="muted">You need to know a location before you can put down roots there.</p>`;
    return wrap;
  }

  const priceFor = locName => {
    const loc = c.locations[locName];
    const category = loc.faction ? (c.factionStandings[loc.faction] || {}).category : (loc.area === "Corpo" ? "Corpo" : null);
    return repTier * 2 + (category === "Corpo" ? 1 : 0);
  };
  const label = document.createElement("p");
  label.className = "muted";
  label.textContent = `${c.apartment ? "Upgrade to" : "Buy"} a ${def.name} (Tier ${repTier}): ${def.flavor}`;
  wrap.appendChild(label);

  const select = document.createElement("select");
  known.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    const price = priceFor(name);
    opt.textContent = `${name} — ${price} BOND${price === 1 ? "" : "S"}`;
    select.appendChild(opt);
  });
  wrap.appendChild(select);

  const btn = document.createElement("button");
  const refresh = () => {
    const price = priceFor(select.value);
    btn.textContent = `${c.apartment ? "Upgrade" : "Buy"} — ${price} BOND${price === 1 ? "" : "S"}`;
    btn.disabled = c.bonds < price;
  };
  select.addEventListener("change", refresh);
  refresh();
  btn.addEventListener("click", () => {
    const price = priceFor(select.value);
    const hadApartment = !!c.apartment;
    c.bonds -= price;
    c.apartment = { location: select.value, tier: repTier, security: [] };
    addLog(c, `You ${hadApartment ? "move up to" : "put down roots at"} ${select.value} — ${def.name}.`);
    persist(); render();
  });
  wrap.appendChild(btn);
  return wrap;
}

// "LESSONS FROM THE STREET" — unchanged Training mechanic, relocated out
// of the Hub's inline section.
function renderTrainingBox(active) {
  const c = G.character;
  const box = document.createElement("div");
  box.className = `downtime-box${active ? "" : " disabled"}`;
  box.innerHTML = `<h3>Lessons From the Street</h3>`;
  if (!active) {
    box.innerHTML += `<p class="muted">Closed for the duration of the job.</p>`;
    return box;
  }
  Object.entries(c.attrs).forEach(([attr, rank]) => {
    const cost = rank; // rank 1→2 costs 1 BOND, 2→3 costs 2, … (todo3.md BOND scale)
    const btn = document.createElement("button");
    btn.textContent = `Train ${attr} (${rank} → ${Math.min(5, rank + 1)}) — ${cost} BOND${cost === 1 ? "" : "S"} + 1 BOOST`;
    btn.disabled = rank >= 5 || c.bonds < cost || c.boost < 1;
    btn.addEventListener("click", () => {
      c.bonds -= cost;
      c.boost -= 1;
      c.attrs[attr] = Math.min(5, c.attrs[attr] + 1);
      addLog(c, `You spend BOOST training ${attr} to ${c.attrs[attr]}.`);
      persist(); render();
    });
    box.appendChild(btn);
  });
  return box;
}

// "EUROSTOXX" (§20.5) — park BONDS in any current Corpo faction's stock;
// it moves with their Wealth via settleStockGains() (state.js, hooked into
// adjustFactionParam). Sell converts the whole held amount back 1:1, any time.
function renderStocksBox(active) {
  const c = G.character;
  const box = document.createElement("div");
  box.className = `downtime-box${active ? "" : " disabled"}`;
  box.innerHTML = `<h3>EuroStoxx</h3>`;
  if (!active) {
    box.innerHTML += `<p class="muted">Closed for the duration of the job.</p>`;
    return box;
  }
  box.innerHTML += `<p class="muted">Park BONDS in a Corpo faction's stock — it moves with their Wealth.</p>`;

  DATA.factions.filter(f => {
    const s = c.factionStandings[f.name];
    return s && !s.destroyed && s.category === "Corpo";
  }).forEach(f => {
    const held = c.stocks[f.name] || 0;
    const row = document.createElement("div");
    row.className = "offer";
    row.innerHTML = `<span>${f.name} <em>(held: ${held})</em></span>`;
    const investBtn = document.createElement("button");
    investBtn.textContent = "Invest 1 BOND";
    investBtn.disabled = c.bonds < 1;
    investBtn.addEventListener("click", () => {
      c.bonds -= 1;
      c.stocks[f.name] = (c.stocks[f.name] || 0) + 1;
      addLog(c, `You park a BOND in ${f.name} stock.`);
      persist(); render();
    });
    row.appendChild(investBtn);
    if (held > 0) {
      const sellBtn = document.createElement("button");
      sellBtn.textContent = `Sell All (${held})`;
      sellBtn.addEventListener("click", () => {
        c.bonds += held;
        delete c.stocks[f.name];
        addLog(c, `You cash out your ${f.name} stock for ${held} BOND${held === 1 ? "" : "S"}.`);
        persist(); render();
      });
      row.appendChild(sellBtn);
    }
    box.appendChild(row);
  });
  return box;
}

function renderSheet() {
  const c = G.character;
  if (!c) { els.sheet.innerHTML = ""; return; }
  const attrRows = Object.entries(c.attrs).map(([k, v]) => `<div class="stat"><span>${k}</span><span>${v}</span></div>`).join("");
  const healthRow = c.health.map(h => `<span class="hbox ${h ? "hurt" : ""}"></span>`).join("");
  const gearList = c.gear.length ? c.gear.map(g => `<li>${g.name} <em>(${g.tier || "Street"}${g.attr ? ` ${g.attr}` : g.heal ? " heal" : g.armor ? ` armor x${g.armor}` : ""})</em></li>`).join("") : "<li><em>none</em></li>";
  // "People" is the full recurring-cast pool, not just friendly contacts —
  // Adversaries and Targets you've crossed paths with end up here too, with
  // a negative relationship. See getPerson()/nudgeRelationship() in state.js.
  // A contact tagged Archenemy gets a Hunt button (only from the Hub — a
  // Hunt shouldn't interrupt whatever job phase is in progress); a
  // BLOODBROTHER shows as "Amigue" (§20.6 display rename — the internal
  // field/function names are unchanged). Both tags are mutually exclusive
  // (tagArchenemy/tagBloodbrother in state.js). Anyone at relationship 3-4
  // (Ally-eligible but not yet free) gets a "Compi" badge — cosmetic only.
  const contactList = c.contacts.map(ct => {
    let tag = "";
    if (ct.archenemy) {
      const huntBtn = G.phase === "hub" ? `<button class="btn-small hunt-btn" data-hunt-id="${ct.id}">Hunt</button>` : "";
      tag = ` <span class="archenemy-badge">⚠ Archenemy</span>${huntBtn}`;
    } else if (ct.bloodbrother) {
      tag = ` <span class="bloodbrother-badge">🩸 Amigue</span>`;
    } else if (ct.relationship >= 3) {
      tag = ` <span class="compi-badge">Compi</span>`;
    }
    return `<li>${ct.name} — ${ct.faction} (${ct.relationship >= 0 ? "+" : ""}${ct.relationship})${tag}</li>`;
  }).join("");
  const graveyardSection = c.graveyard && c.graveyard.length
    ? `<div class="section"><h3>Graveyard</h3><ul>${c.graveyard.map(p => `<li>${p.name} — ${p.faction}</li>`).join("")}</ul></div>`
    : "";
  // The permanent 12-location map (gamedesc.md §6) — fills in as you visit.
  const locationsList = Object.entries(c.locations).map(([name, loc]) => `<li>${name} ${heatBarHtml(loc.heat)}</li>`).join("");
  const injuryBadge = c.permanentInjury ? `<div class="injury-badge">⚠ Permanent Injury — needs repair</div>` : "";
  // Rest clock (todo3.md) — 4 Rest uses builds toward an Archenemy Hunt.
  const restClock = c.restCount > 0
    ? `<div class="section"><h3>Someone's Asking Around</h3><span class="heatbar">${Array.from({ length: 4 }, (_, i) => `<span class="heatseg${i < c.restCount ? " filled" : ""}"></span>`).join("")}</span></div>`
    : "";

  els.sheet.innerHTML = `
    <div class="sheet-header"><h2>${c.name}</h2><button id="retire-btn" class="danger btn-small">Retire</button></div>
    <div class="tag">${c.profession} / ${c.turf}</div>
    <div class="section"><h3>Health</h3><div class="hboxes">${healthRow}</div>${injuryBadge}</div>
    <div class="section"><h3>Bonds</h3><div class="cred">${c.bonds} BOND${c.bonds === 1 ? "" : "S"}</div></div>
    <div class="section"><h3>Attributes</h3>${attrRows}</div>
    <div class="section"><h3>Boost</h3><div class="cred">⚡${c.boost}</div></div>
    <div class="section"><h3>Reputation</h3><div class="cred">${c.reputation} <span class="tag" style="margin:0;display:inline">${reputationTitle(c)} (T${reputationTier(c)})</span></div></div>
    <div class="section"><h3>Gear</h3><ul>${gearList}</ul></div>
    <div class="section"><h3>People</h3><ul>${contactList}</ul></div>
    ${graveyardSection}
    <div class="section"><h3>Locations</h3><ul>${locationsList || "<li><em>none visited yet</em></li>"}</ul></div>
    ${restClock}
  `;
  els.sheet.querySelector("#retire-btn").addEventListener("click", () => {
    if (confirm("Retire this runner and start a new save? This cannot be undone.")) {
      clearSave();
      G.character = null;
      G.phase = "create";
      render();
    }
  });
  els.sheet.querySelectorAll(".hunt-btn").forEach(btn => {
    btn.addEventListener("click", () => startHuntManual(Number(btn.dataset.huntId)));
  });
}

function renderMain() {
  els.main.innerHTML = "";
  const fn = {
    create: renderCreate,
    hub: renderHub,
    briefing: renderBriefing,
    gearup: renderGearUp,
    encounter: renderEncounter,
    checkpoint: renderCheckpoint,
    steps: renderSteps,
    debrief: renderDebrief,
    hunt: renderHunt,
    win: renderWin,
    loss: renderLoss
  }[G.phase];
  if (fn) fn();
  els.main.appendChild(renderJournal());
}

// ---------- CREATE ----------
function renderCreate() {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>New Runner</h2>
    <label>Name<input id="c-name" type="text" placeholder="Street handle" /></label>
    <label>Profession
      <select id="c-prof">
        ${Object.entries(PROFESSIONS).map(([k, v]) => `<option value="${k}">${k} — ${v.desc}</option>`).join("")}
      </select>
    </label>
    <label>Background / Turf
      <select id="c-turf">
        ${Object.entries(TURFS).map(([k, v]) => `<option value="${k}">${k} — ${v.desc}</option>`).join("")}
      </select>
    </label>
    <button id="c-submit">Hit the Street</button>
  `;
  els.main.appendChild(wrap);
  wrap.querySelector("#c-submit").addEventListener("click", () => {
    const name = wrap.querySelector("#c-name").value.trim() || genName();
    const profession = wrap.querySelector("#c-prof").value;
    const turf = wrap.querySelector("#c-turf").value;
    G.character = defaultCharacter(name, profession, turf);
    persist();
    G.phase = "hub";
    render();
  });
}

// ---------- HUB ----------
function renderHub() {
  const c = G.character;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Downtime</h2><p class="muted">Between jobs. Gear up, patch up, or find work.</p>`;

  const jobBtn = document.createElement("button");
  jobBtn.textContent = "Find a Job";
  jobBtn.addEventListener("click", () => startJobSearch());
  wrap.appendChild(jobBtn);

  const medBtn = document.createElement("button");
  const openWounds = c.health.filter(h => h).length;
  medBtn.textContent = `Medical (1 BOND / box) — ${openWounds} wound(s)`;
  // Band-aids don't touch a Permanent Injury — that needs a real repair below.
  medBtn.disabled = openWounds === 0 || c.bonds < 1 || c.permanentInjury;
  medBtn.addEventListener("click", () => {
    c.bonds -= 1;
    healBox(c);
    addLog(c, "You get patched up at a ripperdoc's clinic.");
    persist(); render();
  });
  wrap.appendChild(medBtn);

  if (c.permanentInjury) {
    const repairSection = document.createElement("div");
    repairSection.className = "section";
    repairSection.innerHTML = "<h3>Permanent Injury</h3><p class=\"muted\">Every roll takes -1 until this is fixed.</p>";
    DATA.repairs.forEach(r => {
      const btn = document.createElement("button");
      btn.textContent = `${r.name} — ${r.price} BOND${r.price === 1 ? "" : "S"}`;
      btn.title = r.flavor;
      btn.disabled = c.bonds < r.price;
      btn.addEventListener("click", () => {
        c.bonds -= r.price;
        c.health = [false, false, false];
        c.permanentInjury = false;
        if (r.sideEffect) {
          const attr = pick(Object.keys(c.attrs));
          c.attrs[attr] = Math.max(1, c.attrs[attr] - 1);
          addLog(c, `${r.name} patches you up, but the ${attr} side never sits quite right again (${attr} -1).`);
        } else {
          addLog(c, `${r.name} grows you back clean. No compromises.`);
        }
        persist(); render();
      });
      repairSection.appendChild(btn);
    });
    wrap.appendChild(repairSection);
  }

  // §20.5 — a free heal-a-box roll if you own an Apartment, independent of
  // the Rest clock/Mission Board reroll (this doesn't tick restCount or
  // reroll the job search — it's just "how you spend a bit of downtime").
  // §20.6 — unless the Archenemy left a trap under the bed: 2 Harm boxes
  // instead, one time, then it's cleared.
  if (c.apartment) {
    const homeBtn = document.createElement("button");
    homeBtn.textContent = "Rest at your Apartment (Free)";
    homeBtn.addEventListener("click", () => {
      if (c.apartment.trapped) {
        c.apartment.trapped = false;
        applyHarm(c);
        const wentDown = applyHarm(c);
        if (wentDown && !c.permanentInjury) resolveDownEvent(c);
        addLog(c, "The place goes up the second you're inside — you'd left something behind, alright, and it wasn't yours.");
      } else if (Math.random() < 0.5 && c.health.some(h => h)) {
        healBox(c);
        addLog(c, "You crash at home for a while — it helps.");
      } else {
        addLog(c, "You crash at home for a while. Quiet, at least.");
      }
      persist(); render();
    });
    wrap.appendChild(homeBtn);
  }

  els.main.appendChild(wrap);
}

function sellGearItem(idx) {
  const c = G.character;
  const item = c.gear[idx];
  if (!item) return;
  const bonusPerSale = c.contacts.some(p => p.profession === "Fixer" && p.relationship >= 3) ? 1 : 0;
  c.gear.splice(idx, 1);
  if (item.tier === "Professional" || item.tier === "Military" || item.tier === "Legendary") {
    const gain = 1 + bonusPerSale;
    c.bonds += gain;
    addLog(c, `You sell the ${item.name} for ${gain} BOND${gain === 1 ? "" : "S"}.`);
  } else if (c.pendingSaleItem) {
    const gain = 1 + bonusPerSale;
    c.bonds += gain;
    addLog(c, `You sell the ${item.name} alongside the ${c.pendingSaleItem} for ${gain} BOND${gain === 1 ? "" : "S"}.`);
    c.pendingSaleItem = null;
  } else {
    c.pendingSaleItem = item.name;
    addLog(c, `You bank the ${item.name} — sell one more Street item to cash it in.`);
  }
  if (checkWinCondition()) G.phase = "win";
  persist();
  render();
}

// ---------- BRIEFING / MISSION BOARD (§19.3) ----------
// alreadyRerolled carries forward across a Rest (was per-job "rerolled";
// now board-level since a single Rest rerolls the whole two-job Board) — a
// fresh "Find a Job" from the Hub always starts at false, a Rest always
// passes true so Coffin Hotel is blocked on the very next search.
function startJobSearch(alreadyRerolled) {
  const c = G.character;
  const candidates = genMissionBoard(c); // §19.3 — [{employer, mission, location, excludeIds}, ...]
  G.board = candidates.map(buildJobFromCandidate);
  G.boardRerolled = !!alreadyRerolled;
  G.job = null;
  G.restFlow = null;
  addLog(c, `Two jobs come across the wire tonight.`);
  G.phase = "briefing";
  persist();
  render();
}

// Wraps a genMissionBoard() candidate into the full per-job shape the rest
// of the Job phase flow (GearUp/Steps/Debrief) expects — same shape the old
// single-job startJob() built directly into G.job.
function buildJobFromCandidate(candidate) {
  const { employer, mission, location, excludeIds } = candidate;
  return {
    employer,
    mission,
    excludeIds,
    location,
    steps: buildStepSequence(mission),
    stepIndex: 0,
    stepResults: [],
    // §20.1 — up to 3 concurrent Helpers (was a single Hireling-or-Ally
    // slot): {person, source:"ally"|"hire", tier:3|5|null, attr, used, benched}.
    // "ally" = relationship-recruited (rel≥3 fee / rel≥5 free, one-time +2);
    // "hire" = a paid stranger (1 BOND, passive +1 to their assigned attr).
    helpers: [],
    pendingResult: null,
    lastResult: null,
    encounter: { pre: { done: false }, post: { done: false }, stage: null },
    // §20.7 — the mandatory Heat checkpoint gate, entry and exit. `stage`
    // is "roll" (Social/Stealth), "choice" (bribe-or-ditch, a Partial), or
    // "combat" (Fight/Run, a Fail or a forced Stealth-fail escalation).
    // `activeStage` records which of pre/post is in progress so the
    // resolution handler knows where to route once it's done.
    checkpoint: { pre: { done: false }, post: { done: false }, stage: null, agency: null, activeStage: null },
    outcome: null,
    sideObjective: null // "more BONDS" side job (todo3.md ADD) — see takeSideJob
  };
}

function renderBriefing() {
  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `<h2>Mission Board</h2><p class="muted">Two jobs on the wire tonight. Take one, or lay low till morning.</p>`;
  els.main.appendChild(header);

  G.board.forEach((job, idx) => renderBriefingCard(job, idx));

  const restWrap = document.createElement("div");
  restWrap.className = "card";
  els.main.appendChild(restWrap);
  // Mid-roll on a Rest sub-flow (Night on the Street / Spend the Night / the
  // street fight that can follow it) — show the Challenge UI in place of the
  // Rest picker until it resolves (Accept/side-job buttons on both cards
  // above are also suppressed for the same reason — see renderBriefingCard).
  if (G.restFlow) renderRestSubflow(restWrap);
  else renderRestOptions(restWrap);
}

function renderBriefingCard(job, idx) {
  const { employer, mission, location } = job;
  const wrap = document.createElement("div");
  wrap.className = "card";
  const adversaryList = mission.adversaries.map(a => `<li>${a.name} — ${a.profession} (${a.tier})</li>`).join("");
  const fieldRows = missionFieldRows(mission);
  const payout = estimatePayout(job);
  const sideRow = job.sideObjective
    ? `<p><strong>Side job:</strong> ${job.sideObjective.type} — ${job.sideObjective.target.name} (+2 BONDS if it goes clean)</p>`
    : "";
  // Special Missions (§19.5): unrestricted faction pairing, an extra -1 on
  // every roll, +2 BONDS, amplified relationship/standing swings, and real
  // risk to an Amigue riding along as a Helper.
  const specialBadge = mission.special
    ? `<p class="special-badge">⚠ SPECIAL MISSION — extra -1 to every roll, +2 BONDS, bigger relationship swings. An Amigue riding along can be wounded or killed.</p>`
    : "";
  wrap.innerHTML = `
    <h3>${mission.special ? mission.specialName : `Job ${idx + 1}`}</h3>
    ${specialBadge}
    <p><strong>Employer:</strong> ${employer.name} — ${employer.faction} ${employer.profession}</p>
    <p class="step-desc"><strong>Job:</strong> ${mission.type} — ${mission.flavor}<br><strong>Payout:</strong> ${payout} BOND${payout === 1 ? "" : "S"}</p>
    ${fieldRows}
    ${sideRow}
    <p><strong>Location:</strong> ${location.name} (${location.area}${location.faction ? `, ${location.faction} turf` : ""}) — Heat ${location.heat} ${heatBarHtml(location.heat)}</p>
    <p><strong>Opposition:</strong></p><ul>${adversaryList}</ul>
  `;
  els.main.appendChild(wrap);

  if (G.restFlow) return; // mid Rest roll — don't offer Accept/side-job until it resolves

  const acceptBtn = document.createElement("button");
  acceptBtn.textContent = "Accept the Job";
  acceptBtn.addEventListener("click", () => {
    G.job = job;
    G.board = null;
    G.phase = "gearup";
    persist(); render();
  });
  wrap.appendChild(acceptBtn);

  if (!job.sideObjective) {
    const sideBtn = document.createElement("button");
    sideBtn.textContent = "Take on a side job (+2 BONDS)";
    sideBtn.addEventListener("click", () => takeSideJob(job));
    wrap.appendChild(sideBtn);
  }
}

// Rest replaces the old Pass reroll (todo3.md) — Coffin Hotel keeps the
// once-per-search gate Pass used (now gated on the whole Board, G.boardRerolled);
// Night on the Street (and Spend the Night, with a BLOODBROTHER) are always
// available (todo3.md ADD). Shared by both jobs on the Board — resting
// rerolls the whole Board, not just one candidate.
function renderRestOptions(wrap) {
  wrap.innerHTML = `<h3>Lay Low Instead</h3>`;

  const restBtn = document.createElement("button");
  restBtn.textContent = "Rest in Comfy Coffin Hotel (1 BOND)";
  restBtn.disabled = G.boardRerolled || G.character.bonds < 1;
  restBtn.addEventListener("click", () => restCoffinHotel());
  wrap.appendChild(restBtn);

  const nightBtn = document.createElement("button");
  nightBtn.textContent = "Night on the Street (Free)";
  nightBtn.addEventListener("click", () => { G.restFlow = { stage: "night", pendingResult: null, lastResult: null }; persist(); render(); });
  wrap.appendChild(nightBtn);

  const bb = findBloodbrother(G.character);
  if (bb) {
    const brotherBtn = document.createElement("button");
    brotherBtn.textContent = `Spend the Night with ${bb.name} (Free)`;
    brotherBtn.addEventListener("click", () => { G.restFlow = { stage: "brothernight", pendingResult: null, lastResult: null }; persist(); render(); });
    wrap.appendChild(brotherBtn);
  }

  const restNote = document.createElement("p");
  restNote.className = "muted";
  restNote.textContent = "Resting finds you two different jobs — the Coffin Hotel might also patch you up.";
  wrap.appendChild(restNote);
}

// Dispatches the three Rest sub-flows against G.restFlow (a standalone
// scratch object, not a job — there's no accepted job yet at Briefing, and
// with two candidates on the Board there's no single one to hang this off).
// renderChallenge's ctx param points it at G.restFlow instead of G.job.
function renderRestSubflow(container) {
  const stage = G.restFlow.stage;
  const ctx = { job: null, holder: G.restFlow };
  if (stage === "night") {
    const w = document.createElement("div");
    w.innerHTML = `<h4>Where do you lay low tonight?</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Combat", alt: "Social", desc: "Where do you lay low tonight?" }, finishNightOnStreet, ctx);
  } else if (stage === "brothernight") {
    const bb = findBloodbrother(G.character);
    const w = document.createElement("div");
    w.innerHTML = `<h4>A night with ${bb ? bb.name : "your Amigue"}.</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Social", desc: "Spend the night." }, finishBrotherNight, ctx);
  } else if (stage === "brotherfight") {
    const w = document.createElement("div");
    w.innerHTML = `<h4>It goes sideways — a street fight breaks out.</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Combat", desc: "Fight your way clear." }, finishBrotherFight, ctx);
  }
}

// "More BONDS" side objective (todo3.md ADD) — folds a second Heist or
// Assassination target into the job for +2 BONDS. Drops the shared first
// "approach" step ("remove overlapping challenges like stealth to same
// premises") and appends the type's other two steps instead. Operates on
// one specific Board candidate (job), not necessarily G.job — it isn't
// accepted yet.
function takeSideJob(job) {
  const c = G.character;
  const type = pick(["Heist", "Assassination"]);
  const targetRole = type === "Assassination" ? "hostile" : "ally";
  const target = getPerson(c, targetRole, job.excludeIds);
  const extraSteps = MISSION_SEQUENCES[type].slice(1).map(s => ({
    ...s,
    desc: `[Side job — ${target.name}] ${s.desc}`,
    sideObjective: true
  }));
  job.steps.push(...extraSteps);
  job.sideObjective = { type, target, results: [] };
  addLog(c, `You take on a side job while you're at it: ${type === "Assassination" ? "put down" : "lift something from"} ${target.name}.`);
  persist();
  render();
}

// ---------- REST (Coffin Hotel / Night on the Street — todo3.md) ----------
// The paid option: a flat BOND cost and a quick, un-rolled-on-screen 2d6 vs
// the same 10+/7-9/6- thresholds every Challenge uses, modified by Combat
// rank and any owned "health gear or body modification" (bestHealBonus).
function restCoffinHotel() {
  const c = G.character;
  c.bonds -= 1;
  const { sum } = roll2d6();
  const total = sum + c.attrs.Combat + bestHealBonus(c);
  const openWounds = c.health.filter(h => h).length;
  if (total >= 10) {
    if (openWounds > 0) { healBox(c); addLog(c, `You crash hard in a coffin pod and wake up steadier (rolled ${total}).`); }
    else addLog(c, `You crash hard in a coffin pod — nothing to shake off, just a clean night's sleep (rolled ${total}).`);
  } else if (total >= 7) {
    if (openWounds === 1) { healBox(c); addLog(c, `A rough night, but you shake off the one thing bothering you (rolled ${total}).`); }
    else addLog(c, `A rough night in the pod — you're still carrying what you came in with (rolled ${total}).`);
  } else {
    addLog(c, `You barely sleep in the pod, jumpy all night (rolled ${total}).`);
  }
  processRestTick();
}

// The free option reuses renderChallenge()'s Combat/Social pick + roll UI
// as-is (see renderBriefing above) instead of a bespoke roll, since the
// shape — pick an attr, roll 2d6+attr+mods — is identical to any Challenge.
function finishNightOnStreet() {
  const c = G.character;
  const res = G.restFlow.lastResult;
  const flavor = res.usedAttr === "Combat" ? "a tough street night" : "talking your way into a shelter";
  if (res.tier === "full") {
    healBox(c);
    addLog(c, `You get through ${flavor} — and actually catch some real rest.`);
  } else if (res.tier === "fail") {
    const wentDown = applyHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
    addLog(c, `It's ${flavor}, and it costs you — you catch a hit out there.`);
  } else {
    addLog(c, `It's ${flavor}. You get by, nothing more.`);
  }
  G.restFlow = null;
  processRestTick();
}

// BLOODBROTHER "Spend the Night" (todo3.md Persons) — its own three-tier
// Social table, distinct from Night on the Street's.
function finishBrotherNight() {
  const c = G.character;
  const res = G.restFlow.lastResult;
  const bb = findBloodbrother(c);
  if (res.tier === "full") {
    if (bb) nudgeRelationship(c, bb.id, 1);
    grantBloodbrotherGift(c);
    G.restFlow = null;
    processRestTick();
  } else if (res.tier === "partial") {
    healBox(c);
    if (c.boost > 0) { c.boost -= 1; addLog(c, "Hungover — that BOOST is gone, but at least you're patched up."); }
    else addLog(c, "Hungover, but at least you're patched up.");
    G.restFlow = null;
    processRestTick();
  } else {
    addLog(c, `It goes sideways fast — you and ${bb ? bb.name : "your Amigue"} end up in a street fight.`);
    G.restFlow = { stage: "brotherfight", pendingResult: null, lastResult: null };
    persist();
    render();
  }
}

// The 6- branch's nested Combat roll against the BLOODBROTHER's faction.
function finishBrotherFight() {
  const c = G.character;
  const res = G.restFlow.lastResult;
  const bb = findBloodbrother(c);
  if (res.tier === "full") {
    c.boost = Math.min(10, c.boost + 1);
    addLog(c, "You put them down hard. Adrenaline still running (+1 BOOST).");
  } else if (res.tier === "partial") {
    // No per-player faction-standing scalar exists yet — the closest analog
    // is nudging the Bloodbrother's own relationship, since they're the one
    // who has to answer for it.
    if (bb) nudgeRelationship(c, bb.id, -1);
    addLog(c, `Messy, but you walk away. ${bb ? bb.faction : "Their crew"} won't forget it though.`);
  } else {
    const wentDown = applyHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
    addLog(c, "You catch a bad one in the scuffle.");
  }
  G.restFlow = null;
  processRestTick();
}

// A random gift for a 10+ "Spend the Night" — a Street-tier item in an
// attr category the player doesn't own yet, or (if every category is
// already covered) a heal or a point of BOOST.
function grantBloodbrotherGift(c) {
  const owned = new Set(c.gear.map(g => g.attr).filter(Boolean));
  const missingAttrs = ["Combat", "Driving", "Hacking", "Social", "Stealth"].filter(a => !owned.has(a));
  if (missingAttrs.length) {
    const attr = pick(missingAttrs);
    const item = DATA.gear.Street.find(g => g.attr === attr);
    if (item) {
      c.gear.push({ name: item.name, attr: item.attr, tier: "Street" });
      addLog(c, `They slip you a ${item.name} on your way out.`);
      return;
    }
  }
  if (c.health.some(h => h)) {
    healBox(c);
    addLog(c, "They patch you up before you go.");
  } else {
    c.boost = Math.min(10, c.boost + 1);
    addLog(c, "You leave with your head clear (+1 BOOST).");
  }
}

// Shared by both Rest flavors: ticks the clock toward an Archenemy Hunt
// (todo3.md), locking in the Archenemy on the first use, then either
// rerolls the job search (as Pass used to) or, at 4 uses, launches the Hunt.
// Also runs the §19.7 faction Power struggles once per tick, and checks the
// §19.8 MULTI-CORP loss condition immediately after — a faction destroyed
// mid-Rest can end the game before the next Board or Hunt ever shows.
function processRestTick() {
  const c = G.character;
  c.restCount++;
  if (c.restCount === 1) lockInArchenemy(c);
  c.shopOffers = genShopOffers(reputationTier(c)); // §20.5 — new stock on the shelves each tick
  runFactionPowerStruggles(c);
  if (checkMultiCorpLoss(c)) {
    G.job = null;
    G.board = null;
    G.phase = "loss";
    persist();
    render();
    return;
  }
  if (c.restCount >= 4) {
    c.restCount = 0;
    G.job = null;
    G.board = null;
    persist();
    startHunt();
    return;
  }
  startJobSearch(true);
}

function lockInArchenemy(c) {
  if (!c.contacts.length) return;
  const worst = c.contacts.reduce((min, p) => p.relationship < min.relationship ? p : min, c.contacts[0]);
  c.archenemyId = worst.id; // who the Rest clock is counting down to — see tagArchenemy() for the general tag
  tagArchenemy(c, worst);
  addLog(c, `Word's out that ${worst.name} has a real problem with you. Someone's asking around about where you sleep.`);
}

function findBloodbrother(c) {
  return c.contacts.find(p => p.bloodbrother);
}

// §20.6 — one tick short of the forced Hunt (restCount === 3), the locked-in
// Archenemy has a 50% chance of striking first: either a friend (any
// Amigue/Compi, relationship ≥3) or the player's Apartment, whichever is
// available (a coin flip between the two if both are). No-ops if neither a
// friend nor an apartment exists, or the Archenemy is somehow already gone.
function resolveArchenemyClockEvent(c) {
  if (c.restCount !== 3) return;
  if (Math.random() >= 0.5) return;
  const archenemy = c.contacts.find(p => p.id === c.archenemyId);
  if (!archenemy) return;

  const friends = c.contacts.filter(p => p.relationship >= 3 && p.id !== archenemy.id);
  const hasApartment = !!c.apartment;
  if (!friends.length && !hasApartment) return;

  const hitApartment = hasApartment && (!friends.length || Math.random() < 0.5);
  if (hitApartment) {
    resolveApartmentInvasion(c, archenemy);
  } else {
    const target = pick(friends);
    addLog(c, `While you're out on the job, ${archenemy.name} ${pick(DATA.archenemyInvasion.friendHit)} ${target.name}.`);
    woundPerson(c, target);
  }
}

// §20.6 — the Archenemy's own break-in roll: 2d6 + (their factionTier -
// installed Security features) vs. 10+/7-9/6-. No player attribute is
// involved — this is entirely the Archenemy's side of the roll.
function resolveApartmentInvasion(c, archenemy) {
  const features = c.apartment.security.length;
  const { sum } = roll2d6();
  const roll = sum + ((archenemy.factionTier || 1) - features);

  if (roll >= 10) {
    const evil = randInt(1, 6);
    if (evil <= 3) {
      if (c.gear.length) {
        const item = pick(c.gear);
        c.gear = c.gear.filter(g => g !== item);
        addLog(c, `${pick(DATA.archenemyInvasion.steal)} (lost: ${item.name})`);
      } else {
        addLog(c, `${archenemy.name}'s people break in but find nothing worth taking.`);
      }
    } else if (evil <= 5) {
      addLog(c, pick(DATA.archenemyInvasion.torch));
      c.apartment = null;
    } else {
      c.apartment.trapped = true; // §20.6 — 2 Harm boxes next time you Rest at home
      addLog(c, pick(DATA.archenemyInvasion.trap));
    }
  } else if (roll >= 7) {
    addLog(c, pick(DATA.archenemyInvasion.spooked));
  } else {
    archenemy.factionTier = Math.max(1, (archenemy.factionTier || 1) - 1);
    addLog(c, `${archenemy.name} ${pick(DATA.archenemyInvasion.burned)}`);
  }
}

// §20.7 — reuses the checkpoint's own dice-and-consequence shape (todo3.md:
// "This will be as checkpoint, but the description has to be changed") as
// a single auto-resolved roll (the player's own Social, since they're the
// one answering the door) rather than routing back through the interactive
// Checkpoint UI — the job that triggered it is already over by Debrief.
function resolveApartmentRaid(c, job) {
  if (!c.apartment) return;
  const category = locationCategory(job.location, c.factionStandings);
  const heat = job.location.heat;
  if (!((category === "Corpo" && heat >= 4) || (category === "Crime" && heat >= 5))) return;
  if (Math.random() >= 0.2) return;

  const agency = checkpointAgency(job.location, c.factionStandings) || "EurCop";
  const gearBonus = bestGearBonus(c, "Social");
  const { sum } = roll2d6();
  const total = sum + c.attrs.Social + (gearBonus ? gearBonus.bonus : 0);

  if (total >= 10) {
    addLog(c, `${agency} comes knocking, but you talk them off your doorstep clean.`);
  } else if (total >= 7) {
    const cost = (heat >= 5 || category === "Corpo") ? 2 : 1;
    if (c.bonds >= cost) {
      c.bonds -= cost;
      addLog(c, `${agency} at your door — you grease them and they move on (-${cost} BOND${cost === 1 ? "" : "S"}).`);
    } else if (c.gear.length) {
      const item = pick(c.gear);
      c.gear = c.gear.filter(g => g !== item);
      addLog(c, `${agency} at your door — you hand over the ${item.name} to make them go away.`);
    } else {
      addLog(c, `${agency} at your door — you talk fast and they move on, this time.`);
    }
  } else {
    addLog(c, `${agency} pushes their way in.`);
    applyCheckpointDamage(c, job, "harm");
    applyCheckpointDamage(c, job, pick(["vehicle", "gear"]));
  }
}

function missionFieldRows(mission) {
  // Heist/Transport/Hold/Delay carry an asset flavor line — what's actually
  // being stolen/moved/held decides which faction parameter the job affects
  // (todo2.md). See genMission() in engine.js.
  const assetRow = mission.assetFlavor ? `<p><strong>Word is:</strong> ${mission.assetFlavor}</p>` : "";
  switch (mission.type) {
    case "Assassination":
      return `<p><strong>Target:</strong> ${mission.target.name} (${mission.target.profession}, ${mission.target.faction})</p>`;
    case "Heist":
      return `<p><strong>Target:</strong> ${mission.target.name} (${mission.target.profession}, ${mission.target.faction})</p>${assetRow}`;
    case "Transport":
      return `<p><strong>Cargo:</strong> ${mission.target.name}</p><p><strong>Route:</strong> ${mission.fromLocation.name} → ${mission.location.name}</p>${assetRow}`;
    case "Delay":
    case "Hold":
      return `<p><strong>Time:</strong> ${["Short", "Medium", "Long"][mission.timePeriod - 1]} (${mission.timePeriod} rounds)</p>${assetRow}`;
    default:
      return "";
  }
}

// BOND payout is 1 + the mission's difficulty (todo3.md ADD: "Mission
// payment: 1+ level of difficulty"), not a scaled Cred formula —
// relationship at this scale is a flat ±1 instead of a percentage.
// §20.1: a higher-Tier-category Employer also pays a flat bonus — Crime +1,
// Corpo +2 (Nomad/Authority/Freelance: none).
function estimatePayout(job) {
  let payout = 1 + (job.mission.difficulty || 1);
  const rel = job.employer.relationship || 0;
  if (rel >= 3) payout += 1;
  else if (rel <= -3) payout = Math.max(1, payout - 1);
  const employerStanding = G.character.factionStandings[job.employer.faction];
  if (employerStanding) {
    if (employerStanding.category === "Corpo") payout += 2;
    else if (employerStanding.category === "Crime") payout += 1;
  }
  return payout;
}

// A small 5-segment Heat indicator, e.g. for Briefing and the Locations
// sidebar list.
function heatBarHtml(heat) {
  const segs = Array.from({ length: 5 }, (_, i) => `<span class="heatseg${i < heat ? " filled" : ""}"></span>`).join("");
  return `<span class="heatbar">${segs}</span>`;
}

// ---------- GEAR UP ----------
// §20.5 — buying/selling moved out to the always-open Shop panel
// (renderShopBox), so this is now just final prep for this one job: bring
// Helpers, then head out. (Loadout/carry selection is a later addition.)
function renderGearUp() {
  const c = G.character;
  const job = G.job;

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Gear Up</h2><p class="muted">Anyone coming with you? Gear's sorted from the Shop back in town.</p>`;

  // §20.1 — up to 3 Helpers total, mixing paid strangers (Hire) and
  // relationship-recruited contacts (Call in a Favor). Already-brought
  // helpers are listed first, then whatever slots remain.
  const helperSection = document.createElement("div");
  helperSection.className = "section";
  helperSection.innerHTML = `<h3>Helpers (${job.helpers.length}/3)</h3>`;

  job.helpers.forEach(h => {
    const row = document.createElement("div");
    row.className = "offer";
    const perk = h.source === "hire" ? `+1 ${h.attr}` : "+2 to one test of your choice";
    row.innerHTML = `<span>${h.person.name} (${perk})</span>`;
    helperSection.appendChild(row);
  });
  wrap.appendChild(helperSection);

  if (job.helpers.length < 3) {
    const hireRow = document.createElement("div");
    hireRow.className = "offer";
    hireRow.innerHTML = `<span>Hire backup for this job</span><span>1 BOND</span>`;
    const hireBtn = document.createElement("button");
    hireBtn.textContent = "Hire";
    hireBtn.disabled = c.bonds < 1;
    hireBtn.addEventListener("click", () => {
      c.bonds -= 1;
      const person = getPerson(c, "ally", job.excludeIds);
      // §20.6 — their passive bonus attr comes from their profession's
      // specialty (a random pick between the two, for a profession with two)
      // instead of a flat random attribute.
      const attr = pick(DATA.npcSpecialty[person.profession] || ["Social"]);
      job.helpers.push({ person, source: "hire", tier: null, attr, used: false, benched: false });
      addLog(c, `${person.name} signs on for the job, backing you up on ${attr}.`);
      persist(); render();
    });
    hireRow.appendChild(hireBtn);
    wrap.appendChild(hireRow);

    // Call in a Favor — a contact you're square with (relationship ≥3)
    // instead of a stranger. Excludes anyone already brought along.
    const broughtIds = new Set(job.helpers.map(h => h.person.id));
    const eligible = c.contacts.filter(p => p.relationship >= 3 && !p.archenemy && !broughtIds.has(p.id));
    if (eligible.length) {
      const allySection = document.createElement("div");
      allySection.className = "section";
      allySection.innerHTML = "<h3>Call in a Favor</h3>";
      eligible.forEach(person => {
        const free = person.relationship >= 5;
        const row = document.createElement("div");
        row.className = "offer";
        row.innerHTML = `<span>${person.name} (+2 to one test)</span><span>${free ? "Free" : "pays 1 BOND from payout"}</span>`;
        const btn = document.createElement("button");
        btn.textContent = "Bring along";
        btn.addEventListener("click", () => {
          job.helpers.push({ person, source: "ally", tier: free ? 5 : 3, attr: null, used: false, benched: false });
          addLog(c, `${person.name} agrees to back you up${free ? "" : ", expecting a cut of the payout"}.`);
          persist(); render();
        });
        row.appendChild(btn);
        allySection.appendChild(row);
      });
      wrap.appendChild(allySection);
    }
  }

  const goBtn = document.createElement("button");
  goBtn.textContent = "Head Out";
  goBtn.addEventListener("click", () => {
    G.phase = advanceFromGearUp();
    persist(); render();
  });
  wrap.appendChild(goBtn);

  els.main.appendChild(wrap);
}

// §20.7 — the mandatory Heat checkpoint is the outer gate, Random Encounters
// an incidental layer just inside it: GearUp → checkpoint(pre) →
// encounter(pre) → Steps → encounter(post) → checkpoint(post) → Debrief.
function advanceFromGearUp() {
  if (maybeTriggerCheckpoint("pre")) return "checkpoint";
  return maybeTriggerEncounter("pre") ? "encounter" : "steps";
}

function maybeTriggerEncounter(stage) {
  const job = G.job;
  const chance = job.location.heat * 10;
  const triggered = randInt(1, 100) <= chance;
  job.encounter[stage].done = true;
  if (triggered) {
    job.encounter.stage = stage;
    job.encounter.step = {
      attr: "Stealth", alt: "Combat",
      desc: pick(DATA.encounterFlavor),
      isEncounter: true
    };
    addLog(G.character, `Random Encounter: ${job.encounter.step.desc}`);
  }
  return triggered;
}

// ---------- ENCOUNTER ----------
function renderEncounter() {
  const job = G.job;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Encounter</h2><p class="step-desc">${job.encounter.step.desc}</p>`;
  els.main.appendChild(wrap);
  renderChallenge(wrap, job.encounter.step, () => {
    finalizeChallengeCommon();
    if (job.encounter.stage === "pre") {
      G.phase = "steps";
    } else {
      G.phase = maybeTriggerCheckpoint("post") ? "checkpoint" : "debrief";
      if (G.phase === "debrief") runDebrief();
    }
    persist();
    render();
  });
}

// ---------- CHECKPOINT (§20.7) ----------
// Heat ≥3 always (not a %) puts a checkpoint at both the entry and exit of
// a job's Location — EurCop by default, SwissGuard at Corpo Heat 4-5 or
// Crime Heat 5 (checkpointAgency(), state.js). Not a normal Challenge: it
// has its own bespoke outcome table (bribe-or-ditch on a Partial, a
// Fight-or-Run sub-resolution on a Fail), so it bypasses applyOutcome
// entirely rather than reusing the generic per-attribute fallout.
function maybeTriggerCheckpoint(stage) {
  const c = G.character, job = G.job;
  job.checkpoint[stage].done = true;
  const agency = checkpointAgency(job.location, c.factionStandings);
  if (!agency) return false;
  job.checkpoint.activeStage = stage;
  job.checkpoint.agency = agency;
  // Exit only: already having been made on a failed Stealth step this job
  // skips straight to the Fight/Run resolution — they're already onto you.
  const forcedCombat = stage === "post" && job.stepResults.some(r => r.attr === "Stealth" && r.tier === "fail");
  job.checkpoint.stage = forcedCombat ? "combat" : "roll";
  addLog(c, `${agency} has the ${stage === "pre" ? "way in" : "way out"} locked down${forcedCombat ? " — and they already made you." : "."}`);
  return true;
}

function renderCheckpoint() {
  const job = G.job;
  const cp = job.checkpoint;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>${cp.agency} Checkpoint</h2>`;
  els.main.appendChild(wrap);

  if (cp.stage === "choice") { renderCheckpointChoice(wrap); return; }
  if (cp.stage === "combat") { renderCheckpointCombat(wrap); return; }
  wrap.innerHTML += `<p class="step-desc">Get past the ${cp.agency} line.</p>`;
  renderChallenge(wrap, { attr: "Social", alt: "Stealth", desc: `Get past the ${cp.agency} line.` }, () => finishCheckpointRoll());
}

function finishCheckpointRoll() {
  const c = G.character, job = G.job, cp = job.checkpoint;
  const res = job.lastResult;
  job.pendingResult = null;
  if (res.tier === "full") {
    addLog(c, `You pass the ${cp.agency} line clean.`);
    finishCheckpoint();
  } else if (res.tier === "partial") {
    addLog(c, `They flag you down — there's still a way through.`);
    cp.stage = "choice";
    persist(); render();
  } else {
    addLog(c, `${cp.agency} makes you on the spot.`);
    cp.stage = "combat";
    persist(); render();
  }
}

// A Partial: bribe your way through (1-2 BOND, higher at Heat 5 or a Corpo
// Location) or ditch a piece of gear outright ("get rid of contraband") —
// a real choice, not a random pick.
function renderCheckpointChoice(wrap) {
  const c = G.character, job = G.job, cp = job.checkpoint;
  const category = locationCategory(job.location, c.factionStandings);
  const cost = (job.location.heat >= 5 || category === "Corpo") ? 2 : 1;
  const block = document.createElement("div");
  block.className = "challenge";
  block.innerHTML = `<p class="step-desc">Pay them off, or lose the contraband.</p>`;
  wrap.appendChild(block);

  const payBtn = document.createElement("button");
  payBtn.textContent = `Pay the bribe (${cost} BOND${cost === 1 ? "" : "S"})`;
  payBtn.disabled = c.bonds < cost;
  payBtn.addEventListener("click", () => {
    c.bonds -= cost;
    addLog(c, `You grease the ${cp.agency} line and roll on through.`);
    finishCheckpoint();
  });
  block.appendChild(payBtn);

  const ditchBtn = document.createElement("button");
  ditchBtn.textContent = "Ditch the contraband";
  ditchBtn.addEventListener("click", () => {
    if (c.gear.length) {
      const item = pick(c.gear);
      c.gear = c.gear.filter(g => g !== item);
      addLog(c, `You toss the ${item.name} before they can find it — clean otherwise.`);
    } else {
      addLog(c, `You've got nothing left to ditch — you talk your way through anyway.`);
    }
    finishCheckpoint();
  });
  block.appendChild(ditchBtn);
}

// A Fail (or the forced exit escalation): Fight (Combat) or Run (Driving) —
// renderChallenge already offers both as independent roll buttons, so no
// bespoke choice UI is needed here, just its own three-tier outcome table.
function renderCheckpointCombat(wrap) {
  const job = G.job, cp = job.checkpoint;
  wrap.innerHTML += `<p class="step-desc">Fight through the line, or run for it.</p>`;
  renderChallenge(wrap, { attr: "Combat", alt: "Driving", desc: `Fight through the ${cp.agency} line, or run for it.` }, () => finishCheckpointCombat());
}

function finishCheckpointCombat() {
  const c = G.character, job = G.job, cp = job.checkpoint;
  const res = job.lastResult;
  job.pendingResult = null;
  if (res.tier === "full") {
    addLog(c, `You get clear of the ${cp.agency} line without a scratch.`);
  } else if (res.tier === "partial") {
    addLog(c, `You get through, but it costs you.`);
    applyCheckpointDamage(c, job, pick(["harm", "vehicle", "helper"]));
  } else {
    addLog(c, `It goes bad at the line.`);
    applyCheckpointDamage(c, job, "harm");
    applyCheckpointDamage(c, job, pick(["vehicle", "helper", "gear"]));
  }
  finishCheckpoint();
}

// A single damage "kind", falling back to Harm if the preferred target
// doesn't exist (no vehicle/no active helper/no gear) — same recursive-
// fallback shape as applyFalloutConsequence (§19.9).
function applyCheckpointDamage(c, job, kind) {
  if (kind === "harm") {
    const wentDown = applyHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
  } else if (kind === "vehicle") {
    const vehicles = c.gear.filter(g => g.attr === "Driving");
    if (vehicles.length) degradeGearItem(c, pick(vehicles));
    else applyCheckpointDamage(c, job, "harm");
  } else if (kind === "helper") {
    if (job.helpers.some(h => !h.benched)) woundJobHelper(c, job);
    else applyCheckpointDamage(c, job, "harm");
  } else if (kind === "gear") {
    if (c.gear.length) degradeGearItem(c, pick(c.gear));
    else applyCheckpointDamage(c, job, "harm");
  }
}

// Shared "checkpoint resolved, move on" handler for every branch above.
function finishCheckpoint() {
  const job = G.job;
  const stage = job.checkpoint.activeStage;
  job.checkpoint.stage = null;
  if (stage === "pre") {
    G.phase = maybeTriggerEncounter("pre") ? "encounter" : "steps";
  } else {
    G.phase = "debrief";
    runDebrief();
  }
  persist();
  render();
}

// ---------- STEPS ----------
function renderSteps() {
  const job = G.job;
  const step = job.steps[job.stepIndex];
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>${job.mission.type} — Step ${job.stepIndex + 1}/${job.steps.length}</h2><p class="step-desc">${step.desc}</p>`;
  els.main.appendChild(wrap);
  renderChallenge(wrap, step, () => finalizeStep(step));
}

// Applies a resolved roll's effects (Harm/Heat/etc. per gamedesc.md §7) and
// clears the pending result. Shared by mission steps and Random Encounters so
// neither path skips consequences. BOOST growth is tallied once at Debrief
// from job.stepResults instead of tracked per-step here.
function finalizeChallengeCommon() {
  const job = G.job;
  const c = G.character;
  const res = job.lastResult;

  applyOutcome(c, job, res.usedAttr, res.tier);

  // Every clash deepens the grudge, regardless of roll tier — covers both
  // mission Combat steps and the "Caught!" forced step (Encounter combat
  // touches the same mission adversaries too; treated the same for simplicity).
  if (res.usedAttr === "Combat" && job.mission && job.mission.adversaries) {
    job.mission.adversaries.forEach(a => nudgeRelationship(c, a.id, -1));
  }

  job.pendingResult = null;
  return res;
}

function finalizeStep(step) {
  const job = G.job;
  const c = G.character;
  const res = finalizeChallengeCommon();
  // Side-objective steps (todo3.md ADD: "more BONDS") are tracked
  // separately so a botched side job can't tank the main contract's
  // success ratio — only the main sequence feeds job.stepResults.
  if (step.sideObjective) {
    job.sideObjective.results.push({ attr: res.usedAttr, tier: res.tier });
  } else {
    job.stepResults.push({ attr: res.usedAttr, tier: res.tier });
    applySpecialMissionBloodbrotherDanger(c, job, res);
  }

  // Transport: a failed transit leg (Driving or its Stealth alt) risks an
  // ambush between the two locations, in place of the generic Stealth-fail
  // "Caught!" step below.
  if (job.mission.type === "Transport" && (res.usedAttr === "Driving" || res.usedAttr === "Stealth") && res.tier === "fail" && !step.forced) {
    job.steps.splice(job.stepIndex + 1, 0, {
      attr: "Combat",
      desc: "Ambushed on the road between drop points. Fight through.",
      forced: true
    });
  } else if (res.usedAttr === "Stealth" && res.tier === "fail" && !step.forced) {
    job.steps.splice(job.stepIndex + 1, 0, {
      attr: "Combat", alt: "Social",
      desc: "Caught! Fight your way clear or talk your way out.",
      forced: true
    });
  }

  if (isDown(c)) {
    addLog(c, `${c.name} goes down. The job falls apart.`);
    G.phase = "debrief";
    runDebrief();
    persist();
    render();
    return;
  }

  job.stepIndex++;
  if (job.stepIndex >= job.steps.length) {
    G.phase = maybeTriggerEncounter("post") ? "encounter" : (maybeTriggerCheckpoint("post") ? "checkpoint" : "debrief");
    if (G.phase === "debrief") runDebrief();
  }
  persist();
  render();
}

// A failed/partial check no longer always means Harm (todo2.md) — each
// Challenge type has a weighted table of what actually goes wrong
// (DATA.failOutcomes), and the tier (partial vs fail) sets how bad it is.
// Gear damage downgrades a tier instead of destroying outright
// (Corrections.md: "gear damage should lower the gear grade or remove it
// if it goes below street") — Military -> Professional -> Street -> gone.
// Shared by every "you lose/damage a piece of gear" consequence: the
// Combat/Driving fail table below, Hunt's combat fallout, and a bad Hunt
// Run.
function degradeGearItem(c, item) {
  const idx = c.gear.indexOf(item);
  if (idx === -1) return;
  const tierIdx = DATA.gearTierOrder.indexOf(item.tier || "Street");
  if (tierIdx <= 0) {
    c.gear.splice(idx, 1);
    addLog(c, `${pick(DATA.gearDamageFlavor.fail)} (lost: ${item.name})`);
  } else {
    item.tier = DATA.gearTierOrder[tierIdx - 1];
    addLog(c, `${pick(DATA.gearDamageFlavor.degrade)} (${item.name} degrades to ${item.tier})`);
  }
}

// §19.9 — a fixed, deterministic per-attribute fallout table, replacing the
// old weighted-random one (DATA.failOutcomes, still used by the Hunt's own
// Combat-fail fallout — see applyHuntCombatFailFallout — which this doesn't
// touch). `options` is an array of consequence-key arrays; a Partial/Fail
// picks one array at random and applies every key in it.
function applyOutcome(c, job, attr, tier) {
  const loc = c.locations[job.location.name];
  const fallout = DATA.challengeFallout[attr];

  // Combat always adds Heat, win or lose (§19.9) — checked before the
  // full-success early return below, since it applies there too.
  if (fallout.heatAlways && loc) loc.heat = Math.min(5, loc.heat + 1);

  if (tier === "full") {
    addLog(c, `Full success on ${attr}.`);
    return;
  }

  const table = DATA.complications[attr];
  addLog(c, tier === "partial" ? pick(table.partial) : pick(table.fail));

  if (fallout.heatOnResolve && loc) loc.heat = Math.min(5, loc.heat + fallout.heatOnResolve);

  const consequences = pick(tier === "partial" ? fallout.partial : fallout.fail);
  consequences.forEach(key => applyFalloutConsequence(c, job, attr, tier, key, loc));
}

function applyFalloutConsequence(c, job, attr, tier, key, loc) {
  switch (key) {
    case "harm1":
    case "harm2": {
      const hits = key === "harm2" ? 2 : 1;
      for (let i = 0; i < hits; i++) {
        const wentDown = applyHarm(c);
        if (wentDown) {
          if (!c.permanentInjury) resolveDownEvent(c);
          break;
        }
      }
      break;
    }
    case "gearDamage":
      if (c.gear.length === 0) { applyFalloutConsequence(c, job, attr, tier, "credLoss", loc); break; }
      if (tier === "partial") {
        c.bonds = Math.max(0, c.bonds - 1);
        addLog(c, pick(DATA.gearDamageFlavor.partial));
      } else {
        const matching = c.gear.filter(g => g.attr === attr);
        degradeGearItem(c, pick(matching.length ? matching : c.gear));
      }
      break;
    case "vehicleDamage": {
      const vehicles = c.gear.filter(g => g.attr === "Driving");
      if (vehicles.length) degradeGearItem(c, pick(vehicles));
      else applyFalloutConsequence(c, job, attr, tier, "harm1", loc);
      break;
    }
    case "loseVehicle": {
      const vehicles = c.gear.filter(g => g.attr === "Driving");
      if (vehicles.length) {
        const v = pick(vehicles);
        c.gear = c.gear.filter(item => item !== v);
        addLog(c, `${v.name} is totaled — you lose it for good.`);
      } else {
        applyFalloutConsequence(c, job, attr, tier, "gearDamage", loc);
      }
      break;
    }
    case "woundHelper":
      woundJobHelper(c, job);
      break;
    case "heat":
      if (loc) loc.heat = Math.min(5, loc.heat + 1);
      break;
    case "heat2":
      if (loc) loc.heat = Math.min(5, loc.heat + 2);
      break;
    case "credLoss": {
      const loss = Math.min(c.bonds, tier === "fail" ? 2 : 1);
      c.bonds -= loss;
      addLog(c, `${pick(tier === "fail" ? DATA.credLossFlavor.fail : DATA.credLossFlavor.partial)} (-${loss} BOND${loss === 1 ? "" : "S"})`);
      break;
    }
  }
}

// §19.5/§20.1 — any Bloodbrother riding along as a Helper on a Special
// Mission is at real risk: a Combat Partial wounds them (same "out for the
// rest of the job" effect as woundJobHelper below), any main-sequence Fail
// (any attr) kills them outright. Checked per main-sequence step, not
// side-objective ones or Encounters (neither is "main-sequence") — and
// against every Bloodbrother Helper present, not just one.
function applySpecialMissionBloodbrotherDanger(c, job, res) {
  if (!job.mission.special || !job.helpers.length) return;
  job.helpers
    .filter(h => h.person.bloodbrother)
    .forEach(h => {
      // A Fail kills them outright regardless of whether the generic §19.9
      // fallout already benched them this same step (woundJobHelper) — Fail
      // takes priority over "already benched", so check it before that guard.
      if (res.tier === "fail") {
        addLog(c, `${h.person.name} doesn't walk away from this one. Special Missions don't forgive.`);
        killPerson(c, h.person.id);
        job.helpers = job.helpers.filter(x => x !== h);
        return;
      }
      if (h.benched) return; // the Partial-wound rule below only ever applies once
      if (res.usedAttr === "Combat" && res.tier === "partial") {
        h.benched = true;
        h.used = true;
        addLog(c, `${h.person.name} takes a bad hit backing you up on this one — they're out for the rest of the job.`);
      }
    });
}

// §19.9/§20.1 — a benched Helper stops contributing their bonus (and, if
// they're an "ally"-source Helper, forfeits their unused one-time +2) for
// the rest of the job, and takes the persistent wound-then-kill hit
// (woundPerson, state.js) that follows them into future jobs. Picks one
// random still-active Helper — Special Mission Bloodbrothers have their own
// harsher rule, see applySpecialMissionBloodbrotherDanger() above.
function woundJobHelper(c, job) {
  const active = job.helpers.filter(h => !h.benched);
  if (!active.length) return;
  const h = pick(active);
  h.benched = true;
  h.used = true;
  addLog(c, `${h.person.name} takes a hit backing you up — they're out for the rest of this job.`);
  woundPerson(c, h.person);
}

// ---------- Shared Challenge UI (roll block, used by steps + encounters) ----------
// ctx ({job, holder}, optional) lets Rest sub-flows (renderRestSubflow) reuse
// this without a real accepted job: job is null (no mission/location/ally to
// pull modifiers from) and holder is a standalone scratch object (G.restFlow)
// instead of G.job, since there's no job to hang pendingResult/lastResult off.
function renderChallenge(container, step, onContinue, ctx) {
  const c = G.character;
  const job = ctx ? ctx.job : G.job;
  const holder = ctx ? ctx.holder : G.job;

  if (holder.pendingResult) {
    renderResultBlock(container, holder.pendingResult, onContinue);
    return;
  }

  // Equipment gating (todo3.md): Hacking needs owned Hacking-attr gear ("a
  // deck"); Driving on a medium/hard rural Transport leg needs owned
  // Driving-attr gear ("a vehicle"). Never filter down to zero options —
  // that would hard-lock the step.
  const rawAttrs = [step.attr, step.alt].filter(Boolean);
  const gatedAttrs = rawAttrs.filter(attr => attrAvailable(c, job, attr));
  const attrs = gatedAttrs.length ? gatedAttrs : rawAttrs;
  attrs.forEach(attr => {
    const block = document.createElement("div");
    block.className = "challenge";
    const boostOption = c.boost >= 1
      ? `<label class="boost-toggle"><input type="checkbox" class="boost-check" /> Spend 1 BOOST for +1</label>`
      : "";
    // Ally Assist (todo3.md Persons, §20.1: now up to 3 possible) — each
    // not-yet-used, not-benched "ally" Helper's one-time +2 to a single
    // test, consumed on the roll it's checked for. Independent checkboxes —
    // bringing more helpers means being able to stack more than one.
    const assistHelpers = job ? job.helpers.filter(h => h.source === "ally" && !h.used && !h.benched) : [];
    const assistOptions = assistHelpers.map(h =>
      `<label class="boost-toggle"><input type="checkbox" class="assist-check" data-person-id="${h.person.id}" /> ${h.person.name}: +2 to this roll</label>`
    ).join("");
    block.innerHTML = `<h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${boostOption}${assistOptions}<div class="mods"></div>`;
    const modsEl = block.querySelector(".mods");
    const boostCheck = block.querySelector(".boost-check");
    const assistChecks = Array.from(block.querySelectorAll(".assist-check"));
    const checkedAssistIds = () => assistChecks.filter(el => el.checked).map(el => Number(el.dataset.personId));

    const refreshMods = () => {
      const mods = computeModifiers(attr, boostCheck && boostCheck.checked, checkedAssistIds(), job);
      modsEl.innerHTML = mods.length
        ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
        : `<span class="chip">no modifiers</span>`;
    };
    refreshMods();
    if (boostCheck) boostCheck.addEventListener("change", refreshMods);
    assistChecks.forEach(el => el.addEventListener("change", refreshMods));

    const rollBtn = document.createElement("button");
    rollBtn.textContent = `Roll ${attr}`;
    rollBtn.addEventListener("click", () => {
      const spendBoost = !!(boostCheck && boostCheck.checked);
      const assistIds = checkedAssistIds();
      const mods = computeModifiers(attr, spendBoost, assistIds, job);
      if (spendBoost) c.boost -= 1;
      if (job && assistIds.length) {
        job.helpers.forEach(h => { if (assistIds.includes(h.person.id)) h.used = true; });
      }
      const result = resolve(c.attrs[attr], mods);
      result.usedAttr = attr;
      step.usedAttr = attr;
      holder.pendingResult = result;
      holder.lastResult = result;
      persist();
      render();
    });
    block.appendChild(rollBtn);
    container.appendChild(block);
  });
}

function attrAvailable(c, job, attr) {
  if (attr === "Hacking") return ownsGearForAttr(c, "Hacking");
  if (job && attr === "Driving" && job.mission && job.mission.type === "Transport" && job.mission.difficulty >= 2) {
    const rural = job.location.area === "Rural" || (job.mission.fromLocation && job.mission.fromLocation.area === "Rural");
    if (rural) return ownsGearForAttr(c, "Driving");
  }
  return true;
}

// job may be null (a Rest sub-flow's Challenge has no accepted job to pull
// job/location/helper modifiers from — see renderChallenge's ctx param).
// assistIds (§20.1, optional): ids of Helpers whose one-time +2 is spent on
// this roll — was a single boolean (`spendAlly`) back when there was only
// ever one recruited Ally; now there can be up to 3.
function computeModifiers(attr, spendBoost, assistIds, job) {
  const c = G.character;
  const mods = [];
  const gearBonus = bestGearBonus(c, attr);
  if (gearBonus) mods.push({ label: gearBonus.name, value: gearBonus.bonus });
  if (job && (attr === "Combat" || attr === "Stealth") && job.location.heat >= 4) mods.push({ label: "Heat", value: -1 });
  if (job && (attr === "Combat" || attr === "Stealth") && job.mission.worstTier) {
    const p = tierPenalty(job.mission.worstTier);
    if (p) mods.push({ label: `Adversary (${job.mission.worstTier})`, value: p });
  }
  // §19.6 — a Challenge against a specific hostile faction (the mission
  // Target's) carries that faction's Tier modifier.
  if (job && job.mission && job.mission.target && job.mission.target.faction) {
    const factionMod = factionChallengeModifier(c, job.mission.target.faction);
    if (factionMod) mods.push({ label: `${job.mission.target.faction} (Tier)`, value: factionMod });
  }
  // §19.5 — every Challenge on a Special Mission carries an extra -1.
  if (job && job.mission && job.mission.special) mods.push({ label: "Special Mission", value: -1 });
  // §20.1 — up to 3 Helpers: each "hire" Helper gives a passive +1 to their
  // assigned attr; 2+ active (non-benched) Helpers of any kind give the
  // whole crew +1 Combat / -1 Stealth.
  if (job && job.helpers) {
    job.helpers.forEach(h => {
      if (!h.benched && h.source === "hire" && h.attr === attr) mods.push({ label: h.person.name, value: 1 });
    });
    const activeCount = job.helpers.filter(h => !h.benched).length;
    if (activeCount >= 2 && attr === "Combat") mods.push({ label: "Crew (2+ helpers)", value: 1 });
    else if (activeCount >= 2 && attr === "Stealth") mods.push({ label: "Crew (2+ helpers)", value: -1 });
  }
  if (spendBoost) mods.push({ label: "Boost", value: 1 });
  if (job && assistIds && assistIds.length) {
    job.helpers.forEach(h => {
      if (h.source === "ally" && !h.used && !h.benched && assistIds.includes(h.person.id)) {
        mods.push({ label: h.person.name, value: 2 });
      }
    });
  }
  const harmCount = c.health.filter(h => h).length;
  if (harmCount === 1) mods.push({ label: "Wounded", value: -1 });
  else if (harmCount >= 2) mods.push({ label: "Wounded", value: -2 });
  if (c.permanentInjury) mods.push({ label: "Permanent Injury", value: -1 });
  return mods;
}

function renderResultBlock(container, result, onContinue) {
  const c = G.character;
  const block = document.createElement("div");
  block.className = "result";
  block.innerHTML = `
    <h4>Roll: ${result.d1} + ${result.d2} (+${result.attrRank} attr ${result.modTotal >= 0 ? "+" : ""}${result.modTotal} mods) = ${result.total}</h4>
    <p class="tier tier-${result.tier}">${result.tier.toUpperCase()}</p>
  `;
  const canSignature = c.boost >= 3 && result.tier !== "full";
  if (canSignature) {
    const sigBtn = document.createElement("button");
    sigBtn.textContent = "Spend 3 BOOST (upgrade result)";
    sigBtn.addEventListener("click", () => {
      c.boost -= 3;
      result.tier = upgradeTier(result.tier);
      addLog(c, "You burn through BOOST to turn it around.");
      persist(); render();
    });
    block.appendChild(sigBtn);
  }
  const contBtn = document.createElement("button");
  contBtn.textContent = "Continue";
  contBtn.addEventListener("click", onContinue);
  block.appendChild(contBtn);
  container.appendChild(block);
}

// ---------- DEBRIEF ----------
function runDebrief() {
  const c = G.character, job = G.job;
  const score = job.stepResults.reduce((a, r) => a + (r.tier === "full" ? 2 : r.tier === "partial" ? 1 : 0), 0);
  const max = Math.max(1, job.stepResults.length * 2);
  const ratio = score / max;

  // A Failure pays nothing (todo3.md ADD: "Failed mission should not give
  // you any payment") — both Failure branches below get mult 0.
  let outcome, mult;
  if (isDown(c)) { outcome = "Failure"; mult = 0; }
  else if (ratio >= 0.85) { outcome = "Full Success"; mult = 1; }
  else if (ratio >= 0.4) { outcome = "Partial Success"; mult = 0.6; }
  else { outcome = "Failure"; mult = 0; }

  const basePayout = estimatePayout(job); // §19.1 — "job's base payout, before outcome multiplier"
  const payout = Math.round(basePayout * mult);
  c.bonds += payout;
  let totalPayout = payout; // tracks ally fees / side-objective bonus for the Debrief display

  // §19.5 — Special Missions push every relationship/standing delta below
  // one point further from zero (0 is unaffected — Math.sign(0) === 0).
  const amp = job.mission.special ? 1 : 0;
  const relAmp = v => v + Math.sign(v) * amp;

  // BOOST grows with full successes, replacing the old per-track Rep gain.
  const boostGained = job.stepResults.filter(r => r.tier === "full").length;
  if (boostGained > 0 && c.boost < 10) {
    c.boost = Math.min(10, c.boost + boostGained);
    addLog(c, `That clean work earns you ${boostGained} BOOST (now ${c.boost}).`);
  }

  const relDelta = outcome === "Full Success" ? 1 : outcome === "Partial Success" ? 0 : -1;
  nudgeRelationship(c, job.employer.id, relAmp(relDelta));

  // §19.2 — per-mission-type faction standing effects (supersedes the old
  // flat ±1 asset-type rule): the Employer's faction always gains, the
  // opposing faction (the Target, or the attacking/chasing side for
  // Hold/Transport) always loses, by fixed amounts specific to the type. If
  // the job was ever noticed (Heat rose during the run), tension between
  // employer and target factions rises too.
  if (outcome !== "Failure") {
    const effects = DATA.missionFactionEffects[job.mission.type];
    if (effects) {
      Object.entries(effects.employer).forEach(([param, v]) => adjustFactionParam(c, job.employer.faction, param, relAmp(v)));
      if (job.mission.target && job.mission.target.faction !== job.employer.faction) {
        Object.entries(effects.target).forEach(([param, v]) => adjustFactionParam(c, job.mission.target.faction, param, relAmp(v)));
      }
    }
    const startHeat = job.location.heat;
    const nowHeat = (c.locations[job.location.name] || {}).heat;
    const noticed = job.mission.target && typeof nowHeat === "number" && nowHeat > startHeat;
    if (noticed) {
      nudgeFactionRelation(c, job.employer.faction, job.mission.target.faction, -1);
      addLog(c, `Word gets out — tension rises between ${job.employer.faction} and ${job.mission.target.faction}.`);
    }
  }

  // §19.1 — Reputation: a non-Failure always gives +1, plus stacking +1s
  // for a big payout, an Assassination, and a Special Mission.
  if (outcome !== "Failure") {
    let repGain = 1;
    if (basePayout >= 4) repGain += 1;
    if (job.mission.type === "Assassination") {
      repGain += 1;
      addLog(c, `Word travels: "Shadow of ${job.location.name}."`);
    }
    if (job.mission.special) repGain += 1;
    gainReputation(c, repGain);
    addLog(c, `Reputation +${repGain} (now ${c.reputation}, ${reputationTitle(c)}).`);
  }

  // Outcomes retire people permanently: a successful hit kills its target;
  // a failed Transport/Hold kills whoever was being moved/protected.
  if (job.mission.type === "Assassination") {
    if (outcome !== "Failure") {
      killPerson(c, job.mission.target.id);
      addLog(c, `${job.mission.target.name} won't be a problem for anyone again.`);
    } else if (job.stepResults.some(r => r.attr === "Stealth" && r.tier === "fail")) {
      // A botched hit where you were also spotted leaves the target alive
      // and gunning for you (todo3.md Persons).
      tagArchenemy(c, job.mission.target);
      addLog(c, `${job.mission.target.name} survives, and they know your face now. You've made an Archenemy.`);
    }
  } else if (job.mission.type === "Transport" || job.mission.type === "Hold") {
    if (outcome === "Failure") {
      killPerson(c, job.mission.target.id);
      addLog(c, `${job.mission.target.name} didn't make it.`);
    } else {
      nudgeRelationship(c, job.mission.target.id, relAmp(1));
    }
  }

  // §20.1 — Helper resolution, up to 3 of them. A Special Mission Fail can
  // already have removed a Bloodbrother Helper mid-job (§19.5, see
  // applySpecialMissionBloodbrotherDanger) — job.helpers only holds whoever
  // is left standing by the time Debrief runs.
  job.helpers.forEach(h => {
    if (h.source === "hire") {
      nudgeRelationship(c, h.person.id, relAmp(outcome === "Failure" ? -1 : 1));
      return;
    }
    if (outcome !== "Failure") {
      nudgeRelationship(c, h.person.id, relAmp(1));
      if (h.tier === 3) {
        const fee = Math.min(c.bonds, 1);
        c.bonds -= fee;
        totalPayout -= fee;
        addLog(c, `${h.person.name} takes ${fee} BOND off the top for the help.`);
      } else if (!h.person.bloodbrother) {
        tagBloodbrother(c, h.person);
        gainReputation(c, 1); // §19.1
        addLog(c, `${h.person.name} watches your back, no questions asked. You're blood now.`);
        addLog(c, `Reputation +1 — "Friend of ${h.person.name}" (now ${c.reputation}, ${reputationTitle(c)}).`);
      }
    } else {
      nudgeRelationship(c, h.person.id, relAmp(-2));
    }
  });

  // Side objective resolution (todo3.md ADD: "more BONDS" button) — pays
  // +2 BONDS only if neither of its 2 appended steps came back a Fail.
  if (job.sideObjective) {
    const side = job.sideObjective;
    const cleanRun = side.results.length && side.results.every(r => r.tier !== "fail");
    if (cleanRun) {
      c.bonds += 2;
      totalPayout += 2;
      if (side.type === "Assassination") {
        killPerson(c, side.target.id);
        addLog(c, `The side job pays off too: ${side.target.name} won't be a problem either (+2 BONDS).`);
      } else {
        addLog(c, `The side job pays off too — you walk with extra (+2 BONDS).`);
      }
    } else {
      addLog(c, `The side job falls through. No bonus this time.`);
    }
  }

  decayOtherLocations(c, job.location.name);

  // §20.1 — one background faction-vs-faction mission per category, every
  // Debrief (distinct from §19.7's Rest-tick-only Power-struggle destroy
  // attempts, which only fire for Power ≥10 attackers).
  runFactionBackgroundMissions(c);

  // §20.6 — while the Rest clock sits one tick short of a forced Hunt, the
  // Archenemy might move on a friend or the player's home instead of
  // waiting. Checked after payment (per todo3.md) and before the Heat/
  // EurCop raid check below.
  resolveArchenemyClockEvent(c);

  // §20.7 — a job that ended hot enough (Corpo Heat 4-5, or Crime Heat 5)
  // has a 20% chance of the same agency that would've manned a checkpoint
  // showing up at the player's door instead, if they own one.
  resolveApartmentRaid(c, job);

  job.outcome = outcome;
  job.payout = totalPayout;
  addLog(c, `Job complete: ${outcome}. Paid ${totalPayout} BOND${totalPayout === 1 ? "" : "S"} by ${job.employer.name}.`);
  persist();
}

function renderDebrief() {
  const job = G.job;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Debrief — ${job.outcome}</h2>
    <p>Employer: ${job.employer.name}</p>
    <p>Payout: ${job.payout} BOND${job.payout === 1 ? "" : "S"}</p>
    <p class="muted">${job.stepResults.filter(r => r.tier === "full").length} full, ${job.stepResults.filter(r => r.tier === "partial").length} partial, ${job.stepResults.filter(r => r.tier === "fail").length} failed steps.</p>
  `;
  const btn = document.createElement("button");
  btn.textContent = "Return to the Street";
  btn.addEventListener("click", () => {
    G.job = null;
    G.phase = nextHubPhase();
    persist();
    render();
  });
  wrap.appendChild(btn);
  els.main.appendChild(wrap);
}

// ---------- WIN ----------
// 20 BONDS is the game's win condition (todo3.md) — a clean retirement
// instead of a loss/failure screen.
function renderWin() {
  const c = G.character;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Ticket Off-World</h2>
    <p>${c.bonds} BONDS. That's what a broker on the Beanstalk wants for a one-way
    berth to the lunar colonies — no more Heat, no more fixers, no more looking
    over your shoulder.</p>
    <p>You clear out your gear, settle what you owe, and walk onto the shuttle
    without looking back. Most runners don't get this far. You did.</p>
    <p class="muted">${c.name} — retired, ${c.bonds} BONDS to their name.</p>
  `;
  const btn = document.createElement("button");
  btn.textContent = "Start a New Runner";
  btn.addEventListener("click", () => {
    clearSave();
    G.character = null;
    G.job = null;
    G.hunt = null;
    G.phase = "create";
    render();
  });
  wrap.appendChild(btn);
  els.main.appendChild(wrap);
}

// ---------- LOSS (§17.2/§19.8) ----------
// MULTI-CORP: the Corpo category reduced to a single survivor (§19.7's
// faction Power struggles having destroyed the other two) — that faction
// absorbs the entire tier and the game ends. Checked at nextHubPhase().
function renderLoss() {
  const c = G.character;
  const survivor = DATA.factions.find(f => {
    const s = c.factionStandings[f.name];
    return s && !s.destroyed && s.category === "Corpo";
  });
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>MULTI-CORP</h2>
    <p>${survivor ? survivor.name : "One Corpo giant"} finishes off the last name that could still stand
    up to it. There's no more competition left to play the others off of —
    just one logo, on every wall, in every feed, over every door.</p>
    <p>The SuperState doesn't fall. It just stops pretending it was ever
    anything else. Every fixer, every gang, every Turf answers to one
    balance sheet now, and yours is not the name on it.</p>
    <p class="muted">${c.name} — still on the street, in a city that isn't anyone's anymore.</p>
  `;
  const btn = document.createElement("button");
  btn.textContent = "Start a New Runner";
  btn.addEventListener("click", () => {
    clearSave();
    G.character = null;
    G.job = null;
    G.board = null;
    G.hunt = null;
    G.phase = "create";
    render();
  });
  wrap.appendChild(btn);
  els.main.appendChild(wrap);
}

// ---------- ARCHENEMY HUNT (todo3.md) ----------
// Triggered by processRestTick() once the Rest clock (character.restCount)
// hits 4. A bespoke mini state machine — not the generic mission-step
// sequence — since the branching (avoid/fight, wound tracking, chase/run)
// doesn't fit that shape. Reuses resolve()/renderResultBlock() as-is.
function startHunt() {
  const c = G.character;
  const archenemy = c.contacts.find(p => p.id === c.archenemyId);
  if (!archenemy) {
    // Safety net: the archenemy died some other way (e.g. an Assassination
    // job) before the clock filled. No Hunt to run — just go back to Hub.
    G.phase = "hub";
    persist();
    render();
    return;
  }
  G.hunt = { archenemy, stage: "notice", wounds: 0, combatBonus: 0, combatChoice: null, pendingResult: null, bloodbrotherUsed: false };
  addLog(c, `${archenemy.name} finally catches up with you.`);
  G.phase = "hunt";
  persist();
  render();
}

// Player-initiated Hunt from the People list (todo3.md Persons) — click any
// Archenemy-tagged contact from the Hub. Distinct from startHunt() (the
// Rest clock's forced trigger): this one opens on the "track" stage, with
// its own three-way Social check instead of "notice".
function startHuntManual(personId) {
  const c = G.character;
  const archenemy = c.contacts.find(p => p.id === personId && p.archenemy);
  if (!archenemy) return;
  G.hunt = { archenemy, stage: "track", wounds: 0, combatBonus: 0, combatChoice: null, pendingResult: null, bloodbrotherUsed: false };
  addLog(c, `You go looking for ${archenemy.name}.`);
  G.phase = "hunt";
  persist();
  render();
}

function renderHunt() {
  const hunt = G.hunt;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Archenemy: ${hunt.archenemy.name}</h2>`;
  els.main.appendChild(wrap);

  const stageFns = {
    notice: renderHuntNotice,
    track: renderHuntTrack,
    choice: renderHuntChoice,
    avoid: renderHuntAvoid,
    combat: renderHuntCombat,
    chase: renderHuntChase,
    run: renderHuntRun
  };
  (stageFns[hunt.stage] || renderHuntResolution)(wrap);
}

// Bail-out options offered on most Hunt steps (todo3.md HUNT: "add avoid /
// run to all steps") — Avoid reuses the dedicated Stealth roll/stage, Run
// reuses the dedicated Driving roll/stage. Hidden mid-roll (a pendingResult
// already on screen) and each skippable per-stage so a step never offers a
// redundant duplicate of its own option.
function renderHuntEscape(container, options) {
  const hunt = G.hunt;
  if (hunt.pendingResult) return;
  const opts = options || {};
  const row = document.createElement("div");
  row.className = "offer";
  if (!opts.skipAvoid) {
    const avoidBtn = document.createElement("button");
    avoidBtn.textContent = "Try to Slip Away (Stealth)";
    avoidBtn.addEventListener("click", () => { hunt.stage = "avoid"; persist(); render(); });
    row.appendChild(avoidBtn);
  }
  if (!opts.skipRun) {
    const runBtn = document.createElement("button");
    runBtn.textContent = "Try to Run (Driving)";
    runBtn.addEventListener("click", () => { hunt.stage = "run"; persist(); render(); });
    row.appendChild(runBtn);
  }
  container.appendChild(row);
}

// Mirrors the single-attribute half of renderChallenge(), but for the Hunt
// — there's no G.job to hang modifiers off, so this builds its own: gear
// bonus, Wounded/Permanent Injury penalties, BOOST spend, and the
// Archenemy's own tier penalty (locked in "tough" — see lockInArchenemy).
function renderHuntRoll(container, attr, desc, extraBonus, onResult) {
  const c = G.character;
  const hunt = G.hunt;

  if (hunt.pendingResult) {
    const res = hunt.pendingResult;
    renderResultBlock(container, res, () => { hunt.pendingResult = null; onResult(res); });
    return;
  }

  const block = document.createElement("div");
  block.className = "challenge";
  const boostOption = c.boost >= 1
    ? `<label class="boost-toggle"><input type="checkbox" class="boost-check" /> Spend 1 BOOST for +1</label>`
    : "";
  // A BLOODBROTHER can be called in to help on a Hunt (todo3.md Persons) —
  // a one-time +2, same shape as Ally Assist in renderChallenge().
  const bb = findBloodbrother(c);
  const brotherOption = bb && !hunt.bloodbrotherUsed
    ? `<label class="boost-toggle"><input type="checkbox" class="brother-check" /> Call ${bb.name}: +2 to this roll</label>`
    : "";
  block.innerHTML = `<p class="step-desc">${desc}</p><h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${boostOption}${brotherOption}<div class="mods"></div>`;
  const modsEl = block.querySelector(".mods");
  const boostCheck = block.querySelector(".boost-check");
  const brotherCheck = block.querySelector(".brother-check");

  const buildMods = (spendBoost, callBrother) => {
    const mods = [];
    const gearBonus = bestGearBonus(c, attr);
    if (gearBonus) mods.push({ label: gearBonus.name, value: gearBonus.bonus });
    const tp = tierPenalty(hunt.archenemy.tier);
    if (tp) mods.push({ label: hunt.archenemy.name, value: tp });
    if (extraBonus) mods.push({ label: "Caught them off guard", value: extraBonus });
    if (spendBoost) mods.push({ label: "Boost", value: 1 });
    if (callBrother && bb) mods.push({ label: bb.name, value: 2 });
    const harmCount = c.health.filter(h => h).length;
    if (harmCount === 1) mods.push({ label: "Wounded", value: -1 });
    else if (harmCount >= 2) mods.push({ label: "Wounded", value: -2 });
    if (c.permanentInjury) mods.push({ label: "Permanent Injury", value: -1 });
    return mods;
  };

  const refreshMods = () => {
    const mods = buildMods(boostCheck && boostCheck.checked, brotherCheck && brotherCheck.checked);
    modsEl.innerHTML = mods.length
      ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
      : `<span class="chip">no modifiers</span>`;
  };
  refreshMods();
  if (boostCheck) boostCheck.addEventListener("change", refreshMods);
  if (brotherCheck) brotherCheck.addEventListener("change", refreshMods);

  const rollBtn = document.createElement("button");
  rollBtn.textContent = `Roll ${attr}`;
  rollBtn.addEventListener("click", () => {
    const spendBoost = !!(boostCheck && boostCheck.checked);
    const callBrother = !!(brotherCheck && brotherCheck.checked);
    const mods = buildMods(spendBoost, callBrother);
    if (spendBoost) c.boost -= 1;
    if (callBrother) hunt.bloodbrotherUsed = true;
    const result = resolve(c.attrs[attr], mods);
    result.usedAttr = attr;
    hunt.pendingResult = result;
    persist();
    render();
  });
  block.appendChild(rollBtn);
  container.appendChild(block);
}

function renderHuntNotice(container) {
  renderHuntRoll(container, "Social", `Something's off tonight. Do you notice ${G.hunt.archenemy.name} closing in?`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "fail") {
      addLog(c, `You're watching the wrong corner when a car swerves out of nowhere — ${hunt.archenemy.name} comes out guns blazing!`);
      hunt.stage = "combat";
    } else {
      hunt.combatBonus = res.tier === "full" ? 2 : 0;
      addLog(c, res.tier === "full"
        ? `You have managed to ambush ${hunt.archenemy.name} — you've got the opening if you want it.`
        : `You catch the movement just in time to have options.`);
      hunt.stage = "choice";
    }
    persist(); render();
  });
  renderHuntEscape(container);
}

// The player-initiated Hunt's own Social table (todo3.md Persons) —
// distinct from renderHuntNotice()'s clock-triggered version: 10+ hands you
// the ambush outright (no avoid/fight choice — you went looking for this),
// 7-9 plays out like the normal notice-succeeded flow, 6- costs you a hit
// before the fight even starts.
function renderHuntTrack(container) {
  renderHuntRoll(container, "Social", `Tracking down ${G.hunt.archenemy.name}.`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "full") {
      hunt.combatBonus = 2;
      addLog(c, `You have managed to ambush ${hunt.archenemy.name} before they even knew you were there.`);
      hunt.stage = "combat";
    } else if (res.tier === "partial") {
      addLog(c, `You track ${hunt.archenemy.name} down. No surprises either way.`);
      hunt.stage = "choice";
    } else {
      addLog(c, `You're looking for ${hunt.archenemy.name} when a car swerves round the corner — ${hunt.archenemy.name} comes out guns blazing!`);
      const wentDown = applyHarm(c);
      if (wentDown && !c.permanentInjury) resolveDownEvent(c);
      hunt.stage = "choice";
    }
    persist(); render();
  });
  renderHuntEscape(container);
}

function renderHuntChoice(container) {
  const hunt = G.hunt;
  const block = document.createElement("div");
  block.className = "challenge";
  block.innerHTML = `<p class="step-desc">${hunt.archenemy.name} is close. Avoid them, run for it, or meet them head-on${hunt.combatBonus ? ` (+${hunt.combatBonus} if you fight)` : ""}?</p>`;
  container.appendChild(block);

  const avoidBtn = document.createElement("button");
  avoidBtn.textContent = "Avoid (Stealth)";
  avoidBtn.addEventListener("click", () => { hunt.stage = "avoid"; persist(); render(); });
  block.appendChild(avoidBtn);

  const runBtn = document.createElement("button");
  runBtn.textContent = "Run (Driving)";
  runBtn.addEventListener("click", () => { hunt.stage = "run"; persist(); render(); });
  block.appendChild(runBtn);

  const fightBtn = document.createElement("button");
  fightBtn.textContent = "Fight";
  fightBtn.addEventListener("click", () => { hunt.stage = "combat"; persist(); render(); });
  block.appendChild(fightBtn);
}

function renderHuntAvoid(container) {
  renderHuntRoll(container, "Stealth", `Slip past ${G.hunt.archenemy.name} before they close the distance.`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "fail") {
      addLog(c, `No good — ${hunt.archenemy.name} is on you. The fight's here whether you like it or not.`);
      hunt.stage = "combat";
    } else {
      addLog(c, `You slide out of sight. Not tonight, ${hunt.archenemy.name}.`);
      hunt.stage = "resolved-evade";
    }
    persist(); render();
  });
  renderHuntEscape(container, { skipAvoid: true });
}

// A light, existing-style Combat-fail consequence for a whiffed Attack roll
// — reuses the normal weighted fallout table rather than new bespoke text.
// gearDamage downgrades a tier instead of destroying outright (Corrections.md
// — see degradeGearItem() near applyOutcome()).
function applyHuntCombatFailFallout(c) {
  const effect = pickWeighted(DATA.failOutcomes.Combat);
  if (effect === "harm" || (effect === "gearDamage" && c.gear.length === 0)) {
    const wentDown = applyHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
  } else if (effect === "gearDamage") {
    degradeGearItem(c, c.gear[randInt(0, c.gear.length - 1)]);
  } else if (effect === "credLoss" && c.bonds > 0) {
    c.bonds -= 1;
    addLog(c, `${pick(DATA.credLossFlavor.fail)} (-1 BOND)`);
  }
}

function renderHuntCombat(container) {
  const hunt = G.hunt;

  if (hunt.combatChoice === "attack") {
    renderHuntRoll(container, "Combat", `Wounds landed on ${hunt.archenemy.name}: ${hunt.wounds}/3.`, hunt.combatBonus, (res) => {
      const c = G.character;
      hunt.combatBonus = 0;
      hunt.combatChoice = null;
      if (res.tier === "fail") {
        addLog(c, pick(DATA.complications.Combat.fail));
        applyHuntCombatFailFallout(c);
      } else {
        hunt.wounds++;
        addLog(c, `You land a hit on ${hunt.archenemy.name} (${hunt.wounds}/3).`);
        if (hunt.wounds >= 3) applyHuntKillReward(c);
        else if (hunt.wounds === 2) { addLog(c, `${hunt.archenemy.name} breaks and runs for it.`); hunt.stage = "chase"; }
      }
      persist(); render();
    });
    return;
  }

  if (hunt.combatChoice === "run") { renderHuntRun(container); return; }

  const block = document.createElement("div");
  block.className = "challenge";
  block.innerHTML = `<p class="step-desc">${hunt.archenemy.name} is on you. Wounds landed: ${hunt.wounds}/3.</p>`;
  container.appendChild(block);
  const attackBtn = document.createElement("button");
  attackBtn.textContent = `Attack${hunt.combatBonus ? ` (+${hunt.combatBonus})` : ""}`;
  attackBtn.addEventListener("click", () => { hunt.combatChoice = "attack"; persist(); render(); });
  block.appendChild(attackBtn);
  const runBtn = document.createElement("button");
  runBtn.textContent = "Run (Driving)";
  runBtn.addEventListener("click", () => { hunt.combatChoice = "run"; persist(); render(); });
  block.appendChild(runBtn);
  const avoidBtn = document.createElement("button");
  avoidBtn.textContent = "Break Off (Stealth)";
  avoidBtn.addEventListener("click", () => { hunt.stage = "avoid"; persist(); render(); });
  block.appendChild(avoidBtn);
}

// The Run roll (todo3.md HUNT: "add avoid / run to all steps") — reached
// either mid-combat (hunt.combatChoice === "run") or directly as its own
// stage from anywhere renderHuntEscape() offers it.
function renderHuntRun(container) {
  renderHuntRoll(container, "Driving", `Gun it and try to lose ${G.hunt.archenemy.name}.`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    hunt.combatChoice = null;
    if (res.tier === "full") {
      addLog(c, `Clean break. You lose ${hunt.archenemy.name} in the traffic.`);
      hunt.stage = "resolved-run-clean";
    } else if (res.tier === "partial") {
      const wentDown = applyHarm(c);
      if (wentDown && !c.permanentInjury) resolveDownEvent(c);
      addLog(c, `You get away, but ${hunt.archenemy.name} clips you on the way out.`);
      hunt.stage = "resolved-run-hit";
    } else {
      const wentDown = applyHarm(c);
      if (wentDown && !c.permanentInjury) resolveDownEvent(c);
      if (c.gear.length && Math.random() < 0.5) {
        degradeGearItem(c, c.gear[randInt(0, c.gear.length - 1)]);
        addLog(c, "Bad break — you're hit, and the crash bangs up your gear.");
      } else {
        const loss = Math.min(c.bonds, randInt(1, 2));
        c.bonds -= loss;
        addLog(c, `Bad break — you're hit, and it costs you ${loss} BOND${loss === 1 ? "" : "S"} to smooth things over after.`);
      }
      hunt.stage = "resolved-run-bad";
    }
    persist(); render();
  });
}

function renderHuntChase(container) {
  renderHuntRoll(container, "Driving", `${G.hunt.archenemy.name} is wounded and running. Do you chase them down?`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "full") {
      hunt.wounds = 3;
      addLog(c, `You run ${hunt.archenemy.name} down and finish it.`);
      applyHuntKillReward(c);
    } else if (res.tier === "partial") {
      addLog(c, `You lose them in the chase, but the fight's over — ${hunt.archenemy.name} won't forget this.`);
      hunt.stage = "resolved-escape-win";
    } else {
      addLog(c, `${hunt.archenemy.name} gets away clean.`);
      hunt.stage = "resolved-escape-clean";
    }
    persist(); render();
  });
  // The chase-specific bail option (todo3.md HUNT: "add avoid / run to all
  // steps") — ending it clean, without rolling, rather than a Stealth/
  // Driving check that wouldn't fit "give up mid-chase".
  if (!G.hunt.pendingResult) {
    const row = document.createElement("div");
    row.className = "offer";
    const letGoBtn = document.createElement("button");
    letGoBtn.textContent = "Let Them Go";
    letGoBtn.addEventListener("click", () => {
      const c = G.character, hunt = G.hunt;
      addLog(c, `You ease off — ${hunt.archenemy.name} gets away clean.`);
      hunt.stage = "resolved-escape-clean";
      persist(); render();
    });
    row.appendChild(letGoBtn);
    container.appendChild(row);
  }
}

// One-time reward on the killing blow (todo3.md) — a free Professional-tier
// Combat item, +3 BOOST, +2 BONDS, and the Archenemy moves to the Graveyard.
function applyHuntKillReward(c) {
  const hunt = G.hunt;
  const weapon = pick(DATA.gear.Professional.filter(g => g.attr === "Combat"));
  c.gear.push({ name: weapon.name, attr: weapon.attr, tier: "Professional" });
  c.boost = Math.min(10, c.boost + 3);
  c.bonds += 2;
  addLog(c, `${hunt.archenemy.name} goes down for good. You walk away with a ${weapon.name}, a surge of BOOST, and 2 more BONDS.`);
  gainReputation(c, 2); // §19.1
  addLog(c, `Reputation +2 — "Killer of ${hunt.archenemy.name}" (now ${c.reputation}, ${reputationTitle(c)}).`);
  killPerson(c, hunt.archenemy.id);
  hunt.stage = "resolved-kill";
}

const HUNT_SUMMARY = {
  "resolved-evade": hunt => `You give ${hunt.archenemy.name} the slip. For now.`,
  "resolved-run-clean": hunt => `You put real distance between you and ${hunt.archenemy.name} tonight.`,
  "resolved-run-hit": hunt => `Banged up, but clear. ${hunt.archenemy.name} is still out there.`,
  "resolved-run-bad": hunt => `Ugly getaway, but a getaway. ${hunt.archenemy.name} is still out there.`,
  "resolved-escape-win": hunt => `You come out on top, but ${hunt.archenemy.name} slips away to lick their wounds.`,
  "resolved-escape-clean": hunt => `${hunt.archenemy.name} gets away clean. This isn't over.`,
  "resolved-kill": hunt => `${hunt.archenemy.name} won't be a problem again.`
};

function renderHuntResolution(container) {
  const hunt = G.hunt;
  const block = document.createElement("div");
  block.className = "card";
  const text = (HUNT_SUMMARY[hunt.stage] || (() => ""))(hunt);
  block.innerHTML = `<h3>${hunt.stage === "resolved-kill" ? "Archenemy Down" : "It's Over — For Now"}</h3><p class="step-desc">${text}</p>`;
  const btn = document.createElement("button");
  btn.textContent = "Return to the Street";
  btn.addEventListener("click", () => {
    G.hunt = null;
    G.phase = nextHubPhase();
    persist();
    render();
  });
  block.appendChild(btn);
  container.appendChild(block);
}

document.addEventListener("DOMContentLoaded", init);
