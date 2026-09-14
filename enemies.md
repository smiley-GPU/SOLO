# Enemies — Adversary Archetypes by Category, Power & R&D

A flavor/content reference for the opposition SOLO throws at the player —
Adversaries drawn via `getPerson()`, mission targets, Archenemies, and
anyone else standing in the player's way. Not yet wired into `DATA.js`;
this is the design pass that a future pass would turn into flavor-text
pools or name generators, the same way Appendix B is the source for
`DATA.gear`.

## How to read the grid

Each of the three categories below — **Street**, **Crime**, **Corpo** — is
a 3×3 matrix along the same two axes SOLO already tracks per faction
(`factionStandings.power` / `.rnd`, §8 of SOLOdescription.md, 0–10 each):

- **Power** (rows, low → high): how dangerous the individual is in a
  straight fight — training, muscle, killer instinct. Low Power is a
  pushover; high Power is a veteran who's killed before and will again.
- **R&D** (columns, low → high): how good their *gear* is — not who they
  are, what they're carrying. Low R&D means whatever's on hand; high R&D
  means the kind of hardware that's normally a Corpo boardroom's to spend.

The two axes are independent on purpose: a high-Power/low-R&D enemy is
someone to fear even unarmed, while a low-Power/high-R&D one is a nobody
who got lucky (or was handed something) and is now dangerous *despite*
themselves — the gear does the killing, not the person behind it. The
diagonal (low/low → high/high) is the throughline each category's flavor
builds around; the off-diagonal cells are the mismatches.

Loosely, low tier ≈ the game's `"weak"` Adversary tier, mid ≈ `"tough"`,
high ≈ `"elite"` (§10, `genAdversaryTier`/`tierPenalty` in engine.js) —
though that tier is currently rolled from Location Heat + faction Tier,
not this grid; this document is the *why*, not a mechanical hook.

---

## Street

Unaffiliated gutter-level opposition — no faction backing, no budget,
nothing but whatever they could scrounge, steal, or shoot up. The rawest,
most chaotic category: even its "high R&D" cell is stolen or black-market,
never bought clean.

| Power ↓ / R&D → | **1–3 (basic)** | **4–6 (decent)** | **7–10 (hi-tech)** |
|---|---|---|---|
| **1–3 (simple)** | **Street Ganger** — a knife or a beat-up pistol, no training, more desperate than dangerous. | **Corner Boy with a Burner Deck** — can't fight worth much, but scavenged a cheap hacking rig and knows just enough to be a nuisance. | **Hangaround with a Railgun** — hasn't been patched in yet, still proving themselves, and got handed (or grabbed) absurdly good hardware doing it. Dangerous by accident, not skill. |
| **4–6 (hardened)** | **Knuckle-Dragger** — scarred, mean, knows how to hit and take a hit. Fists, a bat, brass knuckles. | **Ganger Enforcer** — proper mid-tier muscle: a real gun, maybe one cheap street cybernetic, knows the block. | **Chrome-Handed Bruiser** — a solid fighter running black-market cyberware they can barely afford — a cyberarm bought on credit from the wrong people. |
| **7–10 (veteran)** | **Juiced-Up Gangwar Vet** — pumped full of combat drugs and adrenal boosters, terrifyingly strong, still fights dirty and low-tech: chains, cleavers, a sawed-off. | **Gangwar Vet, Armed Proper** — the same hardened killer, now carrying military-surplus weaponry instead of whatever was lying around. | **Gangwar Vet with a Minigun** — peak street-tier terror: veteran instinct plus top-shelf hardware. A one-person massacre waiting to happen. |

---

## Crime

Organized-crime muscle — EuroMafia/Vikings/Hooligans-style. A step up from
Street's chaos: there's a chain of command, a cut of the take, and even
the bottom rung answers to somebody. Gear and training both trend higher
than Street at every tier, and the "family" backs its own.

