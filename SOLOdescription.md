# SOLO — Complete Game Description

A single-player, browser-based (static HTML + vanilla JavaScript, no
framework, no build step, no backend) cyberpunk "job runner" game. It plays
like a solo journaling game: the app procedurally generates people, places,
and jobs; the player makes choices and spends resources; dice resolve
outcomes; a running text log turns the session into a short story.

Setting: **Europunk**, in the **European SuperState** — an original setting
(not a licensed IP). All proper nouns (factions, locations, gear, names) are
invented for this game; see §3 and the Appendix for the full canon.

This document is self-contained: everything needed to rebuild the game from
scratch — every formula, every table, every screen, every button — is
below.

---

## 1. Architecture

- **Files**: `index.html` (shell + script tags), `style.css` (all styling),
  `js/data.js` (static content tables), `js/engine.js` (dice + generators),
  `js/state.js` (character/world model + persistence), `js/game.js` (phase
  state machine + all DOM rendering).
- **No modules, no bundler.** All four `js/*.js` files are loaded as plain
  `<script>` tags in that order and share one global scope — every
  top-level `const`/`function` in one file is directly callable from the
  others (e.g. `game.js` calls `resolve()` from `engine.js` and
  `nudgeRelationship()` from `state.js` with no imports).
- **Persistence**: the entire character/world state is one JSON blob in
  `localStorage` under the key `"solo_game_save_v1"`. `save(character)`
  writes it; `load()` reads and runs it through `migrateCharacter()` (adds
  any fields introduced after the save was made, with safe defaults) before
  handing it back.
- **Rendering model**: no virtual DOM, no diffing. Every state change calls
  `persist()` (save to localStorage) then `render()`, which does three full
  innerHTML rebuilds: `renderSheet()` (left panel), `renderMain()` (center —
  dispatches on `G.phase` to one of ~10 screen-render functions), and
  `renderFactions()` (right panel). `G` is a single global object:
  `{ character, job, phase }` (plus transient `G.hunt` while a Hunt is
  active).
- **Layout** (`index.html` + CSS grid): a 4-column layout — `#sheet` (260px,
  character sheet), `#main` (flexible, the current phase screen + a
  journal log below it), `#downtime` (260px, §20.5's always-visible Shop/
  Training/EuroStoxx panels), `#factions` (320px, every faction's
  standing). Below 980px width it collapses to a single column.
- **Journal**: every significant event calls `addLog(character, text)`
  (state.js), which pushes a line onto `character.log` (capped at 300
  lines, oldest dropped). `renderJournal()` (game.js) renders the array
  **reversed** — newest line on top — under the phase card.

---

## 2. Core Mechanic

**Roll 2d6 + Attribute rank + modifiers, compare to a fixed table.**

```
resolve(attrRank, modifiers[]) → { d1, d2, diceSum, attrRank, modifiers, modTotal, total, tier }
```

| Total | Tier | Meaning |
|---|---|---|
| 10+ | **full** | Full success. |
| 7–9 | **partial** | Partial success — succeed, but pick a complication. |
| ≤6 | **fail** | Fail — roll on the Challenge type's fallout table. |

`modifiers` is an array of `{label, value}` shown to the player as colored
chips (green for positive, red for negative) before they commit to the
roll. The five Attributes are **Combat, Driving, Hacking, Social,
Stealth**, each ranked 1–5.

A **Signature/BOOST upgrade**: after any non-full roll, if the character
has ≥3 BOOST, they may spend 3 to upgrade the result one tier (fail→partial
or partial→full) via `upgradeTier()`. Offered on every roll result screen
(mission steps, encounters, and Hunt rolls alike).

---

## 3. Setting & Canon (Appendix data, summarized here)

- **11 factions**, fixed, 3 per level + 2 Authority:
  - **Corpo**: Hammerstein GmbH, Bulldog Ltd., Styletto
  - **Crime**: EuroMafia, Vikings, Hooligans
  - **Nomad**: Vlads, Sombra 43, Odin's Ax
  - **Authority**: EurCop, SwissGuard
  - A generated person/location has a 25% chance of being **"Freelance"**
    (no faction) instead of one of the 11.
- **12 fixed locations** (the world map never changes, never randomly
  combines) — 4 Urban, 4 Corpo, 4 Rural, each tied to a faction or `null`
  (open/neutral turf):
  - Urban: Rive Nord (EuroMafia), Nedre Kvartal (Vikings), Mercato Vecchio
    (neutral), Pustý Blok (Hooligans)
  - Corpo: Hammerstein Turm (Hammerstein GmbH), Campus Bulldog (Bulldog
    Ltd.), Atrio Styletto (Styletto), La Bourse de Verre (neutral)
  - Rural: Depozit Vlad (Vlads), Askeveien (Sombra 43), Beinhaugen (Odin's
    Ax), Posterunek Rdzy (neutral)
- **Person names**: `genName()` = one of 20 first names ×
  `"<first> \"<handle>\""` where handle is one of 20 street handles (see
  Appendix A for both full lists — French/Italian/Nordic/East-European
  mix).
- **NPC professions** (12): Fixer, Corp Exec, Ganger, Nomad Rider,
  Netrunner, Solo, Media, Cop, Civilian, Medtech, Techie, Body Doc.

---

## 4. Character

### 4.1 Creation
Three inputs: **Name** (free text, defaults to a generated name if blank),
**Profession**, **Background/Turf**. Building the character:

```
attrs = {Combat:1, Driving:1, Hacking:1, Social:1, Stealth:1}
for each attr in profession.boosts: attrs[attr] = min(3, attrs[attr]+1)
attrs[turf.boost] = min(3, attrs[turf.boost]+1)
```

**Professions:**
| Profession | Boosts | Starting gear | Flavor |
|---|---|---|---|
| Solo | Combat, Stealth | Kessler Snub (Combat, Street), Padded Vest (armor 1, Street) | Combat & Stealth. Starts armed and armored. |
| Hacker | Hacking, Social | Bootleg Deck (Hacking, Street), Patchwork ICE Program (Hacking, Street) | Hacking & Social. Starts with a deck and a program. |
| Rocker | Social, Driving | Ostrava Runner (Driving, Street) | Social & Driving. Starts with a ride and a crew contact. |

**Turfs:**
| Turf | Boost | Starting BONDS | Starting gear | Contact faction | Extra |
|---|---|---|---|---|---|
| Nomad | Driving | 2 | Kombi Wagon (Driving, Street) | Vlads | — |
| Corpo | Hacking | 3 | none | Hammerstein GmbH | — |
| Street | Stealth | 2 | none | EuroMafia | +1 BOOST |

All starting gear is tagged `tier: "Street"` if not otherwise specified.

The character starts with **1 seeded Contact**: `{id:1, name: genName(),
faction: turf.contactFaction, profession: "Fixer", relationship: 1, favor:
turf==="Corpo" ? -1 : 0}`.

### 4.2 Full character object shape
```
{
  name, profession, turf,
  attrs: {Combat, Driving, Hacking, Social, Stealth},  // 1-5 each
  boost,                    // spendable BOOST pool, 0-10
  health: [bool, bool, bool],  // 3 Harm boxes, true = marked
  permanentInjury: bool,
  bonds,                    // BONDS currency
  gear: [ {name, tier, attr?|heal?|armor?}, ... ],
  contacts: [ {id, name, faction, profession, relationship, favor,
               archenemy?, bloodbrother?, tier?}, ... ],
  nextPersonId,
  graveyard: [ person, ... ],   // dead contacts, never redrawn
  locations: { name: {area, faction, heat}, ... },  // lazily filled in as visited
  factionStandings: { factionName: {wealth, rnd, power}, ... },  // all 11, eager
  factionRelations: { "A|B": number, ... },  // lazy pairwise, sorted-key
  restCount,                 // 0-3, Rest-clock counter (see §9)
  archenemyId,                // who the Rest clock is counting toward
  pendingSaleItem,            // a banked Street item awaiting its pair (see §12)
  log: [ string, ... ]         // capped at 300
}
```

### 4.3 Attributes
5 attributes, 1–5. Trained in the Hub: cost = **current rank in BONDS + 1
BOOST**, capped at rank 5.

### 4.4 Health
3 boxes, "Harm". Roll penalties: 1 box marked = **-1** to all rolls, 2
boxes = **-2**. 3 boxes (**Down**) forces the job to end in Failure and
always leaves a **Permanent Injury** (an ongoing extra -1 to every roll,
stacked with the Wounded penalty, until repaired).

Going Down triggers `resolveDownEvent()`: a 10% chance of "you should be
dead" — costs 2 BOOST (floored at 0) — either way, `permanentInjury = true`.

**Permanent Injury repair** (Hub, only shown while `permanentInjury` is
true): heals all 3 boxes and clears the flag.
- **Cybernetic Replacement** — 2 BONDS, quick: also knocks -1 off one
  random Attribute (floored at 1), permanently.
- **Biovat Regrowth** — 3 BONDS, slow: no side effect.

**Medical** (Hub, ordinary Wounded only, not a Permanent Injury): 1 BOND
per box healed.

### 4.5 Armor (damage absorption)
Gear can carry an `armor: N` field (charge count) instead of `attr`. Every
place a character would take a Harm hit calls `applyHarm(character)`
instead of the raw `markHarm()`:

```
applyHarm(c):
  armor = first owned gear item with armor > 0
  if armor exists and Math.random() < 0.5:
    armor.armor -= 1
    log "<armor.name> takes the hit for you."
    if armor.armor <= 0: remove it from gear, log "<name> is wrecked — it won't stop another one."
    return false   // no Health box marked
  else:
    return markHarm(c)   // normal Harm mark
```

Flat 50% absorb chance regardless of tier — tier only sets the starting
charge count (Street 1, Professional 2, Military 3). Broken armor is
removed from inventory entirely.

### 4.6 BOOST
A single spendable pool (0–10 cap), replacing a "Rep" system entirely.
Gained from Debrief (1 per Full-success step in the job, if room under 10),
from a killed Archenemy (+3), and from various Rest/Hunt minor events.
Spent as +1 to any single roll (1 BOOST), or to upgrade a roll's tier (3
BOOST, see §2), or on Training (1 BOOST + BONDS per rank).

### 4.7 Reputation
A second character stat, **REPUTATION**, `1-20`, starting at `1`. It is
never spent — it only accumulates and gates the Mission Board. Full rules,
gain conditions, and Tier table are in §19.1; it's called out here because
it lives on the character sheet alongside BONDS and BOOST.

---

## 5. Currency: BONDS

**BONDS** is the one abstract currency (no separate "Cred" — fully
replaced). Small numbers, 0–20+.

- **Win condition**: reaching **20 BONDS** ends the game — see §15.
- **Costs**: gear (1/2/3 BONDS by tier), Medical (1/box), repairs (2 or 3),
  Training (current attribute rank in BONDS + 1 BOOST), Hireling (1),
  Coffin Hotel Rest (1).
- **Mission payout formula**: `payout = 1 + mission.difficulty` (so 2, 3,
  or 4 BONDS for easy/medium/hard), then a flat employer-relationship
  adjustment: **+1** if relationship ≥3, **-1** (floored at 1) if
  relationship ≤-3. At Debrief this base is multiplied by an outcome
  multiplier (see §11) and further adjusted by an Ally fee and/or a Side
  Objective bonus. A **Special Mission** (§19.5) adds a flat **+2 BONDS**
  to this base before the outcome multiplier is applied. A Crime-category
  Employer adds a further flat **+1 BOND**, Corpo **+2 BONDS** (§20.1).
- **`mission.difficulty`** (1/2/3) is set at mission generation:
  `{weak:1, tough:2, elite:3}[worstAdversaryTier]`, bumped to a max of 3 if
  the mission's Time period is "Long" (3).

---

## 6. Gear

Three tiers, each item belonging to exactly one of three kinds:
- **Attribute gear** (`attr: "Combat"|"Driving"|"Hacking"|"Social"|"Stealth"`)
  — grants a passive bonus to any roll of that attribute for as long as
  it's owned. Bonus = tier value (Street +1, Professional +2, Military +3).
  Only the single *best* owned item per attribute counts
  (`bestGearBonus()`); they don't stack.
- **Heal gear** (`heal: N`) — adds N to the Coffin Hotel healing roll (see
  §9). Only the best owned heal item counts (`bestHealBonus()`).
- **Armor** (`armor: N`) — see §4.5. Every owned armor item is eligible
  (the *first* one found is used per hit — no "best" selection since there's
  only ever realistically one at a time).

**Tier scale**: Street = 1 BOND / +1 (or 1 charge for armor/heal),
Professional = 2 BONDS / +2 (2 charges), Military = 3 BONDS / +3 (3
charges).

**Full catalog** — see Appendix B.

### 6.1 Gear Up (buying, during a Job)
`genGearOffers(3)` rolls 3 random offers: tier is picked from the weighted
pool `["Street","Street","Professional","Professional","Military"]` (40%
Street / 40% Professional / 20% Military), then one random item from that
tier's full catalog array (all kinds mixed — attr/heal/armor). Buying
removes BONDS and appends `{name, attr, heal, armor, tier}` to
`character.gear`; each offer can be bought at most once.

