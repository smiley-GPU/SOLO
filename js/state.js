// state.js — character sheet + world state, persisted to localStorage.
// Structure follows gamedesc.md §1 (Character) and §6 (Location Heat persistence).

const SAVE_KEY = "solo_game_save_v1";

// Starting gear names match the Street-tier catalog in data.js where the
// item is mechanically identical (original Europunk names — Corrections.md).
const PROFESSIONS = {
  Solo: { boosts: ["Combat", "Stealth"], gear: [{ name: "Kessler Snub", attr: "Combat" }, { name: "Padded Vest", armor: 1 }], desc: "Combat & Stealth. Starts armed and armored." },
  Hacker: { boosts: ["Hacking", "Social"], gear: [{ name: "Bootleg Deck", attr: "Hacking" }, { name: "Patchwork ICE Program", attr: "Hacking" }], desc: "Hacking & Social. Starts with a deck and a program." },
  Rocker: { boosts: ["Social", "Driving"], gear: [{ name: "Ostrava Runner", attr: "Driving" }], desc: "Social & Driving. Starts with a ride and a crew contact." }
};

const TURFS = {
  Nomad: { boost: "Driving", bonds: 2, contactFaction: "Vlads", gear: [{ name: "Kombi Wagon", attr: "Driving", tags: ["CG"] }], desc: "+Driving. Starts with a vehicle and a Nomad Family contact." },
  Corpo: { boost: "Hacking", bonds: 3, contactFaction: "Hammerstein GmbH", gear: [], desc: "+Hacking. Extra starting BONDS and a Corp contact (a favor owed either way)." },
  Street: { boost: "Stealth", bonds: 2, contactFaction: "EuroMafia", gear: [], boostBonus: 1, desc: "+Stealth. Starts with a Crime contact and a point of BOOST." }
};

function defaultCharacter(name, profession, turf) {
  const attrs = { Combat: 1, Driving: 1, Hacking: 1, Social: 1, Stealth: 1 };
  const prof = PROFESSIONS[profession];
  const trf = TURFS[turf];
  prof.boosts.forEach(a => attrs[a] = Math.min(3, attrs[a] + 1));
  attrs[trf.boost] = Math.min(3, attrs[trf.boost] + 1);
  const factionStandings = defaultFactionStandings();
  const gear = [...prof.gear, ...trf.gear].map(g => ({ ...g, tier: g.tier || "Street" }));

  const character = {
    name, profession, turf,
    attrs,
    boost: trf.boostBonus || 0, // spendable pool — see bestGearBonus/renderChallenge (game.js)
    health: [false, false, false], // true = Harm marked
    permanentInjury: false, // going Down leaves this until a repair is paid for
    bonds: trf.bonds, // BOND — the abstracted currency (todo3.md), replaces Cred. Win at 20.
    gear, // §20.8 — carried defaults computed below, once the full character object exists
    // The people pool: every Employer/Target/Adversary/Hireling ever drawn
    // or generated lives here (not just friendly contacts). See getPerson().
    contacts: [{ id: 1, name: genName(), faction: trf.contactFaction, profession: "Fixer", relationship: 1, favor: turf === "Corpo" ? -1 : 0, factionTier: factionStandings[trf.contactFaction].tier }],
    nextPersonId: 2,
    graveyard: [], // people killed off by mission outcomes; never redrawn
    locations: {}, // name -> {area, faction, heat}
    factionStandings,
    factionRelations: {}, // lazy pairwise map, see nudgeFactionRelation()
    restCount: 0, // Coffin Hotel / Night on the Street uses since the last Hunt (todo3.md)
    archenemyId: null, // locked in on the first Rest — see processRestTick() in game.js
    pendingSaleItem: null, // a banked Street-tier item awaiting its pair — see sellGearItem() in game.js
    reputation: 1, // §19.1 — 1-20, never spent, gates the Mission Board (reputationTier() below)
    pendingWars: [], // §19.7 — guaranteed Special Missions queued by a faction Power struggle
    stocks: {}, // §20.5 EuroStoxx — {factionName: amount}, Corpo factions only
    apartment: null, // §20.5 — {locationName, tier, security: [names]} once bought
    shopOffers: null, // §20.5 — the Shop's current offer list, refreshed each Rest tick
    log: [`${name} (${profession} / ${turf}) steps onto the street for the first time.`]
  };
  computeDefaultCarry(character); // §20.8 — best item per category carried by default
  return character;
}

