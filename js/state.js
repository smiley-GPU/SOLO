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
    cred: trf.cred,
    gear: [...prof.gear, ...trf.gear],
    contacts: [{ name: genName(), faction: trf.contactFaction, relationship: 1, favor: turf === "Corpo" ? -1 : 0 }],
    locations: {}, // name -> {area, faction, heat}
    log: [`${name} (${profession} / ${turf}) steps onto the street for the first time.`]
  };
}

function save(character) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(character));
}
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? JSON.parse(raw) : null;
}
function clearSave() {
  localStorage.removeItem(SAVE_KEY);
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

function rememberLocation(character, location) {
  if (!character.locations[location.name]) {
    character.locations[location.name] = { area: location.area, faction: location.faction, heat: location.heat };
  }
  return character.locations[location.name];
}
function decayOtherLocations(character, exceptName) {
  Object.keys(character.locations).forEach(name => {
    if (name !== exceptName) {
      const loc = character.locations[name];
      loc.heat = Math.max(0, loc.heat - 1);
    }
  });
}