| Power ↓ / R&D → | **1–3 (basic)** | **4–6 (decent)** | **7–10 (hi-tech)** |
|---|---|---|---|
| **1–3 (associate)** | **Family Associate** — the lowest formal rung, not yet made, a concealed pistol and more nerve than skill. | **Family Wire Man** — not a fighter — a surveillance and comms man with decent kit, dangerous for what he knows more than what he carries. | **Trainee, Overarmed** — still being tested by the family, carrying gear far above the skill to back it up — a loaner nobody expects returned in one piece. |
| **4–6 (soldier)** | **Collector** — a knee-breaker, reliable with a bat or knuckledusters, does the family's dirty work in person. | **Capo's Guard** — professional muscle: a decent firearm, basic armor, actual training. | **Made Man, Chromed** — a trusted enforcer the family invested in — real cyberware, a good piece, expected to perform. |
| **7–10 (made)** | **Blood-Oath Killer** — a legend in the underworld, terrifying in a fight, still prefers a blade. Old-school, personal, a message every time. | **Family Hitter** — veteran contract killer, military-grade weapon, knows precisely how and when to use it. | **Don's Own Enforcer** — the family's best. Fully chromed, a small arsenal, answers only to the top. |

---

## Corpo

Corporate security — Hammerstein GmbH/Bulldog Ltd./Styletto-style. The
most institutional category: even its weakest tier is uniformed and
procedural rather than desperate, and its R&D axis means actual advanced
hardware — smart weapons, drones, exosuits, combat AI — not just "a better
gun."

| Power ↓ / R&D → | **1–3 (basic)** | **4–6 (decent)** | **7–10 (hi-tech)** |
|---|---|---|---|
| **1–3 (staff)** | **Facility Security Associate** — entry-level headcount, a stun baton, mostly there to check badges and call it in. | **Security Operations Technician** — low-tier systems monitoring staff, backed by a networked sidearm they're only half-trained on. | **Rookie with a Loaner Exo** — fresh out of onboarding, issued cutting-edge loaner gear they don't fully understand yet. |
| **4–6 (professional)** | **Floor Security** — trained guard, standard-issue sidearm and vest, knows the building cold. | **Corporate Response Officer** — a proper security professional: a smart-linked weapon, drone backup on call. | **Augmented Response Officer** — the same professional, now cybernetically enhanced and running a combat AI assist. |
| **7–10 (asset)** | **Old-Guard Protection Specialist** — a veteran who came up before the tech boom, brutally effective on skill and a sidearm alone. | **Black-Badge Operative** — an elite corporate operative, military-grade loadout, near-unkillable in the field. | **Prototype-Class Cyber-Op** — the bleeding edge: full-body cyberware, experimental weapon systems. Less a person than a walking weapons platform. |

---

## Notes for a future implementation pass

- **Casting**: a person's `factionTier` (§20.6) and their faction's current
  `power`/`rnd` (§8) already exist per-contact and per-faction; this grid
  could key an Adversary's *flavor name* off the same two numbers that
  already drive their mechanical `weak`/`tough`/`elite` tier, without
  adding a new stat.
- **Scope**: only Street/Crime/Corpo are covered here, matching what was
  asked — Nomad and Authority (EurCop/SwissGuard) don't have a matrix yet.
- **Naming**: kept short and evocative on purpose, matching the existing
  `DATA.gear`/Appendix B catalog voice rather than full sentences — these
  read as a name+one-line flavor pair, ready to drop into a `pick()` pool
  the way `DATA.npcProfessions` or `DATA.gear[tier]` already work.
- **Register, per category** (checked pass, chat request): each category's
  names should read in *its own* jargon, not a generic cyberpunk-mercenary
  voice smeared across all three —
  - **Street** — street/gang slang: "corner boy," "burner," "hangaround,"
    "chrome," "juiced," "knuckle-dragger." Nothing official, nothing anyone
    put on a badge.
  - **Crime** — mob talk: real (or real-adjacent) Cosa Nostra rank and
    slang — "associate," "made man," "capo," "don," "hitter," "collector,"
    "blood-oath" — the family's own words for its own people.
  - **Corpo** — corporate jargon: title-cased job titles and HR euphemism
    — "Associate," "Technician," "Specialist," "Operative," "onboarding,"
    "headcount" — never a slur an outsider would use about the guard
    (a corp doesn't call its own "Rent-a-Cop," it calls him a "Facility
    Security Associate").
