// game.js — phase state machine + rendering, per gamedesc.md §3 (Job phases)
// and §9 (App Architecture Notes).

const G = {
  character: null,
  job: null,
  phase: "create"
};

const els = {
  sheet: document.getElementById("sheet"),
  main: document.getElementById("main"),
  factions: document.getElementById("factions")
};

function init() {
  const loaded = load();
  if (loaded) {
    G.character = loaded;
    G.phase = checkWinCondition() ? "win" : "hub";
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

function persist() {
  if (G.character) save(G.character);
}

function render() {
  renderSheet();
  renderMain();
  renderFactions();
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
function renderFactions() {
  els.factions.innerHTML = "";
  if (!G.character) return;
  const standings = G.character.factionStandings;
  const types = ["Corpo", "Gang", "Nomad", "Authority"];
  const html = types.map(type => {
    const rows = DATA.factions.filter(f => f.type === type).map(f => {
      const s = standings[f.name] || { wealth: 0, rnd: 0, power: 0 };
      return `<li class="faction-row"><span>${f.name}</span><span class="faction-stats">
        <em title="Wealth">¥${s.wealth}</em><em title="R&D">🔬${s.rnd}</em><em title="Power">⚔${s.power}</em>
      </span></li>`;
    }).join("");
    return `<div class="section"><h3>${type}</h3><ul>${rows}</ul></div>`;
  }).join("");
  els.factions.innerHTML = `<h2>Factions</h2>${html}`;
}

function renderSheet() {
  const c = G.character;
  if (!c) { els.sheet.innerHTML = ""; return; }
  const attrRows = Object.entries(c.attrs).map(([k, v]) => `<div class="stat"><span>${k}</span><span>${v}</span></div>`).join("");
  const healthRow = c.health.map(h => `<span class="hbox ${h ? "hurt" : ""}"></span>`).join("");
  const gearList = c.gear.length ? c.gear.map(g => `<li>${g.name} <em>(${g.tier || "Street"}${g.attr ? ` ${g.attr}` : g.heal ? " heal" : ""})</em></li>`).join("") : "<li><em>none</em></li>";
  // "People" is the full recurring-cast pool, not just friendly contacts —
  // Adversaries and Targets you've crossed paths with end up here too, with
  // a negative relationship. See getPerson()/nudgeRelationship() in state.js.
  // A contact tagged Archenemy gets a Hunt button (only from the Hub — a
  // Hunt shouldn't interrupt whatever job phase is in progress); a
  // BLOODBROTHER gets its own badge. Both tags are mutually exclusive
  // (tagArchenemy/tagBloodbrother in state.js).
  const contactList = c.contacts.map(ct => {
    let tag = "";
    if (ct.archenemy) {
      const huntBtn = G.phase === "hub" ? `<button class="btn-small hunt-btn" data-hunt-id="${ct.id}">Hunt</button>` : "";
      tag = ` <span class="archenemy-badge">⚠ Archenemy</span>${huntBtn}`;
    } else if (ct.bloodbrother) {
      tag = ` <span class="bloodbrother-badge">🩸 Bloodbrother</span>`;
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
    steps: renderSteps,
    debrief: renderDebrief,
    hunt: renderHunt,
    win: renderWin
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
  jobBtn.addEventListener("click", () => startJob());
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

  const train = document.createElement("div");
  train.className = "section";
  train.innerHTML = "<h3>Training</h3>";
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
    train.appendChild(btn);
  });
  wrap.appendChild(train);

  // Sell Gear (todo3.md Items) — 2 Street items = 1 BOND, 1 Professional/
  // Military item = 1 BOND; a Fixer contact at relationship ≥3 adds +1
  // BOND per completed sale. Street items bank one at a time
  // (character.pendingSaleItem) until a second one pairs with it.
  if (c.gear.length) {
    const sellSection = document.createElement("div");
    sellSection.className = "section";
    const hasFixerDeal = c.contacts.some(p => p.profession === "Fixer" && p.relationship >= 3);
    const bankNote = c.pendingSaleItem ? `<p class="muted">Banked: ${c.pendingSaleItem} — sell one more Street item to cash in.</p>` : "";
    sellSection.innerHTML = `<h3>Sell Gear</h3><p class="muted">2 Street items = 1 BOND. 1 Professional/Military item = 1 BOND.${hasFixerDeal ? " Your fixer kicks in +1 BOND per sale." : ""}</p>${bankNote}`;
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
    wrap.appendChild(sellSection);
  }

  els.main.appendChild(wrap);
}

function sellGearItem(idx) {
  const c = G.character;
  const item = c.gear[idx];
  if (!item) return;
  const bonusPerSale = c.contacts.some(p => p.profession === "Fixer" && p.relationship >= 3) ? 1 : 0;
  c.gear.splice(idx, 1);
  if (item.tier === "Professional" || item.tier === "Military") {
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

// ---------- BRIEFING ----------
// alreadyRerolled carries forward across a Pass (gamedesc.md §3.1: reroll
// once per Job search) — a fresh "Find a Job" from the Hub always starts at
// false, but the job a Pass lands on inherits true so a second Pass is blocked.
function startJob(alreadyRerolled) {
  const c = G.character;
  const fullLoc = resolveLocation(c, genLocationDef());
  const excludeIds = new Set(); // keeps this job from casting one person into two roles
  const employer = getPerson(c, "ally", excludeIds);
  const mission = genMission(fullLoc, c, excludeIds);
  G.job = {
    employer,
    mission,
    excludeIds,
    location: fullLoc,
    steps: buildStepSequence(mission),
    stepIndex: 0,
    stepResults: [],
    hireling: null,
    pendingResult: null,
    rerolled: !!alreadyRerolled,
    encounter: { pre: { done: false }, post: { done: false }, stage: null },
    outcome: null,
    ally: null, // relationship-recruited backup (todo3.md Persons) — see renderGearUp
    sideObjective: null, // "more BONDS" side job (todo3.md ADD) — see takeSideJob
    restStage: null // mid-roll marker for the Rest sub-flows (night/brothernight/brotherfight)
  };
  addLog(c, `A job comes in from ${employer.name} (${employer.faction}, ${employer.profession}): ${mission.flavor}`);
  G.phase = "briefing";
  persist();
  render();
}

function renderBriefing() {
  const { employer, mission, location } = G.job;
  const wrap = document.createElement("div");
  wrap.className = "card";
  const adversaryList = mission.adversaries.map(a => `<li>${a.name} — ${a.profession} (${a.tier})</li>`).join("");
  const fieldRows = missionFieldRows(mission);
  const payout = estimatePayout(G.job);
  const sideRow = G.job.sideObjective
    ? `<p><strong>Side job:</strong> ${G.job.sideObjective.type} — ${G.job.sideObjective.target.name} (+2 BONDS if it goes clean)</p>`
    : "";
  wrap.innerHTML = `
    <h2>Mission Briefing</h2>
    <p><strong>Employer:</strong> ${employer.name} — ${employer.faction} ${employer.profession}</p>
    <p class="step-desc"><strong>Job:</strong> ${mission.type} — ${mission.flavor}<br><strong>Payout:</strong> ${payout} BOND${payout === 1 ? "" : "S"}</p>
    ${fieldRows}
    ${sideRow}
    <p><strong>Location:</strong> ${location.name} (${location.area}${location.faction ? `, ${location.faction} turf` : ""}) — Heat ${location.heat} ${heatBarHtml(location.heat)}</p>
    <p><strong>Opposition:</strong></p><ul>${adversaryList}</ul>
  `;
  els.main.appendChild(wrap);

  // Mid-roll on a Rest sub-flow (Night on the Street / Spend the Night /
  // the street fight that can follow it) — show the Challenge UI in place
  // of the accept/rest buttons until it resolves.
  if (G.job.restStage) {
    renderRestSubflow(wrap);
    return;
  }

  const acceptBtn = document.createElement("button");
  acceptBtn.textContent = "Accept the Job";
  acceptBtn.addEventListener("click", () => { G.phase = "gearup"; persist(); render(); });
  wrap.appendChild(acceptBtn);

  if (!G.job.sideObjective) {
    const sideBtn = document.createElement("button");
    sideBtn.textContent = "Take on a side job (+2 BONDS)";
    sideBtn.addEventListener("click", () => takeSideJob());
    wrap.appendChild(sideBtn);
  }

  // Rest replaces the old Pass reroll (todo3.md) — Coffin Hotel keeps the
  // once-per-search gate Pass used; Night on the Street (and Spend the
  // Night, with a BLOODBROTHER) are always available (todo3.md ADD).
  const restBtn = document.createElement("button");
  restBtn.textContent = "Rest in Comfy Coffin Hotel (1 BOND)";
  restBtn.disabled = G.job.rerolled || G.character.bonds < 1;
  restBtn.addEventListener("click", () => restCoffinHotel());
  wrap.appendChild(restBtn);

  const nightBtn = document.createElement("button");
  nightBtn.textContent = "Night on the Street (Free)";
  nightBtn.addEventListener("click", () => { G.job.restStage = "night"; persist(); render(); });
  wrap.appendChild(nightBtn);

  const bb = findBloodbrother(G.character);
  if (bb) {
    const brotherBtn = document.createElement("button");
    brotherBtn.textContent = `Spend the Night with ${bb.name} (Free)`;
    brotherBtn.addEventListener("click", () => { G.job.restStage = "brothernight"; persist(); render(); });
    wrap.appendChild(brotherBtn);
  }

  const restNote = document.createElement("p");
  restNote.className = "muted";
  restNote.textContent = "Resting finds you a different job — the Coffin Hotel might also patch you up.";
  wrap.appendChild(restNote);
}

// Dispatches the three Rest sub-flows that borrow the Briefing's job object
// for a quick Challenge roll (todo3.md ADD/Persons).
function renderRestSubflow(container) {
  const stage = G.job.restStage;
  if (stage === "night") {
    const w = document.createElement("div");
    w.innerHTML = `<h4>Where do you lay low tonight?</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Combat", alt: "Social", desc: "Where do you lay low tonight?" }, finishNightOnStreet);
  } else if (stage === "brothernight") {
    const bb = findBloodbrother(G.character);
    const w = document.createElement("div");
    w.innerHTML = `<h4>A night with ${bb ? bb.name : "your Bloodbrother"}.</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Social", desc: "Spend the night." }, finishBrotherNight);
  } else if (stage === "brotherfight") {
    const w = document.createElement("div");
    w.innerHTML = `<h4>It goes sideways — a street fight breaks out.</h4>`;
    container.appendChild(w);
    renderChallenge(w, { attr: "Combat", desc: "Fight your way clear." }, finishBrotherFight);
  }
}

// "More BONDS" side objective (todo3.md ADD) — folds a second Heist or
// Assassination target into the job for +2 BONDS. Drops the shared first
// "approach" step ("remove overlapping challenges like stealth to same
// premises") and appends the type's other two steps instead.
function takeSideJob() {
  const c = G.character, job = G.job;
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
  const job = G.job;
  const res = job.lastResult;
  const flavor = res.usedAttr === "Combat" ? "a tough street night" : "talking your way into a shelter";
  if (res.tier === "full") {
    healBox(c);
    addLog(c, `You get through ${flavor} — and actually catch some real rest.`);
  } else if (res.tier === "fail") {
    const wentDown = markHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
    addLog(c, `It's ${flavor}, and it costs you — you catch a hit out there.`);
  } else {
    addLog(c, `It's ${flavor}. You get by, nothing more.`);
  }
  job.pendingResult = null;
  job.restStage = null;
  processRestTick();
}

// BLOODBROTHER "Spend the Night" (todo3.md Persons) — its own three-tier
// Social table, distinct from Night on the Street's.
function finishBrotherNight() {
  const c = G.character;
  const job = G.job;
  const res = job.lastResult;
  const bb = findBloodbrother(c);
  job.pendingResult = null;
  if (res.tier === "full") {
    if (bb) nudgeRelationship(c, bb.id, 1);
    grantBloodbrotherGift(c);
    job.restStage = null;
    processRestTick();
  } else if (res.tier === "partial") {
    healBox(c);
    if (c.boost > 0) { c.boost -= 1; addLog(c, "Hungover — that BOOST is gone, but at least you're patched up."); }
    else addLog(c, "Hungover, but at least you're patched up.");
    job.restStage = null;
    processRestTick();
  } else {
    addLog(c, `It goes sideways fast — you and ${bb ? bb.name : "your Bloodbrother"} end up in a street fight.`);
    job.restStage = "brotherfight";
    persist();
    render();
  }
}

// The 6- branch's nested Combat roll against the BLOODBROTHER's faction.
function finishBrotherFight() {
  const c = G.character;
  const job = G.job;
  const res = job.lastResult;
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
    const wentDown = markHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
    addLog(c, "You catch a bad one in the scuffle.");
  }
  job.pendingResult = null;
  job.restStage = null;
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
function processRestTick() {
  const c = G.character;
  c.restCount++;
  if (c.restCount === 1) lockInArchenemy(c);
  if (c.restCount >= 4) {
    c.restCount = 0;
    G.job = null;
    persist();
    startHunt();
    return;
  }
  startJob(true);
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
function estimatePayout(job) {
  let payout = 1 + (job.mission.difficulty || 1);
  const rel = job.employer.relationship || 0;
  if (rel >= 3) payout += 1;
  else if (rel <= -3) payout = Math.max(1, payout - 1);
  return payout;
}

// A small 5-segment Heat indicator, e.g. for Briefing and the Locations
// sidebar list.
function heatBarHtml(heat) {
  const segs = Array.from({ length: 5 }, (_, i) => `<span class="heatseg${i < heat ? " filled" : ""}"></span>`).join("");
  return `<span class="heatbar">${segs}</span>`;
}

// ---------- GEAR UP ----------
function renderGearUp() {
  const c = G.character;
  const job = G.job;
  if (!job.offers) job.offers = genGearOffers(3);

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Gear Up</h2><p class="muted">A fixer's got a few things on hand. Price is tied to quality — Street 1 BOND (+1), Professional 2 BONDS (+2), Military 3 BONDS (+3) — for as long as you own it.</p>`;

  job.offers.forEach(item => {
    const price = item.price;
    const row = document.createElement("div");
    row.className = "offer";
    const kind = item.attr ? item.attr : "heal";
    row.innerHTML = `<span>${item.name} <em>(${item.tier}, ${kind})</em></span><span>${price} BOND${price === 1 ? "" : "S"}</span>`;
    const btn = document.createElement("button");
    btn.textContent = item.bought ? "Bought" : "Buy";
    btn.disabled = c.bonds < price || item.bought;
    btn.addEventListener("click", () => {
      c.bonds -= price;
      c.gear.push({ name: item.name, attr: item.attr, heal: item.heal, tier: item.tier });
      item.bought = true;
      addLog(c, `You pick up a ${item.name} for the job — yours to keep.`);
      persist(); render();
    });
    row.appendChild(btn);
    wrap.appendChild(row);
  });

  const hireRow = document.createElement("div");
  hireRow.className = "offer";
  if (job.hireling) {
    hireRow.innerHTML = `<span>Hired: ${job.hireling.name} (+1 ${job.hireling.attr})</span>`;
    wrap.appendChild(hireRow);
  } else if (!job.ally) {
    hireRow.innerHTML = `<span>Hire backup for this job</span><span>1 BOND</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Hire";
    btn.disabled = c.bonds < 1;
    btn.addEventListener("click", () => {
      c.bonds -= 1;
      const person = getPerson(c, "ally", job.excludeIds);
      const attr = pick(["Combat", "Driving", "Hacking", "Social", "Stealth"]);
      job.hireling = { ...person, attr };
      addLog(c, `${person.name} signs on for the job, backing you up on ${attr}.`);
      persist(); render();
    });
    hireRow.appendChild(btn);
    wrap.appendChild(hireRow);
  }

  // Ally recruitment (todo3.md Persons) — call in a favor from a contact
  // you're square with (relationship ≥3) instead of hiring a stranger.
  // Shares the same backup slot as the random Hireling above.
  if (job.ally) {
    const allyRow = document.createElement("div");
    allyRow.className = "offer";
    allyRow.innerHTML = `<span>Bringing along: ${job.ally.person.name} (+2 to one test of your choice)</span>`;
    wrap.appendChild(allyRow);
  } else if (!job.hireling) {
    const eligible = c.contacts.filter(p => p.relationship >= 3 && !p.archenemy);
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
          job.ally = { person, tier: free ? 5 : 3, used: false };
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

function advanceFromGearUp() {
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
      G.phase = "debrief";
      runDebrief();
    }
    persist();
    render();
  });
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
    G.phase = maybeTriggerEncounter("post") ? "encounter" : "debrief";
    if (G.phase === "debrief") runDebrief();
  }
  persist();
  render();
}

// A failed/partial check no longer always means Harm (todo2.md) — each
// Challenge type has a weighted table of what actually goes wrong
// (DATA.failOutcomes), and the tier (partial vs fail) sets how bad it is.
function applyOutcome(c, job, attr, tier) {
  const table = DATA.complications[attr];
  if (tier === "full") {
    addLog(c, `Full success on ${attr}.`);
    return;
  }
  const text = tier === "partial" ? pick(table.partial) : pick(table.fail);
  addLog(c, text);

  const loc = c.locations[job.location.name];
  let effect = pickWeighted(DATA.failOutcomes[attr]);
  if (effect === "gearDamage" && tier === "fail" && c.gear.length === 0) effect = "credLoss";

  if (effect === "harm") {
    const wentDown = markHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
    if (attr === "Combat" && tier === "fail" && loc) loc.heat = Math.min(5, loc.heat + 1);
  } else if (effect === "gearDamage") {
    if (tier === "partial") {
      c.bonds = Math.max(0, c.bonds - 1);
      addLog(c, pick(DATA.gearDamageFlavor.partial));
    } else {
      const matching = c.gear.filter(g => g.attr === attr);
      const pool = matching.length ? matching : c.gear;
      const idx = c.gear.indexOf(pick(pool));
      const [lost] = c.gear.splice(idx, 1);
      addLog(c, `${pick(DATA.gearDamageFlavor.fail)} (lost: ${lost.name})`);
    }
  } else if (effect === "heat") {
    if (loc) loc.heat = Math.min(5, loc.heat + (tier === "fail" ? 2 : 1));
  } else if (effect === "relationship") {
    nudgeRelationship(c, job.employer.id, tier === "fail" ? -2 : -1);
  } else if (effect === "credLoss") {
    const loss = Math.min(c.bonds, tier === "fail" ? 2 : 1);
    c.bonds -= loss;
    addLog(c, `${pick(tier === "fail" ? DATA.credLossFlavor.fail : DATA.credLossFlavor.partial)} (-${loss} BOND${loss === 1 ? "" : "S"})`);
  }
}

// ---------- Shared Challenge UI (roll block, used by steps + encounters) ----------
function renderChallenge(container, step, onContinue) {
  const c = G.character;
  const job = G.job;

  if (job.pendingResult) {
    renderResultBlock(container, job.pendingResult, onContinue);
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
    // Ally Assist (todo3.md Persons) — a recruited contact's one-time +2 to
    // a single test, consumed on the roll it's checked for.
    const allyOption = job.ally && !job.ally.used
      ? `<label class="boost-toggle"><input type="checkbox" class="ally-check" /> ${job.ally.person.name}: +2 to this roll</label>`
      : "";
    block.innerHTML = `<h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${boostOption}${allyOption}<div class="mods"></div>`;
    const modsEl = block.querySelector(".mods");
    const boostCheck = block.querySelector(".boost-check");
    const allyCheck = block.querySelector(".ally-check");

    const refreshMods = () => {
      const mods = computeModifiers(attr, boostCheck && boostCheck.checked, allyCheck && allyCheck.checked);
      modsEl.innerHTML = mods.length
        ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
        : `<span class="chip">no modifiers</span>`;
    };
    refreshMods();
    if (boostCheck) boostCheck.addEventListener("change", refreshMods);
    if (allyCheck) allyCheck.addEventListener("change", refreshMods);

    const rollBtn = document.createElement("button");
    rollBtn.textContent = `Roll ${attr}`;
    rollBtn.addEventListener("click", () => {
      const spendBoost = !!(boostCheck && boostCheck.checked);
      const spendAlly = !!(allyCheck && allyCheck.checked);
      const mods = computeModifiers(attr, spendBoost, spendAlly);
      if (spendBoost) c.boost -= 1;
      if (spendAlly) job.ally.used = true;
      const result = resolve(c.attrs[attr], mods);
      result.usedAttr = attr;
      step.usedAttr = attr;
      job.pendingResult = result;
      job.lastResult = result;
      persist();
      render();
    });
    block.appendChild(rollBtn);
    container.appendChild(block);
  });
}

function attrAvailable(c, job, attr) {
  if (attr === "Hacking") return ownsGearForAttr(c, "Hacking");
  if (attr === "Driving" && job.mission && job.mission.type === "Transport" && job.mission.difficulty >= 2) {
    const rural = job.location.area === "Rural" || (job.mission.fromLocation && job.mission.fromLocation.area === "Rural");
    if (rural) return ownsGearForAttr(c, "Driving");
  }
  return true;
}

function computeModifiers(attr, spendBoost, spendAlly) {
  const c = G.character, job = G.job;
  const mods = [];
  const gearBonus = bestGearBonus(c, attr);
  if (gearBonus) mods.push({ label: gearBonus.name, value: gearBonus.bonus });
  if (job.hireling && job.hireling.attr === attr) mods.push({ label: `Hireling`, value: 1 });
  if ((attr === "Combat" || attr === "Stealth") && job.location.heat >= 4) mods.push({ label: "Heat", value: -1 });
  if ((attr === "Combat" || attr === "Stealth") && job.mission.worstTier) {
    const p = tierPenalty(job.mission.worstTier);
    if (p) mods.push({ label: `Adversary (${job.mission.worstTier})`, value: p });
  }
  if (spendBoost) mods.push({ label: "Boost", value: 1 });
  if (spendAlly && job.ally) mods.push({ label: job.ally.person.name, value: 2 });
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

  const payout = Math.round(estimatePayout(job) * mult);
  c.bonds += payout;
  let totalPayout = payout; // tracks ally fees / side-objective bonus for the Debrief display

  // BOOST grows with full successes, replacing the old per-track Rep gain.
  const boostGained = job.stepResults.filter(r => r.tier === "full").length;
  if (boostGained > 0 && c.boost < 10) {
    c.boost = Math.min(10, c.boost + boostGained);
    addLog(c, `That clean work earns you ${boostGained} BOOST (now ${c.boost}).`);
  }

  const relDelta = outcome === "Full Success" ? 1 : outcome === "Partial Success" ? 0 : -1;
  nudgeRelationship(c, job.employer.id, relDelta);

  // Faction system (todo2.md): a completed job moves the parameter tied to
  // its asset (or "power" for a hit) — employer's faction gains, the
  // target's loses. If the job was ever noticed (Heat rose during the run),
  // tension between employer and target factions rises too.
  if (outcome !== "Failure") {
    const param = job.mission.type === "Assassination" ? "power" : job.mission.assetType;
    if (param) {
      adjustFactionParam(c, job.employer.faction, param, 1);
      if (job.mission.target && job.mission.target.faction !== job.employer.faction) {
        adjustFactionParam(c, job.mission.target.faction, param, -1);
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
      nudgeRelationship(c, job.mission.target.id, 1);
    }
  }

  if (job.hireling) {
    nudgeRelationship(c, job.hireling.id, outcome === "Failure" ? -1 : 1);
  }

  // Ally recruitment resolution (todo3.md Persons).
  if (job.ally) {
    if (outcome !== "Failure") {
      nudgeRelationship(c, job.ally.person.id, 1);
      if (job.ally.tier === 3) {
        const fee = Math.min(c.bonds, 1);
        c.bonds -= fee;
        totalPayout -= fee;
        addLog(c, `${job.ally.person.name} takes ${fee} BOND off the top for the help.`);
      } else {
        tagBloodbrother(c, job.ally.person);
        addLog(c, `${job.ally.person.name} watches your back, no questions asked. You're blood now.`);
      }
    } else {
      nudgeRelationship(c, job.ally.person.id, -2);
    }
  }

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
    G.phase = checkWinCondition() ? "win" : "hub";
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
    chase: renderHuntChase
  };
  (stageFns[hunt.stage] || renderHuntResolution)(wrap);
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
  renderHuntRoll(container, "Social", "Something's off tonight. Do you notice the ambush coming?", 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "fail") {
      addLog(c, `You don't see it coming. ${hunt.archenemy.name} is already on you.`);
      hunt.stage = "combat";
    } else {
      hunt.combatBonus = res.tier === "full" ? 2 : 0;
      addLog(c, res.tier === "full"
        ? `You clock them a beat before they move — you've got the opening if you want it.`
        : `You catch it just in time to have options.`);
      hunt.stage = "choice";
    }
    persist(); render();
  });
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
      addLog(c, `You find them first and get the drop.`);
      hunt.stage = "combat";
    } else if (res.tier === "partial") {
      addLog(c, `You track them down. No surprises either way.`);
      hunt.stage = "choice";
    } else {
      addLog(c, `They clock you before you clock them.`);
      const wentDown = markHarm(c);
      if (wentDown && !c.permanentInjury) resolveDownEvent(c);
      hunt.stage = "choice";
    }
    persist(); render();
  });
}

