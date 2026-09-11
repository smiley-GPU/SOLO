// data.js — all generator content lives here as plain arrays/objects,
// per gamedesc.md §9 ("data-driven tables").

const DATA = {
  // European first-name pool (Corrections.md: "french, italian, nordic and
  // east european names") — mixed nationalities on purpose, no single-origin
  // block.
  firstNames: [
    "Luca", "Amara", "Bjorn", "Elin", "Mateusz", "Ines", "Dimitri", "Freya",
    "Giulia", "Sven", "Katarina", "Marco", "Ingrid", "Nikolai", "Chiara",
    "Anders", "Zofia", "Tomas", "Léa", "Viktor"
  ],
  // Street/hacker handles — same European mix, kept short and punchy.
  handles: [
    "Ferro", "Nera", "Lupo", "Fenrir", "Ravn", "Sabel", "Noir", "Vlk",
    "Krähe", "Ombra", "Falke", "Ghiaccio", "Corvo", "Mrok", "Volkov",
    "Eisen", "Blitz", "Rook", "Kilo", "Sturm"
  ],

  // Exactly 3 factions per level (Corpo/Crime/Nomad) plus 2 Authority
  // factions, per todo2.md. Original Europunk names (Corrections.md) — this
  // is the European SuperState, not any other setting. Each has a
  // Wealth/R&D/Power standing tracked per-character in
  // character.factionStandings (state.js), seeded from factionBaseStats below.
  factions: [
    { name: "Hammerstein GmbH", type: "Corpo" },
    { name: "Bulldog Ltd.", type: "Corpo" },
    { name: "Styletto", type: "Corpo" },
    { name: "EuroMafia", type: "Crime" },
    { name: "Vikings", type: "Crime" },
    { name: "Hooligans", type: "Crime" },
    { name: "Vlads", type: "Nomad" },
    { name: "Sombra 43", type: "Nomad" },
    { name: "Odin's Ax", type: "Nomad" },
    { name: "EurCop", type: "Authority" },
    { name: "SwissGuard", type: "Authority" }
  ],

  // Starting Wealth/R&D/Power per faction type — see factionStandings in state.js.
  factionBaseStats: {
    Corpo: { wealth: 8, rnd: 8, power: 4 },
    Crime: { wealth: 3, rnd: 1, power: 6 },
    Nomad: { wealth: 4, rnd: 2, power: 4 },
    Authority: { wealth: 5, rnd: 3, power: 8 }
  },

  npcProfessions: [
    "Fixer", "Corp Exec", "Ganger", "Nomad Rider", "Netrunner", "Solo",
    "Media", "Cop", "Civilian", "Medtech", "Techie", "Body Doc"
  ],

  // Fixed, permanent world map — always these 12, never randomly combined.
  // faction is null for open/neutral turf. See gamedesc.md §6. Original
  // European names (Corrections.md) mixing French/Italian/Nordic/German/
  // East European flavor.
  locations: [
    { name: "Rive Nord", area: "Urban", faction: "EuroMafia" },
    { name: "Nedre Kvartal", area: "Urban", faction: "Vikings" },
    { name: "Mercato Vecchio", area: "Urban", faction: null },
    { name: "Pustý Blok", area: "Urban", faction: "Hooligans" },
    { name: "Hammerstein Turm", area: "Corpo", faction: "Hammerstein GmbH" },
    { name: "Campus Bulldog", area: "Corpo", faction: "Bulldog Ltd." },
    { name: "Atrio Styletto", area: "Corpo", faction: "Styletto" },
    { name: "La Bourse de Verre", area: "Corpo", faction: null },
    { name: "Depozit Vlad", area: "Rural", faction: "Vlads" },
    { name: "Askeveien", area: "Rural", faction: "Sombra 43" },
    { name: "Beinhaugen", area: "Rural", faction: "Odin's Ax" },
    { name: "Posterunek Rdzy", area: "Rural", faction: null }
  ],

  // Prices/bonuses are BOND-scale (todo3.md): Street +1 for 1 BOND,
  // Professional +2 for 2 BONDS, Military +3 for 3 BONDS. A few entries
  // carry `heal` instead of `attr` — "health gear or body modifications"
  // that boost the Rest healing roll (see bestHealBonus in state.js).
  // Original item names throughout (Corrections.md) — Clothing (the
  // Stealth-attr line) is named like fashion labels on purpose; Armor
  // entries carry `armor` instead of `attr` — absorb charges for the
  // damage-absorption mechanic (see applyHarm() in state.js).
  gear: {
    Street: [
      { name: "Kessler Snub", attr: "Combat", price: 1 },
      { name: "Rusted Stiletto", attr: "Combat", price: 1 },
      { name: "Grigio Overcoat", attr: "Stealth", price: 1 },
      { name: "Ostrava Runner", attr: "Driving", price: 1 },
      { name: "Bootleg Deck", attr: "Hacking", price: 1 },
      { name: "Kiosk Chits", attr: "Social", price: 1 },
      { name: "Field Trauma Wrap", heal: 1, price: 1 },
      { name: "Padded Vest", armor: 1, price: 1 }
    ],
    Professional: [
      { name: "Halvar Sidearm", attr: "Combat", price: 2 },
      { name: "Monofilament Edge", attr: "Combat", price: 2 },
      { name: "Notte Milano", attr: "Stealth", price: 2 },
      { name: "Voss Coupé", attr: "Driving", price: 2 },
      { name: "Rime Breaker", attr: "Hacking", price: 2 },
      { name: "Broker's Black Book", attr: "Social", price: 2 },
      { name: "Dermal Weave", heal: 2, price: 2 },
      { name: "Kevlar Weave Jacket", armor: 2, price: 2 }
    ],
    Military: [
      { name: "Sturmgewehr SMG", attr: "Combat", price: 3 },
      { name: "Raptor Talons", attr: "Combat", price: 3 },
      { name: "Ombra Couture", attr: "Stealth", price: 3 },
      { name: "Panzer AV", attr: "Driving", price: 3 },
      { name: "Blackline Shard", attr: "Hacking", price: 3 },
      { name: "Ledger of Favors", attr: "Social", price: 3 },
      { name: "MedCorp Platinum Chit", heal: 3, price: 3 },
      { name: "Composite Plate", armor: 3, price: 3 }
    ]
  },

  missionTypes: ["Assassination", "Heist", "Transport", "Delay", "Hold"],

  missionFlavor: {
    Assassination: "put down a target who's become a liability — gun, blade, or a burst of lethal ICE.",
    Heist: "lift something valuable before anyone notices it's gone.",
    Transport: "move a package across town without it getting flagged.",
    Delay: "keep someone or something tied up while the real move happens.",
    Hold: "hold a position until the extraction window opens."
  },

  // What Heist/Transport/Hold/Delay is actually about, per todo2.md — which
  // faction parameter (wealth/rnd/power) a job affects depends on the asset,
  // not the mission type. Delay rolls one too, but it's just flavor ("could be
  // anything, you're covering for someone else's job") — see engine.js genMission.
  assetTypes: {
    wealth: ["a case of untraceable BONDS", "a shipment of black-market luxury goods", "a stash of counterfeit chits"],
    rnd: ["a prototype cyberware core", "an encrypted R&D data shard", "a stolen weapons blueprint"],
    power: ["a crate of military-grade hardware", "a cache of restricted munitions", "a captured enforcer"]
  },
  delayFlavor: "You don't know what the real op needs from this — could be anything. You're just buying time for someone else's job.",

  // Gear bonus scales with quality, per todo2.md/todo3.md — applied by
  // bestGearBonus() in state.js against any owned item whose attr matches
  // the roll. BOND-scale: Street +1, Professional +2, Military +3.
  gearTierBonus: { Street: 1, Professional: 2, Military: 3 },

  // Weighted table of what a Partial/Fail actually costs you, per Challenge
  // type, per todo2.md ("failed check should not always result to damage").
  // Weights are relative, picked via a simple weighted-random draw.
  failOutcomes: {
    Combat: [{ effect: "harm", weight: 50 }, { effect: "gearDamage", weight: 30 }, { effect: "credLoss", weight: 20 }],
    Driving: [{ effect: "harm", weight: 35 }, { effect: "gearDamage", weight: 45 }, { effect: "credLoss", weight: 20 }],
    Hacking: [{ effect: "gearDamage", weight: 35 }, { effect: "heat", weight: 40 }, { effect: "credLoss", weight: 25 }],
    Social: [{ effect: "heat", weight: 25 }, { effect: "relationship", weight: 40 }, { effect: "credLoss", weight: 35 }],
    Stealth: [{ effect: "heat", weight: 55 }, { effect: "gearDamage", weight: 20 }, { effect: "relationship", weight: 25 }]
  },

  // Flavor for the two new fail-outcome effects (gearDamage/credLoss), read
  // alongside the existing per-attribute complications below.
  gearDamageFlavor: {
    partial: ["A close call bends something — you'll need a quick repair.", "Your gear takes a knock; nothing lost, but it'll cost to fix."],
    // "fail" is the final-loss line (Street-tier gear damaged with nowhere
    // left to downgrade to); "degrade" is Corrections.md's softer outcome —
    // the piece survives, just knocked down a grade.
    fail: ["Wrecked beyond repair — you lose the piece for good.", "It's trashed in the scuffle; that one's gone."],
    degrade: ["It takes a beating but holds together — knocked down a grade.", "Banged up bad; it'll still work, just not like it used to."]
  },
  credLossFlavor: {
    partial: ["You grease a palm to make this go away.", "A quiet bribe smooths it over."],
    fail: ["You pay through the nose to make this disappear.", "It costs you, hard, to keep this off the books."]
  },

  // Complication / fallout flavor per Challenge type, per gamedesc.md §7
  complications: {
    Combat: {
      partial: ["You land it, but take a hit doing it.", "It works, but you burn through your ammo/charge."],
      fail: ["You catch a bad hit.", "You're pinned down and the shooting draws attention."]
    },
    Driving: {
      partial: ["You make it, but scrape the vehicle up badly.", "You get there, but had to take the ugly route."],
      fail: ["You crash — the vehicle takes damage and so do you.", "You lose control and end up somewhere you didn't plan."]
    },
    Hacking: {
      partial: ["You're in, but you trip a partial alarm.", "It works, but a trace starts crawling toward you."],
      fail: ["Full trace — ICE burns your deck and every camera in the block just woke up.", "The system locks you out hard and pings security."]
    },
    Social: {
      partial: ["They go for it, but now you owe them one.", "You get the info, but they remember your face."],
      fail: ["They see right through you.", "Word gets back to the wrong people."]
    },
    Stealth: {
      partial: ["You slip by, but someone clocks movement.", "You're through, barely — they know something's off now."],
      fail: ["You're spotted cold.", "A patrol catches you mid-move."]
    }
  },

  // Repair options for a Permanent Injury (gamedesc.md §1 Health). Cybernetic
  // is the cheap, standard fix but leaves a lasting rough edge; Biovat costs
  // more but grows back clean.
  repairs: [
    { name: "Cybernetic Replacement", price: 2, sideEffect: true, flavor: "Quick and cheap. It works — but it's never quite the same." },
    { name: "Biovat Regrowth", price: 3, sideEffect: false, flavor: "Slow and expensive. Grown clean, no compromises." }
  ],

  encounterFlavor: [
    "A patrol rounds the corner right into your path.",
    "A rival crew is working the same block.",
    "A drone sweep pings something out of place.",
    "A fixer's runner recognizes you from a past job.",
    "Corp security is doing a routine sweep tonight."
  ]
};