**Revision (§20.5)**: buying/selling no longer happens during a job at
all — it moved to the Shop, an always-open Downtime panel using
`genShopOffers()` (Reputation-Tier-scaled, a 4th Legendary tier) instead
of this flat weighted pool. Gear Up itself now only handles Helper
recruitment (§20.4).

### 6.2 Gear damage (a Fail consequence)
On certain Fail results (see §10.2 weighted fallout), gear takes damage
via `degradeGearItem(c, item)`:
```
tierOrder = ["Street","Professional","Military"]
idx = tierOrder.indexOf(item.tier)
if idx <= 0 (already Street): remove item from gear entirely (lost)
else: item.tier = tierOrder[idx-1]   // downgrade one tier, item survives
```
Different flavor-text pools for "downgraded" vs. "lost for good" (Appendix
C). A Partial gearDamage result is cheaper and non-destructive: -1 BOND
("a quick repair"), tier unchanged.

### 6.3 Selling gear (Hub, "Sell Gear" section — shown whenever gear.length > 0)
- **1 Professional or Military item → 1 BOND**, sold instantly.
- **2 Street items → 1 BOND.** The first Street item sold is "banked"
  (`character.pendingSaleItem = item.name`, shown as a note); selling a
  second Street item pairs with the bank and pays out, clearing the bank.
- **Fixer bonus**: if the character has any Contact with
  `profession === "Fixer"` and `relationship >= 3`, every completed sale
  (the Prof/Mil case, or the paired-Street case) pays **+1 extra BOND**.
- Selling can push BONDS to 20 and trigger the win screen immediately.

---

## 7. People (the Contact pool / recurring cast)

Every Employer, mission Target, Adversary, and Hireling is drawn from one
shared pool, `character.contacts` — not always freshly generated. This is
the game's entire recurring cast.

### 7.1 `getPerson(character, roleCategory, excludeIds)`
- `roleCategory` is `"hostile"` (opposition: Adversaries, Assassination
  targets) or `"ally"` (cooperative: Employers, Hirelings, every other
  mission type's Target).
- Eligibility: a pooled person qualifies for `"hostile"` roles if
  `relationship < 0`, for `"ally"` roles if `relationship >= 0`.
  `excludeIds` (a `Set`, one per Job) prevents casting the same person into
  two roles in the same job.
- **80% of the time** (`REUSE_CHANCE = 0.8`), if any eligible pooled person
  exists, one is picked at random and reused. Otherwise (or if the pool is
  empty), `genPerson()` creates a new one:
  ```
  genPerson() → { name: genName(), faction: genFaction().name, profession: pick(npcProfessions) }
  ```
  assigned `id = nextPersonId++`, `relationship = roleCategory==="hostile"
  ? -randInt(1,2) : 0`, `favor: 0`, and pushed onto `contacts`.

### 7.2 Relationship
A signed integer, clamped **-5..+5**, per person. `nudgeRelationship(c,
personId, delta)` is the one mutator; after clamping it also checks: if
the person is tagged `bloodbrother` and their relationship just went
negative, they auto-flip to `archenemy` (see §7.3) and a log line fires.

Relationship changes happen at Debrief (Employer ±1/0/-1 by outcome,
Target +1 on a successful Transport/Hold, Hireling ±1, Ally ±1/-2 — see
§14), from Combat clashes (-1 to every mission Adversary on any Combat
roll, tier-independent), from failed Social/Stealth fallout (-1/-2 to the
Employer), and from the various Rest/Hunt/Bloodbrother events below.

### 7.3 Tags: Archenemy / Bloodbrother
Mutually exclusive booleans on a contact; `tagArchenemy()`/
`tagBloodbrother()` (state.js) each clear the other before setting their
own. `tagArchenemy` also stamps `tier: "tough"` (used for a Hunt-modifier
penalty, see §13).

**A person becomes an Archenemy from:**
1. The Rest clock's first tick (`lockInArchenemy` — the single
   *worst*-relationship contact in the whole pool is chosen and locked in
   as `character.archenemyId`, the one the clock counts toward).
2. A **failed Assassination** where at least one Stealth step in that job
   also came back a Fail — the surviving target is tagged (independent of
   the clock; can happen to *any* target, and multiple Archenemies can
   coexist).
3. A **Bloodbrother's relationship dropping below 0** for any reason
   (auto-flip, §7.2).

**A person becomes a Bloodbrother from:** succeeding on a job with them as
a free (relationship ≥5) recruited Ally (§14).

**Display rename (§20.6)**: shown to the player as "Amigue"; the
`bloodbrother` field/function names above are unchanged.

Any contact tagged `archenemy` shows a small **Hunt** button next to their
name in the sheet's People list (only rendered while `G.phase === "hub"`,
so it can't interrupt an in-progress job) — clicking it starts a
player-initiated Hunt (§13).

### 7.4 Death
`killPerson(character, personId)` removes a contact and moves them to
`character.graveyard` (`dead: true`); dead people are never redrawn. Deaths
happen: a successful Assassination kills its target; a failed
Transport/Hold kills the person being moved/protected; a killed Archenemy
(Hunt reward) or a killed side-objective Assassination target.

### 7.5 The Mysterious Benefactor (§20.10)
A special-cased recurring contact, tagged `benefactor: true`, created the
first time `grantBenefactorGift()` (state.js) runs — either from a Downtime
"lucky break" (§20.10) or a Reputation Tier-up once the character has met
them at least once. Freelance, `relationship: 0`, never moves off that
value, and `getPerson()` excludes it from every ordinary Employer/Target/
Hireling draw — this contact only ever does one thing: hand the player a
one-shot item (Appendix B) matching their current lowest-ranked Attribute.
Only one Benefactor ever exists per character; `findOrCreateBenefactor()`
reuses the same contact every time rather than generating a new one.

---

## 8. Factions

11 tracked factions (§3), each with a `{wealth, rnd, power}` standing,
seeded from its **type**'s base stats and eager-initialized for every
character (shown in the right-hand panel grouped by type, always all 11
visible):

| Type | wealth | rnd | power |
|---|---|---|---|
| Corpo | 8 | 8 | 4 |
| Crime | 3 | 1 | 6 |
| Nomad | 4 | 2 | 4 |
| Authority | 5 | 3 | 8 |

`adjustFactionParam(c, factionName, param, delta)` clamps each stat to
0–20.

**How standings move** (at Debrief, only on a non-Failure outcome): the
job's **asset type** (`wealth`/`rnd`/`power` — see §10.1) is the parameter
moved; for an Assassination it's always `power`. The Employer's faction
gains +1; if the mission Target belongs to a *different* faction than the
Employer, that faction loses -1.

**Faction-to-faction relations** (`factionRelations`, a lazy map keyed
`"<sorted A>|<sorted B>"`, clamped -5..5): if the job's Location Heat ended
higher than it started (i.e. the job "made noise"), tension rises -1
between the Employer's faction and the Target's faction (only if they
differ and both are real tracked factions — never for "Freelance").

**Revision (§19)**: §19.2, §19.4, and §19.6–§19.8 extend the above with
per-mission-type standing magnitudes, Employer/Target faction-pairing
constraints, Faction Tiers, and a Power-driven faction-destruction
mechanic. Where they disagree with the simple ±1 rule above, §19 is
canonical.

---

## 9. Locations & Heat

The 12 locations (§3) are a **fixed, permanent map** — never randomly
combined, Heat persists forever once rolled.

- **First visit**: `resolveLocation()` rolls Heat via
  `rollHeatForArea(area)`: Corpo → 1-3, Urban → 0-3, Rural → 0-2. From then
  on the persisted value is always reused (`rememberLocation` only sets it
  once).
- **Heat 4-5** applies a flat **-1** to any Combat or Stealth roll made at
  that location during a job.
- **Rises**: +1 on a Combat Fail; +1/+2 on a "heat" fallout effect
  (partial/fail); capped at 5.