// Eager-inits Wealth/R&D/Power for all 11 fixed factions (unlike Locations,
// the faction roster is small and fixed, so there's no lazy-discovery step —
// the Factions panel always shows every faction in the game). See data.js
// DATA.factions / DATA.factionBaseStats.
function defaultFactionStandings() {
  const standings = {};
  DATA.factions.forEach(f => {
    standings[f.name] = {
      ...DATA.factionBaseStats[f.type],
      category: f.type, // mutable: Wealth-driven category jumps (§19.6) change this away from DATA.factions' fixed type
      tier: startingFactionTier(f.name, f.type),
      destroyed: false
    };
  });
  return standings;
}

// -- Faction Tiers (§19.6) --------------------------------------------------

function startingFactionTier(factionName, category) {
  if (DATA.factionFixedTier[factionName] !== undefined) return DATA.factionFixedTier[factionName];
  const range = DATA.factionTierRanges[category];
  return range ? range.min : 1;
}

// Re-checks a faction's Tier/category after any Wealth/R&D change (§19.6):
// R&D ≥10 promotes to the category's higher Tier, dropping back below 8
// demotes it again; Wealth ≥10 while already at the category's higher Tier
// promotes it into the next category up (Nomad→Crime, Crime→Corpo), keeping
// the Tier number. Authority factions (fixed Tier) never move.
function updateFactionTier(character, factionName) {
  const standing = character.factionStandings[factionName];
  if (!standing || standing.destroyed) return;
  if (DATA.factionFixedTier[factionName] !== undefined) return;
  const range = DATA.factionTierRanges[standing.category];
  if (!range) return;

  if (standing.tier < range.max && standing.rnd >= 10) {
    standing.tier = range.max;
    addLog(character, `${factionName} throws its R&D lead around — it moves up to Tier ${standing.tier}.`);
  } else if (standing.tier === range.max && standing.rnd < 8) {
    standing.tier = range.min;
    addLog(character, `${factionName}'s R&D dries up — it slips back to Tier ${standing.tier}.`);
  }

  if (standing.tier === range.max && standing.wealth >= 10) {
    const nextCategory = standing.category === "Nomad" ? "Crime" : standing.category === "Crime" ? "Corpo" : null;
    if (nextCategory) {
      standing.category = nextCategory;
      // Tier number carries over unchanged — it's already this category's floor/ceiling either way.
      addLog(character, `${factionName} buys its way up — it's a ${nextCategory} player now.`);
    }
  }
}

function nonDestroyedFactionsIn(character, category) {
  return DATA.factions.filter(f => {
    const s = character.factionStandings[f.name];
    return s && !s.destroyed && s.category === category;
  }).map(f => f.name);
}

// §20.1 — the atk/def modifier formula shared by every faction-vs-faction
// roll (§19.7's Power struggles and this background-mission roll): each
// side's count of attributes ≥10, plus +1 if that side's Tier is higher.
function factionRollMods(attacker, defender) {
  const atkMod = ["wealth", "rnd", "power"].filter(k => attacker[k] >= 10).length + (attacker.tier > defender.tier ? 1 : 0);
  const defMod = ["wealth", "rnd", "power"].filter(k => defender[k] >= 10).length + (defender.tier > attacker.tier ? 1 : 0);
  return atkMod - defMod;
}

