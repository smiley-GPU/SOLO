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
  factions: document.getElementById("factions")
};

function init() {
  const loaded = load();
  if (loaded) {
    G.character = loaded;
    // BATCH 2.1 (item 6) — seed the "newest log lines" watermark to the
    // full existing history so a reload doesn't flag old lines as new.
    G.lastLogCount = G.character.log.length;
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
  if (G.character) maybeLuckyBreak(G.character); // BATCH 2.1 (item 11)
  return "hub";
}

// BATCH 2.1 (item 11) — a Downtime "lucky break": if the character arrives
// at the Hub flat broke (0 BONDS) and still carrying Harm, 20% chance of one
// of three breaks. Only ever called from nextHubPhase(), which itself is
// only ever called from init() (resuming a save) and the Debrief/Hunt-
// resolution "Return to the Street" buttons — never from inside renderHub()
// — so this can't re-fire while the player just sits in an already-rendered
// Hub training or shopping.
function maybeLuckyBreak(c) {
  if (c.bonds > 0 || !c.health.some(h => h)) return;
  if (randInt(1, 100) > 20) return;
  const friends = c.contacts.filter(p => p.relationship >= 3);
  const options = friends.length ? ["friend", "benefactor", "lottery"] : ["benefactor", "lottery"];
  const choice = pick(options);
  if (choice === "friend") {
    const friend = pick(friends);
    c.health = c.health.map(() => false);
    addLog(c, `${friend.name} won't let you sleep rough like this — they take you in and patch you up clean.`);
  } else if (choice === "benefactor") {
    grantBenefactorGift(c); // state.js
  } else {
    c.bonds += 2;
    addLog(c, `A ticket you forgot about pays off — the nightly "Road-Kill, Faster, Faster(R)" Lottery hands you 2 BONDS.`);
  }
  persist();
}

function persist() {
  if (G.character) save(G.character);
}

function render() {
  // UPDATE 3.1 (chat request) — safety net alongside finalizeChallengeCommon/
  // finishCheckpointRoll/finishCheckpointCombat's explicit resets: catches
  // any other way of leaving a Challenge screen those don't cover (Abort
  // Mission, a Hunt/Debrief "Return to the Street" button, Win/Loss, ...) —
  // a swap-picker panel left expanded should never survive a phase change.
  if (G.lastRenderedPhase !== G.phase) {
    G.expandedSwap = null;
    G.lastRenderedPhase = G.phase;
  }
  renderSheet();
  renderMain();
  renderFactions();
}

// INTERFACE 2.4.2 — the journal now sits at the top of #main (was a footer
// under the phase card), a fixed-height scrollable box — 10 rows, or 20 with
// the Expand toggle — instead of one open-ended list. Newest line on top,
// old ones pushed down (todo2.md INTERFACE); no auto-scroll needed since the
// newest entry is always the first thing visible.
function renderJournalBox() {
  const box = document.createElement("div");
  box.className = "journal-box";
  const expanded = !!G.logExpanded;
  box.innerHTML = `
    <div class="journal-head">
      <h3>Journal</h3>
      <button type="button" id="journal-toggle" class="btn-small">${expanded ? "Shrink" : "Expand"}</button>
    </div>
  `;
  const journal = document.createElement("div");
  journal.id = "journal";
  journal.className = expanded ? "expanded" : "";
  if (G.character) {
    const log = G.character.log;
    // BATCH 2.1 (item 6) — render() fires exactly once per user action
    // across this whole codebase, so "lines added since the last render()"
    // is exactly "lines added by the most recent action." Since the array
    // is rendered reversed (newest first), the newest `newCount` entries
    // are the first ones out of the loop below.
    const newCount = Math.max(0, log.length - (G.lastLogCount || 0));
    G.lastLogCount = log.length;
    log.slice().reverse().forEach((line, idx) => {
      // todo3.md INTERFACE UPDATE 2.5 — a tagged entry is {text, tag}
      // instead of a plain string (see addLog(), state.js); "archenemy"
      // renders in red regardless of how new the line is.
      const tagged = typeof line === "object" && line !== null;
      const p = document.createElement("div");
      p.className = "log-line" + (idx < newCount ? " log-new" : "") + (tagged ? ` log-${line.tag}` : "");
      p.textContent = tagged ? line.text : line;
      journal.appendChild(p);
    });
  }
  box.appendChild(journal);
  box.querySelector("#journal-toggle").addEventListener("click", () => {
    G.logExpanded = !G.logExpanded; // ephemeral UI state, never persisted
    renderMain();
  });
  return box;
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
  els.factions.appendChild(renderStocksBox()); // todo3.md INTERFACE 2.4.2.2 — EuroStoxx moved below Factions
}

// ---------- DOWNTIME (§20.5, restructured — todo3.md INTERFACE 2.4.2) ------
// Shop/Workshop/Apartment/Street-Dojo used to live (with EuroStoxx) in their
// own permanent 4th sidebar column, always visible-but-greyed outside the
// Hub; INTERFACE 2.4.2 moves them into #main as a row of columns under the
// Lay-Low/Find-a-Job window (renderHub, below) — both are now rendered only
// at the Hub, so there's no more "closed for the job" grey state to track:
// they simply aren't in the DOM once a job is under way. INTERFACE 2.4.2.2
// moved EuroStoxx again, out of this row and down onto the Factions panel
// (renderFactions) — see renderStocksBox, which re-gains its own "closed for
// the job" check now that it's rendered on every phase, not just the Hub.
function renderDowntimeColumns() {
  const wrap = document.createElement("div");
  wrap.className = "downtime-columns";
  wrap.appendChild(renderShopBox());
  wrap.appendChild(renderWorkshopBox());
  wrap.appendChild(renderApartmentBox());
  wrap.appendChild(renderTrainingBox());
  return wrap;
}

// "GEAR, GUNS AND GENERAL GOODNESS" — buy from the Reputation-Tier-scaled
// offer pool (genShopOffers, engine.js) and sell owned gear. Repair and
// Apartments now have their own columns (renderWorkshopBox/renderApartmentBox
// below) instead of being nested in here. Tabbed by gear category + "All"
// (todo3.md INTERFACE 2.4.2), filtering both the Buy offers and Sell list.
function renderShopBox() {
  const c = G.character;
  const box = document.createElement("div");
  box.className = "downtime-box";
  box.innerHTML = `<h3>Gear, Guns &amp; General Goodness</h3>`;
  if (!c.shopOffers) c.shopOffers = genShopOffers(reputationTier(c));
  if (!G.shopTab) G.shopTab = "All"; // ephemeral UI state — never persisted
  box.innerHTML += tabBarHtml(GEAR_TABS, G.shopTab, "shop-tab");

  c.shopOffers.filter(item => matchesGearTab(item, G.shopTab)).forEach(item => {
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
      // UPDATE 3.0 (todo3.md ARCHENEMY) — a Tier-3+ shop trip risks an
      // Archenemy ambush; a triggered one aborts the purchase entirely.
      if (maybeArchenemyAmbush(c, "shop")) { persist(); render(); return; }
      c.bonds -= price;
      const bought = { name: item.name, attr: item.attr, heal: item.heal, armor: item.armor, tier: item.tier, tags: item.tags };
      c.gear.push(bought);
      autoCarryNewItem(c, bought); // §20.8 — also covers "carry armor when you buy it if you have slots" (UPDATE 3.1, chat request)
      item.bought = true;
      addLog(c, `You pick up a ${item.name} — yours to keep.`);
      persist(); render();
    });
    row.appendChild(btn);
    box.appendChild(row);
  });

  // Sell Gear (todo3.md Items) — 2 Street items = 1 BOND, 1 higher-tier item
  // = 1 BOND; a Fixer contact at relationship ≥3 adds +1 BOND per sale.
  const sellable = c.gear.filter(item => matchesGearTab(item, G.shopTab));
  if (sellable.length) {
    const sellSection = document.createElement("div");
    sellSection.className = "section";
    const hasFixerDeal = c.contacts.some(p => p.profession === "Fixer" && p.relationship >= 3);
    const bankNote = c.pendingSaleItem ? `<p class="muted">Banked: ${c.pendingSaleItem} — sell one more Street item to cash in.</p>` : "";
    sellSection.innerHTML = `<h4>Sell Gear</h4><p class="muted">2 Street items = 1 BOND. 1 higher-tier item = 1 BOND.${hasFixerDeal ? " Your fixer kicks in +1 BOND per sale." : ""}</p>${bankNote}`;
    sellable.forEach(item => {
      const row = document.createElement("div");
      row.className = "offer";
      row.innerHTML = `<span>${item.name} <em>(${item.tier || "Street"})</em></span>`;
      const btn = document.createElement("button");
      btn.textContent = "Sell";
      btn.addEventListener("click", () => sellGearItem(c.gear.indexOf(item)));
      row.appendChild(btn);
      sellSection.appendChild(row);
    });
    box.appendChild(sellSection);
  }

  box.querySelectorAll("[data-shop-tab]").forEach(btn => {
    btn.addEventListener("click", () => { G.shopTab = btn.dataset.shopTab; render(); });
  });
  return box;
}

// "WORKSHOP" (todo3.md INTERFACE 2.4.2) — repairing a degraded (downgraded-
// a-tier) item back up one Tier, priced the same as buying that next Tier
// fresh; split out of the old combined Shop panel. Tabbed like the Shop.
// todo3.md UPDATE 2.8 — "Repair is only possible to items['] original
// level. If you have Hacking 3+, make Repair as Repair/Mod, and then you
// can raise the item tier by 1... If you have Hacking 5, raise up to 2."
// Base case (Hacking <3): Repair can only ever climb back to the item's
// own `originalTier` (ensureOriginalTier(), state.js) — an undamaged item
// already at its ceiling gets no row at all. Hacking 3-4 opens one Tier
// past original ("Mod"); Hacking 5 opens two.
function renderWorkshopBox() {
  const c = G.character;
  const box = document.createElement("div");
  box.className = "downtime-box";
  box.innerHTML = `<h3>Workshop</h3><p class="muted">Repair up to an item's original Tier — Hacking 3+ mods it further, always at the going price.</p>`;
  if (!G.workshopTab) G.workshopTab = "All";
  box.innerHTML += tabBarHtml(GEAR_TABS, G.workshopTab, "workshop-tab");

  const modBonus = c.attrs.Hacking >= 5 ? 2 : c.attrs.Hacking >= 3 ? 1 : 0;
  const repairable = c.gear
    .map(item => {
      const curIdx = DATA.gearTierOrder.indexOf(item.tier || "Street");
      const origIdx = DATA.gearTierOrder.indexOf(ensureOriginalTier(item));
      const maxIdx = Math.min(DATA.gearTierOrder.length - 1, origIdx + modBonus);
      return { item, curIdx, maxIdx };
    })
    .filter(({ curIdx, maxIdx }) => curIdx < maxIdx)
    .filter(({ item }) => matchesGearTab(item, G.workshopTab));
  if (!repairable.length) box.innerHTML += `<p class="muted">Nothing to fix up in this category.</p>`;
  repairable.forEach(({ item, curIdx, maxIdx }) => {
    const nextTier = DATA.gearTierOrder[curIdx + 1];
    const cost = DATA.gear[nextTier][0].price; // same price as buying fresh at that Tier — "always pay the change"
    const isMod = curIdx + 1 > DATA.gearTierOrder.indexOf(ensureOriginalTier(item)); // past original Tier — needs the Hacking-based headroom above
    const row = document.createElement("div");
    row.className = "offer";
    row.innerHTML = `<span>${item.name} <em>(${item.tier} → ${nextTier})</em></span>`;
    const btn = document.createElement("button");
    btn.textContent = `${isMod ? "Mod" : "Repair"} — ${cost} BOND${cost === 1 ? "" : "S"}`;
    btn.disabled = c.bonds < cost;
    btn.addEventListener("click", () => {
      // UPDATE 3.0 (todo3.md ARCHENEMY) — same Tier-3+ ambush risk as the Shop.
      if (maybeArchenemyAmbush(c, "workshop")) { persist(); render(); return; }
      c.bonds -= cost;
      item.tier = nextTier;
      if (item.armor) item.armor = DATA.gearTierBonus[nextTier]; // full charges at the new tier
      addLog(c, `You get the ${item.name} ${isMod ? "modded" : "fixed"} up to ${nextTier} (-${cost} BOND${cost === 1 ? "" : "S"}).`);
      persist(); render();
    });
    row.appendChild(btn);
    box.appendChild(row);
  });

  box.querySelectorAll("[data-workshop-tab]").forEach(btn => {
    btn.addEventListener("click", () => { G.workshopTab = btn.dataset.workshopTab; render(); });
  });
  return box;
}

// "APARTMENT" (todo3.md INTERFACE 2.4.2) — buy/upgrade a place and install
// Security; its own column now instead of nested inside the Shop panel.
// renderApartmentSection (below) is unchanged — this is just its new home.
function renderApartmentBox() {
  const box = document.createElement("div");
  box.className = "downtime-box";
  box.innerHTML = `<h3>Apartment</h3>`;
  box.appendChild(renderApartmentSection(G.character));
  return box;
}

// Apartments (§20.5) — Tier-gated (Reputation Tier, §19.1): nothing at
// Tier 1, then a bigger place with more Security slots at each Tier up.
// Price is 2×Tier BONDS, +1 if the chosen Location's faction is
// Corpo-category. Buying again at a Location you already own at, at a
// higher Tier, replaces that entry (an upgrade, resetting its Security);
// buying at a new Location adds another apartment instead — UPDATE 3.1
// (chat request) — "make it possible to own several apartments." Security
// options install free, capped at the apartment's slot count — their
// defensive payoff belongs to the Archenemy home-invasion/EurCop raid
// mechanics (§20, later phases).
// todo3.md INTERFACE UPDATE 2.5 (APARTMENTS) — tabs for each unlocked
// Tier's "stage" (STRIP/CITY/CORE) instead of one fixed name per Tier and a
// location dropdown. Each stage's several place-type choices are paired
// with a distinct known Location ("choices should be from different
// LOCATIONs") — the player picks a place+location combo directly.
function renderApartmentSection(c) {
  const wrap = document.createElement("div");
  wrap.className = "section";
  const repTier = reputationTier(c);

  // Owned apartments: one summary + Security install block each (was a
  // single `if (c.apartment)` block — now one per array entry).
  c.apartments.forEach(apt => {
    const ownedDef = DATA.apartments[apt.tier];
    const secList = apt.security.length ? apt.security.join(", ") : "none installed";
    const placeLabel = apt.place || ownedDef.stage; // old saves predate the `place` field
    const summary = document.createElement("p");
    summary.className = "muted";
    summary.textContent = `${placeLabel} at ${apt.location} (${ownedDef.stage}, Tier ${apt.tier}). Security: ${secList}.`;
    wrap.appendChild(summary);
    const options = (DATA.securityOptions[apt.tier] || []).filter(o => !apt.security.includes(o));
    if (apt.security.length < ownedDef.securitySlots) {
      // BATCH 2.0 — Security items cost BONDS to install now: 1 BOND for a
      // Tier 3 option, 2 BONDS for a Tier 4 one (Tier 4 ones also grant an
      // armor-charge pool in a home-invasion Hunt — see startHunt/applyHuntHarm).
      const cost = apt.tier >= 4 ? 2 : 1;
      options.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = `Install ${opt} at ${apt.location} — ${cost} BOND${cost === 1 ? "" : "S"}`;
        btn.disabled = c.bonds < cost;
        btn.addEventListener("click", () => {
          c.bonds -= cost;
          apt.security.push(opt);
          addLog(c, `${opt} goes in at your place in ${apt.location} (-${cost} BOND${cost === 1 ? "" : "S"}).`);
          persist(); render();
        });
        wrap.appendChild(btn);
      });
    }
  });

  if (repTier < 2) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = pick(DATA.apartmentTier1Flavor);
    wrap.appendChild(p);
    return wrap;
  }

  const known = Object.keys(c.locations);
  if (!known.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "You need to know a location before you can put down roots there.";
    wrap.appendChild(p);
    return wrap;
  }

  // Tabs for every unlocked Tier (2..repTier) — "add tabs STRIP/CITY/CORE
  // when these apartments come available." Defaults to the highest one
  // unlocked, matching the old behavior of always showing your current best.
  const availableTiers = [2, 3, 4].filter(t => t <= repTier);
  if (!G.apartmentTab || !availableTiers.includes(G.apartmentTab)) {
    G.apartmentTab = availableTiers[availableTiers.length - 1];
  }
  wrap.appendChild(document.createRange().createContextualFragment(
    tabBarHtml(availableTiers.map(t => DATA.apartments[t].stage), DATA.apartments[G.apartmentTab].stage, "apartment-tab")
  ));

  const tabTier = G.apartmentTab;
  const def = DATA.apartments[tabTier];
  const label = document.createElement("p");
  label.className = "muted";
  label.textContent = def.flavor;
  wrap.appendChild(label);

  const priceFor = locName => {
    const loc = c.locations[locName];
    const category = loc.faction ? (c.factionStandings[loc.faction] || {}).category : (loc.area === "Corpo" ? "Corpo" : null);
    return tabTier * 2 + (category === "Corpo" ? 1 : 0);
  };
  // UPDATE 3.1 — "worse than owned"/"upgrade" now only ever compares
  // against whatever's already owned at *this same Location* (at most one
  // apartment per Location — buying at a different, new Location is always
  // just a fresh "Buy", never blocked by what's owned elsewhere).
  const ownedAt = locName => c.apartments.find(a => a.location === locName);

  // Pair each place-type with a distinct known Location, capped to however
  // many are actually known — never repeat a Location across the choices.
  def.places.slice(0, known.length).forEach((place, i) => {
    const locName = known[i];
    const price = priceFor(locName);
    const existing = ownedAt(locName);
    const isHome = existing && existing.tier === tabTier && existing.place === place;
    const worseThanOwned = existing && tabTier < existing.tier;
    const row = document.createElement("div");
    row.className = "offer";
    row.innerHTML = `<span>${place} <em>at ${locName}</em></span>`;
    const btn = document.createElement("button");
    btn.textContent = isHome ? "Home" : worseThanOwned ? "Already have better here" : `${existing ? "Upgrade" : "Buy"} — ${price} BOND${price === 1 ? "" : "S"}`;
    btn.disabled = isHome || worseThanOwned || c.bonds < price;
    btn.addEventListener("click", () => {
      c.bonds -= price;
      const newApt = { location: locName, tier: tabTier, place, security: [] };
      if (existing) {
        // Upgrading in place — same Location, resets Security (unchanged
        // precedent from the single-apartment version).
        c.apartments[c.apartments.indexOf(existing)] = newApt;
        addLog(c, `You move up to ${place} in ${locName}.`);
      } else {
        c.apartments.push(newApt);
        addLog(c, c.apartments.length > 1 ? `You add ${place} in ${locName} to your holdings.` : `You put down roots at ${place} in ${locName}.`);
      }
      persist(); render();
    });
    row.appendChild(btn);
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("[data-apartment-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const stage = btn.dataset.apartmentTab;
      G.apartmentTab = availableTiers.find(t => DATA.apartments[t].stage === stage);
      render();
    });
  });
  return wrap;
}