- **Decays**: every Job's Debrief calls `decayOtherLocations()`, which
  drops every *other* visited location's Heat by 1 (floored at 0) — only
  the location the just-finished job happened at is left untouched (it
  keeps whatever the job's events pushed it to).
- **Random Encounters** (pre- and post-Job): chance = `heat * 10%`,
  checked independently before Mission Steps and after (via
  `maybeTriggerEncounter`). If triggered: one Challenge (Stealth vs. Combat
  alt, random flavor line from a 5-entry pool) must be resolved before
  continuing; its outcome runs through the same `applyOutcome`/`applyHarm`
  pipeline as a normal step, but doesn't cancel the job.

**Addition (§20.7)**: Heat ≥3 also gates entry and exit with a mandatory
(not probabilistic) EurCop/SwissGuard Checkpoint, layered *outside* Random
Encounters (checkpoint → encounter → Steps → encounter → checkpoint).

---

## 10. Mission Generation

`genMission(location, character, excludeIds)`:

1. **Type**: uniform random from `["Assassination","Heist","Transport","Delay","Hold"]`.
2. **Adversaries**: 1-3 (`randInt(1,3)`), each drawn via `getPerson(...,
   "hostile", ...)` then given a **tier** rolled independently per
   adversary: `randInt(1,6) + location.heat` → ≥8 elite, ≥5 tough, else
   weak (`genAdversaryTier`). `worstTier` = the toughest among them.
   Roll-penalty by tier: weak 0, tough -1, elite -2 (`tierPenalty`).
3. **Time period** (Delay/Hold only): `randInt(1,3)` = Short/Medium/Long,
   maps directly to 1-3 repeated Challenge steps.
4. **Target**: Assassination casts from the `"hostile"` pool (the kill
   target); every other type casts `"ally"` (the person/cargo being
   stolen/moved/delayed/held). The Target's faction must satisfy the
   Employer/Target pairing rule (§19.4) unless the job is a Special
   Mission (§19.5).
5. **Transport's origin** (`fromLocation`): a second, distinct Location
   (never the destination) resolved the same way as the main location —
   the job's primary `location` is always the *destination*.
6. **Asset type** (Heist/Transport/Hold/Delay only — Assassination has
   none): `assetType` = random of `wealth`/`rnd`/`power`; `assetFlavor` = a
   random flavor line from that asset's pool (Appendix D), or a fixed line
   for Delay ("You don't know what the real op needs...").
7. **`difficulty`**: `{weak:1,tough:2,elite:3}[worstTier]`, +1 (capped 3)
   if `timePeriod === 3`.

**Two jobs, tiered**: the Hub now generates and offers **two** Briefings
this way at once rather than one, gated by the player's Reputation Tier,
with an escalating chance of a tougher second offer — see §19.3. Its
higher-tier slot can also roll into a Special Mission — see §19.5.

### 10.1 Mission Sequences (the ordered Challenge steps)
Fixed per type (`MISSION_SEQUENCES`), each entry `{attr, alt?, desc}`:

| Type | Steps |
|---|---|
| Assassination | Stealth "Approach the target undetected." → Combat/Hacking "Take out the target..." → Stealth/Driving "Escape the scene." |
| Heist | Hacking/Stealth "Breach the security..." → Stealth "Grab the target..." → Driving "Getaway..." |
| Transport | Driving/Stealth "Run the transit route..." → Social/Combat "Get past a checkpoint..." |
| Delay | Social/Stealth "Stall them without tipping your hand." (repeated per Time unit) |
| Hold | Combat/Stealth "Hold the position against the next wave." (repeated per Time unit) |

`buildStepSequence(mission)`: Delay/Hold repeat their single template step
once per `timePeriod`, each copy suffixed `" (i/timePeriod)"`; all other
types just copy their fixed array.

### 10.2 Challenge resolution during steps
Each step: `renderChallenge()` offers a button per available attr (the
step's primary `attr`, plus `alt` if present) — see §10.3 for gating. Each
button shows live modifier chips before rolling:

**Modifiers** (`computeModifiers`):
- Best owned gear bonus for that attr.
- +1 if a Hireling is assigned to that attr.
- -1 to Combat/Stealth if Location Heat ≥4.
- Tier penalty (0/-1/-2) to Combat/Stealth from the mission's `worstTier`.
- +1 if the player checks "Spend 1 BOOST" (consumes 1 BOOST).
- +2 if the player checks "Ally Assist" (consumes the job's one-time Ally
  use, §14).
- -1 (1 Wounded box) or -2 (2+ boxes).
- -1 if `permanentInjury`.
- `-(tier - 1)` when the Challenge is against a specific hostile faction
  (Tier 1: 0, Tier 2: -1, Tier 3: -2, Tier 4: -3) — see Faction Tiers,
  §19.6.

**On Full**: logs "Full success on `<attr>`." — no further consequence.

**On Partial/Fail**: logs a random line from `DATA.complications[attr]`
(2 lines each, partial/fail — Appendix E), then rolls a **weighted fallout
effect** from `DATA.failOutcomes[attr]` (Appendix F — effects: `harm`,
`gearDamage`, `credLoss`, `heat`, `relationship`, weighted per attribute).
If the rolled effect is `gearDamage` on a Fail but the character owns no
gear, it's redirected to `credLoss`.

Effect resolution (`applyOutcome`):
- **harm**: `applyHarm(c)` (armor-aware, §4.5); if it results in Down,
  `resolveDownEvent`; a Combat Fail also +1 Heat.
- **gearDamage**: Partial = -1 BOND ("quick repair"), gear untouched. Fail
  = `degradeGearItem` on a random owned item (prefers items matching the
  rolled attr, else any item) — see §6.2.
- **heat**: Location Heat +1 (partial) or +2 (fail), capped 5.
- **relationship**: Employer relationship -1 (partial) or -2 (fail).
- **credLoss**: lose `min(bonds, 1)` (partial) or `min(bonds, 2)` (fail)
  BONDS.

**Forced extra steps** (`finalizeStep`, only on the *main* sequence, not
side-objective steps): 
- Transport: a Fail on the transit leg (Driving or its Stealth alt)
  inserts a forced `"Ambushed on the road..."` Combat step immediately
  after the current one.
- Any other Stealth Fail (not already a forced step) inserts a forced
  `"Caught! Fight your way clear or talk your way out."` Combat/Social
  step.

Going Down mid-sequence (`isDown`) immediately ends the job (Failure,
straight to Debrief).

**Revision**: §19.9 replaces the weighted-random fallout above with a
deterministic per-attribute effect table (including a new "wounded
helper" consequence for Hirelings/Allies, and a Special Mission variant
that can kill a Bloodbrother outright). Treat §19.9 as canonical where
the two disagree.

### 10.3 Equipment gating (`attrAvailable`)
Before offering attr buttons, filter out:
- **Hacking**, unless the character owns any Hacking-attr gear (any tier —
  "a deck").
- **Driving**, only when the current step is a Transport transit leg
  (`mission.type==="Transport"`), `mission.difficulty >= 2`, **and** either
  the destination or origin location's `area === "Rural"` — unless the
  character owns any Driving-attr gear ("a vehicle").

**Safety net**: if gating would remove every offered option, it's ignored
(never hard-lock a step).

### 10.4 Gear Up phase (per-job)
Screen shown right after accepting a Briefing:
- 3 rolled offers (§6.1) to buy.
- **Hireling** (random, alongside/instead of an Ally — mutually exclusive
  slot): 1 BOND, draws a `"ally"`-role person, assigns them a random attr,
  grants **+1** to that attr for the whole job (`job.hireling`).
- **Ally recruitment** ("Call in a Favor" section) — see §14.
- **"Head Out"** button: calls `advanceFromGearUp()` →
  `maybeTriggerEncounter("pre")` → Encounter or straight to Steps.

**Revision (§20.4, §20.5, §20.8)**: the buy-offer list is gone (buying
moved to the Downtime Shop, §20.5) and the single Hireling-or-Ally slot is
now up to 3 concurrent Helpers, any mix of both (§20.4). Gear Up is now a
genuine Loadout screen — Helper recruitment, then choosing which owned
gear to carry this job (§20.8), then "Head Out".

---

## 11. The Job — Full Phase Flow

`Hub → Briefing → GearUp → (Encounter) → Steps → (Encounter) → Debrief → Hub`

`startJob(alreadyRerolled)` builds the job object:
```
{
  employer,           // getPerson(..., "ally", ...)
  mission,            // genMission(...)
  excludeIds,         // Set, shared for the whole job's people casting
  location,           // destination
  steps,              // buildStepSequence(mission)
  stepIndex: 0,
  stepResults: [],    // {attr, tier} per main-sequence step
  hireling: null,
  pendingResult: null,
  rerolled: !!alreadyRerolled,
  encounter: {pre:{done:false}, post:{done:false}, stage:null},
  outcome: null,
  ally: null,          // {person, tier:3|5, used:false}
  sideObjective: null, // {type, target, results:[]}
  restStage: null       // "night"|"brothernight"|"brotherfight" mid-roll marker
}
```

### 11.1 Briefing
Shows Employer, Job type + flavor + **Payout** (same visual size as "Job",
§5 formula), mission-specific fields (§11.5), any accepted side objective,
Location + Heat bar, and the Opposition list. Buttons:
- **Accept the Job** → GearUp.
- **Take on a side job (+2 BONDS)** — see §12 — hidden once already taken.
- **Rest in Comfy Coffin Hotel (1 BOND)** — disabled once `rerolled` is
  true for this search, or if BONDS <1.
- **Night on the Street (Free)** — always enabled, no once-per-search
  limit.
- **Spend the Night with `<Bloodbrother>` (Free)** — only shown if the
  character has a Bloodbrother contact; always enabled.
- All three Rest options reroll into a brand-new job afterward (carrying
  `rerolled: true` forward) — see §9 of the Rest section (§12).

### 11.2 Random Encounter (pre)
`maybeTriggerEncounter("pre")` — see §9. If triggered, one Challenge
(Stealth/Combat) must be resolved before Steps begin.

### 11.3 Mission Steps
`renderSteps()` shows the current step's description and Challenge UI
(§10.2). Each resolution advances `stepIndex`; reaching the end triggers
the post-Encounter check, then Debrief.

### 11.4 Random Encounter (post)
Same mechanic, checked once all steps are done, before Debrief.

### 11.5 Mission-specific Briefing fields
- **Assassination**: Target (name, profession, faction).
- **Heist**: Target (name, profession, faction) + "Word is" asset flavor.
- **Transport**: Cargo (target name) + Route (`from → to`) + asset flavor.
- **Delay/Hold**: Time (Short/Medium/Long, N rounds) + asset flavor.

---

## 12. Rest (replaces the old "Pass")

Three ways to decline the current Briefing and (mostly) reroll into a new
one, all funneled through `processRestTick()`:

### 12.1 Rest in Comfy Coffin Hotel — 1 BOND
Gated to once per job search (`rerolled`). Immediate roll, no UI: `2d6 +
Combat rank + bestHealBonus(c)` vs.:
- **10+**: heal 1 box if any are marked.
- **7-9**: heal 1 box **only if exactly 1** is currently marked.
- **≤6**: nothing.

### 12.2 Night on the Street — Free, always available
Reuses the generic Challenge UI directly: pick **Combat** or **Social**,
roll with full modifiers (gear, Wounded, BOOST, etc. — same
`computeModifiers` pipeline as a mission step, since it borrows the current
job object). Resolution:
- **Full**: heal 1 box.
- **Partial**: nothing.
- **Fail**: `applyHarm(c)` (armor-aware).
Flavor: Combat = "a tough street night", Social = "talking your way into a
shelter".

### 12.3 Spend the Night (BLOODBROTHER only) — Free, always available
Social-only Challenge roll ("Spend the night."):
- **10+**: Bloodbrother relationship +1, plus a random gift
  (`grantBloodbrotherGift`): a free Street-tier item in an attr category
  the player doesn't yet own (picked at random among missing categories),
  else (if all 5 owned) heal 1 box if wounded, else +1 BOOST.
- **7-9**: heal 1 box; if BOOST >0, also -1 BOOST ("hangover").
- **≤6**: triggers a **nested** Combat roll (`"brotherfight"` stage,
  "Fight your way clear."):
  - **Full**: +1 BOOST.
  - **Partial**: Bloodbrother's own relationship -1 (no faction-standing
    scalar exists, so this is the closest analog), no other cost.
  - **Fail**: `applyHarm(c)`.

### 12.4 The Rest clock → Archenemy Hunt
`processRestTick()`, called after any of the three above resolve:
```
c.restCount++
if restCount == 1: lockInArchenemy(c)   // §7.3 — worst-relationship contact locked in
if restCount >= 4:
  restCount = 0
  clear G.job
  startHunt()     // forced Hunt against the locked-in archenemyId (§13)
else:
  startJob(true)   // reroll into a new Briefing, rerolled=true
```

---

## 13. The Archenemy Hunt

A bespoke mini state machine, `G.hunt`, entered via two paths:
- **`startHunt()`** — the Rest clock's forced trigger (§12.4). Opens on
  stage `"notice"`. If the locked-in archenemy is somehow already dead
  (e.g. killed by a normal Assassination job first), it's a no-op back to
  Hub.
- **`startHuntManual(personId)`** — clicking the Hunt button on any
  Archenemy-tagged contact from the Hub (§7.3). Opens on stage `"track"`.

```
G.hunt = { archenemy, stage, wounds: 0, combatBonus: 0, combatChoice: null,
           pendingResult: null, bloodbrotherUsed: false }
```

Every Hunt roll (`renderHuntRoll`) uses its own trimmed modifier set (no
`G.job` involved): best owned gear bonus for the attr, a tier penalty from
the archenemy's fixed `"tough"` tier (-1), an optional one-time
`extraBonus` passed in per-stage, +1 for spending BOOST, +2 for calling in
a Bloodbrother assist (once per Hunt, if one exists), -1/-2 Wounded,
-1 Permanent Injury.

**Bail-out options** (`renderHuntEscape`, offered on most stages, hidden
mid-roll): "Try to Slip Away (Stealth)" jumps to `avoid`; "Try to Run
(Driving)" jumps to `run`.

### 13.1 Stage: `notice` (clock-triggered entry)
Social roll, "Something's off tonight. Do you notice `<name>` closing in?"
- **Fail**: "...a car swerves out of nowhere — `<name>` comes out guns
  blazing!" → stage `combat`, no bonus.
- **Partial**: → stage `choice`, no bonus.
- **Full**: "You have managed to ambush `<name>`..." → stage `choice`,
  `combatBonus = 2` (consumed on the next Attack roll only).
Escape row: both Avoid and Run offered.

### 13.2 Stage: `track` (manual entry)
Social roll, "Tracking down `<name>`."
- **Full**: ambush, `combatBonus = 2` → stage `combat` directly (no choice
  offered — you initiated this).
- **Partial**: → stage `choice`, no bonus.
- **Fail**: "...guns blazing!" + `applyHarm(c)` immediately → stage
  `choice`.
Escape row: both Avoid and Run offered.

### 13.3 Stage: `choice`
Three buttons, no roll: **Avoid** (Stealth) → `avoid`; **Run** (Driving)
→ `run`; **Fight** → `combat`.

### 13.4 Stage: `avoid`
Stealth roll, "Slip past `<name>`..."
- **Fail**: → stage `combat` (forced fight).
- **Partial/Full**: → stage `resolved-evade` (Hunt ends clean).
Escape row: Run only (Avoid is redundant here).

### 13.5 Stage: `combat`
Two/three buttons (no `combatChoice` set yet): **Attack**, **Run
(Driving)**, **Break Off (Stealth)** (→ `avoid`).
- **Attack** (Combat roll, `combatBonus` applied once then cleared):
  - Fail: a Combat-complication line + `applyHuntCombatFailFallout` — a
    weighted pick from `failOutcomes.Combat`: `harm`→`applyHarm` (+Down
    check), `gearDamage`→`degradeGearItem` on a random owned item,
    `credLoss`→ -1 BOND. No wound scored.
  - Partial/Full: `wounds++`. At **3 wounds**: `applyHuntKillReward` (see
    §13.8). At **2 wounds**: archenemy "breaks and runs" → stage `chase`.
- **Run**: → `renderHuntRun` (§13.6), reached the same way whether entered
  from here or from an escape button elsewhere.

### 13.6 The Run roll (shared, stage `run` or `combatChoice==="run"`)
Driving roll, "Gun it and try to lose `<name>`."
- **Full**: → `resolved-run-clean` (clean break, no cost).
- **Partial**: `applyHarm(c)` → `resolved-run-hit`.
- **Fail**: `applyHarm(c)`, then a 50/50 between `degradeGearItem` on a
  random item OR losing `randInt(1,2)` BONDS → `resolved-run-bad`.

### 13.7 Stage: `chase` (only reachable at 2 wounds)
Driving roll, "`<name>` is wounded and running. Do you chase them down?"
- **Full**: `wounds = 3` → `applyHuntKillReward`.
- **Partial**: → `resolved-escape-win` (archenemy survives, but "the
  fight's over").
- **Fail**: → `resolved-escape-clean` (clean getaway for them).
Also offers a no-roll **"Let Them Go"** button → `resolved-escape-clean`
directly (the chase-specific bail option — no Stealth/Driving roll fits
"give up mid-chase").

### 13.8 Kill reward (`applyHuntKillReward`, any path reaching 3 wounds)
- A free random **Professional-tier Combat** item added to gear.
- `+3 BOOST` (capped 10).
- `+2 BONDS` — can trigger the win screen.
- `killPerson()` on the archenemy.
- `+2 Reputation` (§19.1), logged as the title *"Killer of `<name>`"*.
- → stage `resolved-kill`.

### 13.9 Resolution screen
Every `resolved-*` stage renders a one-line summary (Appendix G has the
exact text per outcome) + a **"Return to the Street"** button, which clears
`G.hunt` and routes to `win` (if BONDS ≥20) or `hub`.

**No Hunt outcome resets restCount again** — the clock was already zeroed
the moment the Hunt was triggered (§12.4); only kill/evade/escape *state*
differs, not clock accounting.

---

## 14. Ally Recruitment & Bloodbrother

Shown in Gear Up as **"Call in a Favor"**, listing every Contact with
`relationship >= 3` and not tagged `archenemy` — mutually exclusive with
the random Hireling (picking either hides the other's UI for that job).

- **Relationship 3-4**: "Bring along" → free to add, but **pays 1 BOND
  from the job's payout** at Debrief if the job succeeds.
- **Relationship ≥5**: "Bring along" → completely **free**.

Either way: `job.ally = {person, tier: rel>=5?5:3, used:false}`, and a
**one-time "+2 to this roll" checkbox** appears on every subsequent
Challenge roll in the job (mission steps, encounters) alongside the BOOST
checkbox — using it sets `used:true`, spent for the rest of the job.

**Debrief resolution:**
- Success (Full or Partial): Ally relationship **+1**. Tier 3: **-1 BOND**
  off the payout (min bonds, floored at 0). Tier 5: **tagBloodbrother()**
  on them, plus **+1 Reputation** (§19.1), logged as *"Friend of
  `<name>`"*.
- Failure: Ally relationship **-2**, no payment either way (Failure always
  pays 0 total).

Once someone is a Bloodbrother: they unlock **Spend the Night** (§12.3) in
Briefing and can be **called in for +2 on any Hunt roll**, once per Hunt
(§13, `bloodbrotherUsed`).

**Revision (§20.4)**: the "one Ally *or* one Hireling" exclusivity above is
superseded — a job can now bring up to 3 Helpers total, any mix of Ally and
Hireling, each resolving independently at Debrief with a shared group bonus
and a persistent two-strike wound rule. §20.4 is canonical where it
disagrees with the single-slot description above.

---

## 15. Side Objective ("More BONDS")

A Briefing-only toggle, **"Take on a side job (+2 BONDS)"**, hidden once
taken. On click (`takeSideJob`):
```
type = random(Heist, Assassination)
target = getPerson(c, type==="Assassination" ? "hostile" : "ally", job.excludeIds)
extraSteps = MISSION_SEQUENCES[type].slice(1)   // drop the shared first "approach" step
  .map(step => ({...step, desc: "[Side job — <target>] " + step.desc, sideObjective:true}))
job.steps.push(...extraSteps)   // appended to the end of the main sequence
job.sideObjective = {type, target, results: []}
```
Side-objective steps run through the exact same Challenge pipeline as main
steps, but their results are tracked *separately*
(`job.sideObjective.results`, not `job.stepResults`) — a botched side job
can never affect the main contract's success ratio.

**Debrief**: if `job.sideObjective` exists and **neither** of its two
results came back `"fail"`, it pays **+2 BONDS** and, if the type was
Assassination, kills the side target. Any fail on either step: no bonus,
target unaffected, one log line noting the side job fell through.

---

## 16. Debrief

`runDebrief()`:
```
score = sum over job.stepResults of (full=2, partial=1, fail=0)
ratio = score / max(1, stepResults.length * 2)

if isDown(c):            outcome="Failure", mult=0
elif ratio >= 0.85:       outcome="Full Success", mult=1
elif ratio >= 0.4:        outcome="Partial Success", mult=0.6
else:                     outcome="Failure", mult=0
```
(Only `job.stepResults` — the *main* sequence — feeds this ratio; side
objective results never do.)

`payout = round(estimatePayout(job) * mult)`, added to BONDS immediately.
Then, in order:
1. **BOOST**: +1 per Full-success step (capped 10 total).
2. **Employer relationship**: +1 (Full Success) / 0 (Partial) / -1
   (Failure).
3. **Faction standings + relations** (§8), only if not Failure.
4. **Target outcome** (§7.4 deaths / Archenemy tagging §7.3, §10 — full
   detail there).
5. **Hireling relationship**: +1 (non-Failure) / -1 (Failure).
6. **Ally resolution** (§14).
7. **Side objective resolution** (§15).
8. **Location decay** (§9).
9. **Reputation** (§19.1): if the outcome wasn't a Failure, +1; a further
   +1 if the job's base payout was ≥4 BONDS; a further +1 if
   `mission.type === "Assassination"`; a further +1 if the job was a
   Special Mission (§19.5).

Final `job.payout` is the sum of the base payout plus/minus the Ally fee
and Side Objective bonus — shown on the Debrief screen along with a
full/partial/fail step tally. **"Return to the Street"** clears `G.job`
and routes to `win` (if BONDS ≥20), `loss` (if the MULTI-CORP condition
just triggered — §19.8), or `hub`.

---

## 17. Win & Loss Conditions

### 17.1 Win
`checkWinCondition()` = `character.bonds >= 20`. Checked at load
(`init()`) and at every point control would otherwise route to Hub
(Debrief's button, a Hunt resolution's button, a completed gear Sale).

**Win screen** ("Ticket Off-World"): flavor text about buying passage off-
world with the BONDS; **"Start a New Runner"** clears the save entirely and
returns to Character Creation.

### 17.2 Loss — MULTI-CORP
See §19.8: if the Corpo faction category is ever reduced to a single
survivor, that faction becomes MULTI-CORP and the game is lost. Checked
alongside the win condition, at the same routing points. **"Start a New
Runner"** on the loss screen behaves identically to the win screen's.

---

## 18. Save Migration

`migrateCharacter(character)` runs on every `load()`, backfilling fields
that didn't exist in older saves (never destructive to gameplay-relevant
data unless the field genuinely didn't exist):
- `graveyard`, `contacts` default to `[]`.
- Every contact gets a stable `id` (assigned sequentially if missing) and
  `relationship`/`profession` defaults; `nextPersonId` derived from the max
  seen + 1.
- `permanentInjury` defaults `false`.
- `boost`: if missing, summed from a legacy per-track `rep` object (now
  deleted) — a one-time value-preserving conversion from an earlier
  Rep-track design.
- `factionStandings`/`factionRelations` default via `defaultFactionStandings()`/`{}`.
- Every gear item without a `tier` gets `"Street"`.
- `bonds`: if missing, derived from a legacy `cred` field (`round(cred /
  100)`, floored at 0) — the Cred→BOND currency-rescale conversion; `cred`
  is then deleted.
- `restCount` defaults `0`, `archenemyId` defaults `null`,
  `pendingSaleItem` defaults `null`.
- `reputation` defaults to `1` (§19.1).
- Every faction in `factionStandings` gets a `tier` (defaulted via §19.6's
  starting-Tier rule from its category) and `destroyed: false` if missing
  (§19.7).

---

## 19. Reputation, Faction Power & Special Missions

Design additions layered on top of every system above (`todo3.md`, "ADD2"
section onward). Where a rule here conflicts with an earlier, simpler
rule stated in §§1-18, this section is the canonical one; the earlier
sections carry pointers back here rather than being rewritten in place.

### 19.1 Reputation
A second character stat, **REPUTATION**, `1-20`, starting at `1` (see
§4.7). It is never spent — it only accumulates and gates the Mission
Board (§19.3).

Gained at Debrief (§16) for a non-Failure outcome:
- **+1** for the mission succeeding at all (Full or Partial Success).
- **+1** if the job's base payout (§5, before outcome multiplier/Ally
  fee/Side Objective) was **≥4 BONDS**.
- **+1** if `mission.type === "Assassination"` — logged with the flavor
  title *"Shadow of `<Location>`"*.
- **+1** if the job was a Special Mission (§19.5).
- **+2** whenever an Archenemy is killed (§13.8) — logged as *"Killer of
  `<name>`"*.
- **+1** whenever a contact becomes a Bloodbrother (§14) — logged as
  *"Friend of `<name>`"*.

Capped at 20, never decreases. Reputation Tiers:

| Reputation | Tier | Title |
|---|---|---|
| 1-5 | 1 | Street Rat |
| 6-10 | 2 | Warhound |
| 11-15 | 3 | Operative |
| 16-20 | 4 | Legend |

The player's Reputation Tier gates the Mission Board (§19.3).

### 19.2 Per-mission-type faction standing effects
Supersedes §8's flat ±1 rule. At Debrief, on a non-Failure outcome, the
Employer's and Target's factions move by mission type instead of a flat
amount:

| Type | Target's faction | Employer's faction |
|---|---|---|
| Assassination | Power **-2** | Power **+2** |
| Delay | Wealth **-2**, R&D **-1** | Wealth **+2** |
| Heist | Wealth **-1**, R&D **-2** | R&D **+2** |
| Hold | Wealth **-1**, Power **-1** | Power **+1** |
| Transport | Wealth **-1**, Power **-1** | Wealth **+1** |

("Target's faction" for Hold/Transport means the faction whose forces are
attacking/chasing — the opposition the job defeats.) The existing
`factionRelations` tension rule (§8) is unchanged. On a Special Mission
(§19.5), every value in this table is one point further from zero.

### 19.3 The Mission Board: two jobs, tiered
The Hub now always offers **two Briefings** at once (both built the usual
way, §10-11) instead of one; accepting either starts that Job, declining
both is a Rest action (§12) as before.

- The **first** job is always at or below the player's Reputation Tier:
  `mission.difficulty <= min(reputationTier, 3)` (difficulty is still
  1-3, §10; Tier 4 "Legend" characters stay capped at difficulty 3 for
  ordinary jobs — Special Missions, §19.5, are their outlet for
  higher-stakes work).
- The **second** job uses the same cap, but has a **10% base chance** of
  instead being pitched one tier higher (`min(reputationTier + 1, 3)`).
  This chance is **cumulative +10% per Rest tick**, reusing
  `character.restCount` (§12.4): `chance = 10% + 10% * restCount`. It
  resets to the 10% base once a job is finally accepted.
- Whenever the second job rolls "one tier higher", it additionally has a
  **10% chance of being a Special Mission** (§19.5) instead of an
  ordinary higher-tier job.

### 19.4 Employer/Target faction pairing
When the Employer and the mission Target are cast (§10 step 4, §7.1),
their factions are constrained:
- Same category (Corpo↔Corpo, Crime↔Crime, Nomad↔Nomad), **or**
- Adjacent categories: Corpo↔Crime or Crime↔Nomad. Corpo↔Nomad is never
  allowed directly.
- **Authority** factions (EurCop, SwissGuard) may only be cast as the
  Target, **never** as the Employer.
- "Freelance" people (§3) are exempt from this constraint on either side.

**Special Missions (§19.5) ignore this rule entirely** — either role can
be filled by any faction.

### 19.5 Special Missions
Only the Mission Board's higher-tier second slot can roll a Special
Mission (10% chance there, §19.3). It differs from an ordinary job:
- **Faction pairing is unrestricted** (§19.4 exception).
- **Tier**: one full tier above what pairing/difficulty would otherwise
  give, and every Challenge in it carries an extra **-1** modifier on top
  of its normal modifiers (§10.2).
- **Dangerous**: if a Bloodbrother is riding along as the job's Ally
  (§14) — a Combat Challenge **Partial** wounds them (they stop
  contributing their +2 for the rest of the job, §19.9); any
  main-sequence **Fail** kills them (`killPerson`, §7.4) outright.
- **Payment**: the job's base payout gets a flat **+2 BONDS** on top of
  the usual `1 + difficulty` (§5).
- **Amplified relationships**: every relationship delta the job would
  normally apply (Employer, Target, Ally, Hireling — §16, §14) and every
  faction-standing change (§19.2) is one point further from zero.
- **Reputation**: completing one grants the usual mission Reputation plus
  a flat **+1** "Special Mission" bonus (§19.1).
- **Name**: generated once at mission creation from Appendix J —
  `"Mission: <GREEK> <SHAPE> <COLOR> <NN>"`, e.g. *"Mission: ALPHA HEX
  CYAN 77"* — shown in place of the normal Job-type line on the Briefing
  and Debrief screens.

### 19.6 Faction Tiers
Every faction also carries a **Tier** (a separate number from Reputation
Tiers, §19.1, though scaled the same way):

| Faction | Tier range | Starts at |
|---|---|---|
| Corpo factions | 3 or 4 | 3 (lower) |
| Crime factions | 2 or 3 | 2 (lower) |
| Nomad factions | 1 or 2 | 1 (lower) |
| EurCop | always 2 | 2 |
| SwissGuard | always 3 | 3 |

- **R&D ≥10** promotes the faction to its category's higher Tier; if R&D
  later drops back below **8**, it demotes again.
- **Wealth ≥10** while the faction already sits at its category's
  *higher* Tier promotes it into the next category up, keeping that Tier
  number: a Nomad faction at Tier 2 becomes a Crime faction at Tier 2; a
  Crime faction at Tier 3 becomes a Corpo faction at Tier 3. (EurCop/
  SwissGuard never move.)
- **Challenge modifier** (superseded by §20.12): a Challenge against a
  specific hostile faction used to apply `-(tier - 1)` — Tier 1: 0, Tier 2:
  -1, Tier 3: -2, Tier 4: -3 — folded into `computeModifiers` (§10.2). §20.12
  removes this once Adversary toughness itself became faction-derived, to
  avoid counting the same faction's Tier twice on one roll.

### 19.7 Power struggles & faction destruction
Any faction whose **Power ≥10** attempts to destroy a rival in its own
category. Checked once per Rest tick (§12.4 — the closest thing this
single-player game has to a "round"):

```
atkMod = count(attacker.{wealth,rnd,power} >= 10) + (attacker.tier > target.tier ? 1 : 0)
defMod = count(target.{wealth,rnd,power} >= 10)   + (target.tier > attacker.tier ? 1 : 0)
roll = 2d6 + atkMod - defMod
```
- **≤6**: the attempt fails; the attacking faction loses **1 Power**.
- **7-9**: it opens a **guaranteed** Special Mission (§19.5, 100% chance,
  bypassing its normal 10% odds) — an Assassination-flavored contract
  against the target faction. If that job succeeds, the target faction is
  **destroyed**.
- **10+**: the target faction is destroyed immediately, no mission
  needed.

A destroyed faction is flagged `destroyed: true`, drops out of every
Employer/Target/Adversary draw pool, and is shown in the right-hand panel
greyed out and marked "DESTROYED"; its surviving Contacts become
Freelance (§3).

### 19.8 The MULTI-CORP loss condition
If the Corpo category is ever reduced to a **single remaining faction**
(the other two destroyed via §19.7), that faction absorbs the entire
Corpo tier and becomes **MULTI-CORP** — the game is **lost** (§17.2). A
dedicated loss screen plays instead of the Hub, with flavor text about the
last independent voice in the SuperState going dark and the world folding
under one logo; the only action offered is **"Start a New Runner"**
(as on the Win screen, §17.1), clearing the save.

### 19.9 Revised Mission Challenge fallout (supersedes Appendix F)
Replaces the weighted-random fallout of §10.2/Appendix F with a fixed,
deterministic set of consequences per attribute and tier. Combat
Challenges **always** add Heat, win or lose, on top of anything below.

| Attr | 7-9 Partial | ≤6 Fail |
|---|---|---|
| Combat | 1 Harm box, **or** lost equipment, **or** a wounded helper | 2 Harm boxes **and** (lost equipment **or** a wounded helper) |
| Driving | vehicle damage, **or** 1 Harm box, **or** lost equipment; +Heat | 1 Harm box **and** lose the vehicle; +Heat |
| Hacking | +Heat, **or** lose equipment (deck/ICE) | +Heat **and** (1 Harm box **or** lost equipment — deck/software) |
| Social | +Heat, **or** lose equipment | +Heat **and** lose equipment |
| Stealth | +Heat, **or** lose equipment | +2 Heat **and** 1 Harm box |

"Lost equipment" still resolves via `degradeGearItem` (§6.2). A **wounded
helper** is a new consequence: the job's Hireling or Ally stops
contributing their bonus (and, for an Ally, forfeits their one-time +2 if
unused) for the rest of the job — see §19.5 for the harsher Special
Mission variant, which can kill a Bloodbrother outright instead.

---

## 20. Faction Economy, Helpers & the Downtime Overhaul

Design additions layered on top of §19 (`todo3.md`, rows 139+ onward — the
"SHOP AND TRAINING", "MISSIONS and TIER", "Persons / NPCs", "HEAT EFFECT",
and "INVENTORY" material). This chapter covers the first slice actually
implemented — the backend mission/faction economy and the Helper rework —
not yet the Downtime UI overhaul, NPC specialties, checkpoints, or the
inventory/loadout system, which remain design-only pending their own
implementation passes.

### 20.1 Payout by Employer faction Tier
Extends §5's payout formula: after the relationship adjustment, a flat bonus
is added based on the Employer's faction's *current* category (§19.6) —
**+1 BOND** if Crime, **+2 BOND** if Corpo (Nomad, Authority, and Freelance
Employers: no bonus). Stacks with the existing relationship ±1 and the
Special Mission +2 (§19.5).

### 20.2 The Mission Board: distinct Employers
Extends §19.3: the Board's two jobs are never generated with the same
Employer *or* the same Employer faction — `genMissionBoard()` retries job
B's generation (bounded, ~5 attempts, falling back to whatever the last
attempt produced rather than hard-failing) until its Employer differs from
job A's on both counts. A queued faction-war Special Mission (§19.7) is
exempt from this retry — it must be exactly what the Power struggle
targeted.

### 20.3 Background faction missions (supplements §19.7)
Distinct from §19.7's Power-struggle destroy-attempts (which only fire for
Power ≥10 attackers, on Rest ticks, and can destroy a faction): once per
**Debrief**, one random faction in each of Corpo/Crime/Nomad attempts a
mission of its own against a random same-category rival — a lower-stakes,
always-on layer of background activity. Uses the same roll shape as §19.7
(`2d6 + atkMod - defMod`, identical modifier formula) against a randomly
chosen mission type's standing effects (§19.2's table, applied acting-faction-as-employer/rival-as-target):