// §20.1 — a lighter background layer than §19.7's Power struggles (which
// only fire for Power ≥10 attackers and can destroy a faction): once per
// Debrief, one random faction per category (Corpo/Crime/Nomad) tries a
// mission of its own against a random same-category rival, using the same
// roll shape but never destroying anyone — it just moves standings, at a
// cost on anything short of a clean win.
function runFactionBackgroundMissions(character) {
  ["Corpo", "Crime", "Nomad"].forEach(category => {
    const factions = nonDestroyedFactionsIn(character, category);
    if (factions.length < 2) return;
    const actorName = pick(factions);
    const rivalName = pick(factions.filter(n => n !== actorName));
    const actor = character.factionStandings[actorName];
    const rival = character.factionStandings[rivalName];

    const { sum } = roll2d6();
    const roll = sum + factionRollMods(actor, rival);

    const type = pick(Object.keys(DATA.missionFactionEffects));
    const effects = DATA.missionFactionEffects[type];
    const applyEffect = () => {
      Object.entries(effects.employer).forEach(([param, v]) => adjustFactionParam(character, actorName, param, v));
      Object.entries(effects.target).forEach(([param, v]) => adjustFactionParam(character, rivalName, param, v));
    };

    if (roll >= 10) {
      applyEffect();
      addLog(character, `${actorName} pulls off a job against ${rivalName} on the quiet.`);
    } else if (roll >= 7) {
      applyEffect();
      adjustFactionParam(character, actorName, "wealth", -1);
      adjustFactionParam(character, actorName, "power", -1);
      addLog(character, `${actorName} gets what it wanted from ${rivalName}, but it costs them.`);
    } else {
      adjustFactionParam(character, actorName, "wealth", -1);
      adjustFactionParam(character, actorName, "power", -1);
      addLog(character, `${actorName}'s move against ${rivalName} falls apart.`);
    }
  });
}

// A destroyed faction drops out of every future draw and its remaining
// Contacts scatter to Freelance (§19.7).
function destroyFaction(character, factionName) {
  const standing = character.factionStandings[factionName];
  if (!standing || standing.destroyed) return;
  standing.destroyed = true;
  character.contacts.forEach(p => { if (p.faction === factionName) p.faction = "Freelance"; });
  // §20.5 — any EuroStoxx position in a destroyed faction is wiped, not sellable.
  if (character.stocks[factionName]) {
    delete character.stocks[factionName];
    addLog(character, `Your ${factionName} stock is worthless overnight.`);
  }
  addLog(character, `${factionName} is torn apart. What's left of it scatters.`);
}

// §19.8 — the Corpo category reduced to a single survivor ends the game.
function checkMultiCorpLoss(character) {
  return nonDestroyedFactionsIn(character, "Corpo").length === 1;
}

// §19.7 — checked once per Rest tick. Any non-destroyed Corpo/Crime/Nomad
// faction with Power ≥10 rolls against a random rival in its own category.
function runFactionPowerStruggles(character) {
  ["Corpo", "Crime", "Nomad"].forEach(category => {
    nonDestroyedFactionsIn(character, category).forEach(attackerName => {
      const attacker = character.factionStandings[attackerName];
      if (!attacker || attacker.destroyed || attacker.power < 10) return;
      const rivals = nonDestroyedFactionsIn(character, category).filter(n => n !== attackerName);
      if (!rivals.length) return;
      const targetName = pick(rivals);
      const target = character.factionStandings[targetName];

      const { sum } = roll2d6();
      const roll = sum + factionRollMods(attacker, target);

      if (roll <= 6) {
        attacker.power = Math.max(0, attacker.power - 1);
        addLog(character, `${attackerName} makes a play for ${targetName} and it falls apart (-1 Power for ${attackerName}).`);
      } else if (roll <= 9) {
        character.pendingWars.push({ attacker: attackerName, target: targetName });
        addLog(character, `${attackerName} puts a price on ${targetName}'s territory. Word is a Special Mission's coming.`);
      } else {
        destroyFaction(character, targetName);
        addLog(character, `${attackerName} crushes ${targetName} outright.`);
      }
    });
  });
}

function save(character) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(character));
}
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const character = JSON.parse(raw);
  migrateCharacter(character);
  return character;
}
function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

