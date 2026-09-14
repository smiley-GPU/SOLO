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

// BATCH 2.2 (todo3.md) — "NPCs toughness should be same as their Tier and
// Faction Tier": the adversary's own factionTier (1-4, from assignFactionTier)
// nudges this roll on top of Heat, rather than being pure dice+heat.
function genAdversaryTier(heat, factionTier) {
  const r = randInt(1, 6) + heat + ((factionTier || 1) - 1);
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
  let idx = 0;
  const offers = [genShopOffer(reputationTier, idx++), genShopOffer(reputationTier, idx++)];
  if (randInt(1, 100) <= 50) offers.push(genShopOffer(Math.min(4, reputationTier + 1), idx++));
  if (randInt(1, 100) <= 20) offers.push(genShopOffer(Math.min(4, reputationTier + 2), idx++));
  // todo3.md UPDATE 2.8 — "always have two items per tier from lower tiers
  // (if any) in the shop": every Tier below the player's own reliably gets
  // 2 offers too, so cheaper gear never disappears from the shelves once
  // you've outgrown it (nothing below Street Rat's own Tier 1, so this is
  // a no-op there).
  for (let t = 1; t < reputationTier; t++) {
    offers.push(genShopOffer(t, idx++));
    offers.push(genShopOffer(t, idx++));
  }
  // BATCH 2.1 (item 9) — one-shot gear: single-use, "1S"-tagged items
  // available a full Tier below what their own Tier would otherwise
  // require (a Rep Tier 1 "Street Rat" already sees Professional-tier
  // one-shots), priced 1 BOND under that Tier's normal price (baked into
  // DATA.oneShotGear's own `price` fields, not recomputed here). 40% chance
  // per Shop refresh.
  if (randInt(1, 100) <= 40) {
    const oneShot = genOneShotOffer(reputationTier, idx++);
    if (oneShot) offers.push(oneShot);
  }
  return offers;
}

// BATCH 2.1 (item 9) — reputationTier maps to the Tier *one above* the
// character's own (DATA.gearTierOrder[reputationTier]: Rep Tier 1 -> index 1
// "Professional", Tier 2 -> "Military", Tier 3+ -> capped at "Legendary").
// Returns the same {...item, tier, id} shape genShopOffer() does, so
// renderShopBox()'s existing Buy handler (which already copies `tags` onto
// the purchased item) needs no changes to pick up the "1S" tag.
function genOneShotOffer(reputationTier, idx) {
  const tierName = DATA.gearTierOrder[Math.min(reputationTier, 3)];
  const pool = DATA.oneShotGear[tierName];
  if (!pool || !pool.length) return null;
  const item = pick(pool);
  return { ...item, tier: tierName, id: `${item.name}-${Date.now()}-${idx}` };
}

