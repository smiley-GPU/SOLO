// engine.js — dice resolution + procedural generators.
// Core mechanic per gamedesc.md §2: 2d6 + Attribute (+ modifiers) vs table.

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// Weighted-random pick from [{effect, weight}, ...] — used to diversify
// fail/partial consequences per Challenge type (todo2.md, DATA.failOutcomes).
function pickWeighted(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.effect;
  }
  return entries[entries.length - 1].effect;
}

function roll2d6() {
  const d1 = randInt(1, 6), d2 = randInt(1, 6);
  return { d1, d2, sum: d1 + d2 };
}

// modifiers: array of {label, value}
function resolve(attrRank, modifiers) {
  const { d1, d2, sum } = roll2d6();
  const modTotal = modifiers.reduce((a, m) => a + m.value, 0);
  const total = sum + attrRank + modTotal;
  let tier;
  if (total >= 10) tier = "full";
  else if (total >= 7) tier = "partial";
  else tier = "fail";
  return { d1, d2, diceSum: sum, attrRank, modifiers, modTotal, total, tier };
}

function upgradeTier(tier) {
  if (tier === "fail") return "partial";
  if (tier === "partial") return "full";
  return "full";
}

function genName() {
  return `${pick(DATA.firstNames)} "${pick(DATA.handles)}"`;
}

function genFaction(chanceFreelance = 0.25) {
  if (Math.random() < chanceFreelance) return { name: "Freelance", type: "None" };
  return pick(DATA.factions);
}

// allowedFactionNames (§19.4, optional): if given, the generated person's
// faction is drawn from that list instead of any of the 11 — Freelance is
// always included since it's exempt from the Employer/Target pairing rule.
function genPerson(allowedFactionNames) {
  let f;
  if (allowedFactionNames) {
    f = pick([{ name: "Freelance", type: "None" }, ...DATA.factions.filter(x => allowedFactionNames.includes(x.name))]);
  } else {
    f = genFaction();
  }
  return {
    name: genName(),
    faction: f.name,
    profession: pick(DATA.npcProfessions)
  };
}

function genAdversaryTier(heat) {
  // Higher location Heat skews tougher opposition.
  const r = randInt(1, 6) + heat;
  if (r >= 8) return "elite";
  if (r >= 5) return "tough";
  return "weak";
}
function tierPenalty(tier) {
  return tier === "elite" ? -2 : tier === "tough" ? -1 : 0;
}

// Higher-Heat areas roll hotter on first visit; Location Heat otherwise
// persists on character.locations (see rememberLocation/resolveLocation in
// state.js) — the world is a fixed 12-location map, not randomly combined.
function rollHeatForArea(area) {
  return area === "Corpo" ? randInt(1, 3) : area === "Urban" ? randInt(0, 3) : randInt(0, 2);
}

function genLocationDef() {
  return pick(DATA.locations); // {name, area, faction}
}

// §19.5 / Appendix J — "Mission: <GREEK> <SHAPE> <COLOR> <NN>".
function genSpecialMissionName() {
  const p = DATA.specialMissionParts;
  return `Mission: ${pick(p.greek).toUpperCase()} ${pick(p.shape).toUpperCase()} ${pick(p.color).toUpperCase()} ${randInt(10, 99)}`;
}

// §20.5 — the always-open Shop's offer pool: always some gear at the
// player's own Reputation Tier, a 50% chance of one offer a Tier higher,
// and a 20% chance of one offer two Tiers higher (each capped at Tier 4).
// Replaces the old flat Street/Professional/Military-weighted Gear Up
// offers (todo3.md ADD: "Remove Gear buy and sales from the mission
// start") — nothing generates a job-scoped offer list anymore.
function genShopOffer(tier, idx) {
  const tierName = DATA.gearTierOrder[Math.min(tier, 4) - 1];
  const item = pick(DATA.gear[tierName]);
  return { ...item, tier: tierName, id: `${item.name}-${Date.now()}-${idx}` };
}
function genShopOffers(reputationTier) {
  const offers = [genShopOffer(reputationTier, 0), genShopOffer(reputationTier, 1)];
  if (randInt(1, 100) <= 50) offers.push(genShopOffer(Math.min(4, reputationTier + 1), 2));
  if (randInt(1, 100) <= 20) offers.push(genShopOffer(Math.min(4, reputationTier + 2), 3));
  return offers;
}