// "LESSONS FROM THE STREET" — unchanged Training mechanic, relocated out
// of the Hub's inline section.
// todo3.md INTERFACE 2.4.2 — renamed "Street-Dojo" on screen; function/
// mechanic names unchanged (same cosmetic-rename idiom as Amigue/Compi, §20.6).
function renderTrainingBox() {
  const c = G.character;
  const box = document.createElement("div");
  box.className = "downtime-box";
  box.innerHTML = `<h3>Street-Dojo</h3>`;
  Object.entries(c.attrs).forEach(([attr, rank]) => {
    const cost = rank; // rank 1→2 costs 1 BOND, 2→3 costs 2, … (todo3.md BOND scale)
    const btn = document.createElement("button");
    btn.textContent = `Train ${attr} (${rank} → ${Math.min(5, rank + 1)}) — ${cost} BOND${cost === 1 ? "" : "S"} + 1 BOOST`;
    btn.disabled = rank >= 5 || c.bonds < cost || c.boost < 1;
    btn.addEventListener("click", () => {
      // UPDATE 3.0 (todo3.md ARCHENEMY) — same Tier-3+ ambush risk as the Shop.
      if (maybeArchenemyAmbush(c, "street-dojo")) { persist(); render(); return; }
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
// adjustFactionParam). Sell converts the whole held amount back 1:1, any
// time. todo3.md INTERFACE 2.4.2.2 — rendered on the Factions panel now
// (renderFactions), below the faction list, which unlike the Downtime
// columns is on-screen every phase — so this is the one panel that still
// needs its own "closed for the duration of the job" check.
function renderStocksBox() {
  const c = G.character;
  const box = document.createElement("div");
  box.className = "downtime-box";
  box.innerHTML = `<h3>EuroStoxx</h3>`;
  if (G.phase !== "hub") {
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
      addLog(c, `You park a BOND in ${f.name} stock.`, "stocks"); // UPDATE 3.1 (chat request) — blue EuroStoxx log lines
      persist(); render();
    });
    row.appendChild(investBtn);
    if (held > 0) {
      // todo3.md UPDATE 2.8 — "add a 'sell 1' function to EuroStoxx," next
      // to the existing sell-everything option.
      const sell1Btn = document.createElement("button");
      sell1Btn.textContent = "Sell 1";
      sell1Btn.addEventListener("click", () => {
        c.bonds += 1;
        c.stocks[f.name] -= 1;
        if (c.stocks[f.name] <= 0) delete c.stocks[f.name];
        addLog(c, `You cash out 1 share of ${f.name} stock for 1 BOND.`, "stocks");
        persist(); render();
      });
      row.appendChild(sell1Btn);

      const sellBtn = document.createElement("button");
      sellBtn.textContent = `Sell All (${held})`;
      sellBtn.addEventListener("click", () => {
        c.bonds += held;
        delete c.stocks[f.name];
        addLog(c, `You cash out your ${f.name} stock for ${held} BOND${held === 1 ? "" : "S"}.`, "stocks");
        persist(); render();
      });
      row.appendChild(sellBtn);
    }
    box.appendChild(row);
  });
  return box;
}

// INTERFACE 2.4.1 — the five Loadout categories (§20.8) plus "All"; a plain
// tab bar over the sheet's Gear list, and (§20.16) the Shop/Workshop offer
// lists. INTERFACE 2.4.3 added "Other" for anything gearCategory() can't
// place (heal-gear, previously only ever visible under "All").
const GEAR_TABS = ["All", "Weapons", "Clothing", "Decks", "Vehicles", "Social", "Other"];
function matchesGearTab(item, tab) {
  if (tab === "All") return true;
  const cat = gearCategory(item);
  return tab === "Other" ? !cat : cat === tab;
}
// INTERFACE 2.4.1 — People tabs: Friends (Amigue/Compi), Faces (everyone
// else not an Archenemy), Enemies (Archenemy-tagged), All.
const PEOPLE_TABS = ["Friends", "Faces", "Enemies", "All"];
function personBucket(ct) {
  if (ct.archenemy) return "Enemies";
  if (ct.bloodbrother || ct.relationship >= 3) return "Friends";
  return "Faces";
}
// UPDATE 3.1 (chat request) — "list class features under attributes, hover
// for a short description": one profession-gated Class Ability per
// Profession (§21.3), plus WRAITH/WICKED if earned. classFeaturesFor()
// returns each unlocked feature's name in display order; CLASS_FEATURE_DESC
// is the hover text for renderSheet()'s plain title="" tooltip (no JS
// needed for the hover itself).
const PROFESSION_FEATURE = { Jockey: "GEARHEAD", Hacker: "NETRUNNER", Rocker: "NATURAL LEADER", Solo: "STREET SAMURAI" };
const CLASS_FEATURE_DESC = {
  "GEARHEAD": "Your vehicle can't be lost to mission fallout — it always comes back. Once a job, swap a Combat check to Driving.",
  "NETRUNNER": "Your deck can't be lost to mission fallout — it always comes back. Once a job, swap a Stealth or Combat check to Hacking.",
  "NATURAL LEADER": "Your first Hire each job is free.",
  "STREET SAMURAI": "Once a job, auto-resolve a Combat check as a guaranteed Partial — no roll, but still runs the normal Partial fallout.",
  "WRAITH": "Earned from a 2nd Shadow-of title. Once a job, swap a Combat check to Stealth.",
  "WICKED": "Earned from a 2nd Killer-of title. Once a job, swap a Stealth check to Combat."
};
function classFeaturesFor(c) {
  return [PROFESSION_FEATURE[c.profession], c.wraith ? "WRAITH" : null, c.wicked ? "WICKED" : null].filter(Boolean);
}

function tabBarHtml(tabs, active, dataAttr) {
  return `<div class="tab-bar">${tabs.map(t =>
    `<button type="button" class="tab-btn${t === active ? " active" : ""}" data-${dataAttr}="${t}">${t}</button>`
  ).join("")}</div>`;
}

function renderSheet() {
  const c = G.character;
  if (!c) { els.sheet.innerHTML = ""; return; }
  // BATCH 2.0 — a cybernetic Combat/Social modifier shows as a small red
  // badge next to the base attribute (cyberAttrModifier(), state.js).
  const attrRows = Object.entries(c.attrs).map(([k, v]) => {
    const cyberMod = cyberAttrModifier(c, k);
    const modBadge = cyberMod ? ` <span class="cyber-mod">${cyberMod > 0 ? "+" : ""}${cyberMod}</span>` : "";
    return `<div class="stat"><span>${k}</span><span>${v}${modBadge}</span></div>`;
  }).join("");
  // UPDATE 3.1 (chat request) — Class Features listed under Attributes;
  // title="" gives a native hover tooltip with each one's short description.
  const classFeaturesHtml = classFeaturesFor(c).map(f =>
    `<span class="class-feature" title="${CLASS_FEATURE_DESC[f]}">${f}</span>`
  ).join("");
  const healthRow = c.health.map(h => `<span class="hbox ${h ? "hurt" : ""}"></span>`).join("");

  // Armor boxes (INTERFACE 2.4.1): carried gear armor (depletable — one box
  // per charge, filled left-to-right as charges are spent, the whole row
  // gone once the item itself is wrecked and removed) plus a chrome-colored
  // box per non-depleting cybernetic armor point (§20.11's Faceplate/
  // Cyberlung/arm+leg pair) — those never fill in, they're a second,
  // permanent absorb chance, not a shared charge pool.
  const armorItem = carriedArmorItem(c);
  const gearArmorMax = armorItem ? (DATA.gearTierBonus[armorItem.tier] || armorItem.armor) : 0;
  const gearArmorUsed = armorItem ? Math.max(0, gearArmorMax - armorItem.armor) : 0;
  const cyberArmor = cyberArmorCount(c);
  const armorSection = (armorItem || cyberArmor)
    ? `<div class="section"><h3>Armor</h3><div class="hboxes">${
        Array.from({ length: gearArmorMax }, (_, i) => `<span class="abox${i < gearArmorUsed ? " used" : ""}"></span>`).join("")
      }${
        Array.from({ length: cyberArmor }, () => `<span class="abox cyber"></span>`).join("")
      }</div></div>`
    : "";

  if (!G.gearTab) G.gearTab = "All"; // ephemeral UI state — never persisted, see G in game.js header
  const gearShown = c.gear.filter(g => matchesGearTab(g, G.gearTab));
  const gearList = gearShown.length
    ? gearShown.map(g => {
        const kind = g.attr ? ` ${g.attr}` : g.heal ? " heal" : g.armor ? ` armor x${g.armor}` : "";
        const stowed = gearCategory(g) && !g.carried ? ", stowed" : ""; // §20.8 — only carried gear does anything
        // todo3.md INTERFACE UPDATE 2.5 — "mark where each vehicle is
        // stocked," with a way to move it (only meaningful once there's
        // an Apartment to move it to or from; hidden mid-job while "Moving").
        // UPDATE 3.1 (chat request) — a simple 2-way toggle button stopped
        // making sense once there can be several apartment locations; a
        // <select> destination picker (Street + every owned Location but
        // the vehicle's current one) replaces it.
        let vehicleHtml = "";
        if (g.attr === "Driving") {
          const loc = vehicleLocation(g);
          let moveControl = "";
          if (loc !== "Moving" && c.apartments.length) {
            const destinations = ["Street", ...c.apartments.map(a => a.location)].filter(d => d !== loc);
            if (destinations.length) {
              const options = destinations.map(d => `<option value="${d}">${d}</option>`).join("");
              moveControl = ` <select class="btn-small" data-move-vehicle="${c.gear.indexOf(g)}"><option value="">Move to…</option>${options}</select>`;
            }
          }
          vehicleHtml = ` <span class="muted" style="font-size:11px">[${loc}]</span>${moveControl}`;
        }
        return `<li>${g.name} <em>(${g.tier || "Street"}${kind}${stowed})</em>${vehicleHtml}</li>`;
      }).join("")
    : "<li><em>none</em></li>";

  // "People" is the full recurring-cast pool, not just friendly contacts —
  // Adversaries and Targets you've crossed paths with end up here too, with
  // a negative relationship. See getPerson()/nudgeRelationship() in state.js.
  // A contact tagged Archenemy gets a Hunt button (only from the Hub — a
  // Hunt shouldn't interrupt whatever job phase is in progress); a
  // BLOODBROTHER shows as "Amigue" (§20.6 display rename — the internal
  // field/function names are unchanged). Both tags are mutually exclusive
  // (tagArchenemy/tagBloodbrother in state.js). Anyone at relationship 3-4
  // (Ally-eligible but not yet free) gets a "Compi" badge — cosmetic only.
  if (!G.peopleTab) G.peopleTab = "All";
  const peopleShown = (G.peopleTab === "All" ? c.contacts.slice() : c.contacts.filter(ct => personBucket(ct) === G.peopleTab))
    .sort((a, b) => (a.relationship - b.relationship) * (G.peopleTab === "Enemies" ? 1 : -1)); // Enemies ascending (worst first), everything else descending
  const contactList = peopleShown.map(ct => {
    let tag = "";
    if (ct.archenemy) {
      const huntBtn = G.phase === "hub" ? `<button class="btn-small hunt-btn" data-hunt-id="${ct.id}">Hunt</button>` : "";
      tag = ` <span class="archenemy-badge">⚠ Archenemy</span>${huntBtn}`;
    } else if (ct.bloodbrother) {
      tag = ` <span class="bloodbrother-badge">🩸 Amigue</span>`;
    } else if (ct.relationship >= 3) {
      tag = ` <span class="compi-badge">Compi</span>`;
    }
    // todo3.md INTERFACE 2.4.1 — a red mark for anyone currently wounded
    // (woundPerson, state.js), cleared automatically by recoverWoundedContacts().
    const woundedMark = ct.wounded ? ` <span class="wounded-mark" title="Wounded — sidelined">●</span>` : "";
    return `<li>${ct.name} — ${ct.faction} (${ct.relationship >= 0 ? "+" : ""}${ct.relationship})${tag}${woundedMark}</li>`;
  }).join("");
  const graveyardSection = c.graveyard && c.graveyard.length
    ? `<div class="section"><h3>Graveyard</h3><ul>${c.graveyard.map(p => `<li>${p.name} — ${p.faction}</li>`).join("")}</ul></div>`
    : "";
  // The permanent 12-location map (gamedesc.md §6) — fills in as you visit.
  const locationsList = Object.entries(c.locations).map(([name, loc]) => `<li>${name} ${heatBarHtml(loc.heat)}</li>`).join("");
  const injuryBadge = c.permanentInjury ? `<div class="injury-badge">⚠ Permanent Injury — needs repair</div>` : "";
  // BATCH 2.0 — cybernetic replacements, shown under Health as small chips.
  const cyberBadges = c.cyberneticReplacements.length
    ? `<div class="cyber-badges">${c.cyberneticReplacements.map(p => `<span class="cyber-badge">${p}</span>`).join("")}</div>`
    : "";
  // Rest clock (todo3.md) — 4 Rest uses builds toward an Archenemy Hunt.
  const restClock = c.restCount > 0
    ? `<div class="section"><h3>Someone's Asking Around</h3><span class="heatbar">${Array.from({ length: 4 }, (_, i) => `<span class="heatseg${i < c.restCount ? " filled" : ""}"></span>`).join("")}</span></div>`
    : "";
  // todo3.md INTERFACE 2.4.1 — earned honorifics under Reputation, newest
  // first; the same list is reused as the obituary/score chart on the
  // win/loss/death screens (addTitle(), state.js).
  const titlesList = c.titles.length
    ? `<ul class="titles-list">${c.titles.slice().reverse().map(t => `<li>${t}</li>`).join("")}</ul>`
    : "";
  // todo3.md INTERFACE UPDATE 2.5 — "mark Apartment: Street/ or type and
  // LOCATION under the BONDS value... an arrow triangle to open the details
  // (security, vehicles stocked here)." UPDATE 3.1 (chat request) — several
  // apartments can now be owned at once, so the summary line reads "N
  // apartments" once there's more than one (a single one still just names
  // it, unchanged), and the expanded details list every one of them.
  let apartmentSectionHtml;
  if (!c.apartments.length) {
    apartmentSectionHtml = `<div class="section"><h3>Apartment</h3><div class="cred" style="font-size:14px">Street</div></div>`;
  } else {
    const apartmentExpanded = !!G.apartmentSheetExpanded;
    const summaryLine = c.apartments.length === 1
      ? `${c.apartments[0].place || DATA.apartments[c.apartments[0].tier].stage} — ${c.apartments[0].location}`
      : `${c.apartments.length} apartments`;
    const details = apartmentExpanded
      ? c.apartments.map(apt => {
          const ownedDef = DATA.apartments[apt.tier];
          const placeLabel = apt.place || ownedDef.stage;
          const secList = apt.security.length ? apt.security.join(", ") : "none installed";
          const vehiclesHere = c.gear.filter(g => g.attr === "Driving" && vehicleLocation(g) === apt.location);
          return `<p class="muted"><strong>${placeLabel} — ${apt.location}</strong> (Tier ${apt.tier})<br>Security: ${secList}<br>Vehicles here: ${vehiclesHere.length ? vehiclesHere.map(v => v.name).join(", ") : "none"}</p>`;
        }).join("")
      : "";
    apartmentSectionHtml = `<div class="section"><h3>Apartment</h3>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:6px">
        <span class="cred" style="font-size:14px">${summaryLine}</span>
        <button type="button" id="apartment-toggle" class="btn-small">${apartmentExpanded ? "▲" : "▼"}</button>
      </div>
      ${details}
    </div>`;
  }

  els.sheet.innerHTML = `
    <div class="sheet-header"><h2>${c.name}</h2><button id="retire-btn" class="danger btn-small">Retire</button></div>
    <div class="tag">${c.profession} / ${c.turf}</div>
    ${armorSection}
    <div class="section"><h3>Health</h3><div class="hboxes">${healthRow}</div>${cyberBadges}${injuryBadge}</div>
    <div class="section"><h3>Bonds</h3><div class="cred">${c.bonds} BOND${c.bonds === 1 ? "" : "S"}</div></div>
    ${apartmentSectionHtml}
    <div class="section"><h3>Attributes</h3>${attrRows}<div class="class-features">${classFeaturesHtml}</div></div>
    <div class="section"><h3>Boost</h3><div class="cred">⚡${c.boost}</div></div>
    <div class="section"><h3>Reputation</h3><div class="cred">${c.reputation} <span class="tag" style="margin:0;display:inline">${reputationTitle(c)} (T${reputationTier(c)})</span></div>${titlesList}</div>
    <div class="section"><h3>Gear</h3>${tabBarHtml(GEAR_TABS, G.gearTab, "gear-tab")}<ul>${gearList}</ul></div>
    <div class="section"><h3>People</h3>${tabBarHtml(PEOPLE_TABS, G.peopleTab, "people-tab")}<ul>${contactList}</ul></div>
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
  // Tab clicks are pure UI state (G.gearTab/G.peopleTab, never persisted) —
  // re-render just the sheet, not the whole screen.
  els.sheet.querySelectorAll("[data-gear-tab]").forEach(btn => {
    btn.addEventListener("click", () => { G.gearTab = btn.dataset.gearTab; renderSheet(); });
  });
  els.sheet.querySelectorAll("[data-people-tab]").forEach(btn => {
    btn.addEventListener("click", () => { G.peopleTab = btn.dataset.peopleTab; renderSheet(); });
  });
  const apartmentToggle = els.sheet.querySelector("#apartment-toggle");
  if (apartmentToggle) {
    apartmentToggle.addEventListener("click", () => {
      G.apartmentSheetExpanded = !G.apartmentSheetExpanded; // ephemeral UI state
      renderSheet();
    });
  }
  // todo3.md INTERFACE UPDATE 2.5 — move a vehicle between Street and an
  // owned Apartment's location (only shown when there's somewhere to move
  // it to/from, and never while it's "Moving" mid-job). UPDATE 3.1 (chat
  // request) — now a <select> destination picker (Street + every owned
  // Location but the current one) instead of a 2-way toggle button, since
  // there can be several apartment locations to choose from.
  els.sheet.querySelectorAll("select[data-move-vehicle]").forEach(sel => {
    sel.addEventListener("change", () => {
      const item = c.gear[Number(sel.dataset.moveVehicle)];
      const dest = sel.value;
      if (!item || !dest) return;
      item.location = dest;
      addLog(c, `You move the ${item.name} to ${item.location}.`);
      persist(); render();
    });
  });
}

function renderMain() {
  els.main.innerHTML = "";
  els.main.appendChild(renderJournalBox()); // INTERFACE 2.4.2 — journal now leads, not trails
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
    loss: renderLoss,
    death: renderDeath
  }[G.phase];
  if (fn) fn();
  // todo3.md UPDATE 2.6 — "after each mission click always scroll the
  // screen to top, so that the log... [is] visible": every render while a
  // job is under way (Gear Up through Debrief) resets scroll, since a
  // render in those phases only ever follows a real player action there
  // (Roll, Continue, Head Out, Abort, ...), not idle browsing.
  const missionPhases = ["gearup", "steps", "encounter", "checkpoint", "debrief"];
  if (missionPhases.includes(G.phase)) {
    els.main.scrollTop = 0;
    window.scrollTo(0, 0);
  }
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

// ---------- HUB / DOWNTIME (restructured — todo3.md INTERFACE 2.4.2/2.4.2.2) --
// The pre-job view: Permanent-Injury care, then the Lay-Low window (rest
// options, including StreetDoc — was a standalone "Medical" button, now one
// of the Lay Low options — plus Find a Job), then the Shop/Workshop/
// Apartment/Street-Dojo columns underneath (EuroStoxx moved to the Factions
// panel, renderStocksBox). All of it — Lay-Low and the columns alike —
// disappears the instant "Find a Job" is pressed, replaced by the Mission
// Board's two cards (renderBriefing); "Return to Street" brings it back
// without touching G.board, so the same two jobs are still there (todo3.md:
// "keep the same missions still available"). The window itself is as wide
// as the Journal above it (.card.downtime-window drops the .card max-width).
function renderHub() {
  const c = G.character;
  const wrap = document.createElement("div");
  wrap.className = "card downtime-window";
  wrap.innerHTML = `<h2>Downtime</h2><p class="muted">Between jobs. Gear up, patch up, or find work.</p>`;

  if (c.permanentInjury) {
    const repairSection = document.createElement("div");
    repairSection.className = "section";
    repairSection.innerHTML = "<h3>Permanent Injury</h3><p class=\"muted\">Every roll takes -1 until this is fixed.</p>";
    DATA.repairs.forEach(r => {
      const btn = document.createElement("button");
      btn.textContent = `${r.name} — ${r.price} BOND${r.price === 1 ? "" : "S"}`;
      btn.title = pick(r.flavor);
      btn.disabled = c.bonds < r.price;
      btn.addEventListener("click", () => {
        c.bonds -= r.price;
        c.health = [false, false, false];
        c.permanentInjury = false;
        if (r.cybernetic) {
          // BATCH 2.0 — "count cybernetic replacements — getting to borg":
          // a random chrome part goes in instead of the old flat attribute
          // penalty — see cyberAttrModifier()/cyberArmorCount() (state.js).
          const part = pick(DATA.cyberneticParts);
          c.cyberneticReplacements.push(part);
          const partFlavor = {
            Cyberarm: "A cyberarm — steadier hands, heavier fists.",
            Cyberleg: "A cyberleg — you'll never quite walk soft again.",
            Faceplate: "A faceplate — plated and unreadable, but people notice.",
            Cyberlung: "A cyberlung — you don't get winded anymore. You also don't quite breathe."
          }[part];
          addLog(c, `${r.name} goes in clean. ${partFlavor}`);
        } else {
          addLog(c, `${r.name} grows you back clean. No compromises.`);
        }
        persist(); render();
      });
      repairSection.appendChild(btn);
    });
    wrap.appendChild(repairSection);
  }

  // Lay Low (todo3.md INTERFACE 2.4.2: Coffin Hotel/Street/Apartment/Amigue —
  // always visible here now, no longer gated on a Board already existing,
  // since resting builds one regardless). Find a Job sits below it, in the
  // same window.
  const laylowHeading = document.createElement("h3");
  laylowHeading.textContent = "Lay Low";
  wrap.appendChild(laylowHeading);
  const laylowContent = document.createElement("div");
  laylowContent.className = "section";
  wrap.appendChild(laylowContent);
  if (G.restFlow) renderRestSubflow(laylowContent);
  else renderRestOptions(laylowContent);

  if (!G.restFlow) {
    // todo3.md INTERFACE 2.4.3 — "the button that actually starts the real
    // game": centered, ~20% larger, a distinct gold color (.btn-cta).
    const jobBtn = document.createElement("button");
    jobBtn.className = "btn-cta";
    jobBtn.textContent = "Find a Job";
    jobBtn.addEventListener("click", () => goFindJob());
    wrap.appendChild(jobBtn);
  }

  els.main.appendChild(wrap);
  els.main.appendChild(renderDowntimeColumns());
}

// todo3.md INTERFACE 2.4.2 — Find a Job re-opens the existing Mission Board
// (G.board) if there already is one, instead of rerolling it; the Board only
// ever changes from a Lay-Low action (processRestTick -> startJobSearch(true))
// or once a job is accepted and a fresh search is needed next time.
function goFindJob() {
  if (G.board) {
    G.phase = "briefing";
    persist();
    render();
    return;
  }
  startJobSearch();
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
    sideObjective: null, // "more BONDS" side job (todo3.md ADD) — see takeSideJob
    abortFlow: null, // todo3.md INTERFACE 2.4.2 — "Abort Mission" Evasion roll, see renderAbortBox
    // UPDATE 3.0/3.1 (todo3.md CHARACTER CLASS ABILITY) — each profession's
    // once-per-mission special, tracked per job so it refreshes every time
    // out: Jockey's Combat-to-Driving swap (renderChallenge), Rocker's free
    // Hire (renderGearUp), Solo's auto-success (renderChallenge), Hacker's
    // Stealth-or-Combat-to-Hacking swap (renderChallenge). wraithUsed/
    // wickedUsed (chat request) are the odd ones out — not profession-gated,
    // unlocked by earning a 2nd "Shadow of X"/"Killer of X" instead; see
    // wraithEligible/wickedEligible.
    classAbility: { gearheadUsed: false, samuraiUsed: false, freeHireUsed: false, hackerSwapUsed: false, wraithUsed: false, wickedUsed: false },
    pendingStepPenalty: null, // UPDATE 3.0 MISSIONS — see MISSION_SEQUENCES' alertOnFail (engine.js)
    jockeyVehicleSnapshot: null, // UPDATE 3.0/3.1 GEARHEAD — set on "Head Out", restored at Debrief
    hackerDeckSnapshot: null // UPDATE 3.1 (chat request) — same never-lose-it protection, for a Hacker's deck
  };
}

// todo3.md INTERFACE 2.4.2 — two trading-card-style offers side by side
// (renderBriefingCard), plus a "Return to Street" card below them. Choosing
// a mission (renderBriefingCard's Accept button) moves G.phase off
// "briefing" entirely, which drops this whole screen — the other card and
// the Return to Street box go with it, with nothing extra to discard by hand.
function renderBriefing() {
  const header = document.createElement("div");
  header.className = "card centered"; // todo3.md INTERFACE 2.4.3 — "align Mission board to center"
  header.innerHTML = `<h2>Mission Board</h2><p class="muted">Two jobs on the wire tonight. Take one, or return to the street.</p>`;
  els.main.appendChild(header);

  const row = document.createElement("div");
  row.className = "mission-row"; // centered via CSS (justify-content: center)
  els.main.appendChild(row);
  G.board.forEach((job, idx) => renderBriefingCard(row, job, idx));

  const returnBox = document.createElement("div");
  returnBox.className = "card centered return-street-box";
  returnBox.innerHTML = `<h3>Not Tonight</h3><p>Head back to the street — the same two jobs will still be waiting.</p>`;
  const returnBtn = document.createElement("button");
  returnBtn.textContent = "Return to Street";
  returnBtn.addEventListener("click", () => {
    G.phase = "hub"; // G.board is left untouched — see goFindJob()
    persist();
    render();
  });
  returnBox.appendChild(returnBtn);
  els.main.appendChild(returnBox);
}

// todo3.md INTERFACE 2.4.2/2.4.3 — one trading-card-style mission offer,
// appended into the shared `row` (a .mission-row flex container) instead of
// straight into #main. Deliberately just two font sizes throughout
// (.mission-card's CSS): an 18px headline (the title/payout line, and the
// job description right under it) and one 14px body size for everything
// else — no muted/grey text on the card. INTERFACE 2.4.3: the title line is
// now "Job N: X BONDS" (payout folded into the headline, "only put the
// BONDS" — no separate "Payout:" line), with the job description directly
// below it instead of down among the other details.
function renderBriefingCard(row, job, idx) {
  const { employer, mission, location } = job;
  const wrap = document.createElement("div");
  wrap.className = "mission-card" + (mission.special ? " special" : "");
  const adversaryList = mission.adversaries.map(a => `<li>${a.name} — ${a.profession} (${a.tier})</li>`).join("");
  const fieldRows = missionFieldRows(mission);
  const payout = estimatePayout(job);
  const title = mission.special ? mission.specialName : `Job ${idx + 1}`;
  const sideRow = job.sideObjective
    ? `<p><strong>Side job:</strong> ${job.sideObjective.type} — ${job.sideObjective.target.name} (+2 BONDS if it goes clean)</p>`
    : "";
  // Special Missions (§19.5): unrestricted faction pairing, an extra -1 on
  // every roll, +2 BONDS, amplified relationship/standing swings, and real
  // risk to an Amigue riding along as a Helper.
  const specialBadge = mission.special
    ? `<p><strong>⚠ SPECIAL MISSION</strong> — extra -1 to every roll, +2 BONDS, bigger relationship swings. An Amigue riding along can be wounded or killed.</p>`
    : "";
  wrap.innerHTML = `
    <h3>${title}: ${payout} BOND${payout === 1 ? "" : "S"}</h3>
    ${specialBadge}
    <p class="step-desc">${mission.type} — ${mission.flavor}</p>
    ${factionSummaryHtml(job)}
    <p><strong>Employer:</strong> ${employer.name} — ${employer.faction} ${employer.profession}</p>
    ${fieldRows}
    ${sideRow}
    <p><strong>Location:</strong> ${location.name} (${location.area}${location.faction ? `, ${location.faction} turf` : ""}) — Heat ${location.heat} ${heatBarHtml(location.heat)}</p>
    <p><strong>Opposition:</strong></p><ul>${adversaryList}</ul>
  `;
  row.appendChild(wrap);

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
// rerolls the whole Board, not just one candidate. todo3.md INTERFACE
// 2.4.2.2 — laid out as two side-by-side rows: StreetDoc (was the Hub's
// standalone "Medical" button)/Coffin Hotel/Night on the Street first, then
// Spend the Night (Amigue)/Rest at your Apartment below them.
function renderRestOptions(wrap) {
  const c = G.character;
  wrap.innerHTML = ""; // BATCH 2.2 — the box's own header ("Lay Low") lives one level up now

  const row1 = document.createElement("div");
  row1.className = "laylow-row";
  wrap.appendChild(row1);

  const docBtn = document.createElement("button");
  const openWounds = c.health.filter(h => h).length;
  docBtn.textContent = `StreetDoc (1 BOND / box) — ${openWounds} wound(s)`;
  // Band-aids don't touch a Permanent Injury — that needs a real repair above.
  docBtn.disabled = openWounds === 0 || c.bonds < 1 || c.permanentInjury;
  docBtn.addEventListener("click", () => {
    c.bonds -= 1;
    healBox(c);
    addLog(c, "You get patched up at a ripperdoc's clinic.");
    persist(); render();
  });
  row1.appendChild(docBtn);

  const restBtn = document.createElement("button");
  restBtn.textContent = "Rest in Comfy Coffin Hotel (1 BOND)";
  restBtn.disabled = c.bonds < 1; // BATCH 2.0 — repeatable now, BONDS are the only limiter
  restBtn.addEventListener("click", () => restCoffinHotel());
  row1.appendChild(restBtn);

  const nightBtn = document.createElement("button");
  nightBtn.textContent = "Night on the Street (Free)";
  nightBtn.addEventListener("click", () => { G.restFlow = { stage: "night", pendingResult: null, lastResult: null }; persist(); render(); });
  row1.appendChild(nightBtn);

  const row2 = document.createElement("div");
  row2.className = "laylow-row";
  wrap.appendChild(row2);

  // BATCH 2.0 — more than one Amigue can exist now; offer a row per Amigue
  // instead of always grabbing the first one found.
  c.contacts.filter(p => p.bloodbrother).forEach(bb => {
    const brotherBtn = document.createElement("button");
    brotherBtn.textContent = `Spend the Night with ${bb.name} (Free)`;
    brotherBtn.addEventListener("click", () => { G.restFlow = { stage: "brothernight", withId: bb.id, pendingResult: null, lastResult: null }; persist(); render(); });
    row2.appendChild(brotherBtn);
  });

  // BATCH 2.0 — relocated from the Hub, and now ticks the Rest clock like
  // every other option here (it deliberately didn't before). UPDATE 3.1
  // (chat request) — one button per owned apartment now, not just one.
  c.apartments.forEach(apt => {
    const homeBtn = document.createElement("button");
    homeBtn.textContent = `Rest at ${apt.place || DATA.apartments[apt.tier].stage} in ${apt.location} (Free)`;
    homeBtn.addEventListener("click", () => restAtApartment(apt));
    row2.appendChild(homeBtn);
  });

  const restNote = document.createElement("p");
  restNote.className = "muted";
  restNote.textContent = "Resting finds you two different jobs — the Coffin Hotel might also patch you up.";
  wrap.appendChild(restNote);
}

// BATCH 2.0 — Rest at your Apartment, now part of the Rest cycle (ticks
// restCount like Coffin Hotel/Night on the Street). If the Archenemy left
// a trap here (§20.6), that fires instead of the usual heal roll. If this
// tick is the one that fills the Rest clock, the resulting Hunt happens
// at home (see startHunt's atHome param) rather than out on the street.
// apartment (UPDATE 3.1, chat request): which of possibly several owned
// apartments the player chose to rest at — stashed on G.homeApartment
// (ephemeral, never persisted) so startHunt() knows which one's Security
// counts toward a forced-Hunt-at-home, if this tick is the one that fills
// the clock.
function restAtApartment(apartment) {
  const c = G.character;
  if (apartment.trapped) {
    apartment.trapped = false;
    addLog(c, "The place goes up the second you're inside — you'd left something behind, alright, and it wasn't yours.");
    for (let i = 0; i < 2 && !isDown(c); i++) {
      if (handleGoingDown(c, applyHarm(c))) { persist(); render(); return; }
    }
  } else if (Math.random() < 0.5 && c.health.some(h => h)) {
    healBox(c);
    addLog(c, "You crash at home for a while — it helps.");
  } else {
    addLog(c, "You crash at home for a while. Quiet, at least.");
  }
  G.homeApartment = apartment;
  // todo3.md INTERFACE UPDATE 2.5 — resting at home still ticks the clock
  // and rerolls the Board, but returns to Downtime instead of dropping
  // straight into the Mission Board (same fix as Spend the Night, §20.19).
  processRestTick(true, true);
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
    const bb = G.character.contacts.find(p => p.id === G.restFlow.withId) || findBloodbrother(G.character);
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
  const total = sum + c.attrs.Combat + bestHealBonus(c) + cyberAttrModifier(c, "Combat");
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
  // BATCH 2.1 (item 12) — Night on the Street always grants a bonus point of
  // BOOST on top of whatever the roll itself resolved, win or lose: the city
  // itself feeds you something, checked before the tier branches below since
  // it applies no matter what happens next (including a fatal one).
  if (c.boost < 10) {
    c.boost += 1;
    addLog(c, pick(DATA.nightBoostFlavor));
  }
  if (res.tier === "full") {
    healBox(c);
    addLog(c, `You get through ${flavor} — and actually catch some real rest.`);
  } else if (res.tier === "fail") {
    addLog(c, `It's ${flavor}, and it costs you — you catch a hit out there.`);
    if (handleGoingDown(c, applyHarm(c))) { G.restFlow = null; persist(); render(); return; }
  } else {
    addLog(c, `It's ${flavor}. You get by, nothing more.`);
  }
  G.restFlow = null;
  // todo3.md UPDATE 2.7 — Night on the Street gets the same fix as Spend
  // the Night (§20.19) and Rest at your Apartment (§20.20): still ticks
  // the clock and rerolls the Board, but returns to Downtime instead of
  // dropping straight into the Mission Board.
  processRestTick(false, true);
}

// BLOODBROTHER "Spend the Night" (todo3.md Persons) — its own three-tier
// Social table, distinct from Night on the Street's. BATCH 2.0: `bb` comes
// from G.restFlow.withId (which specific Amigue) now that more than one
// can exist, falling back to the old first-match behavior defensively.
function finishBrotherNight() {
  const c = G.character;
  const res = G.restFlow.lastResult;
  const bb = c.contacts.find(p => p.id === G.restFlow.withId) || findBloodbrother(c);
  if (res.tier === "full") {
    if (bb) nudgeRelationship(c, bb.id, 1);
    grantBloodbrotherGift(c);
    G.restFlow = null;
    processRestTick(false, true); // todo3.md INTERFACE 2.4.4 — a clean night in returns to Downtime, not straight to the Mission Board
  } else if (res.tier === "partial") {
    healBox(c);
    if (c.boost > 0) { c.boost -= 1; addLog(c, "Hungover — that BOOST is gone, but at least you're patched up."); }
    else addLog(c, "Hungover, but at least you're patched up.");
    G.restFlow = null;
    processRestTick();
  } else {
    addLog(c, `It goes sideways fast — you and ${bb ? bb.name : "your Amigue"} end up in a street fight.`);
    G.restFlow = { stage: "brotherfight", withId: bb ? bb.id : null, pendingResult: null, lastResult: null };
    persist();
    render();
  }
}

// The 6- branch's nested Combat roll against the BLOODBROTHER's faction.
function finishBrotherFight() {
  const c = G.character;
  const res = G.restFlow.lastResult;
  const bb = c.contacts.find(p => p.id === G.restFlow.withId) || findBloodbrother(c);
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
    addLog(c, "You catch a bad one in the scuffle.");
    if (handleGoingDown(c, applyHarm(c))) { G.restFlow = null; persist(); render(); return; }
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
    // BATCH 2.1 — the catalog now has 3 Street models per attr; pick a
    // random one instead of always the same first match.
    const candidates = DATA.gear.Street.filter(g => g.attr === attr);
    const item = candidates.length ? pick(candidates) : null;
    if (item) {
      const gift = { name: item.name, attr: item.attr, tier: "Street" };
      c.gear.push(gift);
      autoCarryNewItem(c, gift); // §20.8 — the category has no carried item yet, so this one always is
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
// viaApartment (BATCH 2.0): true when this tick came from Rest at your
// Apartment — if it's the tick that fills the clock, the resulting Hunt
// happens at home (startHunt's atHome param) instead of out on the street.
// returnToHub (todo3.md INTERFACE 2.4.4): a successful Spend the Night still
// ticks the clock and rerolls the Board like any other Rest action, but
// lands back on the Downtime screen instead of dropping the player straight
// into the Mission Board — startJobSearch() already rendered "briefing" by
// the time this runs, so it's a deliberate second render to override that,
// not a race: JS won't paint the intermediate frame.
function processRestTick(viaApartment, returnToHub) {
  const c = G.character;
  c.restCount++;
  if (c.restCount === 1) lockInArchenemy(c);
  c.shopOffers = genShopOffers(reputationTier(c)); // §20.5 — new stock on the shelves each tick
  runFactionPowerStruggles(c);
  applyFactionPassiveRecovery(c); // BATCH 2.0 — counters the downward trend
  recoverWoundedContacts(c); // INTERFACE 2.4.1 — wounded contacts sit out 2 ticks (Rest or job), then clear
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
    startHunt(viaApartment);
    return;
  }
  startJobSearch(true);
  if (returnToHub) {
    G.phase = "hub";
    persist();
    render();
  }
}

function lockInArchenemy(c) {
  if (!c.contacts.length) return;
  const worst = c.contacts.reduce((min, p) => p.relationship < min.relationship ? p : min, c.contacts[0]);
  c.archenemyId = worst.id; // who the Rest clock is counting down to — see tagArchenemy() for the general tag
  tagArchenemy(c, worst);
  addLog(c, `Word's out that ${worst.name} has a real problem with you. Someone's asking around about where you sleep.`, "archenemy");
}

function findBloodbrother(c) {
  return c.contacts.find(p => p.bloodbrother);
}

// §20.6 — one tick short of the forced Hunt (restCount === 3), the locked-in
// Archenemy has a 50% chance of striking first: either a friend (any
// Amigue/Compi, relationship ≥3) or the player's Apartment, whichever is
// available (a coin flip between the two if both are). No-ops if neither a
// friend nor an apartment exists, or the Archenemy is somehow already gone.
// job (UPDATE 3.0, todo3.md ARCHENEMY, optional): the just-finished job —
// "Archenemy should not hit on helpers that are on a Job" excludes anyone
// who rode along as one of this job's Helpers from the "hit a friend" pool
// (they're out on the job with the player, not an easy mark at home).
function resolveArchenemyClockEvent(c, job) {
  if (c.restCount !== 3) return;
  if (Math.random() >= 0.5) return;
  const archenemy = c.contacts.find(p => p.id === c.archenemyId);
  if (!archenemy) return;

  const helperIds = new Set((job && job.helpers ? job.helpers : []).map(h => h.person.id));
  const friends = c.contacts.filter(p => p.relationship >= 3 && p.id !== archenemy.id && !helperIds.has(p.id));
  const hasApartment = c.apartments.length > 0;
  if (!friends.length && !hasApartment) return;

  const hitApartment = hasApartment && (!friends.length || Math.random() < 0.5);
  if (hitApartment) {
    // UPDATE 3.1 (chat request) — several apartments can exist now; picks
    // one at random to invade instead of always hitting "the" apartment.
    resolveApartmentInvasion(c, archenemy, pick(c.apartments));
  } else {
    const target = pick(friends);
    addLog(c, `While you're out on the job, ${archenemy.name} ${pick(DATA.archenemyInvasion.friendHit)} ${target.name}.`, "archenemy");
    woundPerson(c, target);
    gainReputation(c, -1); // BATCH 2.0 — a landed hit costs Reputation
    addLog(c, `Reputation -1 (now ${c.reputation}, ${reputationTitle(c)}).`, "archenemy");
  }
}

// §20.6 — the Archenemy's own break-in roll: 2d6 + (their factionTier -
// installed Security features) vs. 10+/7-9/6-. No player attribute is
// involved — this is entirely the Archenemy's side of the roll.
// apartment (UPDATE 3.1, chat request): which of possibly several owned
// apartments got picked as the target — every read/write below is scoped
// to that one entry, not "the" apartment.
function resolveApartmentInvasion(c, archenemy, apartment) {
  const features = apartment.security.length;
  const { sum } = roll2d6();
  const roll = sum + ((archenemy.factionTier || 1) - features);

  if (roll >= 10) {
    const evil = randInt(1, 6);
    if (evil <= 3) {
      // §20.8 — "a leftover inventory gear that was not on the last
      // mission" (todo3.md): prefer stealing from what's sitting at home
      // uncarried, only reaching for carried gear if that's all there is.
      const leftovers = c.gear.filter(g => !g.carried);
      const pool = leftovers.length ? leftovers : c.gear;
      if (pool.length) {
        const item = pick(pool);
        c.gear = c.gear.filter(g => g !== item);
        addLog(c, `${pick(DATA.archenemyInvasion.steal)} (lost: ${item.name})`, "archenemy");
      } else {
        addLog(c, `${archenemy.name}'s people break in but find nothing worth taking.`, "archenemy");
      }
    } else if (evil <= 5) {
      addLog(c, `${pick(DATA.archenemyInvasion.torch)} (${apartment.place || DATA.apartments[apartment.tier].stage} in ${apartment.location})`, "archenemy");
      c.apartments = c.apartments.filter(a => a !== apartment);
    } else {
      apartment.trapped = true; // §20.6 — 2 Harm boxes next time you Rest at home
      addLog(c, `${pick(DATA.archenemyInvasion.trap)} (${apartment.location})`, "archenemy");
    }
    // BATCH 2.0 — a landed hit costs Reputation; being spooked off or
    // burned (below) are player wins, not losses.
    gainReputation(c, -1);
    addLog(c, `Reputation -1 (now ${c.reputation}, ${reputationTitle(c)}).`, "archenemy");
  } else if (roll >= 7) {
    addLog(c, pick(DATA.archenemyInvasion.spooked), "archenemy");
  } else {
    archenemy.factionTier = Math.max(1, (archenemy.factionTier || 1) - 1);
    addLog(c, `${archenemy.name} ${pick(DATA.archenemyInvasion.burned)}`, "archenemy");
  }
}

// §20.7 — reuses the checkpoint's own dice-and-consequence shape (todo3.md:
// "This will be as checkpoint, but the description has to be changed") as
// a single auto-resolved roll (the player's own Social, since they're the
// one answering the door) rather than routing back through the interactive
// Checkpoint UI — the job that triggered it is already over by Debrief.
// UPDATE 3.1 (chat request) — with several apartments possible, only fires
// if the player owns one AT the job's own Location — "the heat traces back
// home" only means anything if home is actually there. No fallback to a
// random other apartment: one somewhere else was never near this job.
function resolveApartmentRaid(c, job) {
  if (!c.apartments.some(a => a.location === job.location.name)) return;
  const category = locationCategory(job.location, c.factionStandings);
  const heat = job.location.heat;
  if (!((category === "Corpo" && heat >= 4) || (category === "Crime" && heat >= 5))) return;
  if (Math.random() >= 0.2) return;

  const agency = checkpointAgency(job.location, c.factionStandings) || "EurCop";
  const gearBonus = bestGearBonus(c, "Social");
  const { sum } = roll2d6();
  const total = sum + c.attrs.Social + (gearBonus ? gearBonus.bonus : 0) + cyberAttrModifier(c, "Social");

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
    if (!applyCheckpointDamage(c, job, "harm")) applyCheckpointDamage(c, job, pick(["vehicle", "gear"]));
  }
}

// BATCH 2.1 (items 4/5) — the Employer's/Target's faction data was already
// present in the Briefing's prose lines; this makes it legible at a glance
// instead of buried in a sentence, on the Briefing card and (via
// jobContextHtml below) on every Challenge screen too.
function factionSummaryHtml(job) {
  const targetFaction = job.mission.target ? job.mission.target.faction : null;
  return `<p class="faction-summary"><strong>Employer Faction:</strong> ${job.employer.faction}` +
    (targetFaction ? ` &nbsp;•&nbsp; <strong>Target Faction:</strong> ${targetFaction}` : "") + `</p>`;
}

// BATCH 2.1 (item 5) — keeps job type/employer/location/faction visible on
// every Challenge-hosting screen (Steps/Encounter/Checkpoint), not just the
// Briefing you accepted the job from several screens ago.
function jobContextHtml(job) {
  if (!job) return "";
  return `<p class="job-context muted">${job.mission.special ? job.mission.specialName : job.mission.type} for ${job.employer.name} — ${job.location.name} ${heatBarHtml(job.location.heat)}</p>${factionSummaryHtml(job)}`;
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
      return `<p><strong>Cargo:</strong> ${mission.target.name} (${mission.target.faction})</p><p><strong>Route:</strong> ${mission.fromLocation.name} → ${mission.location.name}</p>${assetRow}`;
    case "Delay":
    case "Hold":
      return `<p><strong>Target:</strong> ${mission.target.name} (${mission.target.profession}, ${mission.target.faction})</p><p><strong>Time:</strong> ${["Short", "Medium", "Long"][mission.timePeriod - 1]} (${mission.timePeriod} rounds)</p>${assetRow}`;
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
  wrap.className = "card centered"; // todo3.md INTERFACE 2.4.3 — "align Gear Up window to the center"
  wrap.innerHTML = `<h2>Gear Up</h2><p class="muted">Anyone coming with you? Gear's sorted from the Shop back in town.</p>`;

  // §20.1 — up to 3 Helpers total, mixing paid strangers (Hire) and
  // relationship-recruited contacts (Call in a Favor). Already-brought
  // helpers are listed first, then whatever slots remain.
  const helperSection = document.createElement("div");
  helperSection.className = "section";
  helperSection.innerHTML = `<h3>Helpers (${job.helpers.length}/3)</h3>`;

  // todo3.md UPDATE 2.6 — "put Helper name on one row and the game effect
  // on the row below. Align costs, and align buttons horizontally from the
  // middle of the buttons": every Helper-ish row (already brought, Hire, or
  // Call in a Favor) is now a name/effect two-line stack on the left, the
  // cost and any button on the right, all sharing the same .helper-row
  // layout so their costs and buttons line up down the list.
  job.helpers.forEach(h => {
    const perk = h.source === "hire" ? `+1 ${h.attr}` : "+2 to one test of your choice";
    // BATCH 2.0 — show if this Helper is wounded/benched for the rest of the job.
    const woundedBadge = h.benched ? ` <span class="archenemy-badge">wounded — out</span>` : "";
    const row = document.createElement("div");
    row.className = "offer helper-row";
    row.innerHTML = `<div class="helper-info"><div class="helper-name">${h.person.name}${woundedBadge}</div><div class="helper-effect muted">${perk}</div></div>`;
    helperSection.appendChild(row);
  });
  wrap.appendChild(helperSection);

  if (job.helpers.length < 3) {
    // UPDATE 3.0 (todo3.md CHARACTER CLASS ABILITY) — Rocker's NATURAL
    // LEADER: "they get a one free Hire for a mission" — waives the 1 BOND
    // cost on the first Hire per job only, then behaves normally.
    const freeHire = c.profession === "Rocker" && !job.classAbility.freeHireUsed;
    const hireCost = freeHire ? 0 : 1;
    const hireRow = document.createElement("div");
    hireRow.className = "offer helper-row";
    hireRow.innerHTML = `<div class="helper-info"><div class="helper-name">Hire backup for this job</div><div class="helper-effect muted">+1 to a random specialty attribute</div></div><div class="helper-actions"><span class="helper-cost muted">${freeHire ? "Free (Natural Leader)" : "1 BOND"}</span></div>`;
    const hireBtn = document.createElement("button");
    hireBtn.textContent = "Hire";
    hireBtn.disabled = c.bonds < hireCost;
    hireBtn.addEventListener("click", () => {
      if (freeHire) job.classAbility.freeHireUsed = true;
      else c.bonds -= 1;
      const person = getPerson(c, "ally", job.excludeIds);
      // §20.6 — their passive bonus attr comes from their profession's
      // specialty (a random pick between the two, for a profession with two)
      // instead of a flat random attribute.
      const attr = pick(DATA.npcSpecialty[person.profession] || ["Social"]);
      job.helpers.push({ person, source: "hire", tier: null, attr, used: false, benched: false });
      addLog(c, `${person.name} signs on for the job, backing you up on ${attr}.`);
      persist(); render();
    });
    hireRow.querySelector(".helper-actions").appendChild(hireBtn);
    wrap.appendChild(hireRow);

    // Call in a Favor — a contact you're square with (relationship ≥3)
    // instead of a stranger. Excludes anyone already brought along, and
    // (todo3.md UPDATE 2.8) a wounded Compi/Amigue — they're sidelined,
    // not fit for a job.
    const broughtIds = new Set(job.helpers.map(h => h.person.id));
    const eligible = c.contacts.filter(p => p.relationship >= 3 && !p.archenemy && !p.wounded && !broughtIds.has(p.id));
    if (eligible.length) {
      const allySection = document.createElement("div");
      allySection.className = "section";
      allySection.innerHTML = "<h3>Call in a Favor</h3>";
      eligible.forEach(person => {
        const free = person.relationship >= 5;
        // BATCH 2.0 — the free "+2 to one test" perk stays as-is, but hint at
        // what this Amigue is actually good at via their profession specialty.
        const specialty = (DATA.npcSpecialty[person.profession] || ["Social"]).join("/");
        const row = document.createElement("div");
        row.className = "offer helper-row";
        row.innerHTML = `<div class="helper-info"><div class="helper-name">${person.name} <em>(${person.profession}, good with ${specialty})</em></div><div class="helper-effect muted">+2 to one test of your choice</div></div><div class="helper-actions"><span class="helper-cost muted">${free ? "Free" : "pays 1 BOND"}</span></div>`;
        const btn = document.createElement("button");
        btn.textContent = "Bring along";
        btn.addEventListener("click", () => {
          job.helpers.push({ person, source: "ally", tier: free ? 5 : 3, attr: null, used: false, benched: false });
          addLog(c, `${person.name} agrees to back you up${free ? "" : ", expecting a cut of the payout"}.`);
          persist(); render();
        });
        row.querySelector(".helper-actions").appendChild(btn);
        allySection.appendChild(row);
      });
      wrap.appendChild(allySection);
    }
  }

  wrap.appendChild(renderLoadoutSection());

  const goBtn = document.createElement("button");
  goBtn.textContent = "Head Out";
  goBtn.addEventListener("click", () => {
    // todo3.md INTERFACE UPDATE 2.5 — a carried Vehicle is "Moving" for the
    // duration of the job; stash wherever it actually was so Debrief can
    // put it back (runDebrief()) — even if the job ends via Abort Mission
    // (finishAbortMission() routes there too).
    const vehicle = c.gear.find(g => g.attr === "Driving" && g.carried);
    if (vehicle) {
      vehicle.preMissionLocation = vehicleLocation(vehicle);
      vehicle.location = "Moving";
    }
    // UPDATE 3.0/3.1 — Jockey GEARHEAD (moved here from the Nomad Turf,
    // chat request): "they never lose their vehicle... it always returns to
    // him after mission" — snapshot it here (name/tier survive even if
    // degradeGearItem/loseVehicle later strips or removes it mid-job) so
    // runDebrief can restore it once the job's over.
    if (c.profession === "Jockey" && vehicle) {
      job.jockeyVehicleSnapshot = { name: vehicle.name, tier: vehicle.tier, tags: vehicle.tags, preMissionLocation: vehicle.preMissionLocation };
    }
    // UPDATE 3.1 (chat request) — Hacker: "never lose the deck — similarly
    // like GEARHEAD vehicle." Same snapshot-and-reconcile shape as Jockey's
    // vehicle above, just for a carried Hacking-attr item instead of a
    // Driving one (decks don't have a Moving/location concept to restore).
    const deck = c.gear.find(g => g.attr === "Hacking" && g.carried);
    if (c.profession === "Hacker" && deck) {
      job.hackerDeckSnapshot = { name: deck.name, tier: deck.tier, tags: deck.tags };
    }
    G.phase = advanceFromGearUp();
    persist(); render();
  });
  wrap.appendChild(goBtn);

  els.main.appendChild(wrap);
}

// §20.8 — the Loadout: pick which owned gear actually comes on this job.
// Only carried gear grants its bonus or takes the hit (bestGearBonus,
// applyHarm, degradeGearItem call sites, state.js/game.js) — anything left
// at home is inert for the whole job.
// UPDATE 3.1 (chat request) — "limit gear to three items + any from
// vehicle. Vehicle has its own extra slot": Vehicles keep their own
// exclusive single-carried slot (unchanged); Weapons/Clothing/Decks/Social
// now share one flat pool capped at computeCarrySlots() (state.js) instead
// of each getting a guaranteed slot plus a separate spare pool.
function renderLoadoutSection() {
  const c = G.character;
  const categories = ["Weapons", "Clothing", "Decks", "Vehicles", "Social"];
  const cap = computeCarrySlots(c);

  const section = document.createElement("div");
  section.className = "section";
  section.innerHTML = `<h3>Loadout</h3><p class="muted">Only what you carry grants its bonus (or takes the hit) this job. Carry up to <span id="spare-count">${carriedNonVehicleCount(c)}</span>/${cap} items (Weapons/Clothing/Decks/Social) — your Vehicle has its own slot, on top.</p>`;

  // todo3.md INTERFACE 2.4.4 — "align all Gear Up boxes horizontally": the
  // category blocks sit side by side in a wrapping row instead of stacked.
  const grid = document.createElement("div");
  grid.className = "loadout-grid";
  section.appendChild(grid);

  categories.forEach(cat => {
    const items = c.gear.filter(g => gearCategory(g) === cat);
    if (!items.length) return;
    const catBlock = document.createElement("div");
    catBlock.innerHTML = `<h4>${cat}</h4>`;
    items.forEach(item => {
      const row = document.createElement("label");
      row.className = "offer";
      row.style.cursor = "pointer";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.carried;
      checkbox.addEventListener("change", () => {
        // BATCH 2.1 (item 1) — only one Vehicle can be in use at a time, no
        // matter how much pool room exists (you can't drive two cars).
        // Radio-style swap — checking one auto-uncarries any other carried
        // Vehicle — rather than a hard block, matching the same mutual-
        // exclusivity idiom used for the Hunt's Amigue-call checkboxes.
        if (cat === "Vehicles" && checkbox.checked) {
          c.gear.forEach(g => { if (gearCategory(g) === "Vehicles" && g !== item) g.carried = false; });
          item.carried = true;
          persist(); render();
          return;
        }
        if (cat !== "Vehicles" && checkbox.checked && carriedNonVehicleCount(c) >= cap) {
          checkbox.checked = false;
          return;
        }
        item.carried = checkbox.checked;
        persist(); render();
      });
      const kind = item.attr || (item.armor ? `armor x${item.armor}` : "");
      const tagsHtml = item.tags ? ` [${item.tags.join(", ")}]` : "";
      row.appendChild(checkbox);
      row.append(` ${item.name} (${item.tier}${kind ? `, ${kind}` : ""}${tagsHtml})`);
      catBlock.appendChild(row);
    });
    grid.appendChild(catBlock);
  });

  const healItems = c.gear.filter(g => g.heal);
  if (healItems.length) {
    const healBlock = document.createElement("div");
    healBlock.innerHTML = `<h4>Heal (always available)</h4>`;
    healBlock.innerHTML += healItems.map(g => `<div class="offer"><span>${g.name} (${g.tier})</span></div>`).join("");
    grid.appendChild(healBlock);
  }

  return section;
}

// §20.7 (BATCH 2.3 fix) — Checkpoint and Random Encounter are mutually
// exclusive at each job boundary (entry/exit), never both: GearUp →
// (checkpoint(pre) OR encounter(pre)) → Steps → (checkpoint(post) OR
// encounter(post)) → Debrief. Checkpoint is the deterministic Heat-driven
// gate and always gets first chance; Encounter only rolls if Checkpoint
// didn't fire — todo3.md BATCH 2.3: "should not get a random encounter and
// a checkpoint in entry or exit" (the two used to be able to chain, one
// firing right after the other resolved, which read like a Fight-or-Run
// loop even though neither mechanic actually re-armed itself).
function resolveBoundaryGate(stage) {
  if (maybeTriggerCheckpoint(stage)) return "checkpoint";
  return maybeTriggerEncounter(stage) ? "encounter" : null;
}

function advanceFromGearUp() {
  return resolveBoundaryGate("pre") || "steps";
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
  wrap.className = "card centered"; // todo3.md INTERFACE 2.4.4 — every window after Gear Up is centered
  wrap.innerHTML = `<h2>Encounter</h2>${jobContextHtml(job)}<p class="step-desc">${job.encounter.step.desc}</p>`;
  els.main.appendChild(wrap);
  if (job.abortFlow) { renderAbortBox(els.main); return; } // todo3.md INTERFACE 2.4.2/2.4.4
  renderChallenge(wrap, job.encounter.step, () => {
    finalizeChallengeCommon();
    if (G.phase === "death") { persist(); render(); return; } // BATCH 2.0
    if (job.encounter.stage === "pre") {
      G.phase = "steps";
    } else {
      // BATCH 2.3 fix — reaching an Encounter's own resolution at "post"
      // already means Checkpoint didn't fire at this boundary (Checkpoint
      // is always tried first, see resolveBoundaryGate), so there's nothing
      // left to roll here — straight to Debrief, not a second gate.
      G.phase = "debrief";
      runDebrief();
    }
    persist();
    render();
  });
  if (!job.pendingResult) renderAbortBox(els.main); // hidden while a roll result awaits Continue
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
  wrap.className = "card centered"; // todo3.md INTERFACE 2.4.4
  wrap.innerHTML = `<h2>${cp.agency} Checkpoint</h2>${jobContextHtml(job)}`;
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
  G.expandedSwap = null; // UPDATE 3.1 (chat request) — see finalizeChallengeCommon's note
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
    addLog(c, `You grease the ${cp.agency} line and roll on through (-${cost} BOND${cost === 1 ? "" : "S"}).`);
    finishCheckpoint();
  });
  block.appendChild(payBtn);

  const ditchBtn = document.createElement("button");
  ditchBtn.textContent = "Ditch the contraband";
  ditchBtn.addEventListener("click", () => {
    // §20.8 — only what you actually brought is on you to toss.
    const carried = c.gear.filter(g => g.carried);
    if (carried.length) {
      const item = pick(carried);
      c.gear = c.gear.filter(g => g !== item);
      addLog(c, `You toss the ${item.name} before they can find it — clean otherwise.`);
    } else {
      addLog(c, `You've got nothing on you to ditch — you talk your way through anyway.`);
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
  G.expandedSwap = null; // UPDATE 3.1 (chat request) — see finalizeChallengeCommon's note
  let died = false;
  if (res.tier === "full") {
    addLog(c, `You get clear of the ${cp.agency} line without a scratch.`);
  } else if (res.tier === "partial") {
    addLog(c, `You get through, but it costs you.`);
    died = applyCheckpointDamage(c, job, pick(["harm", "vehicle", "helper"]));
  } else {
    addLog(c, `It goes bad at the line.`);
    died = applyCheckpointDamage(c, job, "harm");
    if (!died) died = applyCheckpointDamage(c, job, pick(["vehicle", "helper", "gear"]));
  }
  if (died) { persist(); render(); return; }
  finishCheckpoint();
}

// A single damage "kind", falling back to Harm if the preferred target
// doesn't exist (no vehicle/no active helper/no gear) — same recursive-
// fallback shape as applyFalloutConsequence (§19.9).
// Returns true if this call ended the run in death (handleGoingDown,
// BATCH 2.0) — callers must check and bail rather than continue their own
// next-step logic.
function applyCheckpointDamage(c, job, kind) {
  if (kind === "harm") {
    return applyMissionHarm(c, job);
  } else if (kind === "vehicle") {
    // §20.8 — only a carried vehicle can take this hit.
    const vehicles = c.gear.filter(g => g.carried && g.attr === "Driving");
    if (vehicles.length) { degradeGearItem(c, pick(vehicles)); return false; }
    return applyCheckpointDamage(c, job, "harm");
  } else if (kind === "helper") {
    if (job.helpers.some(h => !h.benched)) { woundJobHelper(c, job); return false; }
    return applyCheckpointDamage(c, job, "harm");
  } else if (kind === "gear") {
    const carried = c.gear.filter(g => g.carried);
    if (carried.length) { degradeGearItem(c, pick(carried)); return false; }
    return applyCheckpointDamage(c, job, "harm");
  }
  return false;
}

// Shared "checkpoint resolved, move on" handler for every branch above.
function finishCheckpoint() {
  const job = G.job;
  const stage = job.checkpoint.activeStage;
  job.checkpoint.stage = null;
  if (stage === "pre") {
    // BATCH 2.3 fix — Checkpoint firing at "pre" already used up this
    // boundary's one chance (see resolveBoundaryGate); no separate
    // Encounter roll afterward.
    G.phase = "steps";
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
  wrap.className = "card centered"; // todo3.md INTERFACE 2.4.4
  wrap.innerHTML = `<h2>${job.mission.type} — Step ${job.stepIndex + 1}/${job.steps.length}</h2>${jobContextHtml(job)}<p class="step-desc">${step.desc}</p>`;
  els.main.appendChild(wrap);
  if (job.abortFlow) { renderAbortBox(els.main); return; } // todo3.md INTERFACE 2.4.2/2.4.4
  renderChallenge(wrap, step, () => finalizeStep(step));
  if (!job.pendingResult) renderAbortBox(els.main); // hidden while a roll result awaits Continue
}

// todo3.md INTERFACE 2.4.2 — "ABORT MISSION": a bail-out box shown once a
// job is under way (Steps/Encounter). Rolls Evasion (Stealth or Driving,
// player's choice) through the normal Challenge UI (reusing every existing
// modifier — gear, Helpers, Wounded, BOOST, one-shots) and always ends the
// job as a forced Failure — see finishAbortMission/runDebrief's forceFailure.
// INTERFACE 2.4.4 — its own card (not nested in the mission card), appended
// as a sibling in #main so it reads as a genuinely separate, "slightly
// separated" box instead of just another section inside the mission window.
function renderAbortBox(container) {
  const job = G.job;
  const box = document.createElement("div");
  box.className = "card centered abort-box";
  if (!job.abortFlow) {
    box.innerHTML = `<h3>Abort Mission</h3><p class="muted">Cut and run — the job ends here, one way or another.</p>`;
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.textContent = "Abort Mission";
    btn.addEventListener("click", () => {
      job.abortFlow = { pendingResult: null, lastResult: null };
      persist(); render();
    });
    box.appendChild(btn);
    container.appendChild(box);
    return;
  }
  box.innerHTML = `<h3>Abort Mission</h3>`;
  container.appendChild(box);
  renderChallenge(box, { attr: "Stealth", alt: "Driving", desc: "Evasion — break contact and get clear." }, finishAbortMission, { job, holder: job.abortFlow });
}

// A Partial takes one of {1 Harm box, a carried item damaged, an active
// Helper wounded}; a Fail takes two draws from that same list — todo3.md:
// "you can take same twice so it can result to two damage, dead help..."
function applyAbortConsequence(c, job) {
  const carried = c.gear.filter(g => g.carried);
  const activeHelpers = job.helpers.filter(h => !h.benched);
  const options = ["harm"];
  if (carried.length) options.push("item");
  if (activeHelpers.length) options.push("helper");
  const choice = pick(options);
  if (choice === "item") { degradeGearItem(c, pick(carried)); return false; }
  if (choice === "helper") { woundJobHelper(c, job); return false; }
  return applyMissionHarm(c, job); // "harm" — true only if the run just ended for good (permadeath)
}

function finishAbortMission() {
  const c = G.character;
  const job = G.job;
  const res = job.abortFlow.lastResult;
  let ended = false;
  if (res.tier === "full") {
    addLog(c, "Clean break — you're gone before anyone clocks it.");
  } else if (res.tier === "partial") {
    addLog(c, "You get clear, but not for free.");
    ended = applyAbortConsequence(c, job);
  } else {
    addLog(c, "It's a mess getting out.");
    for (let i = 0; i < 2 && !ended && !isDown(c); i++) {
      ended = applyAbortConsequence(c, job);
    }
  }
  job.abortFlow = null;
  if (ended || G.phase === "death") { persist(); render(); return; }
  addLog(c, `${c.name} pulls the plug on the job. Any hired backup stands down — they'd need hiring again next time.`);
  G.phase = "debrief";
  runDebrief(true); // forced Failure — todo3.md: "Mission failed, normal penalty to your rep"
  persist();
  render();
}

// Applies a resolved roll's effects (Harm/Heat/etc. per gamedesc.md §7) and
// clears the pending result. Shared by mission steps and Random Encounters so
// neither path skips consequences. BOOST growth is tallied once at Debrief
// from job.stepResults instead of tracked per-step here.
function finalizeChallengeCommon() {
  const job = G.job;
  const c = G.character;
  const res = job.lastResult;

  // UPDATE 3.1 (chat request) — "reset the WRAITH/GEARHEAD/similar buttons
  // after moving away from the window": this roll is done and we're about
  // to move on to whatever comes next (the next step, the post-Encounter
  // check, Debrief, ...) — collapse any expanded swap-picker panel now
  // rather than carrying it (or its label matching an unrelated ability on
  // the next box) into a context it no longer belongs to.
  G.expandedSwap = null;

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
  const loc = c.locations[job.location.name]; // UPDATE 3.0 — snapshotted before the roll's own fallout can raise it
  const heatBefore = loc ? loc.heat : 0;
  const res = finalizeChallengeCommon();
  if (G.phase === "death") { persist(); render(); return; } // BATCH 2.0
  // Side-objective steps (todo3.md ADD: "more BONDS") are tracked
  // separately so a botched side job can't tank the main contract's
  // success ratio — only the main sequence feeds job.stepResults.
  if (step.sideObjective) {
    job.sideObjective.results.push({ attr: res.usedAttr, tier: res.tier });
  } else {
    // UPDATE 3.0 (todo3.md MISSIONS) — carry the step's keyChallenge tag
    // (MISSION_SEQUENCES, engine.js) onto its result so determineMissionOutcome
    // can find it by tag instead of array position (a forced step spliced in
    // right after it would otherwise shift the indices).
    job.stepResults.push({ attr: res.usedAttr, tier: res.tier, keyChallenge: !!step.keyChallenge });
    applySpecialMissionBloodbrotherDanger(c, job, res);

    // Assassination's Approach / Heist's Breach: a Partial/Fail hands the
    // very next main-sequence step a -1/-2 ("alerted"/"code RED") penalty —
    // consumed automatically by computeModifiers() once job.stepIndex moves
    // onto that next step (see its stepIndex-keyed check there).
    if (step.alertOnFail && res.tier !== "full") {
      job.pendingStepPenalty = {
        stepIndex: job.stepIndex + 1,
        value: res.tier === "fail" ? -2 : -1,
        label: res.tier === "fail" ? "Code RED" : "Alerted"
      };
    }

    // Transport: the person/cargo being moved takes damage on either of its
    // two main steps — Fail 2, Partial 1, out of 3 before they die in
    // transit (checked at Debrief, determineMissionOutcome).
    if (step.targetDamage && (res.tier === "partial" || res.tier === "fail")) {
      const dmg = res.tier === "fail" ? 2 : 1;
      job.mission.targetDamage = (job.mission.targetDamage || 0) + dmg;
      addLog(c, `${job.mission.target.name} takes a hit in transit (${job.mission.targetDamage}/3).`);
    }
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

  // UPDATE 3.0 (todo3.md MISSIONS, Delay) — "If Heat gets to 5, the mission
  // is over and a failure. Partial raises 1, if it doesn't already do so;
  // Failure in check raises Heat by 2, if it doesn't already do so." The
  // generic §19.9 fallout table sometimes picks "lose equipment" instead of
  // Heat on a Social/Stealth Partial/Fail — this tops Heat up to the
  // guaranteed amount regardless of what it actually picked, then checks
  // the Heat-5 mission-ending condition.
  if (job.mission.type === "Delay" && !step.sideObjective && loc) {
    if (res.usedAttr === "Social" || res.usedAttr === "Stealth") {
      const wanted = res.tier === "fail" ? 2 : res.tier === "partial" ? 1 : 0;
      if (wanted) {
        const gained = loc.heat - heatBefore;
        if (gained < wanted) raiseHeat(c, loc, wanted - gained);
      }
    }
    if (loc.heat >= 5) {
      addLog(c, `Heat hits 5 at ${job.location.name} — the whole thing falls apart.`);
      G.phase = "debrief";
      runDebrief(true); // forceFailure
      persist();
      render();
      return;
    }
  }

  job.stepIndex++;
  if (job.stepIndex >= job.steps.length) {
    // BATCH 2.3 fix — Checkpoint tried first, Encounter only if it didn't
    // fire (resolveBoundaryGate); previously Encounter was checked first
    // here, and could chain into a Checkpoint roll right after resolving.
    G.phase = resolveBoundaryGate("post") || "debrief";
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
  ensureOriginalTier(item); // todo3.md UPDATE 2.8 — lock in the Repair/Mod ceiling before this item ever moves
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
  if (fallout.heatAlways) raiseHeat(c, loc, 1);

  if (tier === "full") {
    addLog(c, `Full success on ${attr}.`);
    return;
  }

  const table = DATA.complications[attr];
  addLog(c, tier === "partial" ? pick(table.partial) : pick(table.fail));

  if (fallout.heatOnResolve) raiseHeat(c, loc, fallout.heatOnResolve);

  // BATCH 2.1 (item 7) — a Partial "gearDamage" option costs a flat -1 BOND
  // (or, with no carried gear, redirects to credLoss's own -1 BOND) — at 0
  // BONDS that's a silent no-op billed as a cost. Exclude any Partial option
  // that could land on "gearDamage" while broke, so something else (harm,
  // heat, a wounded helper) gets picked instead. Fail's own "gearDamage"
  // degrades an item rather than costing BONDS, so it's unaffected. Safety
  // net (never hard-lock, matching attrAvailable()): fall back to the
  // unfiltered list if excluding it would leave nothing to pick from.
  const options = tier === "partial" ? fallout.partial : fallout.fail;
  const eligible = tier === "partial" && c.bonds === 0
    ? options.filter(opt => !opt.includes("gearDamage"))
    : options;
  const consequences = pick(eligible.length ? eligible : options);
  for (const key of consequences) {
    if (applyFalloutConsequence(c, job, attr, tier, key, loc)) return; // died — skip any remaining keys in this bundle
  }
}

// BATCH 2.0 (todo3.md) — the one path a mission-scoped Harm hit should use:
// applies the hit, handles permadeath as before, and — only if a Harm box
// was actually marked (not absorbed by carried armor or chrome) — rolls the
// cyberpsycho risk. Returns true if either ended the run.
function applyMissionHarm(c, job) {
  const before = c.health.filter(Boolean).length;
  if (handleGoingDown(c, applyHarm(c))) return true;
  if (c.health.filter(Boolean).length > before) return maybeTriggerCyberpsycho(c, job);
  return false;
}

// BATCH 2.0 (todo3.md) — "count cybernetic replacements — getting to borg".
// Only ever checked on a Harm box actually landing during the job flow
// (Steps/Encounters/Checkpoints, via applyMissionHarm above) — Rest and the
// Archenemy Hunt are their own separate systems and sit outside this.
// Returns true if this ended the run (10+, killed by SwissGuard).
function maybeTriggerCyberpsycho(c, job) {
  if (!c.cyberneticReplacements.length) return false;
  const { sum } = roll2d6();
  const roll = sum + c.cyberneticReplacements.length;
  if (roll <= 6) {
    addLog(c, "Red creeps in at the edges of your vision. You grit your teeth and hold the line.");
    return false;
  }

  if (roll >= 10) {
    addLog(c, "Something snaps behind your eyes. The red haze doesn't lift this time.");
    if (job.employer) killPerson(c, job.employer.id);
    if (job.mission.target) killPerson(c, job.mission.target.id);
    (job.mission.adversaries || []).forEach(a => killPerson(c, a.id));
    job.helpers.forEach(h => killPerson(c, h.person.id));
    addLog(c, "SwissGuard finds you standing over the wreckage and fries you where you stand with a microwave cannon.");
    G.phase = "death";
    return true;
  }

  // 7-9 — everyone opposing you tonight dies, and so does anyone standing
  // too close, but you come back to yourself once the mission's over.
  addLog(c, "The red haze takes you. When it clears, everyone standing against you tonight is dead — and so is anyone who was standing too close.");
  (job.mission.adversaries || []).forEach(a => killPerson(c, a.id));
  if (job.mission.target) killPerson(c, job.mission.target.id);
  job.helpers.slice().forEach(h => {
    killPerson(c, h.person.id);
    c.contacts.forEach(p => { if (p.faction === h.person.faction) nudgeRelationship(c, p.id, -1); });
  });
  if (job.helpers.length) addLog(c, "Word of what you did to your own help gets back to their people fast.");
  job.helpers = [];
  return false;
}

// Returns true if this call ended the run in death (handleGoingDown,
// BATCH 2.0) — applyOutcome's caller must stop applying any further
// consequence keys in the same bundle and bail.
function applyFalloutConsequence(c, job, attr, tier, key, loc) {
  switch (key) {
    case "harm1":
    case "harm2": {
      const hits = key === "harm2" ? 2 : 1;
      for (let i = 0; i < hits; i++) {
        if (applyMissionHarm(c, job)) return true;
        if (isDown(c)) break; // fully Down but an Amigue saved you — no more hits to land
      }
      return false;
    }
    case "gearDamage": {
      // §20.8 — only carried gear can be damaged or lost on a mission.
      const carried = c.gear.filter(g => g.carried);
      if (carried.length === 0) return applyFalloutConsequence(c, job, attr, tier, "credLoss", loc);
      if (tier === "partial") {
        c.bonds = Math.max(0, c.bonds - 1);
        addLog(c, `${pick(DATA.gearDamageFlavor.partial)} (-1 BOND)`);
      } else {
        const matching = carried.filter(g => g.attr === attr);
        degradeGearItem(c, pick(matching.length ? matching : carried));
      }
      return false;
    }
    case "vehicleDamage": {
      const vehicles = c.gear.filter(g => g.carried && g.attr === "Driving");
      if (vehicles.length) { degradeGearItem(c, pick(vehicles)); return false; }
      return applyFalloutConsequence(c, job, attr, tier, "harm1", loc);
    }
    case "loseVehicle": {
      const vehicles = c.gear.filter(g => g.carried && g.attr === "Driving");
      if (vehicles.length) {
        const v = pick(vehicles);
        c.gear = c.gear.filter(item => item !== v);
        addLog(c, `${v.name} is totaled — you lose it for good.`);
        return false;
      }
      return applyFalloutConsequence(c, job, attr, tier, "gearDamage", loc);
    }
    case "woundHelper":
      woundJobHelper(c, job);
      return false;
    case "heat":
      raiseHeat(c, loc, 1);
      return false;
    case "heat2":
      raiseHeat(c, loc, 2);
      return false;
    case "credLoss": {
      const loss = Math.min(c.bonds, tier === "fail" ? 2 : 1);
      c.bonds -= loss;
      addLog(c, `${pick(tier === "fail" ? DATA.credLossFlavor.fail : DATA.credLossFlavor.partial)} (-${loss} BOND${loss === 1 ? "" : "S"})`);
      return false;
    }
  }
  return false;
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

// BATCH 2.1 (items 8/9/13) — shared by renderChallenge() and renderHuntRoll()
// so this batch's three additions to "how a roll happens" each live in
// exactly one place instead of being duplicated across both roll-handling
// code paths.

// Item 13 — "spend up to 2 BOOST," capped by what the character actually
// has. todo3.md INTERFACE 2.4.4 gave this two independent, identical "+1
// BOOST"-labeled boxes side by side so checking either (or both) stacks;
// todo3.md UPDATE 2.6 (row 381) trims that to a single "BOOST" label with
// its 1-2 checkboxes stacked vertically beside it, instead of repeating the
// label on every box.
function boostSpendOptionHtml(c) {
  const max = Math.min(2, c.boost);
  if (!max) return "";
  const boxes = Array.from({ length: max }, () => `<input type="checkbox" class="boost-check" />`).join("");
  return `<div class="boost-spend"><span class="boost-spend-label">BOOST</span><div class="boost-check-stack">${boxes}</div></div>`;
}
// Wires up the checkboxes boostSpendOptionHtml() rendered into `block`:
// each one is independent now (no mutual exclusion) — returns a getter for
// however many are checked, i.e. however much BOOST is spent (0 if none).
function wireBoostSpend(block, onChange) {
  const checks = Array.from(block.querySelectorAll(".boost-check"));
  checks.forEach(cb => cb.addEventListener("change", onChange));
  return () => checks.filter(cb => cb.checked).length;
}

// Item 8 — every generic Challenge roll (never Coffin Hotel's or the
// Apartment raid/invasion's bespoke inline formulas) goes through here so a
// 13+ total always nets +1 BOOST (capped 10), regardless of tier — a
// stronger-than-Full success is worth more than a bare Full.
// Balance pass (chat request) — raised from 12 to 13.
function resolveRoll(c, attrRank, mods) {
  const result = resolve(attrRank, mods);
  if (result.total >= 13 && c.boost < 10) {
    c.boost = Math.min(10, c.boost + 1);
    addLog(c, `That roll comes back hot (${result.total}) — +1 BOOST (now ${c.boost}).`);
  }
  return result;
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
  // UPDATE 3.0/3.1 (todo3.md CHARACTER CLASS ABILITY) — Jockey GEARHEAD:
  // "they can also change one Combat check to a Driving check," once per
  // mission — only when Combat is on offer, Driving isn't already, and
  // they're actually carrying a vehicle.
  const gearheadEligible = job && c.profession === "Jockey" && job.classAbility && !job.classAbility.gearheadUsed
    && rawAttrs.includes("Combat") && !rawAttrs.includes("Driving") && ownsGearForAttr(c, "Driving");
  // UPDATE 3.1 (chat request) — Hacker NETRUNNER: "change one stealth or
  // combat check to hacking," once per mission — offered whenever the
  // step's real options include Combat or Stealth (Hacking isn't already
  // one of them), and they're actually carrying a deck.
  const hackerSwapEligible = job && c.profession === "Hacker" && job.classAbility && !job.classAbility.hackerSwapUsed
    && (rawAttrs.includes("Combat") || rawAttrs.includes("Stealth")) && !rawAttrs.includes("Hacking") && ownsGearForAttr(c, "Hacking");
  // UPDATE 3.1 (chat request) — WRAITH: earned (not profession-gated) by a
  // 2nd "Shadow of X" (§19.1, runDebrief) — "change one combat in mission
  // to Stealth. Same way as GEARHEAD." No gear prerequisite (unlike
  // Jockey's vehicle/Hacker's deck) — it's an earned trait, not equipment.
  const wraithEligible = job && c.wraith && job.classAbility && !job.classAbility.wraithUsed
    && rawAttrs.includes("Combat") && !rawAttrs.includes("Stealth");
  // UPDATE 3.1 (chat request) — WICKED: earned by a 2nd "Killer of X"
  // (§13.8, applyHuntKillReward) — "change Stealth to Combat once in a
  // mission," the reverse pairing of WRAITH above. Same no-gear-prerequisite
  // shape.
  const wickedEligible = job && c.wicked && job.classAbility && !job.classAbility.wickedUsed
    && rawAttrs.includes("Stealth") && !rawAttrs.includes("Combat");

  attrs.forEach(attr => {
    const block = document.createElement("div");
    block.className = "challenge";
    renderRollOption(block, attr, step, job, holder, c, null);

    // UPDATE 3.1 (chat request) — "place GEARHEAD and NETRUNNER in the same
    // box as the roll they could replace, so the mechanic is evident to the
    // player": each swap renders as a second `.swap-option` sub-section
    // inside this same attr's box (renderRollOption below), right beside
    // the roll it substitutes for, instead of appearing as its own separate
    // top-level box next to it. A step offering both Combat and Stealth
    // gets NETRUNNER embedded in both boxes, since it could replace either
    // — clicking either one resolves the same underlying Hacking roll and
    // spends the same once-per-job flag. Collected into one array (rather
    // than each rendered inline as it's found) so a box that happens to
    // have 2+ eligible swaps (e.g. a Jockey who's also earned WRAITH: both
    // GEARHEAD and WRAITH want the Combat box) can be told apart from the
    // common single-swap case just below.
    const swaps = [];
    if (gearheadEligible && attr === "Combat") {
      swaps.push({
        key: "GEARHEAD", attr: "Driving",
        onUse: () => {
          job.classAbility.gearheadUsed = true;
          addLog(c, `${c.name} fights it from behind the wheel — GEARHEAD.`);
        }
      });
    }
    if (hackerSwapEligible && (attr === "Combat" || attr === "Stealth")) {
      swaps.push({
        key: "NETRUNNER", attr: "Hacking",
        onUse: () => {
          job.classAbility.hackerSwapUsed = true;
          addLog(c, `${c.name} routes it through the deck instead — NETRUNNER.`);
        }
      });
    }
    if (wraithEligible && attr === "Combat") {
      swaps.push({
        key: "WRAITH", attr: "Stealth",
        onUse: () => {
          job.classAbility.wraithUsed = true;
          addLog(c, `${c.name} is already gone before the fight starts — WRAITH.`);
        }
      });
    }
    if (wickedEligible && attr === "Stealth") {
      swaps.push({
        key: "WICKED", attr: "Combat",
        onUse: () => {
          job.classAbility.wickedUsed = true;
          addLog(c, `${c.name} drops the quiet approach and goes straight for the throat — WICKED.`);
        }
      });
    }

    if (swaps.length === 1) {
      // The common case, unchanged: a single swap always renders fully
      // expanded, side by side with the real roll.
      const s = swaps[0];
      renderRollOption(block, s.attr, step, job, holder, c, { label: s.key, onUse: s.onUse });
    } else if (swaps.length > 1) {
      // UPDATE 3.1 (chat request) — "if you have both wraith and other
      // ability that can change a combat roll, make them buttons": 2+
      // swaps contending for the same box collapse into a row of toggle
      // buttons (one per ability) instead of all rendering fully expanded
      // at once. Clicking a button reveals that swap's full roll-option
      // details (mods/BOOST/Ally-Assist/one-shot + its own "Roll X"
      // confirm button) via the same renderRollOption() the single-swap
      // case uses; clicking the same button again hides them; clicking a
      // different ability's button switches directly, no need to close the
      // first. G.expandedSwap (ephemeral UI state, never persisted — same
      // idiom as G.shopTab/G.gearTab/G.peopleTab) tracks which one, if any.
      block.classList.add("has-swap");
      const picker = document.createElement("div");
      picker.className = "swap-picker";
      swaps.forEach(s => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "swap-picker-btn" + (G.expandedSwap === s.key ? " active" : "");
        btn.textContent = s.key;
        btn.addEventListener("click", () => {
          G.expandedSwap = G.expandedSwap === s.key ? null : s.key;
          render();
        });
        picker.appendChild(btn);
      });
      block.appendChild(picker);
      const active = swaps.find(s => s.key === G.expandedSwap);
      if (active) {
        renderRollOption(block, active.attr, step, job, holder, c, { label: active.key, onUse: active.onUse });
      }
    }

    // UPDATE 3.0 (todo3.md CHARACTER CLASS ABILITY) — Solo STREET SAMURAI:
    // "they can choose to have one auto success in combat challenge. Once
    // a mission." A separate no-roll button, already living in this same
    // Combat box right under "Roll Combat" — synthesizes a result (matches
    // renderResultBlock's expected shape) instead of calling resolve() at
    // all.
    // Balance pass (chat request): originally synthesized a guaranteed Full
    // (total 12) — the strongest of the four Class Abilities, since it was
    // a *free*, *unconditional*, *downside-free* guarantee, usable on any
    // Combat roll including a mission's key challenge (§21.2). Softened to
    // a guaranteed Partial (total 8) instead: still an unconditional
    // "success" — still wins a Combat key challenge outright, §21.2 — but
    // now runs through applyOutcome()'s normal Partial fallout too (a real
    // chance of Harm, gear damage, or a wounded Helper, same as if the
    // player had actually rolled a 7-9), no BOOST-for-a-Full-success at
    // Debrief, and the mission's own payout multiplier lands at Partial
    // Success (0.6x) rather than Full (1x) if this was the deciding roll.
    if (attr === "Combat" && job && c.profession === "Solo" && job.classAbility && !job.classAbility.samuraiUsed) {
      const samuraiBtn = document.createElement("button");
      samuraiBtn.textContent = "STREET SAMURAI: Auto-Success";
      samuraiBtn.addEventListener("click", () => {
        job.classAbility.samuraiUsed = true;
        const result = { d1: 0, d2: 0, diceSum: 0, attrRank: c.attrs.Combat, modifiers: [], modTotal: 0, total: 8, tier: "partial", usedAttr: "Combat" };
        addLog(c, `${c.name} muscles through on instinct — STREET SAMURAI reflexes take over, messy but effective.`);
        step.usedAttr = "Combat";
        holder.pendingResult = result;
        holder.lastResult = result;
        persist();
        render();
      });
      block.appendChild(samuraiBtn);
    }
    container.appendChild(block);
  });
}

// Renders one roll option (checkboxes, live modifier chips, Roll button)
// into `parent` — either the outer `.challenge` box itself (the step's own
// real attr, swapMeta null) or a nested `.swap-option` sub-section within
// that same box (a Class Ability substitute roll, swapMeta = {label,
// onUse}). Factored out of renderChallenge (UPDATE 3.1, chat request) so
// GEARHEAD/NETRUNNER's swap renders inside the box of the roll they
// replace instead of as a separate top-level box — see renderChallenge's
// attrs.forEach above for where each is invoked.
function renderRollOption(parent, attr, step, job, holder, c, swapMeta) {
  const wrap = document.createElement("div");
  // UPDATE 3.1 (chat request) — "place this on the right-hand side of the
  // box, not below": .roll-option/.swap-option (rather than swap-option
  // alone) so the box can lay both side by side via CSS (.challenge.has-swap
  // in style.css) once a swap is present — see the has-swap class added
  // below, right after this option renders.
  wrap.className = swapMeta ? "swap-option" : "roll-option";
  if (swapMeta) parent.classList.add("has-swap");
  const boostOption = boostSpendOptionHtml(c); // BATCH 2.1 (item 13) — up to 2 BOOST
  // Ally Assist (todo3.md Persons, §20.1: now up to 3 possible) — each
  // not-yet-used, not-benched "ally" Helper's one-time +2 to a single
  // test, consumed on the roll it's checked for. Independent checkboxes —
  // bringing more helpers means being able to stack more than one.
  const assistHelpers = job ? job.helpers.filter(h => h.source === "ally" && !h.used && !h.benched) : [];
  // todo3.md UPDATE 2.8 — "align Amigue/Compi bonus boxes with helper
  // name": reuses Gear Up's .helper-row/.helper-info layout (§20.21) so
  // the checkbox sits consistently next to a name/effect stack here too,
  // instead of a plain inline "Name: +2 to this roll" label.
  const assistOptions = assistHelpers.map(h =>
    `<label class="offer helper-row assist-toggle"><div class="helper-info"><div class="helper-name">${h.person.name}</div><div class="helper-effect muted">+2 to this roll</div></div><input type="checkbox" class="assist-check" data-person-id="${h.person.id}" /></label>`
  ).join("");
  // PATCH 2.4 (todo3.md) — one-shot ("1S") gear is an opt-in choice per
  // roll now, not auto-applied/burned whenever it happened to be the best
  // gear for this attribute. One independent checkbox per carried
  // one-shot item matching this attr.
  const oneShotItems = oneShotOptionsForAttr(c, attr);
  const oneShotOptions = oneShotItems.map((item, i) =>
    `<label class="boost-toggle"><input type="checkbox" class="oneshot-check" data-idx="${i}" /> Use ${item.name} (1S) for +${DATA.gearTierBonus[item.tier] || 0}</label>`
  ).join("");
  const heading = swapMeta ? `${swapMeta.label} — Roll ${attr} instead (rank ${c.attrs[attr]})` : `Roll ${attr} (rank ${c.attrs[attr]})`;
  wrap.innerHTML = `<h4>${heading}</h4>${boostOption}${assistOptions}${oneShotOptions}<div class="mods"></div>`;
  const modsEl = wrap.querySelector(".mods");
  const assistChecks = Array.from(wrap.querySelectorAll(".assist-check"));
  const checkedAssistIds = () => assistChecks.filter(el => el.checked).map(el => Number(el.dataset.personId));
  const oneShotChecks = Array.from(wrap.querySelectorAll(".oneshot-check"));
  const checkedOneShots = () => oneShotChecks.filter(el => el.checked).map(el => oneShotItems[Number(el.dataset.idx)]);

  const refreshMods = () => {
    const mods = computeModifiers(attr, getBoostSpend(), checkedAssistIds(), job, checkedOneShots());
    modsEl.innerHTML = mods.length
      ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
      : `<span class="chip">no modifiers</span>`;
  };
  const getBoostSpend = wireBoostSpend(wrap, refreshMods); // BATCH 2.1 (item 13)
  refreshMods();
  assistChecks.forEach(el => el.addEventListener("change", refreshMods));
  oneShotChecks.forEach(el => el.addEventListener("change", refreshMods));

  const rollBtn = document.createElement("button");
  rollBtn.textContent = `Roll ${attr}`;
  rollBtn.addEventListener("click", () => {
    const spendAmount = getBoostSpend();
    const assistIds = checkedAssistIds();
    const chosenOneShots = checkedOneShots();
    const mods = computeModifiers(attr, spendAmount, assistIds, job, chosenOneShots);
    if (spendAmount) c.boost -= spendAmount;
    if (job && assistIds.length) {
      job.helpers.forEach(h => { if (assistIds.includes(h.person.id)) h.used = true; });
    }
    consumeOneShotItems(c, chosenOneShots); // PATCH 2.4
    if (swapMeta) swapMeta.onUse();
    const result = resolveRoll(c, c.attrs[attr], mods); // BATCH 2.1 (item 8)
    result.usedAttr = attr;
    step.usedAttr = attr;
    holder.pendingResult = result;
    holder.lastResult = result;
    persist();
    render();
  });
  wrap.appendChild(rollBtn);
  parent.appendChild(wrap);
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
// ever one recruited Ally; now there can be up to 3. spendBoost (BATCH 2.1,
// item 13): was a boolean ("spend 1 BOOST"), now an integer 0-2 — however
// much BOOST is being spent on this one roll.
function computeModifiers(attr, spendBoost, assistIds, job, chosenOneShots) {
  const c = G.character;
  const mods = [];
  // PATCH 2.4 — one-shot ("1S") gear is excluded from the automatic "best
  // owned item" bonus now; it's an explicit per-roll checkbox instead (see
  // renderChallenge) whose chosen items are passed in here.
  const gearBonus = bestPermanentGearBonus(c, attr);
  if (gearBonus) mods.push({ label: gearBonus.name, value: gearBonus.bonus });
  (chosenOneShots || []).forEach(item => {
    mods.push({ label: `${item.name} (1S)`, value: DATA.gearTierBonus[item.tier] || 0 });
  });
  // BATCH 2.0 — cybernetic replacements (§ "getting to borg"): +1 Combat for
  // an arm+leg pair, -1 Social per Faceplate.
  const cyberMod = cyberAttrModifier(c, attr);
  if (cyberMod) mods.push({ label: "Cyberware", value: cyberMod });
  if (job && (attr === "Combat" || attr === "Stealth") && job.location.heat >= 4) mods.push({ label: "Heat", value: -1 });
  // todo3.md UPDATE 2.7 — "the adversary game effect... should be
  // character Tier compared to target faction Tier. If character is
  // higher, then he gets Tier bonus, if it's lower character gets Tier
  // penalty." Replaces the old flat worstTier-derived penalty (BATCH 2.2)
  // entirely — a Reputation Tier ahead of the mission Target's faction
  // Tier is now a real edge, not just a smaller penalty. Freelance/
  // destroyed targets have no tracked Tier to compare against, so they
  // skip this like every other faction-Tier check in the game.
  if (job && (attr === "Combat" || attr === "Stealth") && job.mission.target) {
    const targetStanding = c.factionStandings[job.mission.target.faction];
    if (targetStanding && !targetStanding.destroyed) {
      const delta = reputationTier(c) - targetStanding.tier;
      if (delta) mods.push({ label: `Adversary (T${targetStanding.tier})`, value: delta });
    }
  }
  // §19.5 — every Challenge on a Special Mission carries an extra -1.
  if (job && job.mission && job.mission.special) mods.push({ label: "Special Mission", value: -1 });
  // UPDATE 3.0 (todo3.md MISSIONS) — Assassination's Approach / Heist's
  // Breach (MISSION_SEQUENCES' alertOnFail, engine.js): a Partial/Fail
  // there hands the very next main-sequence step a -1/-2 penalty. Keyed to
  // job.stepIndex so it self-expires once that next step resolves — no
  // explicit clearing needed.
  if (job && job.pendingStepPenalty && job.pendingStepPenalty.stepIndex === job.stepIndex) {
    mods.push({ label: job.pendingStepPenalty.label, value: job.pendingStepPenalty.value });
  }
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
  if (spendBoost) mods.push({ label: "Boost", value: spendBoost });
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
// The old flat step-ratio calc (score/max, thresholds 0.85/0.4), kept as
// determineMissionOutcome()'s fallback for Delay (past the Heat-5 check,
// UPDATE 3.0 doesn't specify anything else for it) and as a defensive net
// for Assassination/Heist if their key-challenge step is somehow missing
// (e.g. a job aborted before it was ever reached).
function legacyRatioOutcome(job) {
  const score = job.stepResults.reduce((a, r) => a + (r.tier === "full" ? 2 : r.tier === "partial" ? 1 : 0), 0);
  const max = Math.max(1, job.stepResults.length * 2);
  const ratio = score / max;
  if (ratio >= 0.85) return { outcome: "Full Success", mult: 1 };
  if (ratio >= 0.4) return { outcome: "Partial Success", mult: 0.6 };
  return { outcome: "Failure", mult: 0 };
}

// UPDATE 3.0 (todo3.md MISSIONS) — "there is a key challenge or two in each
// mission. If these challenges succeed, the mission succeeds" — replaces the
// old one-size-fits-all step-ratio Debrief calc with a rule per mission
// type. forceFailure (todo3.md INTERFACE 2.4.2 — Abort Mission) and isDown
// both short-circuit to Failure exactly as before, ahead of any type rule.
function determineMissionOutcome(c, job, forceFailure) {
  if (isDown(c) || forceFailure) return { outcome: "Failure", mult: 0 };

  switch (job.mission.type) {
    case "Assassination":
    case "Heist": {
      // The key challenge (Combat/Hacking "Take out the target" for an
      // Assassination, Stealth "Grab the target" for a Heist) decides it on
      // its own — a Partial still kills/steals the goal ("even partial is
      // success"), only a Fail on that specific step is a Failure. Escape/
      // Getaway and the Approach/Breach setup step still play out and still
      // apply their own fallout, but don't move this needle.
      const key = job.stepResults.find(r => r.keyChallenge);
      if (!key) return legacyRatioOutcome(job); // defensive net — see comment above
      if (key.tier === "fail") return { outcome: "Failure", mult: 0 };
      return key.tier === "full" ? { outcome: "Full Success", mult: 1 } : { outcome: "Partial Success", mult: 0.6 };
    }
    case "Transport": {
      // "The target that has been transported has to survive... the target
      // can take 3 damage" (job.mission.targetDamage, tallied in
      // finalizeStep). 0 damage taken is a clean Full Success, any damage
      // short of dying is a Partial, 3+ is a Failure (the target dies in
      // transit — see runDebrief's existing Transport/Hold kill handling).
      const dmg = job.mission.targetDamage || 0;
      if (dmg >= 3) return { outcome: "Failure", mult: 0 };
      return dmg === 0 ? { outcome: "Full Success", mult: 1 } : { outcome: "Partial Success", mult: 0.6 };
    }
    case "Delay": {
      // "If Heat gets to 5, the mission is over and a failure" — already
      // caught mid-job by finalizeStep's own check (forceFailure, above),
      // so reaching here at all means Heat stayed under 5. No further
      // UPDATE 3.0 rule for the non-failure case — falls back to the old
      // step-ratio calc for Full vs. Partial.
      return legacyRatioOutcome(job);
    }
    case "Hold":
      // "As long as character survives the mission is success" — isDown
      // already ruled that out above, so anything else is a clean win,
      // regardless of how any individual wave went.
      return { outcome: "Full Success", mult: 1 };
    default:
      return legacyRatioOutcome(job);
  }
}

// forceFailure (todo3.md INTERFACE 2.4.2 — Abort Mission): forces a
// Failure outcome regardless of how the job was actually going, same as
// isDown(c) — see determineMissionOutcome above.
function runDebrief(forceFailure) {
  const c = G.character, job = G.job;

  // A Failure pays nothing (todo3.md ADD: "Failed mission should not give
  // you any payment") — every Failure path below gets mult 0.
  const { outcome, mult } = determineMissionOutcome(c, job, forceFailure);

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
  // for a big payout, an Assassination, and a Special Mission. BATCH 2.0:
  // a Failure mirrors the exact same stacking rule as a loss instead.
  if (outcome !== "Failure") {
    let repGain = 1;
    if (basePayout >= 4) repGain += 1;
    // UPDATE 3.1 (chat request) — "Shadow of <Location>" (the extra +1 Rep
    // and the title itself) now also requires the job's Location Heat to
    // have stayed at 3 or below the whole way through, not just a
    // successful Assassination outright — a loud hit that spikes Heat past
    // 3 doesn't earn "Shadow of" anymore, even if the kill itself landed
    // clean. Heat only ever rises during a job (nothing decays the job's
    // own Location until Debrief's decayOtherLocations, which explicitly
    // skips it), so the value read here is already the highest it reached.
    const finalHeat = (c.locations[job.location.name] || {}).heat;
    if (job.mission.type === "Assassination" && typeof finalHeat === "number" && finalHeat <= 3) {
      repGain += 1;
      // UPDATE 3.1 (chat request) — WRAITH: a 2nd "Shadow of X" upgrades
      // the title track to WRAITH instead of stacking more Shadow entries
      // (and unlocks its Class Ability — see wraithEligible below); every
      // one after that is "not shown or has no effect" — the +1 Reputation
      // above still applies each time, just no further title/flavor line.
      c.shadowCount = (c.shadowCount || 0) + 1;
      if (c.shadowCount === 1) {
        addLog(c, `Word travels: "Shadow of ${job.location.name}."`);
        addTitle(c, `Shadow of ${job.location.name}`);
      } else if (c.shadowCount === 2) {
        c.wraith = true;
        addLog(c, `${c.name} isn't just a shadow anymore — the street starts calling them WRAITH.`);
        addTitle(c, `WRAITH`);
      }
    }
    if (job.mission.special) repGain += 1;
    gainReputation(c, repGain);
    addLog(c, `Reputation +${repGain} (now ${c.reputation}, ${reputationTitle(c)}).`);
  } else {
    let repLoss = 1;
    if (basePayout >= 4) repLoss += 1;
    if (job.mission.type === "Assassination") repLoss += 1;
    if (job.mission.special) repLoss += 1;
    gainReputation(c, -repLoss);
    addLog(c, `Reputation -${repLoss} (now ${c.reputation}, ${reputationTitle(c)}).`);
  }

  // Outcomes retire people permanently: a successful hit kills its target;
  // a failed Transport/Hold kills whoever was being moved/protected.
  if (job.mission.type === "Assassination") {
    if (outcome !== "Failure") {
      const keyResult = job.stepResults.find(r => r.keyChallenge);
      killPerson(c, job.mission.target.id);
      addLog(c, `${job.mission.target.name} won't be a problem for anyone again.`);
      // UPDATE 3.0 (todo3.md MISSIONS) — "Even partial is success
      // considering mission result, but creates Archenemy of killed
      // person's sibling": the kill goes through either way, but a Partial
      // on the key Combat/Hacking challenge leaves a fresh Archenemy behind.
      if (keyResult && keyResult.tier === "partial") spawnArchenemySibling(c, job.mission.target);
      // §19.7 — a guaranteed Special Mission queued by a faction Power
      // struggle's 7-9 result destroys the target faction outright on
      // success (todo3.md FACTIONS: "if the mission succeeds then it
      // destroys the target faction").
      if (job.mission.forcedFactionWar) {
        const { attacker, target } = job.mission.forcedFactionWar;
        destroyFaction(c, target);
        addLog(c, `${attacker} gets what it paid for — ${target} is finished.`);
      }
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
        addTitle(c, `Friend of ${h.person.name}`);
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

  // BATCH 2.0 ("kauppojen pitää päivittyä" — the shops need to update):
  // also refresh here, not just on a Rest tick, so a player who never
  // Rests still sees new stock between jobs.
  c.shopOffers = genShopOffers(reputationTier(c));

  // §20.1 — one background faction-vs-faction mission per category, every
  // Debrief.
  runFactionBackgroundMissions(c);

  // A completed job counts as a tick for wounded-Helper recovery too, not
  // just a Rest — so grinding missions back-to-back still heals a sidelined
  // Compi/Amigue eventually, even without ever resting.
  recoverWoundedContacts(c);

  // todo3.md UPDATE 2.7 — §19.7's Power-struggle/war-destroy check used to
  // only fire on a Rest tick; now it also runs here, at Debrief, right
  // after every faction-attribute change this job could have caused (its
  // own standing effects above, and the background missions just above)
  // has actually been counted — "check corporate war possibility after
  // mission and after faction attribute changes has been counted." Any
  // faction it destroys is still caught by the usual MULTI-CORP check the
  // "Return to the Street" button already runs via nextHubPhase().
  runFactionPowerStruggles(c);

  // §20.6 — while the Rest clock sits one tick short of a forced Hunt, the
  // Archenemy might move on a friend or the player's home instead of
  // waiting. Checked after payment (per todo3.md) and before the Heat/
  // EurCop raid check below. UPDATE 3.0 (todo3.md ARCHENEMY) — passes job
  // so it can exclude this job's own Helpers from the "hit a friend" pool.
  resolveArchenemyClockEvent(c, job);

  // §20.7 — a job that ended hot enough (Corpo Heat 4-5, or Crime Heat 5)
  // has a 20% chance of the same agency that would've manned a checkpoint
  // showing up at the player's door instead, if they own one.
  resolveApartmentRaid(c, job);

  // todo3.md INTERFACE UPDATE 2.5 — any Vehicle that went "Moving" for this
  // job (GearUp's "Head Out") returns to wherever it was stocked before.
  c.gear.forEach(item => {
    if (item.preMissionLocation !== undefined) {
      item.location = item.preMissionLocation;
      delete item.preMissionLocation;
    }
  });

  // UPDATE 3.0/3.1 (todo3.md CHARACTER CLASS ABILITY) — Jockey GEARHEAD
  // (moved here from the Nomad Turf, chat request): "they never lose their
  // vehicle. It can be damaged (or destroyed) by effect but it always
  // returns to him after mission." Reconciles whatever the job's own
  // fallout did to it (degradeGearItem's tier drop, or loseVehicle's
  // outright removal) against the snapshot taken on "Head Out" — restoring
  // the item if it's gone, or its Tier if it's merely downgraded.
  if (job.jockeyVehicleSnapshot) {
    const snap = job.jockeyVehicleSnapshot;
    const item = c.gear.find(g => g.attr === "Driving" && g.name === snap.name);
    if (!item) {
      c.gear.push({ name: snap.name, attr: "Driving", tier: snap.tier, tags: snap.tags, carried: true, location: snap.preMissionLocation || "Street" });
      addLog(c, `${snap.name} rolls back up outside your place, patched together — GEARHEAD, you never really lose it.`);
    } else if (DATA.gearTierOrder.indexOf(item.tier || "Street") < DATA.gearTierOrder.indexOf(snap.tier)) {
      item.tier = snap.tier;
      addLog(c, `${snap.name} comes back fixed up to spec overnight — GEARHEAD keeps it running.`);
    }
  }

  // UPDATE 3.1 (chat request) — Hacker: "never lose the deck — similarly
  // like GEARHEAD vehicle." Identical reconcile-against-snapshot shape as
  // Jockey's vehicle above, just for a carried Hacking-attr item; decks
  // don't have a Moving/location concept, so there's no location to restore.
  if (job.hackerDeckSnapshot) {
    const snap = job.hackerDeckSnapshot;
    const item = c.gear.find(g => g.attr === "Hacking" && g.name === snap.name);
    if (!item) {
      c.gear.push({ name: snap.name, attr: "Hacking", tier: snap.tier, tags: snap.tags, carried: true });
      addLog(c, `${snap.name} turns back up in your rig, rebuilt from a backup image — you never really lose the deck.`);
    } else if (DATA.gearTierOrder.indexOf(item.tier || "Street") < DATA.gearTierOrder.indexOf(snap.tier)) {
      item.tier = snap.tier;
      addLog(c, `${snap.name} reflashes itself back to spec overnight.`);
    }
  }

  job.outcome = outcome;
  job.payout = totalPayout;
  addLog(c, `Job complete: ${outcome}. Paid ${totalPayout} BOND${totalPayout === 1 ? "" : "S"} by ${job.employer.name}.`);
  persist();
}

function renderDebrief() {
  const job = G.job;
  const wrap = document.createElement("div");
  wrap.className = "card centered"; // todo3.md INTERFACE 2.4.4
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
// todo3.md INTERFACE 2.4.1 — "use these [titles], when character dies /
// flatlines, or wins the game to write an obituary or a score chart."
// Shared by renderWin/renderLoss/renderDeath below.
function obituaryHtml(c) {
  const titles = c.titles.length
    ? `<ul class="titles-list">${c.titles.slice().reverse().map(t => `<li>${t}</li>`).join("")}</ul>`
    : `<p class="muted">No honors earned — a quiet run.</p>`;
  return `
    <div class="section"><h3>Final Score</h3>
      <p class="muted">Reputation ${c.reputation} — ${reputationTitle(c)} (Tier ${reputationTier(c)}) · ${c.bonds} BONDS</p>
      ${titles}
    </div>
  `;
}

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
    ${obituaryHtml(c)}
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
    ${obituaryHtml(c)}
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

// ---------- DEATH (BATCH 2.0) ----------
// Going Down while already carrying a Permanent Injury is fatal — unless
// an Amigue is present to take the hit instead (handleGoingDown, below).
// This is the only way the run itself can end besides Win/MULTI-CORP-Loss.
function renderDeath() {
  const c = G.character;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h2>Flatlined</h2>
    <p>The second time your body gives out, it doesn't get back up. No
    ripperdoc, no coffin pod, no lucky break this time — just the street,
    and then nothing.</p>
    <p class="muted">${c.name} — didn't make it off Europunk's streets.</p>
    ${obituaryHtml(c)}
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

// Central Down/death handler (BATCH 2.0): going Down while already
// carrying a Permanent Injury is fatal, unless an Amigue (Bloodbrother) is
// present to sacrifice their own life instead. A first-ever Down is
// unchanged (resolveDownEvent's BOOST-loss chance + sets permanentInjury).
// Sets G.phase = "death" and returns true if this call ended the run —
// every call site that would otherwise continue on to its own next-step
// logic (advance a step, tick Rest, run Debrief, ...) must check the
// return value and bail instead. See SOLOdescription.md §20.9 for the
// full list of call sites and which ones needed a guard.
function handleGoingDown(c, wentDown) {
  if (!wentDown) return false;
  if (!c.permanentInjury) { resolveDownEvent(c); return false; }
  const amigues = c.contacts.filter(p => p.bloodbrother);
  if (amigues.length) {
    const savior = pick(amigues);
    addLog(c, `${savior.name} throws themselves between you and the end. It's not you going in the ground tonight.`);
    killPerson(c, savior.id);
    return false;
  }
  addLog(c, `${c.name} doesn't get back up this time.`);
  G.phase = "death";
  return true;
}

// ---------- ARCHENEMY HUNT (todo3.md) ----------
// Triggered by processRestTick() once the Rest clock (character.restCount)
// hits 4. A bespoke mini state machine — not the generic mission-step
// sequence — since the branching (avoid/fight, wound tracking, chase/run)
// doesn't fit that shape. Reuses resolve()/renderResultBlock() as-is.
// atHome (BATCH 2.0): true when the Rest clock filled via Rest at your
// Apartment — the Archenemy comes for the player at home instead of on the
// street; installed Security counts toward Combat rolls for this Hunt
// (renderHuntRoll), and any Tier-4 items also grant a one-Hunt armor pool.
function startHunt(atHome) {
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
  // BATCH 2.0 — Tier-4 Security items grant a one-Hunt armor-like absorb
  // pool (2 charges each, the Professional-tier scale) when hunted at home.
  // UPDATE 3.1 (chat request) — G.homeApartment (set by restAtApartment(),
  // right before this call — the only path that ever passes atHome truthy)
  // is which specific one of possibly several owned apartments the player
  // was resting at; stashed on the hunt itself so the rest of the Hunt
  // (renderHuntRoll's Security modifier) reads the same one throughout.
  const homeApartment = atHome ? G.homeApartment : null;
  const homeArmorCharges = homeApartment
    ? homeApartment.security.filter(name => DATA.securityOptions[4].includes(name)).length * 2
    : 0;
  G.hunt = { archenemy, stage: "notice", wounds: 0, combatBonus: 0, combatChoice: null, pendingResult: null, bloodbrotherUsed: false, atHome: !!atHome, homeApartment, homeArmorCharges };
  addLog(c, atHome ? `${archenemy.name} comes for you at your own front door.` : `${archenemy.name} finally catches up with you.`);
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

// UPDATE 3.0 (todo3.md ARCHENEMY) — "When character has reached Tier 3, the
// Archenemy can try to HUNT character when he chooses a shop/workshop/
// street-dojo option. When player clicks the purchase, there is a 20%
// chance that he bumps to an Archenemy and there is a shootout." Called at
// the top of the Shop/Workshop/Street-Dojo purchase handlers, before any
// BONDS/BOOST are spent — if it returns true, the purchase is aborted
// entirely (nothing spent, nothing bought) and a full Hunt takes over
// instead. A Social roll first ("you hear that an Archenemy is on a
// warpath nearby") — success just flavors the transaction and lets it
// proceed as normal; only a Fail actually triggers the ambush.
function maybeArchenemyAmbush(c, origin) {
  if (reputationTier(c) < 3) return false;
  if (!c.archenemyId) return false;
  const archenemy = c.contacts.find(p => p.id === c.archenemyId && p.archenemy);
  if (!archenemy) return false;
  if (randInt(1, 100) > 20) return false;

  const gearBonus = bestGearBonus(c, "Social");
  const { sum } = roll2d6();
  const total = sum + c.attrs.Social + (gearBonus ? gearBonus.bonus : 0) + cyberAttrModifier(c, "Social");
  addLog(c, `Word on the street: ${archenemy.name} is on a warpath nearby.`);
  if (total >= 7) {
    addLog(c, `You clock it in time and keep your head down — business as usual at the ${origin}.`);
    return false;
  }
  addLog(c, `${archenemy.name} finds you first — a shootout breaks out right there in the ${origin}!`, "archenemy");
  startHuntAmbush(origin);
  return true;
}

// The Hunt this ambush drops into: no "notice" roll of its own (the Social
// check above already stood in for it) — straight to the Fight/Run/Break-Off
// combat stage, same as any other Hunt from there.
function startHuntAmbush(origin) {
  const c = G.character;
  const archenemy = c.contacts.find(p => p.id === c.archenemyId);
  if (!archenemy) { G.phase = "hub"; persist(); render(); return; }
  G.hunt = { archenemy, stage: "combat", wounds: 0, combatBonus: 0, combatChoice: null, pendingResult: null, bloodbrotherUsed: false };
  addLog(c, `Gunfire in the ${origin} — everyone else scatters. It's just you and ${archenemy.name} now.`, "archenemy");
  G.phase = "hunt";
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
  const boostOption = boostSpendOptionHtml(c); // BATCH 2.1 (item 13) — up to 2 BOOST
  // A BLOODBROTHER can be called in to help on a Hunt (todo3.md Persons) —
  // a one-time +2, same shape as Ally Assist in renderChallenge(). BATCH 2.0
  // — more than one Amigue can exist now; offer a row per Amigue (mutually
  // exclusive, like a picker) instead of always grabbing the first one found.
  // todo3.md UPDATE 2.8 — a wounded Compi/Amigue isn't available here either.
  const amigues = c.contacts.filter(p => p.bloodbrother && !p.wounded);
  const brotherOption = amigues.length && !hunt.bloodbrotherUsed
    ? amigues.map(a => `<label class="boost-toggle"><input type="checkbox" class="brother-check" data-id="${a.id}" /> Call ${a.name}: +2 to this roll</label>`).join("")
    : "";
  // PATCH 2.4 (todo3.md) — one-shot ("1S") gear is an opt-in choice per
  // roll now, same as in renderChallenge().
  const oneShotItems = oneShotOptionsForAttr(c, attr);
  const oneShotOption = oneShotItems.map((item, i) =>
    `<label class="boost-toggle"><input type="checkbox" class="oneshot-check" data-idx="${i}" /> Use ${item.name} (1S) for +${DATA.gearTierBonus[item.tier] || 0}</label>`
  ).join("");
  block.innerHTML = `<p class="step-desc">${desc}</p><h4>Roll ${attr} (rank ${c.attrs[attr]})</h4>${boostOption}${brotherOption}${oneShotOption}<div class="mods"></div>`;
  const modsEl = block.querySelector(".mods");
  const brotherChecks = Array.from(block.querySelectorAll(".brother-check"));
  const oneShotChecks = Array.from(block.querySelectorAll(".oneshot-check"));
  const checkedOneShots = () => oneShotChecks.filter(el => el.checked).map(el => oneShotItems[Number(el.dataset.idx)]);

  const buildMods = (spendBoost, callBrotherId, chosenOneShots) => {
    const mods = [];
    const gearBonus = bestPermanentGearBonus(c, attr);
    if (gearBonus) mods.push({ label: gearBonus.name, value: gearBonus.bonus });
    (chosenOneShots || []).forEach(item => {
      mods.push({ label: `${item.name} (1S)`, value: DATA.gearTierBonus[item.tier] || 0 });
    });
    const cyberMod = cyberAttrModifier(c, attr); // BATCH 2.0
    if (cyberMod) mods.push({ label: "Cyberware", value: cyberMod });
    const tp = tierPenalty(hunt.archenemy.tier);
    if (tp) mods.push({ label: hunt.archenemy.name, value: tp });
    if (extraBonus) mods.push({ label: "Caught them off guard", value: extraBonus });
    // BATCH 2.0 — hunted at home: installed Security counts toward Combat
    // only ("other rolls as normal"). UPDATE 3.1 — reads hunt.homeApartment
    // (the specific one being defended, set in startHunt()) instead of "the"
    // apartment.
    if (hunt.atHome && attr === "Combat" && hunt.homeApartment && hunt.homeApartment.security.length) {
      mods.push({ label: "Security", value: hunt.homeApartment.security.length });
    }
    if (spendBoost) mods.push({ label: "Boost", value: spendBoost }); // BATCH 2.1 (item 13) — integer amount, not a boolean
    const calledBrother = callBrotherId && amigues.find(a => a.id === callBrotherId);
    if (calledBrother) mods.push({ label: calledBrother.name, value: 2 });
    const harmCount = c.health.filter(h => h).length;
    if (harmCount === 1) mods.push({ label: "Wounded", value: -1 });
    else if (harmCount >= 2) mods.push({ label: "Wounded", value: -2 });
    if (c.permanentInjury) mods.push({ label: "Permanent Injury", value: -1 });
    return mods;
  };

  const checkedBrotherId = () => {
    const checked = brotherChecks.find(cb => cb.checked);
    return checked ? checked.dataset.id : null;
  };

  const refreshMods = () => {
    const mods = buildMods(getBoostSpend(), checkedBrotherId(), checkedOneShots());
    modsEl.innerHTML = mods.length
      ? mods.map(m => `<span class="chip ${m.value > 0 ? "pos" : "neg"}">${m.label} ${m.value > 0 ? "+" : ""}${m.value}</span>`).join("")
      : `<span class="chip">no modifiers</span>`;
  };
  const getBoostSpend = wireBoostSpend(block, refreshMods); // BATCH 2.1 (item 13)
  refreshMods();
  brotherChecks.forEach(cb => cb.addEventListener("change", () => {
    if (cb.checked) brotherChecks.forEach(other => { if (other !== cb) other.checked = false; });
    refreshMods();
  }));
  oneShotChecks.forEach(el => el.addEventListener("change", refreshMods));

  const rollBtn = document.createElement("button");
  rollBtn.textContent = `Roll ${attr}`;
  rollBtn.addEventListener("click", () => {
    const spendAmount = getBoostSpend();
    const callBrotherId = checkedBrotherId();
    const chosenOneShots = checkedOneShots();
    const mods = buildMods(spendAmount, callBrotherId, chosenOneShots);
    if (spendAmount) c.boost -= spendAmount;
    if (callBrotherId) hunt.bloodbrotherUsed = true;
    consumeOneShotItems(c, chosenOneShots); // PATCH 2.4
    const result = resolveRoll(c, c.attrs[attr], mods); // BATCH 2.1 (item 8)
    result.usedAttr = attr;
    hunt.pendingResult = result;
    persist();
    render();
  });
  block.appendChild(rollBtn);
  container.appendChild(block);
}

// BATCH 2.0 — the one path a Hunt should use to apply Harm to the player:
// when hunted at home, a Tier-4 Security item's leftover charge pool gets
// first crack at absorbing the hit, before falling through to the normal
// applyHarm(). todo3.md UPDATE 2.7 — deterministic now, same as carried
// Armor (state.js): any remaining charge always blocks, no roll.
function applyHuntHarm(c) {
  const hunt = G.hunt;
  if (hunt.atHome && hunt.homeArmorCharges > 0) {
    hunt.homeArmorCharges--;
    addLog(c, `Your security tech takes the hit for you (${hunt.homeArmorCharges} charge${hunt.homeArmorCharges === 1 ? "" : "s"} left).`);
    return false;
  }
  return applyHarm(c);
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
      if (!handleGoingDown(c, applyHuntHarm(c))) hunt.stage = "choice";
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
  const carried = c.gear.filter(g => g.carried); // §20.8 — only what's on you can be hit
  if (effect === "harm" || (effect === "gearDamage" && carried.length === 0)) {
    handleGoingDown(c, applyHuntHarm(c));
  } else if (effect === "gearDamage") {
    degradeGearItem(c, pick(carried));
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
      addLog(c, `You get away, but ${hunt.archenemy.name} clips you on the way out.`);
      if (!handleGoingDown(c, applyHuntHarm(c))) hunt.stage = "resolved-run-hit";
    } else {
      handleGoingDown(c, applyHuntHarm(c));
      const carried = c.gear.filter(g => g.carried); // §20.8
      if (carried.length && Math.random() < 0.5) {
        degradeGearItem(c, pick(carried));
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
      gainReputation(c, -1); // BATCH 2.0 — losing clean to your Archenemy costs Reputation
      addLog(c, `Reputation -1 (now ${c.reputation}, ${reputationTitle(c)}).`);
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
      gainReputation(c, -1); // BATCH 2.0
      addLog(c, `Reputation -1 (now ${c.reputation}, ${reputationTitle(c)}).`);
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
  const reward = { name: weapon.name, attr: weapon.attr, tier: "Professional" };
  c.gear.push(reward);
  autoCarryNewItem(c, reward); // §20.8
  c.boost = Math.min(10, c.boost + 3);
  c.bonds += 2;
  addLog(c, `${hunt.archenemy.name} goes down for good. You walk away with a ${weapon.name}, a surge of BOOST, and 2 more BONDS.`);
  gainReputation(c, 2); // §19.1
  addLog(c, `Reputation +2 — "Killer of ${hunt.archenemy.name}" (now ${c.reputation}, ${reputationTitle(c)}).`);
  // UPDATE 3.1 (chat request) — WICKED: same track/upgrade shape as
  // WRAITH (§19.1's Shadow-of note) — a 2nd "Killer of X" upgrades the
  // title track to WICKED instead of stacking more Killer entries, and
  // permanently unlocks a Stealth-to-Combat swap (the reverse of WRAITH's
  // Combat-to-Stealth). The +2 Reputation above still applies every time,
  // unaffected — only the title/flavor-line progression changes.
  c.killerCount = (c.killerCount || 0) + 1;
  if (c.killerCount === 1) {
    addTitle(c, `Killer of ${hunt.archenemy.name}`);
  } else if (c.killerCount === 2) {
    c.wicked = true;
    addLog(c, `${c.name} isn't just a killer anymore — the street starts calling them WICKED.`);
    addTitle(c, `WICKED`);
  }
  killPerson(c, hunt.archenemy.id);
  hunt.stage = "resolved-kill";
}

// BATCH 2.1 (item 14) — each resolution now has 2 phrasings; renderHuntResolution() picks one.
const HUNT_SUMMARY = {
  "resolved-evade": [
    hunt => `You give ${hunt.archenemy.name} the slip. For now.`,
    hunt => `${hunt.archenemy.name} loses your trail in the crowd. Not tonight.`
  ],
  "resolved-run-clean": [
    hunt => `You put real distance between you and ${hunt.archenemy.name} tonight.`,
    hunt => `${hunt.archenemy.name} is a memory in your mirrors before you even hit the highway.`
  ],
  "resolved-run-hit": [
    hunt => `Banged up, but clear. ${hunt.archenemy.name} is still out there.`,
    hunt => `You shake them off, but not before they get a piece of you. ${hunt.archenemy.name} lives to try again.`
  ],
  "resolved-run-bad": [
    hunt => `Ugly getaway, but a getaway. ${hunt.archenemy.name} is still out there.`,
    hunt => `It's a mess getting clear, but you're clear. ${hunt.archenemy.name} isn't done with you.`
  ],
  "resolved-escape-win": [
    hunt => `You come out on top, but ${hunt.archenemy.name} slips away to lick their wounds.`,
    hunt => `${hunt.archenemy.name} breaks off bleeding. You won this round, not the war.`
  ],
  "resolved-escape-clean": [
    hunt => `${hunt.archenemy.name} gets away clean. This isn't over.`,
    hunt => `${hunt.archenemy.name} vanishes into the city like they were never there.`
  ],
  "resolved-kill": [
    hunt => `${hunt.archenemy.name} won't be a problem again.`,
    hunt => `${hunt.archenemy.name} hits the ground and doesn't get up. It's finished.`
  ]
};

function renderHuntResolution(container) {
  const hunt = G.hunt;
  const block = document.createElement("div");
  block.className = "card";
  const variants = HUNT_SUMMARY[hunt.stage];
  const text = variants ? pick(variants)(hunt) : "";
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