// Backfills saves made before the people-pool feature existed: ids,
// relationship defaults, the id counter, and the graveyard array. Also
// backfills the faction system, gear tiers, and the REP→BOOST switch
// (todo2.md) for saves made before those existed.
function migrateCharacter(character) {
  if (!character.graveyard) character.graveyard = [];
  if (!character.contacts) character.contacts = [];
  let maxId = 0;
  character.contacts.forEach(p => {
    if (typeof p.relationship !== "number") p.relationship = 0;
    if (!p.profession) p.profession = "Fixer";
    if (!p.id) p.id = ++maxId;
    else maxId = Math.max(maxId, p.id);
  });
  if (!character.nextPersonId) character.nextPersonId = maxId + 1;
  if (typeof character.permanentInjury !== "boolean") character.permanentInjury = false;

  if (typeof character.boost !== "number") {
    // Old saves had per-track Rep instead of a single BOOST pool — carry the
    // total forward as starting BOOST rather than losing it outright.
    character.boost = character.rep ? Object.values(character.rep).reduce((a, b) => a + b, 0) : 0;
  }
  delete character.rep;

  if (!character.factionStandings) character.factionStandings = defaultFactionStandings();
  if (!character.factionRelations) character.factionRelations = {};

  // §20.6 — backfill factionTier on any contact created before this field
  // existed, from their faction's *current* Tier (a one-time snapshot, same
  // as a freshly generated NPC would get).
  character.contacts.forEach(p => {
    if (typeof p.factionTier !== "number") assignFactionTier(character, p);
  });

  (character.gear || []).forEach(item => {
    if (!item.tier) item.tier = "Street";
  });
  // §20.8 — backfill `carried` on any save from before the Loadout system
  // existed, using the same "best per category" default a new character gets.
  if (character.gear.some(item => typeof item.carried !== "boolean")) {
    computeDefaultCarry(character);
  }

  // Cred→BOND (todo3.md): old saves had hundreds of Cred, BONDS are a much
  // smaller abstract scale — carry the rough value forward rather than
  // losing it, then drop the old field for good.
  if (typeof character.bonds !== "number") {
    character.bonds = Math.max(0, Math.round((character.cred || 0) / 100));
  }
  delete character.cred;

  if (typeof character.restCount !== "number") character.restCount = 0;
  if (character.archenemyId === undefined) character.archenemyId = null;
  if (character.pendingSaleItem === undefined) character.pendingSaleItem = null;

  // §19.1 / §19.6 / §19.7 — Reputation, Faction Tiers, pending faction wars.
  if (typeof character.reputation !== "number") character.reputation = 1;
  if (!character.pendingWars) character.pendingWars = [];
  Object.entries(character.factionStandings).forEach(([name, standing]) => {
    const f = DATA.factions.find(f => f.name === name);
    if (!standing.category) standing.category = f ? f.type : "None";
    if (typeof standing.tier !== "number") standing.tier = startingFactionTier(name, standing.category);
    if (typeof standing.destroyed !== "boolean") standing.destroyed = false;
  });

  // §20.5 — EuroStoxx, Apartments, and the Shop's persisted offer list.
  if (!character.stocks) character.stocks = {};
  if (character.apartment === undefined) character.apartment = null;
  if (character.shopOffers === undefined) character.shopOffers = null;
}

// Reuse rate for the recurring cast: 8 times out of 10 an existing pooled
// person is drawn instead of generating a brand-new one.
const REUSE_CHANCE = 0.8;

// roleCategory: "hostile" (opposition — Adversary / Assassination target) or
// "ally" (cooperative — Employer / Hireling / other mission Targets), per
// the sign of each pooled person's relationship. excludeIds keeps one job
// from casting the same person into two roles.
// allowedFactionNames (§19.4, optional): restricts both the reused-pool
// draw and a freshly generated person to that faction list (Freelance always
// exempt — see genPerson()). Omitted entirely by every call site that
// doesn't care (Hireling, Adversaries, ...), so existing behavior is unchanged.
function getPerson(character, roleCategory, excludeIds, allowedFactionNames) {
  const pool = character.contacts.filter(p =>
    !excludeIds.has(p.id) &&
    (roleCategory === "hostile" ? p.relationship < 0 : p.relationship >= 0) &&
    (!allowedFactionNames || p.faction === "Freelance" || allowedFactionNames.includes(p.faction))
  );
  let person = null;
  if (pool.length && Math.random() < REUSE_CHANCE) {
    person = pick(pool);
  }
  if (!person) {
    person = genPerson(allowedFactionNames);
    person.id = character.nextPersonId++;
    person.relationship = roleCategory === "hostile" ? -randInt(1, 2) : 0;
    person.favor = 0;
    assignFactionTier(character, person);
    character.contacts.push(person);
  }
  excludeIds.add(person.id);
  return person;
}