// allowedTargetFactions (§19.4, optional): restricts the mission Target's
// faction (null = unrestricted, used for Special Missions and Freelance
// Employers). forcedType/forcedTarget (§19.7): used to build a guaranteed
// Special Mission out of a faction Power struggle's pending war.
function genMission(location, character, excludeIds, allowedTargetFactions, forcedType, forcedTarget) {
  const type = forcedType || pick(DATA.missionTypes);
  const adversaryCount = randInt(1, 3);
  // tier is per-mission, not a trait of the pooled person, so it's spread
  // onto a copy rather than mutating the shared contacts entry. BATCH 2.2 —
  // genAdversaryTier reads the person's own factionTier too now.
  const adversaries = Array.from({ length: adversaryCount }, () => {
    const person = getPerson(character, "hostile", excludeIds);
    return { ...person, tier: genAdversaryTier(location.heat, person.factionTier) };
  });
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
    assetFlavor = type === "Delay" ? pick(DATA.delayFlavor) : pick(DATA.assetTypes[assetType]); // BATCH 2.1 (item 14)
  }

  // UPDATE 3.0 (todo3.md MISSIONS) — Transport tracks cumulative damage to
  // the person/cargo being moved across its two main steps (see
  // MISSION_SEQUENCES' targetDamage tag and finalizeStep, game.js): a Fail
  // deals 2, a Partial deals 1, out of 3 the target can take before dying
  // in transit (checked at Debrief, determineMissionOutcome, game.js).
  const targetDamage = type === "Transport" ? 0 : null;

  // 1/2/3 (easy/medium/hard) — drives the BOND payout table (game.js
  // estimatePayout) and the vehicle-gating rule (renderChallenge in game.js).
  const tierDifficulty = { weak: 1, tough: 2, elite: 3 };
  let difficulty = tierDifficulty[worstTier] || 1;
  if (timePeriod === 3) difficulty = Math.min(3, difficulty + 1);

  return {
    type,
    flavor: pick(DATA.missionFlavor[type]), // BATCH 2.1 (item 14) — now a 2-line pool
    target,
    location,
    fromLocation,
    adversaries,
    worstTier,
    timePeriod,
    difficulty,
    assetType,
    assetFlavor,
    targetDamage,
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
// employerCategories (BATCH 2.2, optional): restricts the Employer's faction
// category — only ever passed for the Board's first slot (see genMissionBoard).
function genBoardJob(character, capTier, wantHigher, forceSpecial, forcedWar, employerCategories) {
  const fullLoc = resolveLocation(character, genLocationDef());
  const excludeIds = new Set();
  // BATCH 2.0 — never draw an Employer from the faction a queued war is
  // already targeting, or a forced-war Special could end up hiring itself.
  const employer = getEmployer(character, excludeIds, forcedWar ? forcedWar.target : null, employerCategories);
  // BATCH 2.0 — Special Missions ignore pairing ("any roles") but still
  // never target the Employer's own faction; nonDestroyedFactionNames()
  // stands in for pairedFactionsFor()'s usual category-based list.
  const allowedTargetFactions = forceSpecial
    ? nonDestroyedFactionNames(character).filter(name => name !== employer.faction)
    : pairedFactionsFor(character, employer.faction);

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
// character.restCount) chance of being one tier higher, and a further 50%
// chance (BATCH 2.1, was 10%) of that being a Special Mission — unless a faction Power struggle
// (§19.7) has a guaranteed war queued up, which always fills the second slot.
function genMissionBoard(character) {
  const capTier = Math.min(reputationTier(character), 3);
  // BATCH 2.2 — the first job's Employer is further restricted to the
  // category set gated by the player's own Reputation Tier (not capTier,
  // which is capped at 3 for difficulty purposes — this uses the real Tier
  // up to 4, per DATA.firstJobCategoriesByTier's own Legend/Tier-4 entry).
  const firstJobCategories = DATA.firstJobCategoriesByTier[Math.min(4, Math.max(1, reputationTier(character)))];
  const jobA = genBoardJob(character, capTier, false, false, null, firstJobCategories);

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
    // BATCH 2.1 (item 2) — raised from 10% to 50%: once the Board's second
    // slot is already escalating to a higher Tier, a coin flip decides
    // whether it's a Special Mission instead of an ordinary higher-tier job.
    const wantSpecial = wantHigher && randInt(1, 100) <= 50;
    jobB = genBoardJob(character, capTier, wantHigher, wantSpecial);
    if (!sameEmployer(jobB)) break;
  }
  return [jobA, jobB];
}

// UPDATE 3.0 (todo3.md MISSIONS) — "there is a key challenge or two in each
// mission. If these challenges succeed, the mission succeeds": each type's
// deciding step carries `keyChallenge: true` (read by determineMissionOutcome,
// game.js — replaces the old flat step-ratio Debrief calc for these five
// types). Assassination's Approach and Heist's Breach carry `alertOnFail`
// instead — a Partial/Fail there hands a -1/-2 penalty to the very next
// step (job.pendingStepPenalty, applied in finalizeStep/computeModifiers,
// game.js), not to the mission's outcome directly. Transport's two steps
// both carry `targetDamage` — see genMission's targetDamage field above.
const MISSION_SEQUENCES = {
  Assassination: [
    { attr: "Stealth", desc: "Approach the target undetected.", alertOnFail: true },
    { attr: "Combat", alt: "Hacking", desc: "Take out the target — a gun or a blade up close, or a burst of lethal ICE through the net.", keyChallenge: true },
    { attr: "Stealth", alt: "Driving", desc: "Escape the scene." }
  ],
  Heist: [
    { attr: "Hacking", alt: "Stealth", desc: "Breach the security around the target.", alertOnFail: true },
    { attr: "Stealth", desc: "Grab the target and get clear of the room.", keyChallenge: true },
    { attr: "Driving", desc: "Getaway before the block locks down." }
  ],
  Transport: [
    { attr: "Driving", alt: "Stealth", desc: "Run the transit route to the drop-off — fast and open, or slow and quiet.", targetDamage: true },
    { attr: "Social", alt: "Combat", desc: "Get past a checkpoint on the way.", targetDamage: true }
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
