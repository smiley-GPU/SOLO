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
    cyberneticReplacements: [], // BATCH 2.0 — one entry per Cybernetic Replacement repair; see cyberAttrModifier()
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
    titles: [], // INTERFACE 2.4.1 — earned honorifics ("Killer of X", "Shadow of X", "Friend of X"), see addTitle()
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

    // BATCH 2.0 — gentler cost: a single random attribute point instead of
    // both wealth and power, so this doesn't compound into a downward spiral.
    if (roll >= 10) {
      applyEffect();
      addLog(character, `${actorName} pulls off a job against ${rivalName} on the quiet.`);
    } else if (roll >= 7) {
      applyEffect();
      adjustFactionParam(character, actorName, pick(["wealth", "power"]), -1);
      addLog(character, `${actorName} gets what it wanted from ${rivalName}, but it costs them.`);
    } else {
      adjustFactionParam(character, actorName, pick(["wealth", "power"]), -1);
      addLog(character, `${actorName}'s move against ${rivalName} falls apart.`);
    }
  });
}

// BATCH 2.0 — counters the faction economy's downward trend: once per
// Rest tick, one random non-destroyed faction gets +1 to one randomly
// chosen attribute, on top of whatever the mission-driven swings did.
function applyFactionPassiveRecovery(character) {
  const all = nonDestroyedFactionNames(character);
  if (!all.length) return;
  const factionName = pick(all);
  const param = pick(["wealth", "rnd", "power"]);
  adjustFactionParam(character, factionName, param, 1);
  addLog(character, `${factionName} quietly rebuilds (+1 ${param}).`);
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

// §19.7 — checked once per Rest tick (processRestTick, game.js) and, since
// todo3.md UPDATE 2.7, once per Debrief too (runDebrief, game.js), right
// after that job's own faction-standing effects are counted. Any
// non-destroyed Corpo/Crime/Nomad faction with Power ≥10 rolls against a
// random rival in its own category.
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
  if (!character.cyberneticReplacements) character.cyberneticReplacements = []; // BATCH 2.0

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
  if (!character.titles) character.titles = []; // INTERFACE 2.4.1
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

  // §20.9 — backfill `name` onto any persisted Location record saved
  // before resolveLocation() started returning the live object directly.
  Object.entries(character.locations).forEach(([name, loc]) => {
    if (!loc.name) loc.name = name;
  });
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
    !p.benefactor && // BATCH 2.1 — the Mysterious Benefactor is never cast into an ordinary role
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

// -- Mysterious Benefactor (BATCH 2.1, item 11) -----------------------------
// A recurring, Freelance, no-relationship-cost NPC who occasionally leaves a
// one-shot gift behind — first met via a "lucky break" Downtime event
// (maybeLuckyBreak, game.js) when the character is flat broke and hurting,
// and liable to reappear on a later Reputation Tier-up (gainReputation
// above). Tagged `benefactor: true` so getPerson() never casts them into an
// ordinary Employer/Target/Hireling role.
function findOrCreateBenefactor(character) {
  let benefactor = character.contacts.find(p => p.benefactor);
  if (!benefactor) {
    benefactor = { id: character.nextPersonId++, name: genName(), faction: "Freelance", profession: "Fixer", relationship: 0, favor: 0, benefactor: true };
    assignFactionTier(character, benefactor);
    character.contacts.push(benefactor);
  }
  return benefactor;
}

// 40% chance per Tier-up, only once the character has actually met the
// Benefactor at least once (gainReputation checks this before calling in).
function maybeBenefactorReturns(character) {
  const benefactor = character.contacts.find(p => p.benefactor);
  if (!benefactor || Math.random() >= 0.4) return;
  addLog(character, `A familiar courier finds you again — word travels fast when you move up in the world.`);
  grantBenefactorGift(character);
}

// Finds/creates the Benefactor, then gifts a one-shot item matching the
// character's current lowest-ranked Attribute (ties broken at random) — "a
// single shot item of your lowest skill" (todo3.md). Falls back to a point
// of BOOST on the vanishingly rare chance no matching one-shot exists.
function grantBenefactorGift(character) {
  const benefactor = findOrCreateBenefactor(character);
  const lowestRank = Math.min(...Object.values(character.attrs));
  const lowAttrs = Object.keys(character.attrs).filter(a => character.attrs[a] === lowestRank);
  const attr = pick(lowAttrs);
  const pool = [].concat(...Object.values(DATA.oneShotGear)).filter(g => g.attr === attr);
  if (!pool.length) {
    character.boost = Math.min(10, character.boost + 1);
    addLog(character, `${benefactor.name} sends word, but nothing arrives this time (+1 BOOST).`);
    return;
  }
  const item = pick(pool);
  const tier = Object.keys(DATA.oneShotGear).find(t => DATA.oneShotGear[t].includes(item));
  const gift = { name: item.name, attr: item.attr, tier, tags: item.tags };
  character.gear.push(gift);
  autoCarryNewItem(character, gift);
  addLog(character, `A courier drops off a package — no note, just a ${item.name}, from whoever's been watching out for you.`);
}

// -- Employer/Target faction pairing (§19.4) --------------------------------

function nonAuthorityFactionNames(character) {
  return Object.keys(character.factionStandings).filter(name => {
    const s = character.factionStandings[name];
    return !s.destroyed && s.category !== "Authority";
  });
}

function nonDestroyedFactionNames(character) {
  return Object.keys(character.factionStandings).filter(name => !character.factionStandings[name].destroyed);
}

// Authority factions may only ever be a mission Target, never an Employer.
// excludeFactionName (BATCH 2.0, optional): also excludes one specific
// faction — used when building a guaranteed-war Special Mission (§19.7) so
// the Employer never coincidentally matches the war's own target faction.
// allowedCategories (BATCH 2.2, optional): further restricts the Employer to
// factions in these categories — used for the Mission Board's first slot,
// gated by the player's own Reputation Tier (DATA.firstJobCategoriesByTier).
// Freelance Employers are unaffected either way (getPerson() always exempts
// Freelance from an allowedFactionNames list).
function getEmployer(character, excludeIds, excludeFactionName, allowedCategories) {
  let allowed = nonAuthorityFactionNames(character).filter(name => name !== excludeFactionName);
  if (allowedCategories) {
    allowed = allowed.filter(name => allowedCategories.includes(character.factionStandings[name].category));
  }
  return getPerson(character, "ally", excludeIds, allowed);
}

// The factions a Target may belong to given the Employer's faction: same or
// an adjacent category (Corpo↔Crime, Crime↔Nomad), or any Authority faction
// — but never the Employer's own faction (BATCH 2.0: a faction never
// attacks/targets itself). Returns null (no constraint) for a Freelance/
// untracked Employer.
function pairedFactionsFor(character, employerFactionName) {
  const employerStanding = character.factionStandings[employerFactionName];
  if (!employerStanding) return null;
  const allowedCategories = DATA.factionCategoryAdjacency[employerStanding.category] || [employerStanding.category];
  const allowed = [];
  Object.entries(character.factionStandings).forEach(([name, standing]) => {
    if (standing.destroyed || name === employerFactionName) return;
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
  const before = person.relationship;
  person.relationship = Math.max(-5, Math.min(5, person.relationship + delta));
  // A BLOODBROTHER whose relationship turns negative flips to Archenemy
  // (todo3.md Persons) — checked here so it applies no matter what caused
  // the drop (Debrief, a Hunt, an Ally-favor failure, ...).
  if (person.bloodbrother && person.relationship < 0) {
    tagArchenemy(character, person);
    addLog(character, `${person.name} turns on you. What you had is gone.`, "archenemy");
  } else if (!person.archenemy && person.relationship === -5 && before > -5) {
    // BATCH 2.0 — more than one Archenemy can exist now: hitting the
    // relationship floor tags them regardless of the Rest clock, which
    // still separately locks in its own single worst-relationship target
    // (lockInArchenemy, game.js) — that assignment is untouched.
    tagArchenemy(character, person);
    addLog(character, `${person.name} will never forgive this. You've made an Archenemy.`, "archenemy");
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
  // BATCH 2.0 — a proper obituary for anyone the player actually knew,
  // instead of leaving every call site to write its own one-off line.
  if (dead.relationship >= 3 || dead.bloodbrother || dead.archenemy) {
    addLog(character, `${dead.name} ${pick(DATA.obituaries)}`);
  }
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
    // Back to 2 ticks (was 1 per UPDATE 2.9) — but a "tick" now counts both
    // a Rest and a completed job (runDebrief, game.js), not just Rest, so
    // this isn't strictly slower than UPDATE 2.9 in practice.
    person.woundedRounds = 2;
    addLog(character, `${person.name} is wounded and won't be much use for a while.`);
  }
}

// INTERFACE 2.4.1 — the sheet shows a red mark on any `wounded` contact
// ("remove it when they are healed, available again to work"); this is what
// clears it. Ticks once per Rest (processRestTick, game.js) — the same
// "round/night" cadence the faction Power struggles use — and once per
// completed job (runDebrief, game.js), so grinding missions back-to-back
// without ever resting still heals a sidelined Helper eventually.
function recoverWoundedContacts(character) {
  character.contacts.forEach(p => {
    if (!p.wounded) return;
    if (typeof p.woundedRounds !== "number") p.woundedRounds = 2; // backfill for anyone wounded before this field existed
    p.woundedRounds -= 1;
    if (p.woundedRounds <= 0) {
      p.wounded = false;
      delete p.woundedRounds;
      addLog(character, `${p.name} is back on their feet.`);
    }
  });
}

// todo3.md INTERFACE UPDATE 2.5 — "write all Archenemy actions with a red
// font": a log entry stays a plain string (the common case) unless it needs
// a tag, in which case it's pushed as {text, tag} instead — renderJournalBox()
// (game.js) reads either shape. `tag` is normally passed explicitly (the
// Archenemy-clock event, an Apartment invasion, a relationship hitting -5,
// ...); when omitted, a Hunt actively in progress (G.hunt, game.js's UI-state
// global) auto-tags it "archenemy" instead, so the whole Hunt narration flow
// (~20 call sites, all firing while G.hunt is truthy) doesn't need tagging
// one by one. G is defined well before addLog is ever actually called
// (every script has loaded and init() has run by then), so this is safe
// despite state.js not otherwise reaching into game.js's UI state.
function addLog(character, text, tag) {
  const finalTag = tag || (typeof G !== "undefined" && G.hunt ? "archenemy" : undefined);
  character.log.push(finalTag ? { text, tag: finalTag } : text);
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
// INTERFACE 2.4.1 — boxes are always marked leftmost-first (markHarm above
// already does this); healing has to clear from the rightmost marked box
// instead of the leftmost, or a heal would open a gap in the middle of the
// row instead of shrinking it from the end.
function healBox(character) {
  for (let i = character.health.length - 1; i >= 0; i--) {
    if (character.health[i]) { character.health[i] = false; return; }
  }
}

// Armor (Corrections.md, revised by todo3.md UPDATE 2.7 — "armor should
// always protect you from damage. As many damage can be blocked as you
// have armor points"): carried gear armor now *always* absorbs a Harm mark
// instead of taking it, at the cost of one durability point off the armor
// (`item.armor`, set to the tier's charge count at purchase — see
// DATA.gear in data.js); broken (0 durability) armor is removed. Tier sets
// how many hits an armor item can take — once those points are spent,
// there's nothing left to block with. Cybernetic (chrome) armor is a
// separate, non-depleting layer underneath it and keeps its own flat
// chance instead — it has no finite "points" to exhaust the way gear armor
// does. This is the one path anything should use in place of a bare
// markHarm() call.
const CYBER_ARMOR_ABSORB_CHANCE = 0.5;

// BATCH 2.0 (todo3.md) — "count cybernetic replacements — getting to borg".
// hasCyberPart/cyberArmorCount/cyberAttrModifier are the three read-only
// helpers everything else (applyHarm below, and every Combat/Social
// modifier list in game.js) builds on.
function hasCyberPart(character, part) {
  return character.cyberneticReplacements.includes(part);
}
function cyberArmorCount(character) {
  const limbBonus = hasCyberPart(character, "Cyberarm") && hasCyberPart(character, "Cyberleg") ? 1 : 0;
  const faceplates = character.cyberneticReplacements.filter(p => p === "Faceplate").length;
  const lungs = character.cyberneticReplacements.filter(p => p === "Cyberlung").length;
  return limbBonus + faceplates + lungs;
}
function cyberAttrModifier(character, attr) {
  if (attr === "Combat") {
    return hasCyberPart(character, "Cyberarm") && hasCyberPart(character, "Cyberleg") ? 1 : 0;
  }
  if (attr === "Social") {
    return -character.cyberneticReplacements.filter(p => p === "Faceplate").length;
  }
  return 0;
}

// INTERFACE 2.4.1 — the one carried armor item currently absorbing hits;
// shared by applyHarm() and the sheet's Armor-boxes row so they never
// disagree about which item is "the" armor.
function carriedArmorItem(character) {
  return character.gear.find(item => item.carried && item.armor > 0);
}

function applyHarm(character) {
  const armor = carriedArmorItem(character);
  if (armor) {
    // todo3.md UPDATE 2.7 — deterministic now: any remaining armor point
    // always blocks the hit, no roll involved.
    armor.armor -= 1;
    addLog(character, `${armor.name} takes the hit for you.`);
    if (armor.armor <= 0) {
      character.gear = character.gear.filter(item => item !== armor);
      addLog(character, `${armor.name} is wrecked — it won't stop another one.`);
    }
    return false; // absorbed clean — no Health box marked, so never "wentDown" here
  }
  // BATCH 2.0 — a Faceplate/Cyberlung/arm+leg pair gives a second, permanent
  // (non-depleting) absorb chance once carried gear armor doesn't apply —
  // still a flat roll, not points, since it never runs out (todo3.md
  // UPDATE 2.7 only made finite-points gear armor deterministic).
  if (cyberArmorCount(character) > 0 && Math.random() < CYBER_ARMOR_ABSORB_CHANCE) {
    addLog(character, "Your chrome takes the hit for you.");
    return false;
  }
  const down = markHarm(character);
  // §20.9 (BATCH 2.0) — every non-absorbed hit states its effect plainly,
  // one chokepoint covering every one of the ~9 call sites that use this
  // instead of a bare markHarm(): the flavor line callers log separately
  // never said which mechanical thing actually happened.
  addLog(character, down ? "You go down — every Harm box marked." : "-1 Harm box.");
  return down;
}

// Fires on a character's *first* Down (all 3 Health boxes marked): a slim
// chance knocks 2 points off their BOOST pool ("you should be dead —
// you're not, but it cost you"), and either way they're left with a
// Permanent Injury that needs a paid repair (see DATA.repairs) and an
// ongoing roll penalty until it's fixed. Going Down *again* while already
// carrying one is fatal (BATCH 2.0) — see handleGoingDown() in game.js,
// the one path anything should call instead of this directly.
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
  const beforeTier = reputationTier(character);
  character.reputation = Math.max(1, Math.min(20, character.reputation + amount));
  // BATCH 2.1 (item 11) — a Reputation Tier-up has a chance of the Mysterious
  // Benefactor (if the character has ever met them) sending another gift.
  // Purely a contacts/gear/log mutation, never touches G.phase or any UI
  // state, so it's safe to fire mid-Debrief/mid-Hunt-resolution/mid-Rest —
  // every one of gainReputation()'s ~10 call sites is unaffected.
  if (reputationTier(character) > beforeTier) maybeBenefactorReturns(character);
}
function reputationTier(character) {
  const entry = DATA.reputationTiers.find(t => character.reputation <= t.max);
  return entry ? entry.tier : DATA.reputationTiers[DATA.reputationTiers.length - 1].tier;
}
function reputationTitle(character) {
  const entry = DATA.reputationTiers.find(t => character.reputation <= t.max);
  return entry ? entry.title : DATA.reputationTiers[DATA.reputationTiers.length - 1].title;
}

// INTERFACE 2.4.1 — earned honorifics ("Killer of X", "Shadow of X", "Friend
// of X"), one per Reputation-granting deed that already gets its own log
// line. Kept as a simple running list (not deduped — killing a second
// Archenemy is a second honor) shown under Reputation on the sheet, and
// doubling as the obituary/score chart on the win/loss/death screens.
function addTitle(character, title) {
  character.titles.push(title);
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
// factions (Freelance, null turf). Capped at 10 (BATCH 2.0, was 20) — every
// Tier-up/Power-struggle threshold is already "≥10", so a maxed stat now
// just sits at its own threshold permanently instead of climbing further.
function adjustFactionParam(character, factionName, param, delta) {
  const standing = character.factionStandings[factionName];
  if (!standing || standing.destroyed) return;
  const before = standing[param];
  standing[param] = Math.max(0, Math.min(10, standing[param] + delta));
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

// BATCH 2.2 — factionChallengeModifier() (§19.6's "-(tier-1) on every
// Challenge against the mission Target's faction") was removed: once
// genAdversaryTier() folds an adversary's own factionTier into their
// weak/tough/elite combat tier, keeping this too would double-count the
// same faction's Tier on the same roll (todo3.md: "make sure that NPC Tier
// and Faction tier is not counted twice").

// -- Gear bonuses (todo2.md) -----------------------------------------------

// Highest-tier *carried* item matching attr, or null (§20.8 — only carried
// gear grants its bonus; owning something you didn't bring does nothing).
// Gear grants its bonus permanently just by being carried — see
// computeModifiers() in game.js. Includes one-shot ("1S") gear, unlike
// bestPermanentGearBonus() below — only used where there's no interactive
// roll to offer a one-shot choice on (resolveApartmentRaid's auto-resolve,
// game.js), so a carried one-shot still passively contributes there without
// being spent (PATCH 2.4 didn't touch that non-interactive path).
function bestGearBonus(character, attr) {
  let best = null;
  character.gear.forEach(item => {
    if (!item.carried || item.attr !== attr) return;
    const bonus = DATA.gearTierBonus[item.tier] || 0;
    if (!best || bonus > best.bonus) best = { name: item.name, bonus, item };
  });
  return best;
}

// PATCH 2.4 (todo3.md) — one-shot ("1S") gear is now an explicit per-roll
// choice, offered as its own checkbox alongside BOOST/Ally Assist
// (renderChallenge/renderHuntRoll, game.js), instead of being auto-applied
// (and auto-burned) whenever it happened to be the single best item
// bestGearBonus() would have picked. bestPermanentGearBonus() is that same
// "best owned item" search with one-shots excluded — the passive bonus that
// always applies, regardless of any one-shot choice.
function bestPermanentGearBonus(character, attr) {
  let best = null;
  character.gear.forEach(item => {
    if (!item.carried || item.attr !== attr) return;
    if (item.tags && item.tags.includes("1S")) return;
    const bonus = DATA.gearTierBonus[item.tier] || 0;
    if (!best || bonus > best.bonus) best = { name: item.name, bonus, item };
  });
  return best;
}

// Every carried one-shot item matching attr — each offered as its own
// independent checkbox (PATCH 2.4); a character could plausibly carry more
// than one different one-shot for the same attribute.
function oneShotOptionsForAttr(character, attr) {
  return character.gear.filter(item => item.carried && item.attr === attr && item.tags && item.tags.includes("1S"));
}

// PATCH 2.4 — removes exactly the one-shot items the player opted into
// using for this roll (the checked boxes), logging each as spent. Called
// once per roll-button click in renderChallenge()/renderHuntRoll(), right
// before resolving — never more than what was actually checked.
function consumeOneShotItems(character, items) {
  if (!items || !items.length) return;
  character.gear = character.gear.filter(item => !items.includes(item));
  items.forEach(item => addLog(character, `${item.name} is spent — one shot, and it's gone.`));
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

// todo3.md INTERFACE UPDATE 2.5 — "for each vehicle mark where it is
// stocked. Default is street." A lazy default (like `item.tier || "Street"`
// elsewhere) rather than backfilling every gear-creation call site: a
// vehicle with no `location` field yet just reads as "Street".
function vehicleLocation(item) {
  return item.location || "Street";
}

// todo3.md UPDATE 2.8 — "Repair is only possible to items original level":
// Workshop Repair/Mod needs a stable ceiling to measure against, so the
// first time anything actually changes an item's Tier (degrading it on a
// Fail, or repairing/modding it in the Workshop), its Tier at that moment
// gets locked in as `originalTier` — for any item that's never been
// touched by either, its current Tier already *is* the original one, so
// stamping it the first time either path looks at it is equivalent to
// stamping it at purchase, without needing to touch every gear-creation
// call site. Idempotent — safe to call from both places.
function ensureOriginalTier(item) {
  if (item.originalTier === undefined) item.originalTier = item.tier || "Street";
  return item.originalTier;
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
    // `name` is stored too (§20.9) so the live record returned by
    // resolveLocation() below is a drop-in replacement for the old
    // {name, area, faction, heat} copy it used to build.
    character.locations[location.name] = { name: location.name, area: location.area, faction: location.faction, heat: location.heat };
  }
  return character.locations[location.name];
}

// Given a fixed location definition ({name, area, faction} from
// DATA.locations), returns the full, currently-persisted location object —
// rolling a first-visit Heat if this is the first time it's been seen, or
// returning its already-persisted Heat otherwise. The 12 locations are a
// permanent map, so this is the one path anything should use to "visit" one.
// §20.9 (BATCH 2.0, bug fix): returns the *live* persisted object, not a
// copy — a job's `location`/`fromLocation` must see Heat rises that happen
// during its own Steps (Combat's always-on +1, a Stealth Fail's +2, ...),
// or the exit Checkpoint/apartment-raid checks (§20.7) only ever see
// whatever Heat existed before the job even started.
function resolveLocation(character, def) {
  return rememberLocation(character, { name: def.name, area: def.area, faction: def.faction, heat: rollHeatForArea(def.area) });
}
// §20.9 (BATCH 2.0) — the one path anything raising Heat from a Challenge
// fallout should use: mutates *and* logs the change explicitly, since Heat
// rises previously happened silently (no log line at all).
function raiseHeat(character, location, amount) {
  if (!location) return;
  location.heat = Math.min(5, location.heat + amount);
  addLog(character, `Heat +${amount} at ${location.name} (now ${location.heat}).`);
}

function decayOtherLocations(character, exceptName) {
  Object.keys(character.locations).forEach(name => {
    if (name !== exceptName) {
      const loc = character.locations[name];
      loc.heat = Math.max(0, loc.heat - 1);
    }
  });
}