// §20.6 — every NPC gets a Tier from their faction's *current* Tier at the
// moment they're created (Freelance → Tier 1), a plain field distinct from
// the "weak"/"tough"/"elite" combat-tier string Adversaries/Archenemies
// carry (tierPenalty()) — not kept in sync afterward.
function assignFactionTier(character, person) {
  const standing = character.factionStandings[person.faction];
  person.factionTier = standing ? standing.tier : 1;
}

// -- Employer/Target faction pairing (§19.4) --------------------------------

function nonAuthorityFactionNames(character) {
  return Object.keys(character.factionStandings).filter(name => {
    const s = character.factionStandings[name];
    return !s.destroyed && s.category !== "Authority";
  });
}

// Authority factions may only ever be a mission Target, never an Employer.
function getEmployer(character, excludeIds) {
  return getPerson(character, "ally", excludeIds, nonAuthorityFactionNames(character));
}

// The factions a Target may belong to given the Employer's faction: same or
// an adjacent category (Corpo↔Crime, Crime↔Nomad), or any Authority faction.
// Returns null (no constraint) for a Freelance/untracked Employer.
function pairedFactionsFor(character, employerFactionName) {
  const employerStanding = character.factionStandings[employerFactionName];
  if (!employerStanding) return null;
  const allowedCategories = DATA.factionCategoryAdjacency[employerStanding.category] || [employerStanding.category];
  const allowed = [];
  Object.entries(character.factionStandings).forEach(([name, standing]) => {
    if (standing.destroyed) return;
    if (standing.category === "Authority" || allowedCategories.includes(standing.category)) allowed.push(name);
  });
  return allowed;
}

// -- Heat checkpoints (§20.7) -----------------------------------------------

// A Location's "category" for checkpoint/raid purposes: its owning
// faction's *current* category (§19.6), or — for a neutral (faction: null)
// Location — Corpo if its fixed `area` is "Corpo", else no category at all
// (no location's `area` is ever "Crime"/"Nomad", only Urban/Corpo/Rural).
function locationCategory(location, factionStandings) {
  if (location.faction) {
    const standing = factionStandings[location.faction];
    return standing ? standing.category : null;
  }
  return location.area === "Corpo" ? "Corpo" : null;
}

// §20.7 — which agency (if any) mans a checkpoint at this Location right
// now: none below Heat 3, EurCop from Heat 3 up, SwissGuard if the
// Location is Corpo-category at Heat 4-5 or Crime-category at Heat 5.
function checkpointAgency(location, factionStandings) {
  if (location.heat < 3) return null;
  const category = locationCategory(location, factionStandings);
  if (category === "Corpo" && location.heat >= 4) return "SwissGuard";
  if (category === "Crime" && location.heat >= 5) return "SwissGuard";
  return "EurCop";
}

// §19.7 — casts a hostile Target belonging to exactly the queued war's
// target faction (a plain Employer/Target pairing draw could still land on
// Freelance, which wouldn't be "against" that faction at all).
function castWarTarget(character, factionName, excludeIds) {
  const pool = character.contacts.filter(p => !excludeIds.has(p.id) && p.faction === factionName && p.relationship < 0);
  let person = pool.length && Math.random() < REUSE_CHANCE ? pick(pool) : null;
  if (!person) {
    person = { name: genName(), faction: factionName, profession: pick(DATA.npcProfessions) };
    person.id = character.nextPersonId++;
    person.relationship = -randInt(1, 2);
    person.favor = 0;
    assignFactionTier(character, person);
    character.contacts.push(person);
  }
  excludeIds.add(person.id);
  return person;
}

