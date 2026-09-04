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
  log: document.getElementById("log")
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
  renderLog();
}

function renderLog() {
  els.log.innerHTML = "";
  if (!G.character) return;
  G.character.log.forEach(line => {
    const p = document.createElement("div");
    p.className = "log-line";
    p.textContent = line;
    els.log.appendChild(p);
  });
  els.log.scrollTop = els.log.scrollHeight;
}

function renderSheet() {
  const c = G.character;
  if (!c) { els.sheet.innerHTML = ""; return; }
  const attrRows = Object.entries(c.attrs).map(([k, v]) => `<div class="stat"><span>${k}</span><span>${v}</span></div>`).join("");
  const repRows = Object.entries(c.rep).map(([k, v]) => `<div class="stat"><span>${k} Rep</span><span>${"★".repeat(v)}${"☆".repeat(5 - v)}</span></div>`).join("");
  const healthRow = c.health.map(h => `<span class="hbox ${h ? "hurt" : ""}"></span>`).join("");
  const gearList = c.gear.length ? c.gear.map(g => `<li>${g.name}${g.attr ? ` <em>(${g.attr})</em>` : ""}</li>`).join("") : "<li><em>none</em></li>";
  const contactList = c.contacts.map(ct => `<li>${ct.name} — ${ct.faction} (${ct.relationship >= 0 ? "+" : ""}${ct.relationship})</li>`).join("");

  els.sheet.innerHTML = `
    <h2>${c.name}</h2>
    <div class="tag">${c.profession} / ${c.turf}</div>
    <div class="section"><h3>Health</h3><div class="hboxes">${healthRow}</div></div>
    <div class="section"><h3>Cred</h3><div class="cred">¥${c.cred}</div></div>
    <div class="section"><h3>Attributes</h3>${attrRows}</div>
    <div class="section"><h3>Rep</h3>${repRows}</div>
    <div class="section"><h3>Gear</h3><ul>${gearList}</ul></div>
    <div class="section"><h3>Contacts</h3><ul>${contactList}</ul></div>
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
  medBtn.disabled = openWounds === 0 || c.cred < 100;
  medBtn.addEventListener("click", () => {
    c.cred -= 100;
    healBox(c);
    addLog(c, "You get patched up at a ripperdoc's clinic.");
    persist(); render();
  });
  wrap.appendChild(medBtn);

  const train = document.createElement("div");
  train.className = "section";
  train.innerHTML = "<h3>Training</h3>";
  Object.entries(c.attrs).forEach(([attr, rank]) => {
    const cost = (rank + 1) * 150;
    const repAvailable = Object.values(c.rep).some(v => v > 0);
    const btn = document.createElement("button");
    btn.textContent = `Train ${attr} (${rank} → ${Math.min(5, rank + 1)}) — ¥${cost} + 1 Rep`;
    btn.disabled = rank >= 5 || c.cred < cost || !repAvailable;
    btn.addEventListener("click", () => {
      c.cred -= cost;
      const track = Object.entries(c.rep).sort((a, b) => b[1] - a[1])[0][0];
      c.rep[track] = Math.max(0, c.rep[track] - 1);
      c.attrs[attr] = Math.min(5, c.attrs[attr] + 1);
      addLog(c, `You call in favors on your ${track} Rep to train ${attr} to ${c.attrs[attr]}.`);
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
  const loc = genLocation();
  const persisted = rememberLocation(c, loc);
  const fullLoc = { name: loc.name, area: persisted.area, faction: persisted.faction, heat: persisted.heat };
  const mission = genMission(fullLoc);
  const employer = genPerson();
  G.job = {
    employer,
    mission,
    location: fullLoc,
    steps: buildStepSequence(mission),
    stepIndex: 0,
    stepResults: [],
    repStyleFullSuccess: { Gun: false, Knife: false, Car: false },
    prep: {},
    hireling: null,
    pendingResult: null,
    signatureUsed: false,
    rerolled: false,
    encounter: { pre: { done: false }, post: { done: false }, stage: null },
    outcome: null
  };
  addLog(c, `A job comes in from ${employer.name} (${employer.faction.name}, ${employer.profession}): ${mission.flavor}`);
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
    <p><strong>Employer:</strong> ${employer.name} — ${employer.faction.name} ${employer.profession}</p>
    <p><strong>Job:</strong> ${mission.type} — ${mission.flavor}</p>
    ${fieldRows}
    <p><strong>Location:</strong> ${location.name} (${location.area}${location.faction ? `, ${location.faction.name} turf` : ""}) — Heat ${location.heat}</p>
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
  switch (mission.type) {
    case "Assassination":
    case "Heist":
      return `<p><strong>Target:</strong> ${mission.target.name} (${mission.target.profession}, ${mission.target.faction.name})</p>`;
    case "Transport":
      return `<p><strong>Cargo:</strong> ${mission.target.name}</p>`;
    case "Delay":
    case "Hold":
      return `<p><strong>Time:</strong> ${["Short", "Medium", "Long"][mission.timePeriod - 1]} (${mission.timePeriod} rounds)</p>`;
    default:
      return "";
  }
}

function estimatePayout(job) {
  return 100 + job.steps.length * 50 + job.location.heat * 20;
}

// ---------- GEAR UP ----------
function renderGearUp() {
  const c = G.character;
  const job = G.job;
  if (!job.offers) job.offers = genGearOffers(3);

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h2>Gear Up</h2><p class="muted">A fixer's got a few things on hand. Buying the right tool preps a matching Challenge (+1).</p>`;

  job.offers.forEach(item => {
    const row = document.createElement("div");
    row.className = "offer";
    row.innerHTML = `<span>${item.name} <em>(${item.tier}, ${item.attr})</em></span><span>¥${item.price}</span>`;
    const btn = document.createElement("button");
    btn.textContent = item.bought ? "Bought" : "Buy";
    btn.disabled = c.cred < item.price || item.bought;
    btn.addEventListener("click", () => {
      c.cred -= item.price;
      c.gear.push({ name: item.name, attr: item.attr });
      job.prep[item.attr] = true;
      item.bought = true;
      addLog(c, `You pick up a ${item.name} for the job.`);
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
      const person = genPerson();
      const attr = pick(["Combat", "Driving", "Hacking", "Social", "Stealth"]);
      job.hireling = { name: person.name, attr };
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
  wrap.innerHTML = `<h2>Encounter</h2><p>${job.encounter.step.desc}</p>`;
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
  wrap.innerHTML = `<h2>${job.mission.type} — Step ${job.stepIndex + 1}/${job.steps.length}</h2><p>${step.desc}</p>`;
  els.main.appendChild(wrap);
  renderChallenge(wrap, step, () => finalizeStep(step));
}

// Applies a resolved roll's effects (Harm/Heat/etc. per gamedesc.md §7),
// tracks Rep-style Full successes, and clears the pending result. Shared by
// mission steps and Random Encounters so neither path skips consequences.
function finalizeChallengeCommon() {
  const job = G.job;
  const c = G.character;
  const res = job.lastResult;

  applyOutcome(c, job, res.usedAttr, res.tier);
  if (res.styleTrack && res.tier === "full") job.repStyleFullSuccess[res.styleTrack] = true;

  job.pendingResult = null;
  return res;
}

function finalizeStep(step) {
  const job = G.job;
  const c = G.character;
  const res = finalizeChallengeCommon();
  job.stepResults.push({ attr: res.usedAttr, tier: res.tier });

  if (res.usedAttr === "Stealth" && res.tier === "fail" && !step.forced) {
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

function applyOutcome(c, job, attr, tier) {
  const table = DATA.complications[attr];
  if (tier === "full") {
    addLog(c, `Full success on ${attr}.`);
    return;
  }
  const text = tier === "partial" ? pick(table.partial) : pick(table.fail);
  addLog(c, text);

  const loc = c.locations[job.location.name];
  if (attr === "Combat") {
    if (tier === "partial") { markHarm(c); }
    else { markHarm(c); if (loc) loc.heat = Math.min(5, loc.heat + 1); }
  } else if (attr === "Driving") {
    if (tier === "fail") markHarm(c);
  } else if (attr === "Hacking") {
    if (loc) loc.heat = Math.min(5, loc.heat + (tier === "fail" ? 2 : 1));
  } else if (attr === "Social") {
    if (tier === "fail" && c.contacts.length) c.contacts[0].relationship -= 1;
  } else if (attr === "Stealth") {
    if (loc) loc.heat = Math.min(5, loc.heat + 1);
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
    const styles = attr === "Combat" ? ["None", "Gun", "Knife"] : attr === "Stealth" ? ["None", "Knife"] : ["None"];
    const styleSelect = styles.length > 1
      ? `<select class="style-select">${styles.map(s => `<option value="${s}">${s === "None" ? "No style" : `${s} style (Rep ${c.rep[s]})`}</option>`).join("")}</select>`
      : "";
    block.innerHTML = `<h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${styleSelect}<div class="mods"></div>`;
    const modsEl = block.querySelector(".mods");
    const selectEl = block.querySelector(".style-select");

    const refreshMods = () => {
      const style = selectEl ? selectEl.value : "None";
      const mods = computeModifiers(attr, style);
      modsEl.innerHTML = mods.length
        ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
        : `<span class="chip">no modifiers</span>`;
    };
    refreshMods();
    if (selectEl) selectEl.addEventListener("change", refreshMods);

    const rollBtn = document.createElement("button");
    rollBtn.textContent = `Roll ${attr}`;
    rollBtn.addEventListener("click", () => {
      const style = selectEl ? selectEl.value : (attr === "Driving" && c.rep.Car > 0 ? "Car" : "None");
      const mods = computeModifiers(attr, style);
      const result = resolve(c.attrs[attr], mods);
      result.usedAttr = attr;
      result.styleTrack = style !== "None" ? style : (attr === "Driving" ? "Car" : null);
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

function computeModifiers(attr, style) {
  const c = G.character, job = G.job;
  const mods = [];
  if (job.prep[attr]) mods.push({ label: "Prep", value: 1 });
  if (job.hireling && job.hireling.attr === attr) mods.push({ label: `Hireling`, value: 1 });
  if ((attr === "Combat" || attr === "Stealth") && job.location.heat >= 4) mods.push({ label: "Heat", value: -1 });
  if ((attr === "Combat" || attr === "Stealth") && job.mission.worstTier) {
    const p = tierPenalty(job.mission.worstTier);
    if (p) mods.push({ label: `Adversary (${job.mission.worstTier})`, value: p });
  }
  if (style && style !== "None" && c.rep[style] > 0) mods.push({ label: `${style} Rep`, value: 1 });
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
  const canSignature = !G.job.signatureUsed && Object.values(c.rep).some(v => v >= 5) && result.tier !== "full";
  if (canSignature) {
    const sigBtn = document.createElement("button");
    sigBtn.textContent = "Burn Signature Move (upgrade result)";
    sigBtn.addEventListener("click", () => {
      G.job.signatureUsed = true;
      result.tier = upgradeTier(result.tier);
      addLog(c, "You pull off your signature move to turn it around.");
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

  Object.entries(job.repStyleFullSuccess).forEach(([track, used]) => {
    if (used && c.rep[track] < 5) {
      c.rep[track] += 1;
      addLog(c, `Your ${track} Rep grows to ${c.rep[track]}.`);
      if (c.rep[track] === 5) addLog(c, `${track} Rep maxed — you've unlocked a Signature Move.`);
    }
  });

  const relDelta = outcome === "Full Success" ? 1 : outcome === "Partial Success" ? 0 : -1;
  const existing = c.contacts.find(ct => ct.name === job.employer.name);
  if (existing) existing.relationship += relDelta;
  else c.contacts.push({ name: job.employer.name, faction: job.employer.faction.name, relationship: relDelta, favor: 0 });

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