// allowedTargetFactions (§19.4, optional): restricts the mission Target's
// faction (null = unrestricted, used for Special Missions and Freelance
// Employers). forcedType/forcedTarget (§19.7): used to build a guaranteed
// Special Mission out of a faction Power struggle's pending war.
function genMission(location, character, excludeIds, allowedTargetFactions, forcedType, forcedTarget) {
  const type = forcedType || pick(DATA.missionTypes);
  const adversaryCount = randInt(1, 3);
  // tier is per-mission, not a trait of the pooled person, so it's spread
  // onto a copy rather than mutating the shared contacts entry.
  const adversaries = Array.from({ length: adversaryCount }, () => ({
    ...getPerson(character, "hostile", excludeIds),
    tier: genAdversaryTier(location.heat)
  }));
  const worstTier = adversaries.reduce((worst, a) => {
    const order = { weak: 0, tough: 1, elite: 2 };
    return order[a.tier] > order[worst] ? a.tier : worst;
  }, "weak");

  let timePeriod = null;
  if (type === "Delay" || type === "Hold") {
    timePeriod = randInt(1, 3); // Short/Medium/Long -> 1-3 steps
  }

  // Assassination targets are cast from the opposition pool (that's who's
  // getting killed); every other mission type casts a cooperative/neutral
  // Target (the person/cargo being stolen, moved, delayed, or held).
  const targetRole = type === "Assassination" ? "hostile" : "ally";
  const target = forcedTarget || getPerson(character, targetRole, excludeIds, allowedTargetFactions);

  // Transport gets a distinct origin point; `location` (the job's main
  // Location, driving Heat/Encounters) is the destination.
  let fromLocation = null;
  if (type === "Transport") {
    const fromDef = pick(DATA.locations.filter(l => l.name !== location.name));
    fromLocation = resolveLocation(character, fromDef);
  }

  // Which faction parameter this job moves (todo2.md): depends on what's
  // actually being Held/Transported/Heisted, not the mission type. Delay
  // rolls one too, but it's just flavor — see DATA.delayFlavor. Assassination
  // has none; it always hits "power" (see runDebrief in game.js).
  let assetType = null, assetFlavor = null;
  if (type === "Heist" || type === "Transport" || type === "Hold" || type === "Delay") {
    assetType = pick(["wealth", "rnd", "power"]);
    assetFlavor = type === "Delay" ? DATA.delayFlavor : pick(DATA.assetTypes[assetType]);
  }

  // 1/2/3 (easy/medium/hard) — drives the BOND payout table (game.js
  // estimatePayout) and the vehicle-gating rule (renderChallenge in game.js).
  const tierDifficulty = { weak: 1, tough: 2, elite: 3 };
  let difficulty = tierDifficulty[worstTier] || 1;
  if (timePeriod === 3) difficulty = Math.min(3, difficulty + 1);

  return {
    type,
    flavor: DATA.missionFlavor[type],
    target,
    location,
    fromLocation,
    adversaries,
    worstTier,
    timePeriod,
    difficulty,
    assetType,
    assetFlavor,
    special: false, // §19.5 — set true/named by genBoardJob() for the Mission Board's escalated slot
    specialName: null,
    forcedFactionWar: null // §19.7 — set when this Special Mission comes from a queued faction Power struggle
  };
}

// -- §19.3 The Mission Board (two jobs) + §19.4/§19.5 pairing & specials ----