function nudgeRelationship(character, personId, delta) {
  const person = character.contacts.find(p => p.id === personId);
  if (!person) return;
  person.relationship = Math.max(-5, Math.min(5, person.relationship + delta));
  // A BLOODBROTHER whose relationship turns negative flips to Archenemy
  // (todo3.md Persons) — checked here so it applies no matter what caused
  // the drop (Debrief, a Hunt, an Ally-favor failure, ...).
  if (person.bloodbrother && person.relationship < 0) {
    tagArchenemy(character, person);
    addLog(character, `${person.name} turns on you. What you had is gone.`);
  }
}

// -- Archenemy / BLOODBROTHER tags (todo3.md Persons) ----------------------
// A person can never hold both tags — each setter clears the other first.
// Archenemy also locks in a fixed "tough" tier, read by Hunt's modifiers
// (renderHuntRoll in game.js).
function tagArchenemy(character, person) {
  if (!person) return;
  person.bloodbrother = false;
  person.archenemy = true;
  person.tier = "tough";
}
function tagBloodbrother(character, person) {
  if (!person) return;
  person.archenemy = false;
  person.bloodbrother = true;
}

function killPerson(character, personId) {
  const idx = character.contacts.findIndex(p => p.id === personId);
  if (idx === -1) return null;
  const [dead] = character.contacts.splice(idx, 1);
  dead.dead = true;
  character.graveyard.push(dead);
  return dead;
}

// §20.1 — the persistent wound-then-kill rule for a mission Helper (or,
// later, the Archenemy home-invasion event): the first wound just marks
// them (`person.wounded`); a second one anywhere down the line kills them
// outright via killPerson(). Distinct from a job's own transient `benched`
// flag, which only lasts the one job.
function woundPerson(character, person) {
  if (!person) return;
  if (person.wounded) {
    killPerson(character, person.id);
    addLog(character, `${person.name} doesn't survive this one.`);
  } else {
    person.wounded = true;
    addLog(character, `${person.name} is wounded and won't be much use for a while.`);
  }
}

function addLog(character, text) {
  character.log.push(text);
  if (character.log.length > 300) character.log.shift();
}

function harmBoxesOpen(character) {
  return character.health.filter(h => !h).length;
}
function isDown(character) {
  return character.health.every(h => h);
}
function markHarm(character) {
  const idx = character.health.findIndex(h => !h);
  if (idx !== -1) character.health[idx] = true;
  return isDown(character);
}
function healBox(character) {
  const idx = character.health.findIndex(h => h);
  if (idx !== -1) character.health[idx] = false;
}

// Armor (Corrections.md): a flat chance to fully absorb a Harm mark
// instead of taking it, at the cost of one durability point off the armor
// (`item.armor`, set to the tier's charge count at purchase — see
// DATA.gear in data.js); broken (0 durability) armor is removed. Tier only
// sets how many hits an armor item can take, not the odds. This is the one
// path anything should use in place of a bare markHarm() call.
const ARMOR_ABSORB_CHANCE = 0.5;
function applyHarm(character) {
  const armor = character.gear.find(item => item.carried && item.armor > 0);
  if (armor && Math.random() < ARMOR_ABSORB_CHANCE) {
    armor.armor -= 1;
    addLog(character, `${armor.name} takes the hit for you.`);
    if (armor.armor <= 0) {
      character.gear = character.gear.filter(item => item !== armor);
      addLog(character, `${armor.name} is wrecked — it won't stop another one.`);
    }
    return false; // absorbed clean — no Health box marked, so never "wentDown" here
  }
  return markHarm(character);
}

// Fires exactly once, the moment a character goes Down (all 3 Health boxes
// marked). No permadeath: a slim chance instead knocks 2 points off their
// BOOST pool ("you should be dead — you're not, but it cost you"), and
// either way they're left with a Permanent Injury that needs a paid repair
// (see DATA.repairs) and an ongoing roll penalty until it's fixed.
function resolveDownEvent(character) {
  if (Math.random() < 0.1) {
    character.boost = Math.max(0, character.boost - 2);
    addLog(character, "You should be dead. You're not — but it cost you 2 BOOST you won't get back.");
  }
  character.permanentInjury = true;
  addLog(character, "The damage doesn't heal clean. You're carrying a Permanent Injury now — needs real repair.");
}

// -- Reputation (§19.1) ------------------------------------------------------

