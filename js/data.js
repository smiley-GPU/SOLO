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

  // §20.6 — every NPC's profession gives them a specialty: the attribute(s)
  // their passive Helper bonus applies to (a Hire-sourced Helper gets one,
  // picked at random if two are listed) — todo3.md only names 3
  // (Solo→Combat, Nomad [Rider]→Driving/Social, Hacker [Netrunner]→
  // Stealth/tech); the rest extend that logic to the other 9 professions.
  npcSpecialty: {
    Fixer: ["Social"],
    "Corp Exec": ["Social"],
    Ganger: ["Combat"],
    "Nomad Rider": ["Driving", "Social"],
    Netrunner: ["Hacking", "Stealth"],
    Solo: ["Combat"],
    Media: ["Social"],
    Cop: ["Combat", "Social"],
    Civilian: ["Social"],
    Medtech: ["Social"],
    Techie: ["Hacking"],
    "Body Doc": ["Social"]
  },

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
  // §20.5 — a 4th tier, Legendary, joins Street/Professional/Military so
  // gear quality matches the same 1-4 Tier scale as Reputation and Factions
  // (the Shop's offer pool is keyed off Reputation Tier, and a Tier-4
  // "Legend" character needs "their own Tier" equipment to actually exist).
  // `tags` (optional, §20.5) are descriptive only for now — AP/EX on select
  // Weapons, AR/LX/CG on select Vehicles — except CG (Cargo), which the
  // eventual Inventory/Loadout system (§20 Phase 5) will read for spare slots.
  // BATCH 2.1 — each tier now carries 3 models per Loadout category (Weapons/
  // Decks/Vehicles/Social; Clothing counts Stealth+armor together) instead of
  // 1-2, so the Shop's higher-tier rolls have real variety to land on.
  gear: {
    Street: [
      { name: "Kessler Snub", attr: "Combat", price: 1 },
      { name: "Rusted Stiletto", attr: "Combat", price: 1 },
      { name: "Junkyard Shiv", attr: "Combat", price: 1 },
      { name: "Grigio Overcoat", attr: "Stealth", price: 1 },
      { name: "Faded Trenchcoat", attr: "Stealth", price: 1 },
      { name: "Ostrava Runner", attr: "Driving", price: 1 },
      { name: "Rustbucket Moped", attr: "Driving", price: 1 },
      { name: "Borrowed Bicycle", attr: "Driving", price: 1 },
      { name: "Bootleg Deck", attr: "Hacking", price: 1 },
      { name: "Cracked Tablet Rig", attr: "Hacking", price: 1 },
      { name: "Scavenged Antenna Array", attr: "Hacking", price: 1 },
      { name: "Kiosk Chits", attr: "Social", price: 1 },
      { name: "Forged Ration Card", attr: "Social", price: 1 },
      { name: "Back-Alley Barter Chip", attr: "Social", price: 1 },
      { name: "Field Trauma Wrap", heal: 1, price: 1 },
      { name: "Padded Vest", armor: 1, price: 1 }
    ],
    Professional: [
      { name: "Halvar Sidearm", attr: "Combat", price: 2, tags: ["AP"] },
      { name: "Monofilament Edge", attr: "Combat", price: 2 },
      { name: "Tactical Push Dagger", attr: "Combat", price: 2 },
      { name: "Notte Milano", attr: "Stealth", price: 2 },
      { name: "Urban Camo Cloak", attr: "Stealth", price: 2 },
      { name: "Voss Coupé", attr: "Driving", price: 2, tags: ["LX"] },
      { name: "Interceptor Moto", attr: "Driving", price: 2 },
      { name: "Armored Delivery Van", attr: "Driving", price: 2, tags: ["CG"] },
      { name: "Rime Breaker", attr: "Hacking", price: 2 },
      { name: "Signal Jammer Rig", attr: "Hacking", price: 2 },
      { name: "Proxy Ghost Suite", attr: "Hacking", price: 2 },
      { name: "Broker's Black Book", attr: "Social", price: 2 },
      { name: "Corporate Access Badge", attr: "Social", price: 2 },
      { name: "Silver Tongue Earpiece", attr: "Social", price: 2 },
      { name: "Dermal Weave", heal: 2, price: 2 },
      { name: "Kevlar Weave Jacket", armor: 2, price: 2 }
    ],
    Military: [
      { name: "Sturmgewehr SMG", attr: "Combat", price: 3, tags: ["AP"] },
      { name: "Raptor Talons", attr: "Combat", price: 3, tags: ["EX"] },
      { name: "Gauss Battle Rifle", attr: "Combat", price: 3, tags: ["AP"] },
      { name: "Ombra Couture", attr: "Stealth", price: 3 },
      { name: "Optic-Camo Weave", attr: "Stealth", price: 3 },
      { name: "Panzer AV", attr: "Driving", price: 3, tags: ["AR", "CG"] },
      { name: "Wolfpack APC", attr: "Driving", price: 3, tags: ["AR", "CG"] },
      { name: "Stormrunner Interceptor", attr: "Driving", price: 3, tags: ["LX"] },
      { name: "Blackline Shard", attr: "Hacking", price: 3 },
      { name: "Blacksite Cortex Rig", attr: "Hacking", price: 3 },
      { name: "Warhound ICE Suite", attr: "Hacking", price: 3 },
      { name: "Ledger of Favors", attr: "Social", price: 3 },
      { name: "Diplomatic Immunity Chit", attr: "Social", price: 3 },
      { name: "SuperState Press Pass", attr: "Social", price: 3 },
      { name: "MedCorp Platinum Chit", heal: 3, price: 3 },
      { name: "Composite Plate", armor: 3, price: 3 }
    ],
    Legendary: [
      { name: "Ares Railgun", attr: "Combat", price: 4, tags: ["AP", "EX"] },
      { name: "Vorpal Monowire", attr: "Combat", price: 4, tags: ["AP"] },
      { name: "Singularity Blade", attr: "Combat", price: 4, tags: ["EX"] },
      { name: "Chameleon Weave", attr: "Stealth", price: 4 },
      { name: "Phase-Shift Mantle", attr: "Stealth", price: 4 },
      { name: "Ghost Chassis AV", attr: "Driving", price: 4, tags: ["AR", "LX", "CG"] },
      { name: "Meteor Strike AV", attr: "Driving", price: 4, tags: ["AR", "CG"] },
      { name: "Nightfall Phantom Coupé", attr: "Driving", price: 4, tags: ["LX"] },
      { name: "Deus Ex Cortex", attr: "Hacking", price: 4 },
      { name: "Oracle Cortex Array", attr: "Hacking", price: 4 },
      { name: "Genesis Root Kit", attr: "Hacking", price: 4 },
      { name: "Voice of the Council", attr: "Social", price: 4 },
      { name: "Shadow Cabinet Seat", attr: "Social", price: 4 },
      { name: "Off-World Diplomatic Seal", attr: "Social", price: 4 },
      { name: "Nanite Reconstructor", heal: 4, price: 4 },
      { name: "Reactive Plate Mk.IV", armor: 4, price: 4 }
    ]
  },

  // BATCH 2.1 — one-shot items: single-use gear tagged "1S", available to a
  // character one Reputation Tier below what the item's own Tier would
  // normally require, priced 1 BOND under that Tier's normal price. Using
  // one is an explicit per-roll choice (PATCH 2.4) — checked, it's removed
  // from inventory the instant that roll resolves (consumeOneShotItems,
  // state.js). Keyed the same way as DATA.gear (tier name -> items), one per
  // the five Loadout categories per tier.
  oneShotGear: {
    Professional: [
      { name: "Lucky-Lucky Polymer One-Shot Pistol", attr: "Combat", price: 1, tags: ["1S"] },
      { name: "Lucifer Smoke Grenade", attr: "Stealth", price: 1, tags: ["1S"] },
      { name: "Nitro Boost Canister", attr: "Driving", price: 1, tags: ["1S"] },
      { name: "Burner ICE Breaker", attr: "Hacking", price: 1, tags: ["1S"] },
      { name: "Forged Credchip Burner", attr: "Social", price: 1, tags: ["1S"] }
    ],
    Military: [
      { name: "Hades Thermite Grenade", attr: "Combat", price: 2, tags: ["AP", "1S"] },
      { name: "Ghost Static Patch", attr: "Stealth", price: 2, tags: ["1S"] },
      { name: "Smoke Screen Kit", attr: "Driving", price: 2, tags: ["1S"] },
      { name: "Zero-Day Worm", attr: "Hacking", price: 2, tags: ["1S"] },
      { name: "Blackmail Dossier", attr: "Social", price: 2, tags: ["1S"] }
    ],
    Legendary: [
      { name: "Singularity Grenade", attr: "Combat", price: 3, tags: ["EX", "1S"] },
      { name: "Chronoslip Field Emitter", attr: "Stealth", price: 3, tags: ["1S"] },
      { name: "Wormhole Jump Charge", attr: "Driving", price: 3, tags: ["1S"] },
      { name: "Godmode Exploit Chip", attr: "Hacking", price: 3, tags: ["1S"] },
      { name: "Council Pardon Writ", attr: "Social", price: 3, tags: ["1S"] }
    ]
  },

  // Tier order for degrade/upgrade math (degradeGearItem in game.js, the
  // Shop's offer generator in engine.js) — single source of truth so both
  // never drift out of sync with each other.
  gearTierOrder: ["Street", "Professional", "Military", "Legendary"],

  missionTypes: ["Assassination", "Heist", "Transport", "Delay", "Hold"],

  // BATCH 2.1 (item 14) — each mission-type flavor line is now a 2-entry
  // pool instead of a fixed string; genMission() (engine.js) picks one at
  // generation time, same as every other flavor pool in this file.
  missionFlavor: {
    Assassination: ["put down a target who's become a liability — gun, blade, or a burst of lethal ICE.", "erase someone before they can testify, sell out, or just get in the way."],
    Heist: ["lift something valuable before anyone notices it's gone.", "crack a vault, a server, or a safehouse and walk out with the good stuff."],
    Transport: ["move a package across town without it getting flagged.", "get precious cargo from one end of the SuperState to the other, quiet."],
    Delay: ["keep someone or something tied up while the real move happens.", "run interference so the actual op has room to breathe."],
    Hold: ["hold a position until the extraction window opens.", "keep the line from breaking until the cavalry — or the getaway — shows up."]
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
  // BATCH 2.1 (item 14) — 2-entry pool, picked in genMission() (engine.js).
  delayFlavor: [
    "You don't know what the real op needs from this — could be anything. You're just buying time for someone else's job.",
    "Nobody's told you what's actually at stake here. Your job is the clock, not the prize."
  ],

  // Gear bonus scales with quality, per todo2.md/todo3.md — applied by
  // bestGearBonus() in state.js against any owned item whose attr matches
  // the roll. BOND-scale: Street +1, Professional +2, Military +3.
  gearTierBonus: { Street: 1, Professional: 2, Military: 3, Legendary: 4 },

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
  // is the cheap, standard fix but leaves a lasting piece of chrome behind
  // (see cyberneticParts below); Biovat costs more but grows back clean.
  // BATCH 2.1 (item 14) — each flavor is now a 2-entry pool; renderHub()
  // (game.js) picks one for the button's title each render.
  repairs: [
    { name: "Cybernetic Replacement", price: 2, cybernetic: true, flavor: ["Quick and cheap. It works — but it's never quite the same.", "Off-the-shelf chrome, bolted on fast. You'll feel the seam forever."] },
    { name: "Biovat Regrowth", price: 3, flavor: ["Slow and expensive. Grown clean, no compromises.", "A long, quiet stretch in the tank — but you come out whole, not patched."] }
  ],

  // BATCH 2.0 (todo3.md) — "count cybernetic replacements — getting to
  // borg": every Cybernetic Replacement repair bolts on a random one of
  // these. Arms+legs together add Combat and a point of chrome armor;
  // Faceplate/Cyberlung each add a point of chrome armor on their own,
  // and a Faceplate also costs Social — see cyberAttrModifier()/
  // cyberArmorCount() in state.js.
  cyberneticParts: ["Cyberarm", "Cyberleg", "Faceplate", "Cyberlung"],

  encounterFlavor: [
    "A patrol rounds the corner right into your path.",
    "A rival crew is working the same block.",
    "A drone sweep pings something out of place.",
    "A fixer's runner recognizes you from a past job.",
    "Corp security is doing a routine sweep tonight."
  ],

  // BATCH 2.1 (item 12) — Night on the Street now always grants a bonus
  // point of BOOST on top of its usual tier-specific outcome; flavor for
  // that guaranteed gain, picked in finishNightOnStreet() (game.js).
  nightBoostFlavor: [
    "The buzz of neon and traffic gets under your skin — you catch a jolt of energy off the city itself.",
    "Something about the hum of the streets tonight keeps you sharp. You're wired, and ready for whatever's next."
  ],

  // -- §19: Reputation, Faction Power & Special Missions --------------------

  // REPUTATION tiers (SOLOdescription.md §19.1).
  reputationTiers: [
    { max: 5, tier: 1, title: "Street Rat" },
    { max: 10, tier: 2, title: "Warhound" },
    { max: 15, tier: 3, title: "Operative" },
    { max: 20, tier: 4, title: "Legend" }
  ],

  // Faction category adjacency for Employer/Target pairing (§19.4): a
  // category may pair with itself or with the categories listed here.
  // Authority is deliberately absent — it's handled as a special "target
  // only, any pairing" case in pairedFactionsFor() (state.js).
  factionCategoryAdjacency: {
    Corpo: ["Corpo", "Crime"],
    Crime: ["Crime", "Corpo", "Nomad"],
    Nomad: ["Nomad", "Crime"]
  },

  // Faction Tier ranges + starting Tier per category (§19.6). Authority
  // factions are named individually since each has one fixed Tier.
  factionTierRanges: {
    Corpo: { min: 3, max: 4 },
    Crime: { min: 2, max: 3 },
    Nomad: { min: 1, max: 2 }
  },
  factionFixedTier: { EurCop: 2, SwissGuard: 3 },

  // BATCH 2.2 (todo3.md) — the Mission Board's first slot (job A) always
  // pulls its Employer from a category set gated by the player's own
  // Reputation Tier (§19.1): Street Rat -> Nomad only, Warhound -> Crime or
  // Nomad, Operative -> Corpo or lower (unrestricted), Legend -> Corpo only.
  firstJobCategoriesByTier: {
    1: ["Nomad"],
    2: ["Crime", "Nomad"],
    3: ["Corpo", "Crime", "Nomad"],
    4: ["Corpo"]
  },

  // Per-mission-type faction standing effects on a non-Failure outcome
  // (§19.2, supersedes the old flat ±1 asset-type rule). "target" is the
  // opposing faction (the mission's Target, or the attacking/chasing side
  // for Hold/Transport); "employer" is the Employer's faction.
  missionFactionEffects: {
    Assassination: { target: { power: -2 }, employer: { power: 2 } },
    Delay: { target: { wealth: -2, rnd: -1 }, employer: { wealth: 2 } },
    Heist: { target: { wealth: -1, rnd: -2 }, employer: { rnd: 2 } },
    Hold: { target: { wealth: -1, power: -1 }, employer: { power: 1 } },
    Transport: { target: { wealth: -1, power: -1 }, employer: { wealth: 1 } }
  },

  // Special Mission name generator (§19.5, Appendix J).
  specialMissionParts: {
    greek: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Theta", "Kappa", "Sigma", "Omega", "Rho", "Omicron"],
    shape: ["Hex", "Cube", "Prism", "Spiral", "Vertex", "Wedge", "Torus", "Rhombus", "Helix", "Shard", "Obelisk", "Lattice"],
    color: ["Cyan", "Magenta", "Crimson", "Amber", "Jade", "Cobalt", "Onyx", "Violet", "Ember", "Slate", "Indigo", "Bone"]
  },

  // §20.6 — Archenemy home-invasion event (Rest clock at 3 boxes, checked
  // at Debrief). "evil" keys match the 1d6 sub-table on a 10+ break-in.
  archenemyInvasion: {
    friendHit: ["shows up looking for", "sends people around asking about"],
    spooked: ["Your security spooks them off before they get anywhere.", "They case the place, think better of it, and leave."],
    burned: ["They get burned trying it and come away weaker for it.", "It goes wrong for them fast — word gets around."],
    steal: ["They clean out whatever gear you left behind.", "You come home short a piece of kit — they knew exactly where to look."],
    torch: ["They torch the place. It's gone.", "Fire's still going when you get the word — there's nothing left to save."],
    trap: ["They leave something under your bed on the way out.", "Nothing looks touched. That's the problem."]
  },

  // BATCH 2.0 — obituary flavor for a killPerson() call on someone the
  // player actually knew (relationship ≥3, or Amigue/Compi/Archenemy
  // tagged) rather than each call site writing its own one-off line.
  obituaries: [
    "took too many hits and didn't walk away from this one.",
    "is gone. Word travels fast on the street.",
    "won't be answering calls anymore.",
    "clocked out for good tonight.",
    "is one more name for the wall."
  ],

  // §20.5 — Apartments (Downtime "APARTMENT" panel). Tier 1 has nothing to
  // buy. Price is computed at purchase time (2×tier, +1 if the chosen
  // Location's faction is Corpo-category) since it depends on where you're
  // buying, not just the tier. INTERFACE UPDATE 2.5 — each Tier is a named
  // "stage" (STRIP/CITY/CORE) with several place-type choices instead of one
  // fixed name; renderApartmentSection() (game.js) pairs each place with a
  // distinct known Location instead of a dropdown.
  apartments: {
    2: { stage: "STRIP", places: ["The Room Above the Bar", "Backroom of a Noodle Shop"], securitySlots: 0, flavor: "Old digi-lock — you get what you pay for." },
    3: { stage: "CITY", places: ["Garage", "Empty Warehouse", "Seedy Office"], securitySlots: 2, flavor: "Room to breathe, and a door that actually locks." },
    4: { stage: "CORE", places: ["Glass Office", "Penthouse", "Nightclub Backroom"], securitySlots: 4, flavor: "The kind of address that does half your talking for you." }
  },
  // BATCH 2.1 (item 14) — 2-entry pool, picked in renderApartmentSection() (game.js).
  apartmentTier1Flavor: [
    "You are street rat. What are you thinking? Gutter, sewers, under the bridge — that's your home.",
    "An apartment? With what money? A doorway out of the rain is the best you've got tonight."
  ],
  // Security options available at each Apartment Tier (BATCH 2.0: costs
  // BONDS to install — 1 for a Tier 3 option, 2 for a Tier 4 one, see
  // renderApartmentSection — capped at that Tier's securitySlots). Their
  // defensive effect belongs to the Archenemy home-invasion/EurCop raid
  // mechanics (§20 Phase 2/3, BATCH 2.0 §3).
  securityOptions: {
    3: ["Reinforced doors and windows", "Hitek Locks"],
    4: ["Security Drone", "Security-AI", "E-shok-Loks", "ABLocks", "RoboDOG"]
  },

  // Deterministic per-attribute Challenge fallout (§19.9, supersedes the
  // weighted-random DATA.failOutcomes above). Each entry lists the possible
  // consequences for a 7-9 Partial and a ≤6 Fail; applyOutcome() picks one
  // "option" at random from the relevant list (an option can itself bundle
  // more than one simultaneous consequence, e.g. Fail Combat's 2-box-plus-one-more).
  challengeFallout: {
    Combat: {
      heatAlways: true,
      partial: [["harm1"], ["gearDamage"], ["woundHelper"]],
      fail: [["harm2", "gearDamage"], ["harm2", "woundHelper"]]
    },
    Driving: {
      heatOnResolve: 1, // partial/fail always add Heat too, on top of the picked option below
      partial: [["vehicleDamage"], ["harm1"], ["gearDamage"]],
      fail: [["harm1", "loseVehicle"]]
    },
    Hacking: {
      partial: [["heat"], ["gearDamage"]],
      fail: [["heat", "harm1"], ["heat", "gearDamage"]]
    },
    Social: {
      partial: [["heat"], ["gearDamage"]],
      fail: [["heat", "gearDamage"]]
    },
    Stealth: {
      partial: [["heat"], ["gearDamage"]],
      fail: [["heat2", "harm1"]]
    }
  }
};
