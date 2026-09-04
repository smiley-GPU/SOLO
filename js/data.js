// data.js — all generator content lives here as plain arrays/objects,
// per gamedesc.md §9 ("data-driven tables").

const DATA = {
  firstNames: [
    "Viper", "Kai", "Ash", "Rin", "Dax", "Nova", "Ezra", "Six", "Juno", "Cass",
    "Rook", "Mika", "Zed", "Lena", "Tobi", "Yara", "Ren", "Wick", "Suki", "Blaze"
  ],
  handles: [
    "Ferro", "Nightwire", "Chrome", "Static", "Wraith", "Ratchet", "Glitch",
    "Talon", "Slate", "Vega", "Riot", "Marrow", "Fuse", "Halo", "Kestrel",
    "Bramble", "Doss", "Kilo", "Snapback", "Torque"
  ],

  factions: [
    { name: "Arasaka", type: "Corpo" },
    { name: "Militech", type: "Corpo" },
    { name: "Kang Tao", type: "Corpo" },
    { name: "Valentinos", type: "Gang" },
    { name: "Maelstrom", type: "Gang" },
    { name: "Tyger Claws", type: "Gang" },
    { name: "Voodoo Boys", type: "Gang" },
    { name: "Aldecaldos", type: "Nomad" },
    { name: "Wraiths", type: "Nomad" },
    { name: "NCPD", type: "Authority" }
  ],

  npcProfessions: [
    "Fixer", "Corp Exec", "Ganger", "Nomad Rider", "Netrunner", "Solo",
    "Media", "Cop", "Civilian", "Medtech", "Techie", "Ripperdoc"
  ],

  locationAdjectives: {
    Urban: ["Lower", "Old", "Neon", "Rust", "Glass", "Crimson", "Hollow"],
    Corpo: ["Arasaka", "Zenith", "Skyline", "Sterling", "Meridian", "Obsidian"],
    Rural: ["Dust", "Salt", "Ashen", "Bone", "Iron", "Wind"]
  },
  locationNouns: {
    Urban: ["Market", "Alley", "Row", "Underpass", "Bazaar", "Block", "Yards"],
    Corpo: ["Plaza", "Tower", "Atrium", "Campus", "Spire", "Complex"],
    Rural: ["Flats", "Junkyard", "Outpost", "Highway", "Depot", "Ridge"]
  },

  gear: {
    Street: [
      { name: "Snub Pistol", attr: "Combat", price: 80 },
      { name: "Rusty Blade", attr: "Combat", price: 60 },
      { name: "Padded Jacket", attr: "Stealth", price: 70 },
      { name: "Beater Bike", attr: "Driving", price: 150 },
      { name: "Burner Deck", attr: "Hacking", price: 90 },
      { name: "Street Cred Chips", attr: "Social", price: 50 }
    ],
    Professional: [
      { name: "Tech Pistol", attr: "Combat", price: 220 },
      { name: "Monoblade", attr: "Combat", price: 200 },
      { name: "Optical Camo Cloak", attr: "Stealth", price: 260 },
      { name: "Tuned Sedan", attr: "Driving", price: 350 },
      { name: "Icebreaker Deck", attr: "Hacking", price: 300 },
      { name: "Fixer's Rolodex", attr: "Social", price: 240 }
    ],
    Military: [
      { name: "Smart SMG", attr: "Combat", price: 600 },
      { name: "Mantis Blades", attr: "Combat", price: 650 },
      { name: "Ghost Cloak", attr: "Stealth", price: 700 },
      { name: "Armored AV", attr: "Driving", price: 900 },
      { name: "Blackwall Shard", attr: "Hacking", price: 800 },
      { name: "Corp Blackmail File", attr: "Social", price: 750 }
    ]
  },

  missionTypes: ["Assassination", "Heist", "Transport", "Delay", "Hold"],

  missionFlavor: {
    Assassination: "put down a target who's become a liability.",
    Heist: "lift something valuable before anyone notices it's gone.",
    Transport: "move a package across town without it getting flagged.",
    Delay: "keep someone or something tied up while the real move happens.",
    Hold: "hold a position until the extraction window opens."
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

  encounterFlavor: [
    "A patrol rounds the corner right into your path.",
    "A rival crew is working the same block.",
    "A drone sweep pings something out of place.",
    "A fixer's runner recognizes you from a past job.",
    "Corp security is doing a routine sweep tonight."
  ]
};