function gainReputation(character, amount) {
  character.reputation = Math.max(1, Math.min(20, character.reputation + amount));
}
function reputationTier(character) {
  const entry = DATA.reputationTiers.find(t => character.reputation <= t.max);
  return entry ? entry.tier : DATA.reputationTiers[DATA.reputationTiers.length - 1].tier;
}
function reputationTitle(character) {
  const entry = DATA.reputationTiers.find(t => character.reputation <= t.max);
  return entry ? entry.title : DATA.reputationTiers[DATA.reputationTiers.length - 1].title;
}

// -- Faction system (todo2.md) --------------------------------------------

function getFactionRelationKey(a, b) {
  return [a, b].sort().join("|");
}

// Pairwise faction-to-faction standing, lazily created at 0 (neutral) and
// clamped to -5..5, mirroring nudgeRelationship()'s per-person scale. No-ops
// for a faction pair that isn't meaningful (same faction, or either side
// isn't one of the 11 tracked factions — e.g. "Freelance" or a null turf).
function nudgeFactionRelation(character, factionA, factionB, delta) {
  if (!factionA || !factionB || factionA === factionB) return;
  if (!DATA.factions.some(f => f.name === factionA)) return;
  if (!DATA.factions.some(f => f.name === factionB)) return;
  const key = getFactionRelationKey(factionA, factionB);
  const current = character.factionRelations[key] || 0;
  character.factionRelations[key] = Math.max(-5, Math.min(5, current + delta));
}

// Bumps one Wealth/R&D/Power parameter for a faction (a job's employer gains,
// its target loses — see runDebrief() in game.js). No-ops for untracked
// factions (Freelance, null turf).
function adjustFactionParam(character, factionName, param, delta) {
  const standing = character.factionStandings[factionName];
  if (!standing || standing.destroyed) return;
  const before = standing[param];
  standing[param] = Math.max(0, Math.min(20, standing[param] + delta));
  if (param === "rnd" || param === "wealth") updateFactionTier(character, factionName);
  if (param === "wealth") settleStockGains(character, factionName, before, standing.wealth);
}

// §20.5 EuroStoxx — every Wealth change on a faction the player holds stock
// in settles immediately: +1 stock on any rise (+2 if Wealth just crossed
// into ≥10), or a loss equal to however far Wealth fell (floored at 0 held).
function settleStockGains(character, factionName, before, after) {
  const held = character.stocks[factionName];
  if (!held || after === before) return;
  if (after > before) {
    const gain = before < 10 && after >= 10 ? 2 : 1;
    character.stocks[factionName] += gain;
    addLog(character, `Your ${factionName} stock ticks up (+${gain} BOND).`);
  } else {
    const loss = Math.min(held, before - after);
    character.stocks[factionName] -= loss;
    addLog(character, `Your ${factionName} stock takes a hit (-${loss} BOND).`);
  }
}

// §19.6 — the Challenge modifier a faction's Tier applies: Tier 1 → 0,
// Tier 2 → -1, Tier 3 → -2, Tier 4 → -3.
function factionChallengeModifier(character, factionName) {
  const standing = character.factionStandings[factionName];
  if (!standing || standing.destroyed) return 0;
  return -(standing.tier - 1);
}

// -- Gear bonuses (todo2.md) -----------------------------------------------

// Highest-tier *carried* item matching attr, or null (§20.8 — only carried
// gear grants its bonus; owning something you didn't bring does nothing).
// Gear grants its bonus permanently just by being carried — see
// computeModifiers() in game.js.
function bestGearBonus(character, attr) {
  let best = null;
  character.gear.forEach(item => {
    if (!item.carried || item.attr !== attr) return;
    const bonus = DATA.gearTierBonus[item.tier] || 0;
    if (!best || bonus > best.bonus) best = { name: item.name, bonus };
  });
  return best;
}

// Equipment gating (todo3.md): *carrying* gear with a matching attr counts
// as "having a vehicle" (Driving) or "having a deck" (Hacking) — see
// renderChallenge() in game.js, which hides the gated attribute option
// when this comes back false. Owning one you left at home doesn't count
// (§20.8).
function ownsGearForAttr(character, attr) {
  return character.gear.some(item => item.carried && item.attr === attr);
}