function renderHuntChoice(container) {
  const hunt = G.hunt;
  const block = document.createElement("div");
  block.className = "challenge";
  block.innerHTML = `<p class="step-desc">Avoid them, or meet them head-on${hunt.combatBonus ? ` (+${hunt.combatBonus} if you fight)` : ""}?</p>`;
  container.appendChild(block);

  const avoidBtn = document.createElement("button");
  avoidBtn.textContent = "Avoid (Stealth)";
  avoidBtn.addEventListener("click", () => { hunt.stage = "avoid"; persist(); render(); });
  block.appendChild(avoidBtn);

  const fightBtn = document.createElement("button");
  fightBtn.textContent = "Fight";
  fightBtn.addEventListener("click", () => { hunt.stage = "combat"; persist(); render(); });
  block.appendChild(fightBtn);
}

function renderHuntAvoid(container) {
  renderHuntRoll(container, "Stealth", "Slip past them before they close the distance.", 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "fail") {
      addLog(c, `No good — they're on you. Fight's here whether you like it or not.`);
      hunt.stage = "combat";
    } else {
      addLog(c, `You slide out of sight. Not tonight.`);
      hunt.stage = "resolved-evade";
    }
    persist(); render();
  });
}

// A light, existing-style Combat-fail consequence for a whiffed Attack roll
// — reuses the normal weighted fallout table rather than new bespoke text.
function applyHuntCombatFailFallout(c) {
  const effect = pickWeighted(DATA.failOutcomes.Combat);
  if (effect === "harm" || (effect === "gearDamage" && c.gear.length === 0)) {
    const wentDown = markHarm(c);
    if (wentDown && !c.permanentInjury) resolveDownEvent(c);
  } else if (effect === "gearDamage") {
    const idx = randInt(0, c.gear.length - 1);
    const [lost] = c.gear.splice(idx, 1);
    addLog(c, `${pick(DATA.gearDamageFlavor.fail)} (lost: ${lost.name})`);
  } else if (effect === "credLoss" && c.bonds > 0) {
    c.bonds -= 1;
    addLog(c, `${pick(DATA.credLossFlavor.fail)} (-1 BOND)`);
  }
}

