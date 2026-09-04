// state.js — character sheet + world state, persisted to localStorage.
// Structure follows gamedesc.md §1 (Character) and §6 (Location Heat persistence).

const SAVE_KEY = "solo_game_save_v1";

const PROFESSIONS = {
  Solo: { boosts: ["Combat", "Stealth"], gear: [{ name: "Sidearm", attr: "Combat" }, { name: "Light Armor", attr: "Stealth" }], desc: "Combat & Stealth. Starts armed and armored." },
  Hacker: { boosts: ["Hacking", "Social"], gear: [{ name: "Netrunner Deck", attr: "Hacking" }, { name: "Icebreaker Program", attr: "Hacking" }], desc: "Hacking & Social. Starts with a deck and a program." },
  Rocker: { boosts: ["Social", "Driving"], gear: [{ name: "Motorcycle", attr: "Driving" }], desc: "Social & Driving. Starts with a ride and a crew contact." }
};

const TURFS = {
  Nomad: { boost: "Driving", cred: 200, contactFaction: "Aldecaldos", gear: [{ name: "Beater Car", attr: "Driving" }], desc: "+Driving. Starts with a vehicle and a Nomad Family contact." },
  Corpo: { boost: "Hacking", cred: 300, contactFaction: "Arasaka", gear: [], desc: "+Hacking. Extra starting Cred and a Corp contact (a favor owed either way)." },
  Street: { boost: "Stealth", cred: 200, contactFaction: "Valentinos", gear: [], repBonus: "Gun", desc: "+Stealth. Starts with a Gang contact and a point of Gun Rep." }
};

function defaultCharacter(name, profession, turf) {
  const attrs = { Combat: 1, Driving: 1, Hacking: 1, Social: 1, Stealth: 1 };
  const prof = PROFESSIONS[profession];
  const trf = TURFS[turf];
  prof.boosts.forEach(a => attrs[a] = Math.min(3, attrs[a] + 1));
  attrs[trf.boost] = Math.min(3, attrs[trf.boost] + 1);

  const rep = { Gun: 0, Knife: 0, Car: 0 };
  if (trf.repBonus) rep[trf.repBonus] += 1;

  return {
    name, profession, turf,
    attrs,
    rep,
    health: [false, false, false], // true = Harm marked
    permanentInjury: false, // going Down leaves this until a repair is paid for
    cred: trf.cred,
    gear: [...prof.gear, ...trf.gear],
    // The people pool: every Employer/Target/Adversary/Hireling ever drawn
    // or generated lives here (not just friendly contacts). See getPerson().
    contacts: [{ id: 1, name: genName(), faction: trf.contactFaction, profession: "Fixer", relationship: 1, favor: turf === "Corpo" ? -1 : 0 }],
    nextPersonId: 2,
    graveyard: [], // people killed off by mission outcomes; never redrawn
    locations: {}, // name -> {area, faction, heat}
    log: [`${name} (${profession} / ${turf}) steps onto the street for the first time.`]
  };
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
// relationship defaults, the id counter, and the graveyard array.
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
}

// Reuse rate for the recurring cast: 8 times out of 10 an existing pooled
// person is drawn instead of generating a brand-new one.
const REUSE_CHANCE = 0.8;

// roleCategory: "hostile" (opposition — Adversary / Assassination target) or
// "ally" (cooperative — Employer / Hireling / other mission Targets), per
// the sign of each pooled person's relationship. excludeIds keeps one job
// from casting the same person into two roles.
function getPerson(character, roleCategory, excludeIds) {
  const pool = character.contacts.filter(p =>
    !excludeIds.has(p.id) && (roleCategory === "hostile" ? p.relationship < 0 : p.relationship >= 0)
  );
  let person = null;
  if (pool.length && Math.random() < REUSE_CHANCE) {
    person = pick(pool);
  }
  if (!person) {
    person = genPerson();
    person.id = character.nextPersonId++;
    person.relationship = roleCategory === "hostile" ? -randInt(1, 2) : 0;
    person.favor = 0;
    character.contacts.push(person);
  }
  excludeIds.add(person.id);
  return person;
}

function nudgeRelationship(character, personId, delta) {
  const person = character.contacts.find(p => p.id === personId);
  if (!person) return;
  person.relationship = Math.max(-5, Math.min(5, person.relationship + delta));
}

function killPerson(character, personId) {
  const idx = character.contacts.findIndex(p => p.id === personId);
  if (idx === -1) return null;
  const [dead] = character.contacts.splice(idx, 1);
  dead.dead = true;
  character.graveyard.push(dead);
  return dead;
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

function highestRepTrack(character) {
  return Object.entries(character.rep).sort((a, b) => b[1] - a[1])[0][0];
}

// Fires exactly once, the moment a character goes Down (all 3 Health boxes
// marked). No permadeath: a slim chance instead knocks two stars off their
// best Rep track ("you should be dead — you're not, but it cost you"), and
// either way they're left with a Permanent Injury that needs a paid repair
// (see DATA.repairs) and an ongoing roll penalty until it's fixed.
function resolveDownEvent(character) {
  if (Math.random() < 0.1) {
    const track = highestRepTrack(character);
    character.rep[track] = Math.max(0, character.rep[track] - 2);
    addLog(character, `You should be dead. You're not — but your ${track} Rep just took a beating it won't forget.`);
  }
  character.permanentInjury = true;
  addLog(character, "The damage doesn't heal clean. You're carrying a Permanent Injury now — needs real repair.");
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