- **10+**: the effect applies cleanly.
- **7-9**: the effect applies, but the acting faction also pays **-1
  Wealth, -1 Power** for the trouble.
- **6-**: no effect; the acting faction just pays the same -1/-1 cost.

Never destroys a faction — that stays exclusively a §19.7 outcome.

### 20.4 Helpers: up to 3 per job (supersedes the single Ally/Hireling slot)
§14's "one Ally *or* one Hireling" limit is replaced by a roster of up to
**3 concurrent Helpers** per job, freely mixing both kinds:

- **Hire** (unchanged from the old Hireling): 1 BOND, no relationship
  needed, a passive **+1 to one randomly assigned attribute** for the whole
  job.
- **Ally** (unchanged eligibility/cost from §14): a contact at relationship
  ≥3 — pays 1 BOND from the payout at Debrief if ≥3 but <5, free if ≥5 —
  granting a **one-time +2 to a single roll of the player's choice**,
  independently checkable per Helper (bringing more Allies means being able
  to stack more than one +2 on the same roll, each consuming that Helper's
  one-time use).

**Group bonus**: 2 or more active (non-benched) Helpers, regardless of
kind, give the whole crew **+1 to Combat** and **-1 to Stealth** — more
hands is louder.

**Wounding** (two-strike rule): a Helper hit by the §19.9 `woundHelper`
fallout, or a Special Mission's Bloodbrother-Ally danger (§19.5), is
`benched` for the *rest of that job* (stops contributing, and forfeits an
Ally's unused one-time +2) — a job-scoped flag, reset the next job. But the
underlying contact also picks up a **persistent** `wounded` flag; if they
are ever wounded *again* — this job or a future one — they die outright
(`killPerson`). A Special Mission Fail still kills a Bloodbrother Helper
immediately regardless of prior wounds (§19.5's harsher rule takes
precedence over the two-strike count).

At Debrief, every Helper resolves independently: Hire-sourced Helpers get
the old flat relationship ±1 (Failure/non-Failure); Ally-sourced Helpers
keep §14's fee/free-and-relationship-delta rules, and a first-time tier-5
success still tags Bloodbrother and grants +1 Reputation (only once, not on
every subsequent job with an already-tagged Bloodbrother Helper).

### 20.5 The Downtime overhaul: Shop / Training / EuroStoxx / Apartments
Buying and selling gear move out of the per-job flow entirely (superseding
§6.1's Gear Up purchase screen and §10.4's Gear Up phase description) and
into three panels that sit **always visible** next to the Factions
panel (a 4th layout column, `#downtime` — 260px, between `#main` and
`#factions`), rendered every tick alongside the sheet/main/factions panels.
Each panel shows its full content at the Hub and a greyed, inert "closed
for the duration of the job" placeholder at every other phase — `G.phase
=== "hub"` is the only gate, not a separate route. Gear Up (§11's GearUp
phase) keeps only Helper recruitment (§20.4) and "Head Out".

**GEAR, GUNS & GENERAL GOODNESS** (the Shop):
- A **4th gear Tier, Legendary** (4 BONDS, +4 to a matching roll, 4
  armor/heal charges) joins Street/Professional/Military so gear quality
  reaches the same 1-4 Tier scale as Reputation (§19.1) and Factions
  (§19.6) — a Tier-4 "Legend" character needs Tier-4 gear to exist at all.
  `DATA.gearTierOrder` (`["Street","Professional","Military","Legendary"]`)
  is the one shared list gear-degrade and the offer generator both read.
- Gear items may carry `tags` — `AP`/`EX` on select Weapons, `AR`/`LX`/`CG`
  on select Vehicles — shown as chips in the offer list. Purely descriptive
  for now (no mechanical effect yet) except **CG** (Cargo), reserved for a
  future Inventory/Loadout pass's spare-slot math.
- **Offers**: always 2 items at the player's own Reputation Tier, a 50%
  chance of one more a Tier higher, a 20% chance of one more two Tiers
  higher (capped at Tier 4) — `genShopOffers()` in engine.js. The list is
  fixed once generated and only refreshes on a Rest tick (`processRestTick`)
  — "resting finds new stock on the shelves" alongside its existing job
  reroll.
- **Selling** is unchanged from §6.3, extended to recognize Legendary as a
  single-item-sells-for-1-BOND tier alongside Professional/Military.
- **Apartments**: Tier-gated by Reputation Tier — nothing at Tier 1
  ("You are street rat..."), then Rented Cubicle (Tier 2, 0 Security
  slots), Garage/Office/Attic (Tier 3, 2 slots), Penthouse/Office/Nightclub
  Backroom (Tier 4, 4 slots). Price is `2×Tier` BONDS, +1 if the chosen
  (already-visited) Location's faction is Corpo-category. Buying again at a
  higher Tier than the one already owned replaces it (an upgrade, at the
  new Tier's price). Security options (`DATA.securityOptions`, per Tier)
  install free, capped at the apartment's slot count — their defensive
  payoff belongs to the still-unimplemented Archenemy home-invasion/EurCop
  raid mechanics. Owning an apartment also unlocks a free Hub action,
  **"Rest at your Apartment"** — a 50% chance to heal one Harm box,
  independent of the Rest clock/Mission Board reroll (§12) entirely; it
  doesn't tick `restCount`.

**LESSONS FROM THE STREET**: the Training mechanic (§4.3) unchanged,
relocated out of the Hub's inline section into its own panel.

**EUROSTOXX**: a new `character.stocks` map (`{factionName: amount}`,
Corpo-category factions only). "Invest 1 BOND" moves a BOND into a
faction's stock 1:1; "Sell All" converts the whole held amount back to
BONDS 1:1, any time. Whenever `adjustFactionParam` (§8) changes a faction's
Wealth, `settleStockGains()` (state.js) settles any held stock in that
faction immediately: **+1** on any rise (**+2** if Wealth just crossed into
≥10), or a loss equal to however far Wealth fell (floored at 0 held). A
destroyed faction (§19.7) wipes any stock held in it outright — it isn't
sellable first.

### 20.6 NPC Tiers, specialties, AMIGUE/COMPI, and the Archenemy home invasion
**Display rename**: BLOODBROTHER is now shown to the player as **Amigue**
everywhere (the sheet badge, Rest/Hunt UI, Debrief/log copy) — internal
field and function names (`bloodbrother`, `tagBloodbrother`,
`findBloodbrother`, `hunt.bloodbrotherUsed`) are unchanged, this is cosmetic
only. Any contact at relationship **3-4** (Ally-eligible but not yet free,
§14) additionally shows a **Compi** badge, also purely cosmetic — no new
field, just a `relationship >= 3` display check.

**Every NPC gets a `factionTier`**: assigned once, at creation
(`assignFactionTier()`, state.js), from their faction's *current* Tier
(§19.6) at that moment — Freelance NPCs default to Tier 1. This is a plain
number, distinct from the pre-existing `"weak"/"tough"/"elite"` combat-tier
*string* an Adversary or Archenemy separately carries for Hunt/Challenge
modifiers (`tierPenalty()`) — the two never overlap on the same field.

**NPC specialties** (`DATA.npcSpecialty`, one or two attributes per
profession): a Hire-sourced Helper's passive attribute bonus (§20.4) now
comes from their profession's specialty (a random pick between the two, for
professions with two) instead of a flat random attribute across all five.

**Archenemy home invasion** (`resolveArchenemyClockEvent()`, called from
Debrief's tail, right after §20.3's background faction missions): whenever
the Rest clock sits at **exactly 3** boxes — one tick short of the forced
Hunt (§12.4) — there's a **50% chance** the locked-in Archenemy moves first,
hitting either a friend (any contact at relationship ≥3) or the player's
Apartment (§20.5), whichever is available (a coin flip between the two if
both are; no-op if neither exists).
- **Hitting a friend**: the same persistent two-strike rule as a Helper
  wound (§20.4's `woundPerson()`) — wounded the first time, killed outright
  if they're ever hit again.
- **Hitting the Apartment**: a standalone roll, `2d6 + (Archenemy's
  factionTier − installed Security features)` vs. 10+/7-9/6- — no player
  attribute involved, this is entirely the Archenemy's side:
  - **10+** ("Evil things", `1d6`): 1-3 steals a random owned gear item;
    4-5 torches the apartment outright (`character.apartment = null`); 6
    plants a trap — the *next* "Rest at your Apartment" (§20.5) deals 2 Harm
    boxes instead of its usual heal roll, then clears itself.
  - **7-9**: Security scares them off, no effect.
  - **6-**: they get burned — the Archenemy's own `factionTier` drops by 1
    (floored at 1), not the faction's.

### 20.7 Heat checkpoints & apartment raids
**Assumption**: "CORPO location"/"CRIME location" in todo3.md means the
Location's owning faction's *current* category (`locationCategory()`,
state.js — reads the same dynamic `category` field as §19.6), not the
fixed `area` field (no Location's `area` is ever `"Crime"`/`"Nomad"`, only
`Urban`/`Corpo`/`Rural`). A neutral (`faction: null`) Location falls back
to its `area` — `"Corpo"` area counts as Corpo-category, anything else has
no category and never escalates to SwissGuard.

**Checkpoint gate** (`maybeTriggerCheckpoint()`, mirrors §9's
`maybeTriggerEncounter()` but is deterministic, not a %): Heat ≥3 at the
job's Location always puts up a checkpoint at both entry and exit —
`checkpointAgency()` picks EurCop by default, **SwissGuard** if the
Location is Corpo-category at Heat 4-5 or Crime-category at Heat 5.
Sequencing (superseding §11's simpler flow): GearUp → checkpoint(pre) →
encounter(pre) → Steps → encounter(post) → checkpoint(post) → Debrief —
the checkpoint is the outer gate, Encounters an incidental layer inside it.
On the **exit** checkpoint only, if any main-sequence step this job already
came back a Stealth Fail, the roll is skipped entirely and it escalates
straight to the Fight/Run resolution below — "they already made you."

This is not a normal Challenge — it bypasses `applyOutcome`/
`DATA.challengeFallout` (§19.9) entirely for its own bespoke table:
- **Roll** (Social or Stealth): **10+** passes clean. **7-9** flags you
  down — a real choice, not a random pick: **pay a bribe** (1 BOND, 2 if
  Heat ≥5 or the Location is Corpo-category) or **ditch a piece of gear**
  outright (a random owned item removed, not merely downgraded — "get rid
  of contraband"). **6-**: they make you: → the Fight/Run stage.
- **Fight/Run** (Combat or Driving, the player's choice — reuses the
  standard two-button Challenge UI rather than bespoke buttons): **10+**
  clear, no cost. **7-9**: through, but at a cost — one of {1 Harm box,
  vehicle damage, a Helper wounded} (§20.4's `woundJobHelper`), picked at
  random. **6-**: guaranteed 1 Harm box *and* one of {vehicle damage,
  Helper wounded, a piece of gear damaged} — each falls back to Harm if its
  preferred target doesn't exist (no vehicle/no active Helper/no gear),
  same recursive-fallback shape as §19.9's fallout table.

**Apartment raid** (`resolveApartmentRaid()`, Debrief's tail, right after
§20.6's Archenemy-clock check — the todo's explicit ordering): if the job
ended at Corpo Heat 4-5 or Crime Heat 5 and the player owns an Apartment, a
**20% chance** the same agency that would've manned a checkpoint shows up
at their door instead ("this will be as checkpoint, but the description
has to be changed"). **Implementation note**: rather than re-entering the
interactive Checkpoint UI for a job that's already over, this auto-resolves
as a single roll — `2d6 + Social rank + best Social gear` (the player is
home, answering the door) — using the same tier thresholds and Fight/Run
cost table above (Helper-wound excluded, since no Helper is at the
player's home), reflavored as haggling with detectives rather than a
street-level shakedown.

### 20.8 Inventory & Loadout: only carried gear does anything
Every `character.gear` item gets a `carried: boolean`. Only carried gear
grants its bonus, satisfies equipment gating, or can be damaged/lost —
owning something you left at home is inert for the whole job. This
supersedes §6.1's already-superseded Gear Up purchase screen with the last
piece it was missing: gear is bought in Downtime (§20.5) and now *carried*
per-job from the GearUp phase, which is genuinely a Loadout screen from
here on (`renderLoadoutSection()`, appended below Helper recruitment,
§20.4).

**Categories** (`gearCategory()`, state.js): Weapons (Combat), Clothing
(Stealth *and* armor items — "Armor and Stealth suits"), Decks (Hacking),
Vehicles (Driving), Social. Heal-gear fits none of these and is exempt
from the whole system — always available regardless of `carried`
(`bestHealBonus()` is unchanged).

**Slots**: each of the five categories gets one free carry slot, plus a
shared spare pool (`computeCarrySlots()`) — 3 base, +1 if a Vehicle is
carried, +2 more (3 total) if that Vehicle also carries the `CG` tag
(§20.5). A second (or third...) item in the same category draws from the
spares; the Loadout checkbox for it is rejected client-side once the pool
is empty.

**Defaults**: `computeDefaultCarry()` runs once — on a new character, and
on migrating any save from before this system — and carries only the
single best (highest `DATA.gearTierBonus`) item per category, leaving
every spare slot empty ("default is that you take the best tier you have
in each category"). After that it's never re-run, so it can't clobber the
player's own choices; instead `autoCarryNewItem()` runs once whenever a
*new* item is added (Shop buy, a Hunt kill reward, a Bloodbrother gift,
starting gear) — it fills an empty category's free slot automatically but
never dethrones whatever's already carried there.

**Everywhere carried is checked**: `bestGearBonus()`, `ownsGearForAttr()`,
`applyHarm()`'s armor lookup (all state.js), and every gear-picking pool in
`applyFalloutConsequence` (§19.9), the Checkpoint's bribe/Fight-Run tables
(§20.7), and the Hunt's Combat-fail/Run-fail fallout — each filters to
`item.carried` before picking what takes the hit, so "if challenge failure
results in gear damage or loss, it will be this gear that is damaged"
always lands on something the player actually brought. Two contexts stay
deliberately unfiltered: **selling** (Downtime, any owned item) and the
**apartment raid/invasion** (§20.6/§20.7, happens at home — the Archenemy's
"leftover gear" steal even *prefers* uncarried items, "not on the last
mission").

---

### 20.9 BATCH 2.0: Permadeath, Reputation loss, Apartment Rest overhaul, faction rebalance, and playtesting fixes

A grab-bag pass over `todo3.md` rows 245-264 — real design decisions (agreed
with the player up front) plus a round of live-playtesting bug fixes.

#### 20.9.1 Permadeath, and the Amigue's last favor
Every one of the ~9 scattered `if (wentDown && !c.permanentInjury)
resolveDownEvent(c);` call sites (the apartment trap, both Rest-fight
branches, Checkpoint combat, Fallout harm, both Hunt combat paths, Hunt Run)
now funnels through one function:

```js
function handleGoingDown(c, wentDown) {
  if (!wentDown) return false;
  if (!c.permanentInjury) { resolveDownEvent(c); return false; }
  const amigues = c.contacts.filter(p => p.bloodbrother);
  if (amigues.length) {
    // an AMIGUE (§14) throws themselves in — sacrificing their own life
    killPerson(c, pick(amigues).id);
    return false;
  }
  G.phase = "death"; // no save — permanently game over
  return true;
}
```

Going Down for the first time is unchanged (§Appendix — `resolveDownEvent`'s
BOOST-loss chance, then `permanentInjury = true`). Going Down again while
already carrying a Permanent Injury is normally fatal — unless an AMIGUE is
on the contact list, in which case *they* die in the player's place instead
(logged, moved to `graveyard`, obituary line per §20.9.5) and the run
continues. `handleGoingDown()` returns `true` only when the run actually
ended, so the handful of call chains that would otherwise keep going and
silently overwrite `G.phase` back to normal (`finalizeStep`, the Encounter
continue callback, `finishCheckpointCombat`, both Rest-fight finishers) all
check the return value and bail before their usual continuation logic.

A new `death` phase (`renderDeath()`) mirrors `renderWin`/`renderLoss`
exactly: flavor text, then "Start a New Runner" clears the save.

#### 20.9.2 Reputation can go down
Supplements §19.1 (which only ever described gains). Two triggers, agreed
with the player as the ones with an actual mechanical hook today (a third,
"betraying an Ally/Amigue," is deferred — no player action currently
constitutes betrayal):
- **Mission Failure** (`runDebrief()`): a Failure now costs Reputation using
  the *same* stacking rule as a Success gain (+1 base, +1 if the base payout
  was ≥4, +1 if Assassination, +1 if Special Mission) — a botched
  high-stakes job costs proportionally more.
- **Losing to your Archenemy**: -1 Reputation whenever a Hunt resolves
  "they get away clean" (a failed chase-escape roll, or manually choosing
  "Let Them Go"), and -1 whenever `resolveArchenemyClockEvent` actually
  lands a hit (a friend hurt, or an apartment-invasion "Evil things"
  outcome) — never on a result where the player comes out ahead (spooked
  off, burned, etc).

#### 20.9.3 Apartment Rest joins the Rest cycle, and gets a teeth
Supersedes the old free-standing "Rest at your Apartment" card in the plain
Downtime hub (§20.5). It now lives in `renderRestOptions()` alongside
Coffin Hotel (§12.1) and Night on the Street (§12.2), and — unlike before —
calls `processRestTick()` afterward, so it ticks the same clock (§12.4)
instead of being a free action outside the cycle.

**Home-invasion Hunt**: if this tick is the one that fills the Rest clock
(`restCount` hits 4) while resting at the apartment, the resulting Hunt is
flagged `atHome: true` on `G.hunt` instead of the normal street encounter —
same Hunt flow (§13), narrated as the Archenemy coming to the player's own
front door. Two differences while `atHome`:
- **Security count → Combat**: every installed security item (regardless of
  Tier) adds a flat +1 modifier to Combat rolls only, on top of the usual
  gear/Wounded/BOOST stack (`renderHuntRoll`'s `buildMods`) — "other rolls
  as normal."
- **Tier-4 armor pool**: each installed Tier-4 security item grants a
  2-charge absorb pool for the duration of that one Hunt (`homeArmorCharges`
  on `G.hunt`, same 50%-chance-to-absorb math as carried Armor gear). A new
  `applyHuntHarm(c)` checks this pool before falling through to the normal
  `applyHarm()`; a charge, once spent, is gone for the rest of that Hunt.

**Security now costs BONDS to install** (`renderApartmentSection()`): 1 BOND
for a Tier 3 option (Reinforced doors/Hitek Locks), 2 BONDS for a Tier 4
one (Security Drone/Security-AI/E-shok-Loks/ABLocks/RoboDOG) — previously
free, per §20.6's original security-options list.

#### 20.9.4 Faction economy rebalance
The trend from §19.6/§19.7/§20.1/§20.3 was one-directional (standings only
ever fell), so:
- **Passive recovery**: a new `applyFactionPassiveRecovery(character)`
  runs once per Rest tick alongside `runFactionPowerStruggles` — picks one
  random non-destroyed faction and adds +1 to one randomly chosen attribute
  (wealth/rnd/power), logged ("X quietly rebuilds (+1 attr)").
- **Gentler background-mission cost** (§20.3): both the 7-9 and ≤6 branches
  of `runFactionBackgroundMissions()` used to cost the acting faction two
  points (-1 wealth **and** -1 power); now a single randomly-chosen point.
  `runFactionPowerStruggles`'s own roll≤6 cost (-1 power only) was already
  a single point and is unchanged.
- **Cap lowered to 10** (`adjustFactionParam()`, was 20 per §19.6) — every
  Tier-up/power-struggle threshold is already "≥10," so a maxed stat now
  simply sits at its own threshold permanently, which the two changes above
  make meaningfully easier to sustain.

#### 20.9.5 Small fixes
- **Coffin Hotel is repeatable** (§12.1): no longer gated by `boardRerolled`
  — BONDS are the only limiter now.
- **Shop refreshes after every Debrief**, not only on a Rest tick (§20.5):
  `runDebrief()` regenerates `c.shopOffers` at its tail.
- **Wounded Helpers show a badge** in the Gear Up Helper list (§20.4) when
  `h.benched` is true.
- **Obituaries**: a new `DATA.obituaries` flavor pool; `killPerson()`
  (state.js) logs a line from it whenever the dead contact had
  `relationship >= 3` or was tagged, instead of leaving every call site to
  write its own one-off death text.
- **Multiple AMIGUEs and Archenemies**: "Spend the Night" (§12.3) and the
  Hunt-assist checkbox (§13) now offer one row per Bloodbrother contact
  (mutually exclusive — picking one unchecks any other) instead of always
  grabbing `findBloodbrother()`'s first match. Separately, `nudgeRelationship`
  (state.js) now auto-tags **any** contact as soon as their relationship
  clamps to exactly -5 (not just the single worst one the Rest clock counts
  toward, §12.4's `lockInArchenemy`) — so more than one Archenemy can exist
  at once, each huntable from their Hub contact row.
- **Repair Gear**: the Shop (§20.5) gained a "Repair Gear" section
  mirroring "Sell Gear" — any owned item below Legendary tier can be paid up
  one Tier for that Tier's normal fresh-purchase price.
- **Ally recruitment shows a specialty hint**: "Call in a Favor" rows
  (§20.4) now show the contact's profession and `DATA.npcSpecialty` next to
  their name, alongside the existing free "+2 to one test" perk.

#### 20.9.6 Live-playtesting fixes
- **Bug — stale Heat mid-job**: `resolveLocation()` (state.js) used to
  return a fresh plain-object *copy* of the persisted location record, so
  `job.location.heat` was a snapshot frozen at job start — every in-job
  Heat rise (Combat's always-on +1, a Stealth Fail's +2, etc.) mutated
  `character.locations[name]` directly and never touched that snapshot.
  Since `maybeTriggerCheckpoint`, the Heat roll modifier, and
  `resolveApartmentRaid` (§20.7) all read `job.location.heat`, the exit
  checkpoint/raid check never saw heat that climbed during the mission's
  own Steps. Fixed by returning the live `character.locations[name]` object
  directly — every heat mutation is now visible everywhere the job holds a
  reference to it. This was the root cause of checkpoints/raids being rare
  to witness in play.
- **Effect transparency**: partial/fail outcomes used to sometimes log only
  flavor text with no stated mechanical effect. `applyHarm()` (state.js)
  now always logs an explicit line ("-1 Harm box." / "You go down — every
  Harm box marked.") even on the plain non-absorbed case; a new
  `raiseHeat(character, location, amount)` both mutates and logs every Heat
  change ("Heat +N at <location> (now <heat>)."), replacing several
  scattered silent `loc.heat = Math.min(5, ...)` assignments; the
  gearDamage Partial fallout and the Checkpoint bribe now both append the
  BOND amount spent to their log line.
- **Target faction visibility** (§20.7's Briefing fields): Transport's
  Cargo line now shows the cargo owner's faction alongside their name;
  Delay/Hold now show a full `Target:` line (name, profession, faction)
  matching Assassination/Heist's existing format.
- **No self-targeting** (§19.4's Employer/Target pairing): `pairedFactionsFor()`
  now excludes the Employer's own faction name from the Target's allowed
  factions (previously same-category always included it). Special Missions
  (§19.5), which pass an unrestricted target-faction list, now filter that
  list through a new `nonDestroyedFactionNames(character)` minus the
  Employer's faction — "any role" no longer means "against yourself." A
  forced-war Special Mission's Employer draw (§19.7) can now also exclude
  the war's own target faction, via a new optional exclusion parameter on
  `getEmployer()`.

---

### 20.10 BATCH 2.1: legibility, balance, one-shot gear, and the Mysterious Benefactor

A grab-bag pass over `todo3.md` rows 265-282 — UI legibility fixes, small
balance tweaks, and new content.

**Vehicles — one at a time (§20.8).** The Loadout's Vehicles category now
enforces a hard 1-carried limit regardless of spare slots: checking a second
Vehicle auto-uncarries whatever was carried before it (a radio-style swap,
the same mutual-exclusivity idiom the Hunt already uses for its Amigue-call
checkboxes), rather than requiring a manual uncheck first. This also
retroactively makes `computeCarrySlots()`'s existing `.find()` (which only
ever looked at *a* carried Vehicle, singular) a true invariant instead of a
latent assumption.

**Special Mission odds raised to 50% (§19.3, §19.5).** The Mission Board's
higher-tier second slot, once it's already escalating past the player's own
Reputation Tier, now has a 50% chance (was 10%) of that escalation landing
on a full Special Mission instead of an ordinary higher-tier job.

**Job A's cap, reconfirmed.** `genBoardJob()`'s first-slot call always
passes `wantHigher: false`, which takes the branch
`mission.difficulty = Math.min(mission.difficulty, capTier)`, and
`capTier = Math.min(reputationTier(character), 3)` is itself never above the
player's Reputation Tier — so the Board's first job has never been able to
exceed the player's own Tier. No code changed; this batch just confirms and
documents it (todo3.md explicitly asked for the double-check).

**Faction context, always visible.** Every Briefing card now shows an
explicit "Employer Faction: X • Target Faction: Y" line
(`factionSummaryHtml()`) — the data was already present in the surrounding
prose, this just makes it legible at a glance. The same line, plus job
type/employer/location/Heat, now persists across every Challenge-hosting
screen (`jobContextHtml()`, wired into Steps, Encounter, and Checkpoint) —
previously only the Briefing carried that context, and it scrolled out of
view several screens before Debrief.

**The journal highlights what just happened.** `render()` fires exactly
once per player action across the whole game, so `G.lastLogCount` (an
ephemeral, unpersisted watermark, reset once on load so old history never
reads as "new") lets `renderJournal()` tag however many lines were pushed by
the most recent action with a `log-new` class, rendered in the amber
`--warn` color — the newest news is now visually distinct from the scroll
of history underneath it, not just first in position.

**A Partial can't bill you a BOND you don't have.** The §19.9 fallout
table's `"gearDamage"` option costs a flat -1 BOND on a Partial (or,
lacking any carried gear, redirects to `"credLoss"`'s own -1 BOND) — at 0
BONDS that used to be a silent no-op billed as a real cost. `applyOutcome()`
now excludes any Partial option containing `"gearDamage"` from the pick
whenever `c.bonds === 0`, falling back to the unfiltered list only if that
would leave nothing to choose from (the same "never hard-lock" safety net
`attrAvailable()` uses). Fail's own `"gearDamage"` degrades an item instead
of costing BONDS, so it's unaffected.

**A hot roll pays out.** Any Challenge roll (Steps, Encounters, Checkpoint,
Rest sub-flows, Hunt rolls — everywhere the shared roll-button UI calls
`resolve()`, not Coffin Hotel's or the Apartment raid's bespoke inline
formulas) that comes to 12 or more nets an extra +1 BOOST (capped 10),
regardless of tier — a new shared `resolveRoll(c, attrRank, mods)` wraps
`resolve()` and is now the one path both `renderChallenge()` and
`renderHuntRoll()` use.

**Spend up to 2 BOOST on one roll.** The old single "Spend 1 BOOST"
checkbox is now `boostSpendOptionHtml()`/`wireBoostSpend()` — up to
`min(2, c.boost)` mutually-exclusive "Spend N BOOST for +N" checkboxes,
shared by both roll UIs. `computeModifiers()`'s `spendBoost` parameter (and
`renderHuntRoll`'s inline `buildMods`) changed from a boolean to the actual
integer amount being spent.

**One-shot gear.** A new `DATA.oneShotGear` table (Professional/Military/
Legendary tiers, 5 items each — one per Loadout category) holds single-use
items tagged `"1S"`: Lucky-Lucky Polymer One-Shot Pistol, Lucifer Smoke
Grenade, Nitro Boost Canister, Burner ICE Breaker, Forged Credchip Burner
(Professional); Hades Thermite Grenade, Ghost Static Patch, Smoke Screen
Kit, Zero-Day Worm, Blackmail Dossier (Military); Singularity Grenade,
Chronoslip Field Emitter, Wormhole Jump Charge, Godmode Exploit Chip,
Council Pardon Writ (Legendary). `genOneShotOffer()` (engine.js) makes these
available to a character a full Reputation Tier below the item's own Tier
(a Tier-1 "Street Rat" already sees Professional-tier one-shots) — priced 1
BOND under that Tier's normal price, baked directly into each item's own
`price` field. `genShopOffers()` has a 40% chance per refresh of adding one.
`bestGearBonus()` now also returns the underlying item (`{name, bonus,
item}`, purely additive); a new `consumeOneShotGear(character, attr)`
(state.js) checks whatever item just contributed a roll's gear bonus and, if
it's tagged `"1S"`, removes it from `character.gear` — called from both roll
UIs right before the roll resolves, so a one-shot is spent the instant it's
actually used, win or lose.

**The regular gear catalog, at 3 models per category per Tier.** Every Tier
in `DATA.gear` now has exactly 3 items in Weapons/Decks/Vehicles/Social and
3 in Clothing (2 Stealth-attr + 1 armor) — was as few as 1 in several
categories. New names throughout keep the existing European/cyberpunk
naming convention (e.g. Street's Junkyard Shiv, Rustbucket Moped, Cracked
Tablet Rig; Legendary's Singularity Blade, Meteor Strike AV, Oracle Cortex
Array — see the updated Appendix B for the full list). `grantBloodbrotherGift()`
now `pick()`s among the matching Street items instead of always taking the
catalog's first match, so its variety actually shows now that there's
something to vary between.

**Downtime lucky breaks, and the Mysterious Benefactor.** `maybeLuckyBreak()`
(game.js), checked once whenever `nextHubPhase()` actually lands on `"hub"`
(so on `init()`'s reload, and both the Debrief/Hunt-resolution "Return to
the Street" buttons — never while already sitting in a rendered Hub): if the
character is flat broke (0 BONDS) and still carrying Harm, 20% chance of one
of three breaks — a relationship-≥3 friend takes them in and heals them to
full (only offered if such a friend exists); a package from **the Mysterious
Benefactor**, a new recurring NPC type (`state.js`'s `findOrCreateBenefactor()`
— a Freelance, relationship-0 contact flagged `benefactor: true`, created
once and reused after, and excluded from `getPerson()`'s ordinary
Employer/Target/Hireling draws) containing a one-shot item matching the
character's current lowest-ranked Attribute (`grantBenefactorGift()`); or
+2 BONDS from the nightly "Road-Kill, Faster, Faster(R)" Lottery. Separately,
`gainReputation()` now compares Reputation Tier before and after every gain,
and — only for a character who's met the Benefactor at least once — a Tier-up
has a 40% chance of `maybeBenefactorReturns()` sending another gift, logged
as a familiar courier finding them again.

**Night on the Street always pays a little.** `finishNightOnStreet()` now
grants +1 BOOST (capped 10, from the new `DATA.nightBoostFlavor` pool) on
top of whatever the roll itself resolved — win, lose, or draw — flavored as
the buzz of the city itself feeding you something.

**A second line for every single-line flavor pool.** `DATA.missionFlavor`
(each of the 5 mission types), `DATA.delayFlavor`, `DATA.apartmentTier1Flavor`,
and both `DATA.repairs[].flavor` entries are now 2-line pools, `pick()`'d at
their usage site instead of read as a fixed string. `HUNT_SUMMARY` (game.js)
likewise gained a second phrasing per resolution stage — each of its 7
entries is now a 2-element array of template functions, and
`renderHuntResolution()` picks one at random. Pools that already had 2+
lines (complications, gear-damage/cred-loss flavor, Archenemy-invasion
flavor, Encounter flavor, obituaries) are untouched.

---

### 20.11 A faction-war fix, and cybernetic replacements ("getting to borg")

A verification pass over `todo3.md` found the whole file already implemented
except one bug and one unimplemented line; this closes both.

**Faction Power-struggle bugfix (§19.7).** A Power struggle's 7-9 result
queues a guaranteed Special Mission (`job.mission.forcedFactionWar =
{attacker, target}`, set in `genBoardJob()`/`genMissionBoard()`,
engine.js) that's supposed to destroy the target faction outright if the
mission succeeds. The field was set but never read. `runDebrief()`
(game.js) now checks it alongside the existing Assassination-success kill:
on a non-Failure outcome, `destroyFaction(c, forcedFactionWar.target)`
fires and logs which faction paid for the war.

**Cybernetic replacements (BATCH 2.0, "count cybernetic replacements —
getting to borg").** Previously unimplemented; the mechanic below is per the
player's own spec. Repairing a Permanent Injury with **Cybernetic
Replacement** (§4.4) now bolts on a random part from
`DATA.cyberneticParts` (`character.cyberneticReplacements`, an array,
displayed as chips under Health on the sheet) instead of the old flat
random attribute -1:

- **Cyberarm** and **Cyberleg** together: **+1 Combat** (shown as a red
  badge next to the stat, `cyberAttrModifier()`, state.js) and a point of
  chrome armor.
- **Faceplate** and **Cyberlung** each add a point of chrome armor on
  their own; **Faceplate** also costs **-1 Social** (red badge).
- Chrome armor (`cyberArmorCount()`) is a second, non-depleting 50%-chance
  absorb check in `applyHarm()` (state.js), tried after carried gear armor
  and before a Harm box is actually marked — unlike gear, it never breaks.
- The Combat/Social modifier is folded into every place that already
  builds a Combat/Social roll: `computeModifiers()` (Steps, Encounters,
  Checkpoints, Night on the Street, Spend the Night), the Hunt's
  `buildMods`, Coffin Hotel's healing roll, and the Apartment raid's
  haggling roll.
- **Cyberpsycho risk**: any Harm box actually landing during the job flow
  (Steps/Encounters/Checkpoints — not Rest or the Archenemy Hunt, which
  are separate systems) rolls `2d6 + cyberneticReplacements.length`
  (`maybeTriggerCyberpsycho()`, game.js) if the character has any chrome
  at all: **6-** nothing happens; **7-9** every mission Adversary, the
  mission Target, and every current Helper are killed outright (each
  killed Helper also costs -1 relationship with every other contact of
  their faction), then the job continues to Debrief as normal — a
  successful mission still pays; **10+** the Employer dies too and the run
  ends immediately (`G.phase = "death"`, "SwissGuard fries you with a
  microwave cannon"), bypassing Debrief the same way a second Down does.

---

### 20.12 BATCH 2.2: Downtime/Lay-Low merge and Tier-driven mission generation

**Downtime and Lay Low share one screen.** The "Lay Low" Rest options
(Coffin Hotel/Night on the Street/Spend the Night/Rest at the Apartment) —
previously a card inside the Mission Board (`renderBriefing()`, §11.1) —
are now a fourth box in the always-visible Downtime column
(`renderLayLowBox()`, alongside Shop/Training/EuroStoxx, §20.5), open
whenever `G.phase` is `"hub"` or `"briefing"` (browsing a Briefing isn't a
mission yet) and greyed out only once an actual job is under way. Its
content still needs a Board on the wire to mean anything (resting rerolls
`G.board`), so it shows a placeholder hint until "Find a Job" has been
clicked at least once. Mechanically unchanged — this is a rendering
relocation only.

**The Mission Board's first slot is Tier-gated by faction category.**
`genMissionBoard()`'s job A (always at/below the player's own Reputation
Tier per §19.3) now also restricts its Employer's faction category via
`DATA.firstJobCategoriesByTier`: Tier 1 Street Rat → Nomad only; Tier 2
Warhound → Crime or Nomad; Tier 3 Operative → Corpo/Crime/Nomad
(unrestricted); Tier 4 Legend → Corpo only. `getEmployer()` gained an
optional `allowedCategories` filter for this (Freelance Employers are
exempt either way, per §3). Job B (the escalating/Special-Mission slot) is
unaffected — it keeps §19.3's existing rules.

**Adversary toughness is faction-derived, not pure dice.**
`genAdversaryTier(heat, factionTier)` now folds an adversary's own
`factionTier` (1-4, already assigned at creation — §20.6) into the
roll: `randInt(1,6) + heat + (factionTier - 1)`, same weak/tough/elite
thresholds as before (≥8 elite, ≥5 tough, else weak) — a Corpo enforcer
skews tougher than a Nomad ganger before the dice even land.

**No more double-counting a faction's Tier.** Now that the per-Adversary
Combat/Stealth penalty (`tierPenalty(mission.worstTier)`) is itself
faction-derived, the old separate `factionChallengeModifier()` — which
used to apply a second, independent `-(tier-1)` to every roll based on the
mission Target's faction Tier (§19.6) — has been removed from
`computeModifiers()` entirely, since keeping both would penalize the same
underlying faction strength twice on the same roll.

---

## Appendix A — Names
**First names (20)**: Luca, Amara, Bjorn, Elin, Mateusz, Ines, Dimitri,
Freya, Giulia, Sven, Katarina, Marco, Ingrid, Nikolai, Chiara, Anders,
Zofia, Tomas, Léa, Viktor.

**Handles (20)**: Ferro, Nera, Lupo, Fenrir, Ravn, Sabel, Noir, Vlk, Krähe,
Ombra, Falke, Ghiaccio, Corvo, Mrok, Volkov, Eisen, Blitz, Rook, Kilo,
Sturm.

A generated name is always `"<first> \"<handle>\""`.

## Appendix B — Full Gear Catalog
**BATCH 2.1 (§20.10)**: every Tier now has 3 models per Combat/Stealth/
Driving/Hacking/Social, and Clothing (Stealth + armor) sums to 3 as well —
was as few as 1 in several categories.

| Tier | Combat (×3) | Stealth (×2) | Driving (×3) | Hacking (×3) | Social (×3) | heal | armor |
|---|---|---|---|---|---|---|---|
| Street (1 BOND) | Kessler Snub, Rusted Stiletto, Junkyard Shiv | Grigio Overcoat, Faded Trenchcoat | Ostrava Runner, Rustbucket Moped, Borrowed Bicycle | Bootleg Deck, Cracked Tablet Rig, Scavenged Antenna Array | Kiosk Chits, Forged Ration Card, Back-Alley Barter Chip | Field Trauma Wrap (1) | Padded Vest (1) |
| Professional (2 BONDS) | Halvar Sidearm, Monofilament Edge, Tactical Push Dagger | Notte Milano, Urban Camo Cloak | Voss Coupé, Interceptor Moto, Armored Delivery Van | Rime Breaker, Signal Jammer Rig, Proxy Ghost Suite | Broker's Black Book, Corporate Access Badge, Silver Tongue Earpiece | Dermal Weave (2) | Kevlar Weave Jacket (2) |
| Military (3 BONDS) | Sturmgewehr SMG, Raptor Talons, Gauss Battle Rifle | Ombra Couture, Optic-Camo Weave | Panzer AV, Wolfpack APC, Stormrunner Interceptor | Blackline Shard, Blacksite Cortex Rig, Warhound ICE Suite | Ledger of Favors, Diplomatic Immunity Chit, SuperState Press Pass | MedCorp Platinum Chit (3) | Composite Plate (3) |
| Legendary (4 BONDS, §20.5) | Ares Railgun, Vorpal Monowire, Singularity Blade | Chameleon Weave, Phase-Shift Mantle | Ghost Chassis AV, Meteor Strike AV, Nightfall Phantom Coupé | Deus Ex Cortex, Oracle Cortex Array, Genesis Root Kit | Voice of the Council, Shadow Cabinet Seat, Off-World Diplomatic Seal | Nanite Reconstructor (4) | Reactive Plate Mk.IV (4) |

(The Stealth line is deliberately named like fashion labels — "Clothing".)
Selected items also carry a descriptive `tags` chip (§20.5): `AP`/`EX` on a
few Weapons, `AR`/`LX`/`CG` on a few Vehicles — Halvar Sidearm/Sturmgewehr
SMG/Ares Railgun/Vorpal Monowire (AP), Raptor Talons/Ares Railgun (EX),
Voss Coupé (LX), Panzer AV/Ghost Chassis AV/Wolfpack APC (AR, CG; Ghost
Chassis AV also LX), Armored Delivery Van (CG), Stormrunner Interceptor
(LX), Meteor Strike AV (AR, CG), Nightfall Phantom Coupé (LX), and the
Nomad turf's starting Kombi Wagon (CG). No mechanical effect yet except CG
(§20.8's spare-slot math).

**One-shot gear (§20.10, `DATA.oneShotGear`)**: single-use, tagged `1S`,
removed from inventory the moment they're actually used in a roll
(`consumeOneShotGear()`, state.js). Available to a character a full
Reputation Tier below the item's own Tier, priced 1 BOND under that Tier's
normal price:

| Tier (shown from Rep Tier) | Combat | Stealth | Driving | Hacking | Social |
|---|---|---|---|---|---|
| Professional (1 BOND, from Tier 1) | Lucky-Lucky Polymer One-Shot Pistol | Lucifer Smoke Grenade | Nitro Boost Canister | Burner ICE Breaker | Forged Credchip Burner |
| Military (2 BONDS, from Tier 2) | Hades Thermite Grenade (AP) | Ghost Static Patch | Smoke Screen Kit | Zero-Day Worm | Blackmail Dossier |
| Legendary (3 BONDS, from Tier 3) | Singularity Grenade (EX) | Chronoslip Field Emitter | Wormhole Jump Charge | Godmode Exploit Chip | Council Pardon Writ |

## Appendix C — Gear damage flavor
- Partial (repair, no tier change): "A close call bends something —
  you'll need a quick repair." / "Your gear takes a knock; nothing lost,
  but it'll cost to fix."
- Fail, final loss (already Street): "Wrecked beyond repair — you lose the
  piece for good." / "It's trashed in the scuffle; that one's gone."
- Fail, downgraded (survives): "It takes a beating but holds together —
  knocked down a grade." / "Banged up bad; it'll still work, just not like
  it used to."

## Appendix D — Asset flavor (Heist/Transport/Hold/Delay)
- **wealth**: "a case of untraceable BONDS", "a shipment of black-market
  luxury goods", "a stash of counterfeit chits"
- **rnd**: "a prototype cyberware core", "an encrypted R&D data shard", "a
  stolen weapons blueprint"
- **power**: "a crate of military-grade hardware", "a cache of restricted
  munitions", "a captured enforcer"
- **Delay** always uses: "You don't know what the real op needs from this
  — could be anything. You're just buying time for someone else's job."

## Appendix E — Complications (Partial/Fail flavor per attribute)
| Attr | Partial | Fail |
|---|---|---|
| Combat | "You land it, but take a hit doing it." / "It works, but you burn through your ammo/charge." | "You catch a bad hit." / "You're pinned down and the shooting draws attention." |
| Driving | "You make it, but scrape the vehicle up badly." / "You get there, but had to take the ugly route." | "You crash — the vehicle takes damage and so do you." / "You lose control and end up somewhere you didn't plan." |
| Hacking | "You're in, but you trip a partial alarm." / "It works, but a trace starts crawling toward you." | "Full trace — ICE burns your deck and every camera in the block just woke up." / "The system locks you out hard and pings security." |
| Social | "They go for it, but now you owe them one." / "You get the info, but they remember your face." | "They see right through you." / "Word gets back to the wrong people." |
| Stealth | "You slip by, but someone clocks movement." / "You're through, barely — they know something's off now." | "You're spotted cold." / "A patrol catches you mid-move." |

## Appendix F — Weighted Fallout Table (relative weights)
| Attr | harm | gearDamage | credLoss | heat | relationship |
|---|---|---|---|---|---|
| Combat | 50 | 30 | 20 | – | – |
| Driving | 35 | 45 | 20 | – | – |
| Hacking | – | 35 | 25 | 40 | – |
| Social | – | – | 35 | 25 | 40 |
| Stealth | – | 20 | – | 55 | 25 |

## Appendix G — Hunt resolution summary lines
**BATCH 2.1 (§20.10)**: each stage now has 2 phrasings, picked at random.

| Stage | Text |
|---|---|
| resolved-evade | "You give `<name>` the slip. For now." / "`<name>` loses your trail in the crowd. Not tonight." |
| resolved-run-clean | "You put real distance between you and `<name>` tonight." / "`<name>` is a memory in your mirrors before you even hit the highway." |
| resolved-run-hit | "Banged up, but clear. `<name>` is still out there." / "You shake them off, but not before they get a piece of you. `<name>` lives to try again." |
| resolved-run-bad | "Ugly getaway, but a getaway. `<name>` is still out there." / "It's a mess getting clear, but you're clear. `<name>` isn't done with you." |
| resolved-escape-win | "You come out on top, but `<name>` slips away to lick their wounds." / "`<name>` breaks off bleeding. You won this round, not the war." |
| resolved-escape-clean | "`<name>` gets away clean. This isn't over." / "`<name>` vanishes into the city like they were never there." |
| resolved-kill | "`<name>` won't be a problem again." / "`<name>` hits the ground and doesn't get up. It's finished." |

## Appendix H — Encounter flavor (random, pre/post-job)
"A patrol rounds the corner right into your path." / "A rival crew is
working the same block." / "A drone sweep pings something out of place." /
"A fixer's runner recognizes you from a past job." / "Corp security is
doing a routine sweep tonight."

## Appendix I — CSS design tokens (for a faithful visual rebuild)
Dark theme, monospace-adjacent UI: `--bg:#0b0d12, --panel:#12151c,
--panel-2:#171b24, --border:#262c38, --text:#d8dee9, --muted:#7c8496,
--accent:#00e5c7 (teal), --accent-2:#ff2e63 (pink/red headers),
--warn:#ffb703 (amber, BONDS/BOOST numbers), --danger:#ff4d4d`. 4-column
CSS grid (260px / 1fr / 260px / 320px, §20.5 added the 3rd), collapsing to
1 column under 980px. Cards have rounded corners (8px), a max-width of
640px. A 5-segment Heat bar and a reused 4-segment Rest-clock bar are
small colored squares (filled = `--danger`). Font: `"Segoe UI", system-ui,
sans-serif`.

## Appendix J — Special Mission Name Generator (§19.5)
**Greek letters (12)**: Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Theta,
Kappa, Sigma, Omega, Rho, Omicron.

**Shapes (12)**: Hex, Cube, Prism, Spiral, Vertex, Wedge, Torus, Rhombus,
Helix, Shard, Obelisk, Lattice.

**Colors (12)**: Cyan, Magenta, Crimson, Amber, Jade, Cobalt, Onyx,
Violet, Ember, Slate, Indigo, Bone.

Format: `"Mission: <GREEK> <SHAPE> <COLOR> <NN>"` (all uppercase), `NN` =
`randInt(10,99)`. Example: *"Mission: ALPHA HEX CYAN 77"*.
