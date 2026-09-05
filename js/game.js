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
    G.phase = "hub";
  } else {
    G.phase = "create";
  }
  render();
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
  const gearList = c.gear.length ? c.gear.map(g => `<li>${g.name}${g.attr ? ` <em>(${g.tier || "Street"} ${g.attr})</em>` : ""}</li>`).join("") : "<li><em>none</em></li>";
  // "People" is the full recurring-cast pool, not just friendly contacts —
  // Adversaries and Targets you've crossed paths with end up here too, with
  // a negative relationship. See getPerson()/nudgeRelationship() in state.js.
  const contactList = c.contacts.map(ct => `<li>${ct.name} — ${ct.faction} (${ct.relationship >= 0 ? "+" : ""}${ct.relationship})</li>`).join("");
  const graveyardSection = c.graveyard && c.graveyard.length
    ? `<div class="section"><h3>Graveyard</h3><ul>${c.graveyard.map(p => `<li>${p.name} — ${p.faction}</li>`).join("")}</ul></div>`
    : "";
  // The permanent 12-location map (gamedesc.md §6) — fills in as you visit.
  const locationsList = Object.entries(c.locations).map(([name, loc]) => `<li>${name} ${heatBarHtml(loc.heat)}</li>`).join("");
  const injuryBadge = c.permanentInjury ? `<div class="injury-badge">⚠ Permanent Injury — needs repair</div>` : "";

  els.sheet.innerHTML = `
    <h2>${c.name}</h2>
    <div class="tag">${c.profession} / ${c.turf}</div>
    <div class="section"><h3>Health</h3><div class="hboxes">${healthRow}</div>${injuryBadge}</div>
    <div class="section"><h3>Cred</h3><div class="cred">¥${c.cred}</div></div>
    <div class="section"><h3>Attributes</h3>${attrRows}</div>
    <div class="section"><h3>Boost</h3><div class="cred">⚡${c.boost}</div></div>
    <div class="section"><h3>Gear</h3><ul>${gearList}</ul></div>
    <div class="section"><h3>People</h3><ul>${contactList}</ul></div>
    ${graveyardSection}
    <div class="section"><h3>Locations</h3><ul>${locationsList || "<li><em>none visited yet</em></li>"}</ul></div>
  `;
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
    debrief: renderDebrief
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
  jobBtn.addEventListener("click", startJob);
  wrap.appendChild(jobBtn);

  const medBtn = document.createElement("button");
  const openWounds = c.health.filter(h => h).length;
  medBtn.textContent = `Medical (¥100 / box) — ${openWounds} wound(s)`;
  // Band-aids don't touch a Permanent Injury — that needs a real repair below.
  medBtn.disabled = openWounds === 0 || c.cred < 100 || c.permanentInjury;
  medBtn.addEventListener("click", () => {
    c.cred -= 100;
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
      btn.textContent = `${r.name} — ¥${r.price}`;
      btn.title = r.flavor;
      btn.disabled = c.cred < r.price;
      btn.addEventListener("click", () => {
        c.cred -= r.price;
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
    const cost = (rank + 1) * 150;
    const btn = document.createElement("button");
    btn.textContent = `Train ${attr} (${rank} → ${Math.min(5, rank + 1)}) — ¥${cost} + 1 BOOST`;
    btn.disabled = rank >= 5 || c.cred < cost || c.boost < 1;
    btn.addEventListener("click", () => {
      c.cred -= cost;
      c.boost -= 1;
      c.attrs[attr] = Math.min(5, c.attrs[attr] + 1);
      addLog(c, `You spend BOOST training ${attr} to ${c.attrs[attr]}.`);
      persist(); render();
    });
    train.appendChild(btn);
  });
  wrap.appendChild(train);

  const reset = document.createElement("button");
  reset.className = "danger";
  reset.textContent = "Retire this Runner (new game)";
  reset.addEventListener("click", () => {
    if (confirm("Retire this runner and start a new save? This cannot be undone.")) {
      clearSave();
      G.character = null;
      G.phase = "create";
      render();
    }
  });
  wrap.appendChild(reset);

  els.main.appendChild(wrap);
}

// ---------- BRIEFING ----------
function startJob() {
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
    rerolled: false,
    encounter: { pre: { done: false }, post: { done: false }, stage: null },
    outcome: null
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
  wrap.innerHTML = `
    <h2>Mission Briefing</h2>
    <p><strong>Employer:</strong> ${employer.name} — ${employer.faction} ${employer.profession}</p>
    <p class="step-desc"><strong>Job:</strong> ${mission.type} — ${mission.flavor}</p>
    ${fieldRows}
    <p><strong>Location:</strong> ${location.name} (${location.area}${location.faction ? `, ${location.faction} turf` : ""}) — Heat ${location.heat} ${heatBarHtml(location.heat)}</p>
    <p><strong>Opposition:</strong></p><ul>${adversaryList}</ul>
    <p class="muted">Estimated payout: ¥${estimatePayout(G.job)}</p>
  `;
  const acceptBtn = document.createElement("button");
  acceptBtn.textContent = "Accept the Job";
  acceptBtn.addEventListener("click", () => { G.phase = "gearup"; persist(); render(); });
  wrap.appendChild(acceptBtn);

  const rerollBtn = document.createElement("button");
  rerollBtn.textContent = "Pass — find something else (¥20)";
  rerollBtn.disabled = G.job.rerolled || G.character.cred < 20;
  rerollBtn.addEventListener("click", () => {
    G.character.cred -= 20;
    addLog(G.character, "You pass on the job and put the word out for something else.");
    startJob();
  });
  wrap.appendChild(rerollBtn);

  els.main.appendChild(wrap);
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

function estimatePayout(job) {
  const base = 100 + job.steps.length * 50 + job.location.heat * 20;
  // Employer relationship shifts pay ±8% per point (clamped -5..5, so
  // roughly 0.6x-1.4x): work for people you're square with, get paid better.
  const relMult = 1 + (job.employer.relationship || 0) * 0.08;
  return Math.round(base * relMult);
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
  wrap.innerHTML = `<h2>Gear Up</h2><p class="muted">A fixer's got a few things on hand. Better gear gives a lasting bonus to its matching Challenge — Professional +1, Military +2 — for as long as you own it.</p>`;

  // A friendly Employer relationship also gets you a better rate from their
  // fixer, ±4% per point (clamped -5..5, so roughly 0.8x-1.2x).
  const priceMult = 1 - (job.employer.relationship || 0) * 0.04;
  job.offers.forEach(item => {
    const price = Math.max(10, Math.round(item.price * priceMult));
    const row = document.createElement("div");
    row.className = "offer";
    row.innerHTML = `<span>${item.name} <em>(${item.tier}, ${item.attr})</em></span><span>¥${price}</span>`;
    const btn = document.createElement("button");
    btn.textContent = item.bought ? "Bought" : "Buy";
    btn.disabled = c.cred < price || item.bought;
    btn.addEventListener("click", () => {
      c.cred -= price;
      c.gear.push({ name: item.name, attr: item.attr, tier: item.tier });
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
  } else {
    hireRow.innerHTML = `<span>Hire backup for this job</span><span>¥150</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Hire";
    btn.disabled = c.cred < 150;
    btn.addEventListener("click", () => {
      c.cred -= 150;
      const person = getPerson(c, "ally", job.excludeIds);
      const attr = pick(["Combat", "Driving", "Hacking", "Social", "Stealth"]);
      job.hireling = { ...person, attr };
      addLog(c, `${person.name} signs on for the job, backing you up on ${attr}.`);
      persist(); render();
    });
    hireRow.appendChild(btn);
  }
  wrap.appendChild(hireRow);

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
  job.stepResults.push({ attr: res.usedAttr, tier: res.tier });

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
      c.cred = Math.max(0, c.cred - 20);
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
    const pct = tier === "fail" ? 0.12 : 0.05;
    const min = tier === "fail" ? 25 : 10;
    const loss = Math.min(c.cred, Math.max(min, Math.round(c.cred * pct)));
    c.cred -= loss;
    addLog(c, `${pick(tier === "fail" ? DATA.credLossFlavor.fail : DATA.credLossFlavor.partial)} (-¥${loss})`);
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

  const attrs = [step.attr, step.alt].filter(Boolean);
  attrs.forEach(attr => {
    const block = document.createElement("div");
    block.className = "challenge";
    const boostOption = c.boost >= 1
      ? `<label class="boost-toggle"><input type="checkbox" class="boost-check" /> Spend 1 BOOST for +1</label>`
      : "";
    block.innerHTML = `<h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${boostOption}<div class="mods"></div>`;
    const modsEl = block.querySelector(".mods");
    const boostCheck = block.querySelector(".boost-check");

    const refreshMods = () => {
      const mods = computeModifiers(attr, boostCheck && boostCheck.checked);
      modsEl.innerHTML = mods.length
        ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
        : `<span class="chip">no modifiers</span>`;
    };
    refreshMods();
    if (boostCheck) boostCheck.addEventListener("change", refreshMods);

    const rollBtn = document.createElement("button");
    rollBtn.textContent = `Roll ${attr}`;
    rollBtn.addEventListener("click", () => {
      const spendBoost = !!(boostCheck && boostCheck.checked);
      const mods = computeModifiers(attr, spendBoost);
      if (spendBoost) c.boost -= 1;
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

function computeModifiers(attr, spendBoost) {
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

  let outcome, mult;
  if (isDown(c)) { outcome = "Failure"; mult = 0.1; }
  else if (ratio >= 0.85) { outcome = "Full Success"; mult = 1; }
  else if (ratio >= 0.4) { outcome = "Partial Success"; mult = 0.6; }
  else { outcome = "Failure"; mult = 0.2; }

  const payout = Math.round(estimatePayout(job) * mult);
  c.cred += payout;

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

  decayOtherLocations(c, job.location.name);

  job.outcome = outcome;
  job.payout = payout;
  addLog(c, `Job complete: ${outcome}. Paid ¥${payout} by ${job.employer.name}.`);
  persist();
}

function renderDebrief() {
  const job = G.job;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Debrief — ${job.outcome}</h2>
    <p>Employer: ${job.employer.name}</p>
    <p>Payout: ¥${job.payout}</p>
    <p class="muted">${job.stepResults.filter(r => r.tier === "full").length} full, ${job.stepResults.filter(r => r.tier === "partial").length} partial, ${job.stepResults.filter(r => r.tier === "fail").length} failed steps.</p>
  `;
  const btn = document.createElement("button");
  btn.textContent = "Return to the Street";
  btn.addEventListener("click", () => {
    G.job = null;
    G.phase = "hub";
    persist();
    render();
  });
  wrap.appendChild(btn);
  els.main.appendChild(wrap);
}

document.addEventListener("DOMContentLoaded", init);