function renderHuntCombat(container) {
  const hunt = G.hunt;

  if (hunt.combatChoice === "attack") {
    renderHuntRoll(container, "Combat", `Wounds landed: ${hunt.wounds}/3.`, hunt.combatBonus, (res) => {
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

  if (hunt.combatChoice === "run") {
    renderHuntRoll(container, "Driving", "Gun it and try to lose them.", 0, (res) => {
      const c = G.character;
      hunt.combatChoice = null;
      if (res.tier === "full") {
        addLog(c, "Clean break. You lose them in the traffic.");
        hunt.stage = "resolved-run-clean";
      } else if (res.tier === "partial") {
        const wentDown = markHarm(c);
        if (wentDown && !c.permanentInjury) resolveDownEvent(c);
        addLog(c, "You get away, but they clip you on the way out.");
        hunt.stage = "resolved-run-hit";
      } else {
        const wentDown = markHarm(c);
        if (wentDown && !c.permanentInjury) resolveDownEvent(c);
        if (c.gear.length && Math.random() < 0.5) {
          const idx = randInt(0, c.gear.length - 1);
          const [lost] = c.gear.splice(idx, 1);
          addLog(c, `Bad break — you're hit, and ${lost.name} goes flying in the crash.`);
        } else {
          const loss = Math.min(c.bonds, randInt(1, 2));
          c.bonds -= loss;
          addLog(c, `Bad break — you're hit, and it costs you ${loss} BOND${loss === 1 ? "" : "S"} to smooth things over after.`);
        }
        hunt.stage = "resolved-run-bad";
      }
      persist(); render();
    });
    return;
  }

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
}

function renderHuntChase(container) {
  renderHuntRoll(container, "Driving", `${G.hunt.archenemy.name} is wounded and running. Do you chase them down?`, 0, (res) => {
    const c = G.character, hunt = G.hunt;
    if (res.tier === "full") {
      hunt.wounds = 3;
      addLog(c, `You run them down and finish it.`);
      applyHuntKillReward(c);
    } else if (res.tier === "partial") {
      addLog(c, `You lose them in the chase, but the fight's over — ${hunt.archenemy.name} won't forget this.`);
      hunt.stage = "resolved-escape-win";
    } else {
      addLog(c, `They get away clean.`);
      hunt.stage = "resolved-escape-clean";
    }
    persist(); render();
  });
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
    G.phase = checkWinCondition() ? "win" : "hub";
    persist();
    render();
  });
  block.appendChild(btn);
  container.appendChild(block);
}

document.addEventListener("DOMContentLoaded", init);