// Builds one Board candidate: {employer, mission, location, excludeIds}.
// capTier is the Reputation-gated difficulty ceiling (§19.3); wantHigher
// pushes difficulty one tier past it; forceSpecial additionally marks/names
// it a Special Mission and ignores Employer/Target pairing (§19.4/§19.5).
// forcedWar ({attacker, target}, §19.7) forces an Assassination against the
// war's target faction, guaranteed Special — from a faction Power struggle.
function genBoardJob(character, capTier, wantHigher, forceSpecial, forcedWar) {
  const fullLoc = resolveLocation(character, genLocationDef());
  const excludeIds = new Set();
  const employer = getEmployer(character, excludeIds);
  const allowedTargetFactions = forceSpecial ? null : pairedFactionsFor(character, employer.faction);

  let forcedType = null, forcedTarget = null;
  if (forcedWar) {
    forcedType = "Assassination";
    forcedTarget = castWarTarget(character, forcedWar.target, excludeIds);
  }

  const mission = genMission(fullLoc, character, excludeIds, allowedTargetFactions, forcedType, forcedTarget);

  if (forceSpecial) {
    mission.special = true;
    mission.specialName = genSpecialMissionName();
    // "one full tier above" (§19.5), on top of whatever escalation already got it here.
    mission.difficulty = Math.min(4, Math.max(mission.difficulty, capTier + 1) + 1);
    if (forcedWar) mission.forcedFactionWar = forcedWar;
  } else if (wantHigher) {
    mission.difficulty = Math.min(3, Math.max(mission.difficulty, capTier + 1));
  } else {
    mission.difficulty = Math.min(mission.difficulty, capTier);
  }

  return { employer, mission, location: fullLoc, excludeIds };
}

// The Hub always offers two of these (§19.3). The first is always at/below
// the player's Reputation Tier; the second has an escalating (with
// character.restCount) chance of being one tier higher, and a further 10%
// chance of that being a Special Mission — unless a faction Power struggle
// (§19.7) has a guaranteed war queued up, which always fills the second slot.
function genMissionBoard(character) {
  const capTier = Math.min(reputationTier(character), 3);
  const jobA = genBoardJob(character, capTier, false, false);

  // The queued war's target could have been destroyed by another Power
  // struggle in the same tick (§19.7) before this Board consumed it —
  // drop it rather than build a Special Mission against a faction that's
  // already gone.
  let war = character.pendingWars.length ? character.pendingWars.shift() : null;
  const targetStanding = war && character.factionStandings[war.target];
  if (war && (!targetStanding || targetStanding.destroyed)) war = null;

  // §20.1 — the Board's two jobs always come from different Employers and
  // different factions (never a repeat of jobA's contact or faction). A
  // queued war (guaranteed Special Mission) is exempt — it must be exactly
  // what the Power struggle targeted, so it's never retried against this.
  let jobB;
  const sameEmployer = candidate => candidate.employer.id === jobA.employer.id || candidate.employer.faction === jobA.employer.faction;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (war) {
      jobB = genBoardJob(character, capTier, true, true, war);
      break;
    }
    const higherChance = 10 + 10 * character.restCount;
    const wantHigher = randInt(1, 100) <= higherChance;
    const wantSpecial = wantHigher && randInt(1, 100) <= 10;
    jobB = genBoardJob(character, capTier, wantHigher, wantSpecial);
    if (!sameEmployer(jobB)) break;
  }
  return [jobA, jobB];
}

const MISSION_SEQUENCES = {
  Assassination: [
    { attr: "Stealth", desc: "Approach the target undetected." },
    { attr: "Combat", alt: "Hacking", desc: "Take out the target — a gun or a blade up close, or a burst of lethal ICE through the net." },
    { attr: "Stealth", alt: "Driving", desc: "Escape the scene." }
  ],
  Heist: [
    { attr: "Hacking", alt: "Stealth", desc: "Breach the security around the target." },
    { attr: "Stealth", desc: "Grab the target and get clear of the room." },
    { attr: "Driving", desc: "Getaway before the block locks down." }
  ],
  Transport: [
    { attr: "Driving", alt: "Stealth", desc: "Run the transit route to the drop-off — fast and open, or slow and quiet." },
    { attr: "Social", alt: "Combat", desc: "Get past a checkpoint on the way." }
  ],
  Delay: [
    { attr: "Social", alt: "Stealth", desc: "Stall them without tipping your hand." }
  ],
  Hold: [
    { attr: "Combat", alt: "Stealth", desc: "Hold the position against the next wave." }
  ]
};

function buildStepSequence(mission) {
  const base = MISSION_SEQUENCES[mission.type];
  if (mission.type === "Delay" || mission.type === "Hold") {
    // repeat the single template step once per Time unit, per gamedesc.md §4
    return Array.from({ length: mission.timePeriod }, (_, i) => ({ ...base[0], desc: `${base[0].desc} (${i + 1}/${mission.timePeriod})` }));
  }
  return base.map(s => ({ ...s }));
}