// Highest-tier owned "health gear or body modification" — items tagged
// `heal` instead of `attr` (DATA.gear) — added to the Rest healing roll.
// Mirrors bestGearBonus() but matches item.heal instead of item.attr.
// §20.8 — exempt from the carried system entirely: it doesn't fit any of
// the five named gear categories, so it's always available regardless.
function bestHealBonus(character) {
  let best = 0;
  character.gear.forEach(item => {
    if (item.heal && item.heal > best) best = item.heal;
  });
  return best;
}

// -- Inventory / Loadout (§20.8) --------------------------------------------

// Which of the five named categories a gear item belongs to, or null for
// heal-gear (exempt from slot accounting entirely, see bestHealBonus above).
// Armor is filed under Clothing alongside the Stealth-attr line (todo3.md:
// "Clothing: Armor and Stealth suits").
function gearCategory(item) {
  if (item.heal) return null;
  if (item.armor) return "Clothing";
  return { Stealth: "Clothing", Combat: "Weapons", Hacking: "Decks", Driving: "Vehicles", Social: "Social" }[item.attr] || null;
}

// Spare slots beyond the one free slot each of the five categories gets:
// 3 base, +1 if a Vehicle is carried, +2 more (so +3 total) if that
// Vehicle also carries the CG (Cargo) tag.
function computeCarrySlots(character) {
  let spares = 3;
  const vehicle = character.gear.find(item => item.carried && item.attr === "Driving");
  if (vehicle) {
    spares += 1;
    if (vehicle.tags && vehicle.tags.includes("CG")) spares += 2;
  }
  return spares;
}

// One-time default: the single best item in each category is carried, the
// rest aren't — matches todo3.md's "default is that you take the best tier
// you have in each category." Run once, whenever an item is missing the
// `carried` field entirely (new character, or an old save migrating in) —
// never re-run after that, so it doesn't clobber the player's own choices.
function computeDefaultCarry(character) {
  ["Weapons", "Clothing", "Decks", "Vehicles", "Social"].forEach(category => {
    const items = character.gear.filter(item => gearCategory(item) === category);
    if (!items.length) return;
    const best = items.reduce((a, b) => (DATA.gearTierBonus[b.tier] || 0) > (DATA.gearTierBonus[a.tier] || 0) ? b : a);
    items.forEach(item => { item.carried = item === best; });
  });
  character.gear.forEach(item => {
    if (gearCategory(item) === null) item.carried = true; // heal-gear — the flag is just unused
  });
}

// Called whenever a new item enters character.gear (Shop buy, a Hunt kill
// reward, a Bloodbrother gift, starting gear): fills an empty category's
// free slot automatically, but never dethrones something the player is
// already carrying in that category — that's a manual Loadout choice.
function autoCarryNewItem(character, item) {
  const category = gearCategory(item);
  if (category === null) { item.carried = true; return; }
  const alreadyCarried = character.gear.some(g => g !== item && g.carried && gearCategory(g) === category);
  item.carried = !alreadyCarried;
}

function rememberLocation(character, location) {
  if (!character.locations[location.name]) {
    character.locations[location.name] = { area: location.area, faction: location.faction, heat: location.heat };
  }
  return character.locations[location.name];
}

// Given a fixed location definition ({name, area, faction} from
// DATA.locations), returns the full, currently-persisted location object —
// rolling a first-visit Heat if this is the first time it's been seen, or
// returning its already-persisted Heat otherwise. The 12 locations are a
// permanent map, so this is the one path anything should use to "visit" one.
function resolveLocation(character, def) {
  const persisted = rememberLocation(character, { name: def.name, area: def.area, faction: def.faction, heat: rollHeatForArea(def.area) });
  return { name: def.name, area: persisted.area, faction: persisted.faction, heat: persisted.heat };
}
function decayOtherLocations(character, exceptName) {
  Object.keys(character.locations).forEach(name => {
    if (name !== exceptName) {
      const loc = character.locations[name];
      loc.heat = Math.max(0, loc.heat - 1);
    }
  });
}
