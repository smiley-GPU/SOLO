// engine.js — dice resolution + procedural generators.
// Core mechanic per gamedesc.md §2: 2d6 + Attribute (+ modifiers) vs table.

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
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

function genPerson() {
  return {
    name: genName(),
    faction: genFaction(),
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

function genLocation() {
  const area = pick(["Urban", "Corpo", "Rural"]);
  const name = `${pick(DATA.locationAdjectives[area])} ${pick(DATA.locationNouns[area])}`;
  const faction = Math.random() < 0.5 ? genFaction(0.4) : null;
  const baseHeat = area === "Corpo" ? randInt(1, 3) : area === "Urban" ? randInt(0, 3) : randInt(0, 2);
  return { name, area, faction, heat: baseHeat };
}

function genGearOffers(count = 3) {
  const tiers = ["Street", "Street", "Professional", "Professional", "Military"];
  const offers = [];
  for (let i = 0; i < count; i++) {
    const tier = pick(tiers);
    const item = pick(DATA.gear[tier]);
    offers.push({ ...item, tier, id: `${item.name}-${Date.now()}-${i}` });
  }
  return offers;
}

function genMission(location) {
  const type = pick(DATA.missionTypes);
  const adversaryCount = randInt(1, 3);
  const adversaries = Array.from({ length: adversaryCount }, () => ({
    ...genPerson(),
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

  return {
    type,
    flavor: DATA.missionFlavor[type],
    target: genPerson(),
    location,
    adversaries,
    worstTier,
    timePeriod
  };
}

const MISSION_SEQUENCES = {
  Assassination: [
    { attr: "Stealth", desc: "Approach the target undetected." },
    { attr: "Combat", alt: "Hacking", desc: "Take out the target — or disable security and slip past." },
    { attr: "Stealth", alt: "Driving", desc: "Escape the scene." }
  ],
  Heist: [
    { attr: "Hacking", alt: "Stealth", desc: "Breach the security around the target." },
    { attr: "Stealth", desc: "Grab the target and get clear of the room." },
    { attr: "Driving", desc: "Getaway before the block locks down." }
  ],
  Transport: [
    { attr: "Driving", desc: "Run the transit route to the drop-off." },
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
