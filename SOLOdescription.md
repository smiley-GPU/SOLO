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

**Revision (§21.3)**: a 4th Profession, **Jockey** (Driving, Combat;
Roadhouse Revolver + Steel Jackal), joined this table — see §21.3 for its
Class Ability. A balance pass (§21.3) also changed Hacker's 2nd item to a
one-shot ("Burner ICE Breaker" in place of "Patchwork ICE Program") and gave
Rocker a 2nd item it didn't have before ("Back-Alley Barter Chip," Social) —
every Profession now starts with exactly 2 items covering 2 distinct
mechanics.

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
- **+1** if `mission.type === "Assassination"` **and the job's Location
  Heat never rose above 3** — logged with the flavor title *"Shadow of
  `<Location>`"* (revision, chat request: originally granted for any
  non-Failure Assassination regardless of Heat; a loud hit that spikes
  Heat past 3 no longer earns it, even if the kill itself landed clean).
  Checked as `c.locations[job.location.name].heat <= 3` at Debrief — Heat
  only ever rises during a job (nothing decays the job's own Location until
  `decayOtherLocations()` right after, which explicitly skips it), so the
  value read here is already the highest it reached over the whole job.
  **Further revision (chat request) — WRAITH**: `character.shadowCount`
  tracks how many times this condition has ever been met. The 1st still
  logs and titles *"Shadow of `<Location>`"* as above; the 2nd instead sets
  `character.wraith = true` and titles **WRAITH** — "further Shadow titles
  are not shown or have no effect": the 3rd and beyond add no title and no
  extra flavor line (the +1 Reputation itself still applies every time,
  unaffected). **Further revision (chat request)** — earning WRAITH also
  removes the one earlier "Shadow of `<Location>`" entry from
  `character.titles` (`c.titles.findIndex(t => t.startsWith("Shadow of
  "))`, spliced out — always exactly one to find, since `shadowCount` was
  exactly 1 before this branch runs) rather than leaving both titles
  sitting in the list side by side; any *other* titles (Friend of X, Killer
  of Y, ...) are untouched. WRAITH is a permanent, profession-independent
  unlock (unlike every other Class Ability, §21.3, which is gated by
  `character.profession`) granting the same once-per-job Combat-to-Stealth
  swap GEARHEAD/NETRUNNER use for their own attr — see §21.3's WRAITH
  entry.
- **+1** if the job was a Special Mission (§19.5).
- **+2** whenever an Archenemy is killed (§13.8) — logged as *"Killer of
  `<name>`"*. **Revision (chat request) — WICKED**: `character.killerCount`
  (`applyHuntKillReward()`, game.js) tracks how many times this has ever
  fired, the same shape as `shadowCount`/WRAITH just above. The 1st still
  titles *"Killer of `<name>`"*; the 2nd instead sets `character.wicked =
  true` and titles **WICKED**; the 3rd and beyond add no title and no
  extra flavor line — the +2 Reputation itself still applies every time,
  unaffected. **Further revision (chat request)** — same as WRAITH above:
  earning WICKED removes the one earlier "Killer of `<name>`" entry
  (`findIndex(t => t.startsWith("Killer of "))`, spliced out). WICKED is
  the mirror of WRAITH: the same permanent, profession-independent unlock,
  granting a once-per-job Stealth-to-Combat swap instead of WRAITH's
  Combat-to-Stealth — see §21.3's WICKED entry.
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

  **Revision (§20.25)**: more than one can be owned at once.

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
Sequencing (superseding §11's simpler flow; revised by §20.13/BATCH 2.3):
GearUp → (checkpoint(pre) OR encounter(pre)) → Steps → (checkpoint(post) OR
encounter(post)) → Debrief — Checkpoint and Encounter are mutually
exclusive at each boundary, never both (`resolveBoundaryGate()`,
game.js): Checkpoint (the deterministic Heat gate) is always tried first,
Encounter only rolls if Checkpoint didn't fire.
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

**Slots (superseded — see the Revision below)**: each of the five
categories used to get one free carry slot, plus a shared spare pool
(`computeCarrySlots()`) — 3 base, +1 if a Vehicle was carried, +2 more (3
total) if that Vehicle also carried the `CG` tag (§20.5). A second (or
third...) item in the same category drew from the spares; the Loadout
checkbox for it was rejected client-side once the pool was empty.

**Defaults (superseded — see the Revision below)**: `computeDefaultCarry()`
ran once — on a new character, and on migrating any save from before this
system — and carried only the single best (highest `DATA.gearTierBonus`)
item per category, leaving every spare slot empty ("default is that you
take the best tier you have in each category"). After that it was never
re-run, so it couldn't clobber the player's own choices; instead
`autoCarryNewItem()` ran once whenever a *new* item was added (Shop buy, a
Hunt kill reward, a Bloodbrother gift, starting gear) — it filled an empty
category's free slot automatically but never dethroned whatever was
already carried there.

**Revision (chat request) — a flat 3-item cap, Vehicle exempt**: "Limit
gear to three items + any from vehicle. Vehicle has its own extra slot."
Replaces the whole "1 free slot per category + a shared spare pool" model.
`computeCarrySlots()` (state.js) now returns a single number — the total
Weapons/Clothing/Decks/Social items that may be carried at once, sharing
one flat pool instead of a guaranteed slot each: **3**, **+2 more (5)** if
a carried Vehicle has the `CG` tag ("any from vehicle" — cargo capacity,
unchanged trigger from before). A carried **Vehicle itself is exempt** —
its own always-available slot, never counted against that cap, still
exclusive (only one at a time; checking a 2nd auto-uncarries the 1st,
unchanged). `carriedNonVehicleCount(character)` is the new helper counting
what's currently spent against the cap. `computeDefaultCarry()` now picks
the single best item in each of Weapons/Clothing/Decks/Social as before,
but only offers as many of those picks a carry slot as the cap allows
(`.slice(0, computeCarrySlots(character))`) rather than guaranteeing one
per category regardless of the cap; the single best Vehicle is still
always carried, unaffected. `autoCarryNewItem()` auto-carries a new
Vehicle only if none is carried yet (unchanged), and auto-carries anything
else if `carriedNonVehicleCount() < computeCarrySlots()` — true of *any*
gear type now the pool isn't segmented by category, which is also what
satisfies the separate "carry armor when you buy it if you have slots"
request: armor (filed under Clothing) was previously blocked from
auto-carrying whenever Clothing's own single free slot was already taken,
even with spare capacity sitting open elsewhere: under the flat pool, it
competes for room exactly like everything else.

**Further revision (chat request) — shrinking the cap trims back down.**
"If you change CG vehicle to normal remember to take one item out.
Preferably from category that has many - take off the lowest tier."
Swapping away from (or un-carrying) a CG Vehicle in the Loadout screen
drops the cap by 2, which can leave more non-Vehicle items carried than
the new cap allows — nothing else re-validates that on its own. New
`enforceCarryCap(character)` (state.js), called after every carry-state
change in `renderLoadoutSection()` (both the Vehicle-swap branch and the
general checkbox-change path, so unchecking a CG Vehicle outright is
covered too): while `carriedNonVehicleCount()` exceeds the (now smaller)
cap, repeatedly finds whichever of Weapons/Clothing/Decks/Social currently
holds the *most* carried items (re-evaluated fresh each pass, so a
category that started well ahead of the others gets brought down toward
parity with them rather than any one category being singled out
regardless of size) and un-carries the lowest-`DATA.gearTierBonus` item in
it, logging `"<name> won't fit anymore without the cargo room — you leave
it stowed at home."` each time. A no-op whenever nothing's over the
current cap.

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
formulas) that comes to **13 or more** (raised from 12, balance pass —
chat request) nets an extra +1 BOOST (capped 10), regardless of tier — a
new shared `resolveRoll(c, attrRank, mods)` wraps `resolve()` and is now
the one path both `renderChallenge()` and `renderHuntRoll()` use.

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

### 20.13 BATCH 2.3: Checkpoint and Random Encounter are mutually exclusive

todo3.md reported EurCop/SwissGuard checkpoints seeming to "loop
indefinitely." A full trace of the Checkpoint mechanic (§20.7) found its
own roll → (choice or Fight-or-Run) → end sequence was already correct —
a Partial/Fail Fight-or-Run always applies its one-time cost and
unconditionally ends the checkpoint, no re-arming possible. The actual
cause, confirmed with the player: **Checkpoint and Random Encounter could
both fire back-to-back at the same job boundary** (entry or exit), since
whichever of the two got resolved first would, on completion,
independently roll a chance for the *other* — so a failed Checkpoint's
Fight-or-Run could be immediately followed by a Random Encounter offering
its own Stealth/Combat roll, reading exactly like "another fight."

Fixed with one shared gate, `resolveBoundaryGate(stage)` (game.js): tries
`maybeTriggerCheckpoint(stage)` first (the deterministic, Heat-driven
gate) and only rolls `maybeTriggerEncounter(stage)` if that didn't fire —
returning `"checkpoint"`, `"encounter"`, or `null` (neither). All four
places that used to resolve a boundary (`advanceFromGearUp()`, the
Steps-complete transition, `finishCheckpoint()`'s `"pre"` branch, and
`renderEncounter()`'s `"post"` continuation) now go through this one gate
or its result, so at most one of the two ever fires per boundary, and
neither one chains into rolling the other afterward.

---

### 20.14 PATCH 2.4: One-shot gear is a per-roll choice, not automatic

todo3.md: "Make it a choice whether or not to use single-shot (1S) item in a
challenge." Previously (§20.10/BATCH 2.1), `bestGearBonus()` picked the
single best-tier *carried* item for a roll's attribute with no regard for
whether it was tagged `"1S"`, and `consumeOneShotGear()` then auto-burned
it the instant it turned out to be that best item — since a one-shot's
tier (and so its bonus) is usually higher than a character's ordinary
gear, owning one meant it fired on the very next roll of that attribute
whether the player wanted to save it or not.

Now every carried one-shot item matching a roll's attribute is its own
independent checkbox (`oneShotOptionsForAttr()`, state.js) next to the
BOOST-spend and Ally-Assist checkboxes, in both the shared Challenge UI
(`renderChallenge()`) and the Hunt's own roll UI (`renderHuntRoll()`) —
unchecked by default. The passive "best owned item" gear bonus
(`bestPermanentGearBonus()`, state.js) now explicitly excludes `"1S"` gear,
so it always reflects the best *ordinary* item instead; each checked
one-shot then adds its own `+N (1S)` modifier chip on top (multiple
different one-shots for the same attribute can stack if all are checked).
Only the one-shots actually checked at roll time are removed from
inventory (`consumeOneShotItems()`, state.js) — one-shots left unchecked
are untouched and carry over to the next roll. The one non-interactive
exception is `resolveApartmentRaid()` (§20.7), which still uses the
original `bestGearBonus()` (including one-shots, never consumed) since
there's no roll UI there to offer a choice on.

---

### 20.15 INTERFACE UPDATE 2.4.1: Armor boxes, Gear/People tabs, Reputation titles, wounded recovery

todo3.md's "INTERFACE UPDATE 2.4.1" section (rows 306-315) — a pass over the
Character column's readability, with one small mechanic (wounded recovery)
added to back a display requirement that had no underlying state yet.

**Armor boxes**, above Health. `carriedArmorItem(c)` (state.js, also now the
one thing `applyHarm()` itself calls) finds the carried gear-armor item;
its box count is `DATA.gearTierBonus[item.tier]` (the charge count the tier
started with), filled left-to-right as `gearMax - item.armor` — i.e. exactly
as many boxes read "used" as charges have actually been spent. The whole
gear-armor row disappears on its own the moment the item breaks (`applyHarm`
already removes a 0-charge item from `gear` — nothing extra to do). A
second, differently-colored box per point of non-depleting cybernetic armor
(`cyberArmorCount()`, §20.11) is appended after — those never fill in, since
a chrome absorb chance isn't a shared charge pool, just a second independent
roll `applyHarm()` tries after gear armor doesn't apply.

**Health (and Armor) boxes heal from the right.** `markHarm()` already filled
the leftmost *empty* box first; `healBox()` used to clear the leftmost
*marked* box, which could open a gap in the middle of the row instead of
shrinking it from the end (`[true,true,false]` healing to `[false,true,false]`).
Fixed to clear the rightmost marked box instead, so marked boxes are always
a contiguous block starting at index 0 — "filled from the leftmost box,
unfilled from the rightmost," per the todo.

**Reputation gets an earned-titles list.** A new `character.titles` array
(state.js, `addTitle()`) collects the honorific line already logged at each
Reputation-granting deed — "Shadow of `<Location>`" (Assassination),
"Friend of `<name>`" (a Helper becoming an Amigue), "Killer of `<name>`" (a
Hunt kill) — instead of those strings only ever existing as one-off log
lines. Shown under Reputation on the sheet (newest first), and reused
verbatim as a "Final Score" obituary/score-chart block (`obituaryHtml()`,
game.js: Reputation, Tier, BONDS, then the full titles list) on the Win,
Loss (MULTI-CORP), and Death screens alike.

**Gear tabs.** The sheet's Gear list now sits behind a small tab bar — All,
Weapons, Clothing, Decks, Vehicles, Social (`GEAR_TABS`, game.js) — filtering
by the existing `gearCategory()` (state.js, §20.8); heal-gear has no
category of its own (exempt from the Loadout/carry system entirely, §20.8)
so it only ever shows under All. Selected tab is ephemeral UI state
(`G.gearTab`, never persisted) and a click re-renders only the sheet, not
the whole screen. A carried-system item shown while not currently carried
gets a small ", stowed" suffix.

**People tabs.** Likewise for the People list — Friends, Faces, Enemies, All
(`PEOPLE_TABS`/`personBucket()`, game.js): Friends is anyone tagged Amigue
(`bloodbrother`) or at relationship ≥3 (Compi-eligible); Enemies is anyone
tagged Archenemy; Faces is everyone else, including ordinary negative-
relationship contacts that were never tagged. Friends/Faces/All sort
descending by relationship (best first); Enemies sorts ascending (most
hated first).

**Wounded contacts get a red mark — and a way to clear it.** `woundPerson()`
(state.js) already set a persistent `wounded` flag (§20.4's two-strike
rule); the sheet now renders a small red dot next to any wounded contact's
row. Since nothing previously ever cleared that flag, a matching recovery
was added to back "remove it when they are healed, available again to
work": `woundPerson()` now also stamps `woundedRounds = 2`, and a new
`recoverWoundedContacts()` (state.js), called once per Rest tick alongside
the existing faction-recovery calls in `processRestTick()` (game.js),
counts it down and clears `wounded` (logging "`<name>` is back on their
feet.") once it reaches 0 — the "sidelined for two rounds/nights" recovery
todo3.md's Persons/NPCs section originally called for but that was never
wired up.

---

### 20.16 INTERFACE UPDATE 2.4.2: the middle column rebuilt — Journal-first, Downtime folded into #main, Mission Board cards, and Abort Mission

todo3.md's "INTERFACE UPDATE 2.4.2" section (rows 316-335) — a full rebuild
of the middle column (`#main`) and the retirement of the dedicated 4th
sidebar column that used to hold Shop/Training/EuroStoxx. `#layout` is a
3-column grid now (`260px 1fr 320px` — sheet / main / factions); every
Downtime panel lives inside `#main` alongside the Journal and the Mission
Board.

**The Journal moves to the top of `#main`**, a fixed-height scrollable box
(`renderJournalBox()`, game.js) instead of a footer under the phase card —
rendered first, on every phase, by `renderMain()`. 10 rows tall by default
(`#journal { max-height: calc(1.6em * 10); }`), font-size 13px to match a
button's own size (per the todo); an Expand/Shrink toggle button
(`G.logExpanded`, ephemeral UI state) doubles it to 20 rows and back.

**Downtime folds into `#main`.** `renderHub()` (the Hub/"Downtime" phase)
now builds two things in sequence: a Downtime window/card — Medical,
Permanent Injury repair, a "Lay Low" section (Coffin Hotel / Night on the
Street / Spend the Night with an Amigue / Rest at your Apartment, via the
unchanged `renderRestOptions()` — no longer gated on a Board already
existing, since resting builds one regardless) — and, at the bottom of that
same window, "Find a Job"; then `renderDowntimeColumns()` appends a
`flex-wrap` row of five panels underneath: **Shop** ("Gear, Guns & General
Goodness" — buy offers + Sell Gear), **Workshop** (Repair Gear, split out of
the old combined Shop panel), **Apartment** (buy/upgrade/Security, also
split out — `renderApartmentSection()` itself is unchanged, just re-homed),
**Street-Dojo** (renamed on screen from "Lessons From the Street" — same
cosmetic-only rename idiom as Amigue/Compi, §20.6; function/mechanic names
unchanged), and **EuroStoxx**. None of the five carry a "closed for the
job" grey state any more (superseding §20.5's `active`/`.disabled`
handling) — they're only ever rendered at the Hub in the first place, so
they simply aren't in the DOM once a job is under way.

**Shop and Workshop are tabbed by gear category + "All"**
(`GEAR_TABS`/`tabBarHtml()`, reused from §20.15's sheet tabs), via their own
ephemeral `G.shopTab`/`G.workshopTab`, filtering both the Shop's Buy offers
and Sell list, and the Workshop's repairable-items list.

**Find a Job no longer always rerolls.** `goFindJob()` shows the existing
`G.board` (switches to the `"briefing"` phase) if one exists instead of
calling `startJobSearch()` fresh — the Board only ever changes from a
Lay-Low action (`processRestTick()` → `startJobSearch(true)`) or once a job
is accepted and a new search is needed, matching the todo's "change the
missions only if player chooses some other option than Find a Job."

**The Mission Board is two trading-card-style offers side by side, plus a
"Return to Street" card.** `renderBriefing()` lays both candidates out in a
`.mission-row` flex container (`renderBriefingCard()`, each a
`.mission-card`, with a `.special` modifier for a Special Mission's border/
title color) and appends a "Not Tonight" / "Return to Street" card below
them. Deliberately only two font sizes anywhere on a mission card — an 18px
headline (the title, and the Job/Payout line, reusing `.step-desc`
rescaled) and one 14px body size for everything else, with `strong` labels
in `--warn` instead of the sitewide muted grey (`.mission-card p`'s higher
CSS specificity overrides `.faction-summary`'s own grey/13px styling
wherever it's nested inside a card) — per the todo: "only two font sizes...
no grey text on black background." Accepting a job moves `G.phase` off
`"briefing"` entirely, which drops the whole screen — the other card and
the Return-to-Street box go with it, nothing to discard by hand. Return to
Street sets `G.phase` back to `"hub"` without touching `G.board`, so the
same two jobs are still there next time.

**Abort Mission.** A new box (`renderAbortBox()`, game.js) appended under
the Steps and Encounter screens once no roll result is pending review — a
button that, once clicked, opens an Evasion roll (Stealth or Driving,
player's choice, `job.abortFlow` — the same shared Challenge UI as any other
roll, so every existing modifier — gear, Helpers, Wounded, BOOST, one-shots
— applies). `finishAbortMission()` resolves it: **10+** — a clean break, no
cost; **7-9** — one of {1 Harm box, a carried item damaged, an active Helper
wounded} (`applyAbortConsequence()`, picked at random from whichever are
actually available); **6-** — two draws from that same list, which can
repeat (two Harm boxes, an item destroyed via a second downgrade, a Helper
killed via a second wound) — per the todo: "you can take same twice." Every
path then forces the job to end as a Failure regardless of any steps
already completed: `runDebrief()` gained a `forceFailure` parameter that
skips the step-ratio calculation and lands straight on the same branch
`isDown(c)` already used, so the normal Reputation-loss/no-payout Failure
path (§20.9.2) applies unchanged.

---

### 20.17 INTERFACE UPDATE 2.4.2.2: Downtime polish — StreetDoc joins Lay Low, side-by-side rows, equal-height columns, EuroStoxx onto Factions

todo3.md's "INTERFACE UPDATE 2.4.2.2" section (rows 336-341) — five small
follow-up polish items on top of §20.16's rebuild, all cosmetic/layout, no
new mechanics.

**The Downtime window is as wide as the Journal above it.** `renderHub()`'s
outer card now carries a second class, `.card.downtime-window`, whose
`max-width: none` overrides `.card`'s own 640px cap (a same-specificity
override needs the compound selector — `.card`'s plain rule would otherwise
win on source order alone).

**"Medical" is "StreetDoc," and it's a Lay Low option now**, not a
standalone button above the Hub card. `renderRestOptions()` builds it as the
first button in its own row, alongside Coffin Hotel and Night on the
Street — same cost/healing logic as before (1 BOND/box, skipped by a
Permanent Injury), just relocated and renamed.

**Lay Low is two side-by-side rows** (`.laylow-row`, a `flex-wrap` div):
StreetDoc / Coffin Hotel / Night on the Street first, then — on their own
row underneath — one "Spend the Night with `<Amigue>`" button per Amigue and
"Rest at your Apartment" if one is owned. Either row can be empty (no
Amigue, no apartment) without leaving a visible gap.

**Shop/Workshop/Apartment/Street-Dojo stretch to equal height.**
`.downtime-columns` switched from `align-items: flex-start` to the flex
default `stretch`, so every column in a row matches the tallest one even
when its own content is much shorter (Apartment's one-line flavor text next
to Shop's full offer list, say) — "it looks better this way."

**EuroStoxx moves to the Factions panel**, rendered by `renderFactions()`
directly below the faction list (`els.factions.appendChild(renderStocksBox())`)
instead of sitting in the Downtime columns row. Unlike those columns —
which simply aren't in the DOM outside the Hub — the Factions panel renders
on every phase, so `renderStocksBox()` re-gains a small "closed for the
duration of the job" check (`G.phase !== "hub"`) to keep it Hub-only like
every other Downtime commerce panel.

---

### 20.18 INTERFACE UPDATE 2.4.3: centering, a compact Loadout, an "Other" gear tab, and Mission Board cards with the payout in the headline

todo3.md's "INTERFACE UPDATE 2.4.3" section (rows 343-350) — six more
polish items on the middle column, all cosmetic/layout, no new mechanics.

**Gear Up and the Mission Board are centered.** A new opt-in `.card.centered`
class (`margin-left/right: auto`) is applied to Gear Up's wrap and to the
Mission Board's header card and "Not Tonight"/Return-to-Street card; the
`.mission-row` holding the two mission cards gained `justify-content:
center`. Every other `.card` (Steps, Encounter, Checkpoint, Debrief, ...)
stays left-aligned as before — only the two screens the todo named move.

**A more compact Loadout.** Two bugs were quietly making Gear Up taller than
it needed to be: `.card label` (a leftover rule for the Character-creation
form) was out-specificity-ing `.offer`'s own `display: flex` on every
Loadout checkbox row — since a Loadout row is a `<label class="offer">`
inside a `.card` — forcing it to `display: block` with a 12px bottom margin,
which broke the checkbox/item-text alignment (todo3.md: "make sure the
selection box is aligned with the item") and added real height row after
row. A new `.card label.offer` rule (higher specificity by construction)
restores the flex row, tightens the row padding, and drops the stray
margin. Separately, each category's bare `<h4>` was falling back to the
browser's own sizable default margins (no rule targeted it); `.section h4 {
margin: 10px 0 4px; ... }` gives it the same tight spacing `.downtime-box
h4` already had, closing most of the category-to-items gap.

**"Find a Job" is the one real call-to-action.** A new `.btn-cta` class —
centered in the (now full-width, §20.17) Downtime window, ~20% larger
(16px/11px×18px vs. the base button's 13px/9px×14px), and colored `--warn`
(gold) instead of the sitewide teal — so it reads as the button that starts
the game, not one option among many.

**A 7th gear tab, "Other."** `GEAR_TABS` gained `"Other"`, and a new
`matchesGearTab(item, tab)` helper (game.js) replaces the three inline
`tab === "All" || gearCategory(item) === tab` checks (the sheet's Gear tabs,
and the Shop/Workshop offer lists, §20.16/§20.17) — `"Other"` matches
anything `gearCategory()` can't place (heal-gear), which previously only
ever showed up under "All."

**Mission cards: the payout moves into the headline, the description right
under it.** `renderBriefingCard()`'s `<h3>` is now `"Job N: X BONDS"` (or
the Special Mission name, `": X BONDS"`) — folding the old separate
"Payout:" line into the title, "only put the BONDS" per the todo — with the
job's type + flavor line (`.step-desc`, the card's other 18px headline text)
immediately under it. Employer/faction-summary/target/location/opposition
all follow in their previous order, just below the description instead of
above the Job/Payout line.

---

### 20.19 INTERFACE UPDATE 2.4.4: a horizontal Loadout, every post-Gear-Up window centered, a separate Abort Mission card, stackable BOOST checkboxes, and a Spend-the-Night navigation fix

todo3.md's "INTERFACE UPDATE 2.4.4" section (rows 352-358) — six more
polish items, continuing straight on from §20.18's centering/compactness
work. All cosmetic/layout except the BOOST checkbox change and the
Spend-the-Night fix, which are small interaction/navigation tweaks with no
new underlying game rule.

**The checkbox and the item text sit close together now.** A genuine bug,
not just a spacing preference: `.card label.offer`'s flex row (added in
§20.18) never overrode `.offer`'s own `justify-content: space-between`, so
every Loadout row's lone checkbox and item-name pair were being pushed to
opposite ends of the row — the widest possible gap, not the closest. Adding
`justify-content: flex-start` to that rule fixes it.

**"Align all Gear Up boxes horizontally."** The Loadout's category blocks
(Weapons/Clothing/Decks/Vehicles/Social, plus Heal) now sit in a wrapping
flex row (`.loadout-grid`, the same idiom as the Downtime columns) instead
of one long vertical stack — a further, larger cut to Gear Up's height on
top of §20.18's row/margin tightening.

**Every window from Gear Up onward is centered**, not just Gear Up and the
Mission Board (§20.18): Steps, Encounter, Checkpoint, and Debrief's `.card`
wraps all gained the `.centered` class. The Hub, Character creation, Win/
Loss/Death, and the Hunt screens are unaffected — the todo scoped this to
"windows after Gear Up phase... all mission windows."

**Abort Mission is its own card now**, not a `.section` nested inside the
mission's own card. `renderAbortBox()` builds a `.card.centered.abort-box`
and Steps/Encounter append it as a sibling in `#main` (`renderAbortBox(els.
main)`) instead of a child of the step's own wrap — same `margin-top: 14px`
separation as before, but now with its own border/background, reading as a
genuinely separate box ("slightly separated") rather than a subsection of
the mission window.

**BOOST spending is two independent, stackable checkboxes.** Superseding
§20.10 (BATCH 2.1 item 13)'s mutually-exclusive "Spend 1 BOOST for +1" /
"Spend 2 BOOST for +2" pair: `boostSpendOptionHtml()`/`wireBoostSpend()`
(game.js, shared by both roll UIs — `renderChallenge()` and
`renderHuntRoll()`) now render up to two identical, independent "+1 BOOST"
checkboxes; checking one spends 1, checking both spends 2 — "check as many
boxes as he wants boost" — instead of picking one fixed amount from a
choice of two.

**A successful Spend the Night returns to Downtime, not straight to the
Mission Board.** Every Rest action funnels through `processRestTick()`,
which ticks the clock, rerolls the Board, and — unless that tick triggers a
Hunt or the MULTI-CORP loss — leaves the player looking at the Mission
Board (`startJobSearch(true)` sets `G.phase = "briefing"`). `processRestTick()`
gained an optional `returnToHub` parameter: still ticks the clock and
rerolls the Board exactly as before, but then overrides `G.phase` back to
`"hub"` and re-renders. `finishBrotherNight()`'s clean-success ("10+")
branch is the only caller that passes it here — §20.20 adds `restAtApartment()`
as a second caller; Coffin Hotel, Night on the Street, and Spend the
Night's own Partial/Fail branches are unchanged.

---

### 20.20 INTERFACE UPDATE 2.5: Apartments rebuilt (STRIP/CITY/CORE), Archenemy actions in red, per-vehicle stocking, and an Apartment summary on the sheet

todo3.md's "INTERFACE UPDATE 2.5" section (rows 360-374) — the Apartments
system rebuilt around named stages and distinct Locations, red Archenemy
log lines, per-vehicle location tracking, an Apartment-Rest navigation fix
matching §20.19's Spend-the-Night one, and a new subtitle line.

**Apartments: STRIP/CITY/CORE tabs replace the dropdown.**
`DATA.apartments[tier]` (data.js) now carries a `stage` name and a `places`
array (several place-type choices) instead of one fixed `name` — Tier 2
STRIP ("The Room Above the Bar," "Backroom of a Noodle Shop"), Tier 3 CITY
("Garage," "Empty Warehouse," "Seedy Office"), Tier 4 CORE ("Glass Office,"
"Penthouse," "Nightclub Backroom"). `renderApartmentSection()` (game.js) is
rebuilt around a tab bar for every Tier the player's Reputation Tier has
actually unlocked (`G.apartmentTab`, ephemeral UI state, defaulting to the
highest one) — Tier 1 still shows only the unchanged Street Rat flavor
text, no tabs, "if nothing is available." Each place in the selected tab's
`places` list is paired with a distinct known Location by index
(`def.places.slice(0, known.length)` zipped against `Object.keys(c.locations)`)
— "choices should be from different LOCATIONs" — capped to however many
Locations are actually known, so a row is never offered for a place with no
Location left to put it in. Buying stores the chosen `place` name on
`character.apartment` (a new field, additive — old saves without it just
display the stage name instead) alongside the existing `location`/`tier`/
`security`. A tab below the player's own apartment Tier is marked "Already
have better" instead of offering a downgrade; the exact place+Location
already owned reads "Home" instead of a price. **Revision (§20.25)**:
`character.apartment` became `character.apartments`, an array — more than
one can be owned at once, one per Location.

**Archenemy actions log in red.** `addLog()` (state.js) now accepts an
optional third `tag` argument — the common case still just pushes a plain
string, but a tagged line pushes `{text, tag}` instead (`renderJournalBox()`,
game.js, reads either shape, adding a `log-<tag>` class). Every explicit
Archenemy call site passes `"archenemy"` by hand — `lockInArchenemy()`, the
Archenemy-clock friend-hit and Apartment-invasion events
(`resolveArchenemyClockEvent()`/`resolveApartmentInvasion()`), and a
relationship hitting -5 or a Bloodbrother turning hostile
(`nudgeRelationship()`, state.js) — but the entire Hunt narration flow
(~20 `addLog()` call sites across `startHunt()` through
`applyHuntKillReward()`) needed none of that: `addLog()` auto-tags a line
`"archenemy"` whenever `G.hunt` is truthy, which covers every Hunt line for
free since a Hunt is the only context those calls ever fire in. This one
`G.hunt` check is state.js's sole reach into game.js's UI-state global —
documented in the function's own comment as a deliberate, narrow exception
to the usual layering, safe because `G` always exists by the time `addLog()`
is actually called. `.log-line.log-archenemy { color: var(--danger); }` is
declared after `.log-new` in the stylesheet so red always wins the tie for
a line that's both new and Archenemy-tagged (confirmed as the intended
behavior by §20.21's "Archenemy actions always come with red and stay red").

**Revision (chat request) — EuroStoxx lines in blue.** Same tagged-`addLog()`
mechanism, a second explicit tag: every stock invest/sell-1/sell-all line
(`renderStocksBox()`, game.js) and every automatic gain/loss/wipe line
(`settleStockGains()`, `destroyFaction()`, state.js) now passes `"stocks"`
as `addLog()`'s third argument. `.log-line.log-stocks { color: var(--info);
}` (a new `--info: #4da6ff` root token, style.css) is declared after
`.log-new` the same way `.log-archenemy` is, so blue wins the same tie a
freshly-added EuroStoxx line would otherwise lose to yellow.

**Spend the Night at your own Apartment gets the same navigation fix as
Spend the Night with an Amigue (§20.19).** `restAtApartment()`'s call to
`processRestTick()` now passes `returnToHub: true` unconditionally (it has
no distinct success/fail tiers to gate on, unlike the Amigue roll) — still
ticks the clock and rerolls the Board, but lands back on Downtime instead
of the Mission Board.

**A new subtitle line.** `index.html`'s header `<span class="subtitle">`
gained a second sentence: "Your try to get off this dirt ball. Get 20
BONDS for the ticket." — appended verbatim after the existing "a job
runner's log — Europunk, European SuperState."

**Per-vehicle stocking.** Every Driving-attr gear item gets a lazy
`location` field (`vehicleLocation(item)`, state.js: `item.location ||
"Street"` — no backfill needed for old saves, same idiom as `item.tier ||
"Street"` elsewhere). The sheet's Gear list shows `[Street]` / `[<Apartment
Location>]` / `[Moving]` next to every vehicle, Driving-attr items only,
with a "Move to `<the other place>`" button (`data-move-vehicle`, only
rendered when an Apartment exists — otherwise there's nowhere else to move
it) that toggles the vehicle between Street and the Apartment's Location.
**Revision (§20.25)**: a `<select>` destination picker (Street plus every
owned Location but the vehicle's current one) replaces that toggle, now
that there can be more than one Apartment Location to move a vehicle to.
Heading out on a job (`renderGearUp()`'s "Head Out" button) stashes the
carried Vehicle's current location on `preMissionLocation` and sets
`location = "Moving"`; `runDebrief()` restores it (and deletes the stash
field) right after the Apartment raid check, regardless of whether the job
succeeded, failed, or ended via Abort Mission (`finishAbortMission()`
routes to `runDebrief()` too, so this one restore point covers every path
out of a job).

**An Apartment summary on the sheet, under Bonds.** A new section
(`renderSheet()`) shows "Street" when no Apartment is owned, or
`"<place> — <Location>"` with a ▼/▲ toggle (`G.apartmentSheetExpanded`,
ephemeral) that expands to show installed Security and which vehicles
(matched by `vehicleLocation(g) === c.apartment.location`) are currently
stocked there. Only one Apartment can exist at a time in the data model
(buying again replaces it, unchanged from §20.5), so this always
summarizes that one rather than branching on "more than one."
**Revision (§20.25)**: more than one Apartment can exist now — the summary
line becomes `"N apartments"` once it's more than one, and the expanded
view lists every one of them with its own Security/vehicles-here lines.

---

### 20.21 UPDATE 2.6: a two-line Helper layout, a true 3-column Loadout grid, scroll-to-top after every mission click, and a single BOOST label

todo3.md's "UPDATE 2.6" section (rows 376-381) — three layout fixes, a
line confirming the Archenemy-red behavior §20.20 already delivered, and a
follow-up trim to the BOOST-spend checkboxes.

**Gear Up's Helper rows are name-on-top, effect-below.** Every Helper-ish
row — already-brought, the "Hire backup" offer, and each "Call in a Favor"
candidate — now shares one `.helper-row` layout (`.helper-info`: a
`.helper-name`/`.helper-effect` two-line stack on the left; `.helper-actions`:
a `.helper-cost` + button on the right, `.offer`'s own `align-items: center`
keeping the button vertically centered against the now-two-line-tall text
block — "align buttons... from the middle"). `.helper-cost` shares a
`min-width`, so "1 BOND" / "Free" / "pays 1 BOND" line up in a column
regardless of which row they're on.

**The Loadout is a true CSS grid now, not flex-wrap.** `.loadout-grid`
switched from `display: flex; flex-wrap: wrap` (§20.19) to `display: grid;
grid-template-columns: repeat(3, 1fr)` (2 columns under 640px) — flex items
only ever aligned within their own row, so a category box on row 2 could
drift out from under its row-1 counterpart depending on each row's own
content widths; a fixed grid keeps every column aligned across rows no
matter how many boxes the last row actually has ("1st column to 1st
column, 2nd to 2nd, and 3rd as alone").

**Every render during a job scrolls back to the top.** `renderMain()`
resets both `els.main.scrollTop` and `window.scrollTo(0, 0)` whenever
`G.phase` is one of Gear Up/Steps/Encounter/Checkpoint/Debrief — since a
render in those phases only ever follows a real player action there (Roll,
Continue, Head Out, install Security, Abort, ...), this reliably fires
"after each mission click" without needing to touch every individual
handler, and keeps the Journal (top of `#main`) in view for whatever it
just logged.

**Archenemy red confirmed to persist, not just win new-line ties.** The
todo's wording ("always come with red and stay red... old text goes gray")
describes exactly what §20.20's CSS already does: `.log-line.log-archenemy`
applies unconditionally (not gated on `.log-new`), so a tagged line stays
red forever, long after it stops being the newest line and would otherwise
have faded to the default muted gray. No code changed for this bullet —
it's confirmation, not a new requirement.

**One "BOOST" label, not one per checkbox.** todo3.md row 381, a follow-up
to §20.19's stacking BOOST checkboxes: `boostSpendOptionHtml()` (game.js,
shared by `renderChallenge()` and `renderHuntRoll()`) used to repeat a
"+1 BOOST" label on each of its up-to-2 checkboxes; now it renders a single
`.boost-spend` block — one "BOOST" text label, with its 1-2 plain
checkboxes stacked vertically beside it (`.boost-check-stack`) instead of
alongside each one. `wireBoostSpend()` is unchanged — it already just
counts however many `.boost-check` inputs are checked, regardless of what
markup wraps them.

---

### 20.22 UPDATE 2.7: a Night-on-the-Street navigation fix, Tier-vs-Tier Adversary modifier, deterministic armor, and Debrief-time faction wars

todo3.md's "UPDATE 2.7" section (rows 383-387) — a fourth Rest-navigation
fix, a from-scratch replacement for the mission Challenge's Adversary
modifier, a rules change to armor, and the Power-struggle/faction-war check
running one more place.

**Night on the Street gets the same navigation fix as the other three Rest
options** (§20.19's Spend the Night, §20.20's Rest at your Apartment).
`finishNightOnStreet()`'s call to `processRestTick()` now passes
`returnToHub: true` — still ticks the clock and rerolls the Board, but
returns to the Downtime screen instead of dropping straight into the
Mission Board. All four Rest options now behave identically on this point;
only Coffin Hotel never had the problem (it was never phase-switching to
begin with).

**The Adversary Challenge modifier is now the character's own Reputation
Tier against the mission Target's faction Tier**, not a flat penalty
derived from the toughest Adversary rolled. `computeModifiers()` (game.js)
replaces the old `tierPenalty(job.mission.worstTier)` lookup with
`reputationTier(c) - factionStandings[job.mission.target.faction].tier` —
ahead of the Target's faction, a real bonus; behind it, a penalty; dead
even, no modifier at all. A Freelance or already-destroyed Target faction
has no tracked Tier to compare against and is skipped, same as every other
faction-Tier check in the game. This is scoped to Combat/Stealth rolls
only, matching what it replaces; it doesn't touch the Hunt's own separate
`tierPenalty(hunt.archenemy.tier)` modifier (a different system — the
Archenemy's fixed personal combat tier, not a faction comparison) or
`mission.worstTier`'s other job (mission difficulty scaling, engine.js,
untouched).

**Armor absorption is deterministic now: "as many damage can be blocked as
you have armor points."** `applyHarm()` (state.js) used to give carried
gear armor a 50% chance to fully absorb each hit; now a carried armor item
with any charge remaining *always* blocks — one point of "armor points"
per hit, exactly as many hits as it has charges for, then it breaks and
Harm marks normally again. The renamed `CYBER_ARMOR_ABSORB_CHANCE` constant
(was `ARMOR_ABSORB_CHANCE`) makes clear this determinism is gear-armor-only:
cybernetic (chrome) armor keeps its own flat 50% chance, since it's a
non-depleting resource with no finite "points" to make deterministic the
same way. Fixing the constant's rename surfaced a live bug in
`applyHuntHarm()` (the at-home Hunt's Tier-4-security charge pool) — it
still referenced the old `ARMOR_ABSORB_CHANCE` name, which no longer
existed anywhere and would have thrown on the very next at-home Hunt hit;
it's now deterministic too (the same "armor points" reasoning applies to
that charge pool as much as to carried gear).

**Faction Power struggles are checked at Debrief too, not just on a Rest
tick.** `runFactionPowerStruggles()` (§19.7, state.js) used to only run
from `processRestTick()`; `runDebrief()` now calls it as well, placed right
after the mission's own faction-standing effects and
`runFactionBackgroundMissions()` have both already landed — "check
corporate war possibility after mission and after faction attribute
changes has been counted." Any faction it destroys is still caught by the
existing MULTI-CORP check ("Return to the Street" → `nextHubPhase()`),
whichever of the two call sites triggered it.

---

### 20.23 UPDATE 2.8: wounded contacts locked out of jobs and Hunts, a Repair/Mod ceiling tied to Hacking, and Shop/EuroStoxx/alignment polish

todo3.md's "UPDATE 2.8" section (rows 389-397) — two wounded-exclusion
fixes, a UI alignment fix, two Shop/EuroStoxx additions, and a rebuilt
Repair mechanic gated by Hacking.

**A wounded Compi/Amigue can't be brought on a job or called into a
Hunt.** Neither of the two places that list them checked `.wounded`
before: `renderGearUp()`'s "Call in a Favor" eligibility filter gained
`&& !p.wounded`, and `renderHuntRoll()`'s Bloodbrother-assist row
(`amigues = c.contacts.filter(...)`) gained the same check — both already
had every other exclusion (archenemy, already brought, already used this
Hunt) but let a sidelined contact slip through.

**EuroStoxx gained a "Sell 1" button** next to the existing "Sell All,"
selling exactly one held share back for 1 BOND and leaving the rest.

**The Ally-Assist checkbox in a mission Challenge is aligned with the
helper's name**, reusing Gear Up's `.helper-row`/`.helper-info` layout
(§20.21) instead of a plain inline "Name: +2 to this roll" label — a
name/effect two-line stack on the left, the checkbox on the right, the
same treatment Gear Up's own Helper rows already got.

**The Shop always stocks 2 items from every Tier below the player's
own**, on top of the existing 2-at-your-own-Tier plus the 50%/20% chance
of one/two Tiers higher — `genShopOffers()` (engine.js) loops every Tier
from 1 up to (not including) the player's Reputation Tier and adds 2 offers
each, so cheaper gear never disappears from the shelves once a player has
outgrown it. A no-op for Tier 1 (nothing below Street Rat).

**Repair is capped at an item's original Tier — Hacking unlocks going
further as a Mod.** A new `ensureOriginalTier(item)` (state.js) lazily
locks in an item's Tier the first time either `degradeGearItem()` or the
Workshop looks at it — for anything untouched by both so far, its current
Tier already *is* the original one, so this is equivalent to stamping it
at purchase without needing to touch every gear-creation call site (old
saves get the same best-effort treatment: whatever Tier an already-damaged
item happens to be at the first time this runs is the only "original" the
game can still recover). `renderWorkshopBox()` computes each item's ceiling
as `original Tier + (Hacking ≥5 ? 2 : Hacking ≥3 ? 1 : 0)`, capped at
Legendary, and only offers a row while there's room under that ceiling — an
undamaged item with Hacking <3 gets no row at all (already at its cap).
The button reads "Repair" while restoring at or below the original Tier,
"Mod" once it would push past it; pricing is unchanged either way (the
next Tier's normal fresh-purchase price — "always pay the change").

---

### 20.24 UPDATE 2.9: wounded contacts recover in one tick — then back to two, counting jobs as ticks too

todo3.md's "UPDATE 2.9" section (row 400) — a single balance tweak.
`woundPerson()`'s `woundedRounds` (state.js, §20.15/§20.23) drops from 2 to
1: a wounded Compi/Amigue (sidelined from jobs and Hunts, §20.23) now clears
back to available after a single Rest tick instead of two.
`recoverWoundedContacts()`'s backfill default for any contact already
wounded before this change (`typeof p.woundedRounds !== "number"`) moved
from 2 to 1 to match.

**Follow-up (same-session chat request, not from todo3.md): back to 2
ticks, but a completed job now counts as one too.** `woundedRounds` (and
the backfill default) moved back to 2; `runDebrief()` (game.js) gained its
own call to `recoverWoundedContacts()`, right after
`runFactionBackgroundMissions()` — the same function `processRestTick()`
already called, now ticking down once per completed job as well as once
per Rest. A wounded Helper still clears in exactly 2 ticks, but those ticks
no longer have to be Rests specifically — two jobs run back-to-back with no
Rest in between heals them just as well as a Rest-then-job or job-then-Rest
pair does.

### 20.25 Owning several apartments at once (chat request)

Per chat request — "make it possible to own several apartments." Supersedes
§20.5/§20.20's "only one Apartment can exist at a time in the data model"
premise entirely: `character.apartments` (state.js) is now an array (was a
single `{...}`-or-`null`), at most one entry per Location — buying again at
a Location already owned upgrades that entry in place (unchanged precedent:
resets its Security), buying at a **different** Location adds a new entry
instead of replacing anything. `migrateCharacter()` wraps an old save's
single `apartment` in a 1-item array (or `[]` if it had none) and drops the
old field for good.

- **`renderApartmentSection()`** (the Shop's Apartment panel): the owned-
  summary + Security-install block now loops over every entry instead of
  rendering once; each Install button names its Location
  (`"Install X at Rive Nord"`) since there can be more than one to pick
  from. The buy/upgrade grid's "Home"/"Already have better"/"Upgrade" logic
  now only ever compares against what's owned **at that same Location**
  (`ownedAt(locName)`) — owning a Tier 4 place across town never blocks or
  relabels a fresh Tier 2 buy somewhere new. The log line on purchase reads
  "put down roots at" for a first apartment, "move up to" for a same-
  Location upgrade, or "add `<place>` in `<Location>` to your holdings" for
  an additional, different-Location purchase.
- **The sheet's Apartment summary**: "Street" with none owned, `"<place> —
  <Location>"` unchanged for exactly one, or `"N apartments"` for more —
  the expanded (▼/▲) view lists every one of them, each with its own
  Security/vehicles-here lines.
- **"Rest at your Apartment"** (Hub Lay Low row): one button per owned
  apartment now, each naming its own place and Location
  (`"Rest at Garage in Rive Nord (Free)"`), rather than a single unlabeled
  button. `restAtApartment(apartment)` takes the specific one clicked and
  stashes it on `G.homeApartment` (ephemeral, never persisted) right before
  `processRestTick(true, true)` — the one path that can pass `atHome: true`
  into `startHunt()` if this tick fills the Rest clock. `startHunt()` reads
  `G.homeApartment` for that one case and stores it on `G.hunt.homeApartment`
  so the rest of that Hunt (the Security→Combat modifier in
  `renderHuntRoll`, and the Tier-4-Security armor-charge pool) stays scoped
  to the specific apartment that was actually being defended, not "the"
  apartment.
- **Vehicle stocking** (the sheet's Gear list "Move to…" control, and the
  Apartment panel's "Vehicles here" line): a 2-way toggle button stopped
  making sense once there can be several apartment Locations to choose
  from — replaced with a `<select>` destination picker offering Street plus
  every owned Location except the vehicle's current one.
- **Archenemy home invasion** (§20.6, `resolveArchenemyClockEvent()`): "hits
  the Apartment" now picks one at random among every one owned
  (`pick(c.apartments)`) instead of always the single one; a "torched"
  outcome removes just that one entry (`c.apartments = c.apartments.filter
  (a => a !== apartment)`), leaving any others untouched. Every log line in
  `resolveApartmentInvasion()` now names which place/Location was hit.
- **The EurCop/SwissGuard Apartment raid** (§20.7, `resolveApartmentRaid()`):
  now only fires if the player owns an apartment **at the just-finished
  job's own Location** specifically — "the heat traces back home" only
  means anything if home is actually there — with no fallback to a random
  other apartment elsewhere that was never near that job. A player who owns
  apartments only in other cities is safe from any given job's raid check.

---

## 21. UPDATE 3.0: Archenemy shop ambushes, key-challenge missions, and Class Abilities

`todo3.md` rows 402-420 ("UPDATE 3.0", "ARCHENEMY", "MISSIONS", "CHARACTER
CLASS ABILITY"). Three independent additions layered on top of everything
above; where a rule here narrows or replaces an earlier one (§10.1's fixed
step sequences, §16's Debrief ratio calc, §20.6's home-invasion friend
pool), this section is canonical.

### 21.1 Archenemy: no hitting a job's own Helpers, and Tier-3+ Downtime ambushes

Two additions to the Archenemy system (§7.3, §13, §20.6):

- **Helpers are off-limits for the home-invasion "hit a friend" event**
  (`resolveArchenemyClockEvent()`, game.js, §20.6): it now takes the
  just-finished `job` as a second argument and excludes every contact who
  rode along as one of that job's Helpers (`job.helpers`) from the eligible
  "friend" pool — they were out on the job with the player, not an easy
  mark left alone at home. No change to the Apartment-invasion branch or
  to the pick odds otherwise.
- **Downtime ambushes** (`maybeArchenemyAmbush()`, game.js): once the
  player reaches Reputation Tier 3 (§19.1) and has a live, tagged Archenemy
  (`character.archenemyId`), every click of the Shop's "Buy," the
  Workshop's "Repair"/"Mod," or the Street-Dojo's "Train" button first
  rolls a flat 20% chance of the Archenemy having tracked them down there.
  If it fires, an ambient Social check runs (`2d6 + Social rank + best
  owned Social gear + cyberware`, no job/Helper modifiers — there's no job
  in progress): 7+ ("you clock it in time and keep your head down") lets
  the purchase go through exactly as normal, nothing spent yet beyond the
  roll; ≤6 aborts the purchase entirely (no BONDS/BOOST spent, nothing
  bought) and drops straight into a Hunt (`startHuntAmbush()`) — flavored
  as a shootout breaking out in the shop/workshop/street-dojo, opening
  directly on the Hunt's `combat` stage (no separate "notice" roll of its
  own; the Social check above already served that purpose) rather than
  `startHunt()`'s usual `notice` stage or `startHuntManual()`'s `track`
  stage.

**Bug fix (chat request: "why doesn't the Archenemy attack during shopping
at Tier 3/4") — a stale `archenemyId` after the locked-in Archenemy died.**
`character.archenemyId` used to be set exactly once per Rest-clock cycle
(`lockInArchenemy()`, only called when `restCount` ticks to 1) and never
touched again. Killing that specific Archenemy through anything other than
the Rest-clock's own forced Hunt — a player-initiated Hunt
(`startHuntManual()`), or them simply turning up as an ordinary mission's
Assassination target — left `archenemyId` pointing at a person no longer
in `character.contacts` (moved to the graveyard). Every mechanic keyed off
it went dormant as a result: `maybeArchenemyAmbush()`'s `!archenemy` check
above always failed, the Rest-clock's own forced Hunt silently no-op'd
back to Hub (`startHunt()`'s own dead-Archenemy safety net), and the
Tier-3+ home-invasion check (§20.6) had nothing to invade with. The gap
was bounded but could span a full Rest-clock cycle (up to 4 more Rests) or
longer for a player who mostly just runs jobs without resting — easily
read as "the ambush doesn't work at all." `killPerson()` (state.js) now
re-locks a fresh Archenemy immediately (`lockInArchenemy(character)`)
whenever the person being killed is the one `character.archenemyId`
currently points to, the same call the clock's own first tick makes.
(Separately: a character who has genuinely never Rested even once still
has `archenemyId: null` and sees no ambushes at all — that half is
original, intentional design, §12.4's "the Rest clock's first tick locks
one in," not a bug.)

### 21.2 Mission key challenges (supersedes §16's flat step-ratio Debrief calc)

`determineMissionOutcome()` (game.js) replaces the old one-size-fits-all
"score/max step ratio, thresholds 0.85/0.4" Debrief calculation (§16) with
a rule specific to each mission type — "there is a key challenge or two in
each mission; if these challenges succeed, the mission succeeds." `isDown`/
Abort-Mission `forceFailure` still short-circuit to Failure ahead of every
type rule, exactly as before. `MISSION_SEQUENCES` (engine.js) tags the
relevant step(s) per type; `finalizeStep()` copies the tag onto the pushed
`job.stepResults` entry (`keyChallenge`) rather than relying on array
position, since a forced step (the Transport-ambush or "Caught!" insert,
§10.2) spliced in right after a tagged step would otherwise shift indices:

- **Assassination**: the Combat/Hacking "Take out the target" step is
  tagged `keyChallenge`. Its own tier alone decides the mission — Fail is a
  Failure, Partial *or* Full is a success ("even partial is success
  considering mission result"), independent of how the Approach or Escape
  steps went. The Stealth "Approach the target undetected" step is tagged
  `alertOnFail` instead (see below). Every non-Failure kill risks leaving a
  fresh Archenemy behind — see the **Revision** just below, which replaced
  the original Partial-only trigger.

  **Revision (chat request) — "successful Assassination always creates
  archenemy, unless is done full stealth, not heat addition way."**
  Supersedes the original "only on a Partial key challenge" trigger above.
  Both the Approach and Escape steps also carry `stealthCritical: true`
  (`MISSION_SEQUENCES`, engine.js), copied onto their `job.stepResults`
  entries the same way `keyChallenge` is. At Debrief, on any non-Failure
  outcome, `job.stepResults.filter(r => r.stealthCritical)` must be
  non-empty and *every* one of those entries must read `{attr: "Stealth",
  tier: "full"}` for the job to count as "full stealth" — a swapped
  attribute (Escape taken via Driving, or either step swapped through
  NETRUNNER/WICKED/GEARHEAD) or anything short of a Full roll on either
  step disqualifies it, deliberately independent of Location Heat (unlike
  "Shadow of `<Location>`," §19.1, which *is* Heat-gated — "not heat
  addition way"). Anything less than full stealth calls
  `spawnArchenemyRelative()` (state.js, renamed from
  `spawnArchenemySibling()`): a new contact sharing the dead target's
  faction, relationship -3, `tagArchenemy()`'d on the spot — distinct from
  every other Archenemy trigger in §7.3 (the Rest clock, a
  botched-and-spotted hit, the relationship floor, a turned Amigue). The
  accusation names a random relation (`ARCHENEMY_RELATIVE_WORDS`: lover,
  brother, sister, father, mother) and logs as a direct quote —
  `"<target> was my <relation>!" cries <name> — and they swear vengeance.`
  — tagged `"archenemy"` so it renders in red (`.log-archenemy`, style.css)
  like every other Archenemy log line.
- **Heist**: the Stealth "Grab the target" step is tagged `keyChallenge`
  the same way — Fail is a Failure, Partial/Full a success (a Partial still
  applies its own normal fallout cost, unchanged). The Hacking/Stealth
  "Breach the security" step is tagged `alertOnFail`.
- **`alertOnFail` chaining** (Assassination's Approach, Heist's Breach): a
  Partial there hands the *very next* main-sequence step a flat **-1**
  modifier ("Alerted"); a Fail hands **-2** ("Code RED"). Stored as
  `job.pendingStepPenalty = {stepIndex, value, label}` targeting
  `job.stepIndex + 1` at the moment it's set; `computeModifiers()` shows it
  as a chip only while `job.stepIndex` still matches that target, so it
  self-expires the moment that next step resolves — no explicit clearing
  needed, and a forced step inserted in between doesn't consume it early
  (the forced step isn't the one the penalty's `stepIndex` was aimed at).
- **Transport**: both main-sequence steps ("Run the transit route,"
  "Get past a checkpoint," tagged `targetDamage`) chip away at the
  transported person/cargo's health — a Fail deals 2, a Partial deals 1,
  tallied on `job.mission.targetDamage` (initialized 0 by `genMission()`
  for this type only). A forced Transport-ambush step isn't tagged, so it
  never adds damage on top. At Debrief: 0 damage taken is a Full Success, 1
  or 2 is a Partial Success, 3+ means the target died in transit — a
  Failure (feeding into §16's existing "Failure kills the Transport target"
  handling unchanged).
- **Delay**: reaching Location Heat 5 during any step ends the job
  immediately as a Failure ("If Heat gets to 5, the mission is over and a
  failure") — checked in `finalizeStep()` right after the existing `isDown`
  early-return, routing straight to `runDebrief(true)` the same way Down
  does. Since §19.9's per-attribute fallout table sometimes picks a
  non-Heat alternative on a Social/Stealth Partial/Fail (Appendix F's
  weighted "or lose equipment" branch), `finalizeStep()` tops Heat up to
  the guaranteed **+1 Partial / +2 Fail** if the roll's own fallout didn't
  already raise it that much ("if it doesn't already do so") — measured
  against a snapshot of Heat taken before that step's fallout resolved, and
  restricted to when the roll actually used Social or Stealth (a rare
  forced Combat sub-step from a Delay's own Stealth-Fail branch doesn't
  double up on top of Combat's own unconditional +1 Heat, §19.9). Short of
  Heat 5, Delay still falls back to the old step-ratio calc (§16) for
  Full-vs-Partial — UPDATE 3.0 specifies nothing further for that case.
- **Hold**: "as long as character survives the mission is success" — with
  `isDown` already ruled out by the shared early check, every Hold job that
  reaches Debrief is an unconditional Full Success, regardless of how any
  individual wave went (no more step-ratio Partial-or-worse outcome for
  this type).

### 21.3 Character Class Abilities — one free use per job, per Profession

"Each Character class has a special ability that is available once in a
mission." `job.classAbility = {gearheadUsed, samuraiUsed, freeHireUsed,
hackerSwapUsed, wraithUsed, wickedUsed}` (all `false`,
`buildJobFromCandidate()`) tracks each per job, so every new job refreshes
all six regardless of whether the last one used them. Four of the six key
off `character.profession` — every one of the four Professions (§4.1's
table, including Jockey) has exactly one; the three Turfs have none. The
other two, **WRAITH** and **WICKED**, are earned instead of
profession-gated — see their own entries below, after Solo's.

**Revision (chat request, same session as §21.1-21.2)**: GEARHEAD originally
shipped keyed to the Nomad **Turf** rather than a Profession — inconsistent
with every other ability here, and with "each Character *class*" in the
todo's own heading. It was moved onto a brand-new 4th Profession, **Jockey**
(Driving/Combat boosts, starting gear a Roadhouse Revolver and a Steel
Jackal motorcycle, §4.1), and every `c.turf === "Nomad"` gate that used to
read it became `c.profession === "Jockey"`. The Nomad Turf itself is
unchanged otherwise — it still grants +Driving, 2 BONDS, and a starting
Kombi Wagon (§4.1's Turfs table); it just no longer carries a Class Ability
of its own. `job.nomadVehicleSnapshot` was renamed `job.jockeyVehicleSnapshot`
to match.

**Balance pass (chat request)**: a "check the four Professions for balance"
review found Solo's guaranteed auto-success clearly ahead of Jockey's/
Hacker's probabilistic swaps, which in turn were ahead of Rocker's — whose
ability is pure economy (no protection, no success-guarantee, no swap) and
who was also the only Profession starting with just one item instead of
two. Two starting-gear fixes landed from that review (§4.1's table): Hacker's
2nd item changed from "Patchwork ICE Program" (a 2nd *permanent* Hacking
item — functionally redundant with the Bootleg Deck, since `bestGearBonus()`
only ever counts the single best item per attr) to "Burner ICE Breaker," a
one-shot (reusing `DATA.oneShotGear`'s existing Professional-tier entry,
priced in at Street-tier bonus like any other starting item) — a genuinely
distinct 2nd mechanic instead of an inert spare; and Rocker gained a 2nd
item it never had, "Back-Alley Barter Chip" (Social). Every Profession now
starts with exactly 2 items covering 2 distinct mechanics. The Class
Ability power gap itself (Solo > Jockey/Hacker > Rocker) was flagged
but left untouched pending a decision on which direction to take it.

**Follow-up (same session)**: `computeDefaultCarry()` (§20.8, state.js)
only carries the single best item *per category*, so Hacker's two Decks
items tied for that one slot and the one-shot (0 tie-break priority behind
whichever item happens to iterate first) started **uncarried** — invisible
until the player spent a spare Loadout slot on it manually, unlike every
other Profession's second item, which lands in its own category and gets
its free slot automatically. `defaultCharacter()` now force-carries every
one-shot (`1S`-tagged) item right after `computeDefaultCarry()` runs, in
addition to whatever it already picked, not instead of it — scoped to
character creation only, not `computeDefaultCarry()` itself (which
`migrateCharacter()` also calls for old saves), so it can't retroactively
carry a pile of shop-bought one-shots on an existing character. A starting
one-shot is now available from the very first Gear Up, same as everyone
else's second item.

- **Jockey — GEARHEAD**: two effects, one passive and permanent for the
  whole job, one a limited-use swap.
  - *"They never lose their vehicle... it can be damaged (or destroyed) by
    effect but it always returns to him after mission."* On Gear Up's
    "Head Out" click, a Jockey's currently-carried Driving-attr item is
    snapshotted (`job.jockeyVehicleSnapshot = {name, tier, tags,
    preMissionLocation}`) before the normal "vehicle goes Moving"
    handling (§20.20/INTERFACE 2.5). At Debrief, right after that same
    Moving-location restore, `runDebrief()` reconciles the snapshot against
    whatever the job's own fallout did to it: if no Driving-attr item with
    that name remains (`loseVehicle`, §19.9, removed it outright), it's
    pushed back onto `character.gear` at its original name/Tier/tags,
    carried, returned to wherever it was stocked before the job; if it's
    merely downgraded (`degradeGearItem` on a Driving item), its Tier is
    restored. A Jockey effectively can't lose their one signature ride to
    mission fallout — only ever inconvenienced by it mid-job.
  - *"They can also change one Combat check to a Driving check"* — once
    per job, only while `!job.classAbility.gearheadUsed` and the character
    actually carries a vehicle (`ownsGearForAttr(c, "Driving")`). **Revision
    (chat request) — placement**: originally rendered as its own separate
    top-level box next to "Roll Combat" (reusing `renderChallenge()`'s
    per-attr loop via an injected extra entry); moved into a nested
    `.swap-option` sub-section *inside* the Combat box it substitutes for
    — "so the mechanic is evident to the player." `renderRollOption(parent,
    attr, step, job, holder, c, swapMeta)` (game.js) is the shared
    block-builder both the step's own real roll and this substitute now go
    through: called once per box with `swapMeta: null` for the real attr
    (its wrapper gets class `.roll-option`) and, if eligible, again with
    `swapMeta: {label, onUse}` to append the swap as a `.swap-option`
    sub-section in the same box, headed `"GEARHEAD — Roll Driving instead
    (rank N)"` in `--warn` (amber); the parent box also picks up a
    `has-swap` class. **Revision (further chat request) — side by side**:
    `.challenge.has-swap` (style.css) lays `.roll-option`/`.swap-option`
    out as two flex columns divided by a vertical dashed line, rather than
    stacked with a horizontal one, above 640px — "place this on the
    right-hand side of the box, not below" — dropping back to stacked
    (`flex-direction: column`, the divider flipping to horizontal) under
    640px, the same breakpoint the rest of the layout already collapses at.
    Same full roll-block UI either way (mods, BOOST, Ally Assist, one-shot
    checkboxes). Clicking the swap's Roll button calls `swapMeta.onUse()`
    — which sets `job.classAbility.gearheadUsed = true` and logs it —
    right before resolving; picking the box's real "Roll Combat" option
    instead never touches the flag.
- **Hacker — NETRUNNER** (chat request, same session): the same
  never-lose-it/limited-swap shape as Jockey's GEARHEAD, mirrored onto
  Hacking instead of Driving.
  - *"Never lose the deck — similarly like GEARHEAD vehicle."*
    `job.hackerDeckSnapshot = {name, tier, tags}` is taken on "Head Out"
    for a Hacker's currently-carried Hacking-attr item (no location to
    track — decks don't move between an Apartment and "Street" the way a
    Vehicle does); `runDebrief()` reconciles it the same way, right after
    the Jockey vehicle check — pushing the item back if it's gone, restoring
    its Tier if it's merely downgraded.
  - *"Change one stealth or combat check to hacking"* — once per job,
    while `!job.classAbility.hackerSwapUsed` and the character carries a
    deck (`ownsGearForAttr(c, "Hacking")`). **Revision (chat request) —
    placement**: same `renderRollOption()` nested-`.swap-option` side-by-side
    treatment as Jockey's GEARHEAD swap above, headed `"NETRUNNER — Roll
    Hacking instead (rank N)"`. Since NETRUNNER can substitute for *either*
    Combat or Stealth, a step offering both (e.g. Hold: `Combat alt
    Stealth`) embeds it in **both** boxes — clicking either resolves the
    same underlying Hacking roll and spends the same once-per-job flag, so
    whichever the player clicks first is the one that counts.
- **Rocker — NATURAL LEADER**: *"they get a one free Hire for a mission."*
  `renderGearUp()`'s "Hire backup for this job" row costs 0 BONDS instead
  of 1 the first time a Rocker uses it per job (`freeHire = c.profession
  === "Rocker" && !job.classAbility.freeHireUsed`, labeled "Free (Natural
  Leader)" in place of the usual "1 BOND"); clicking it sets
  `job.classAbility.freeHireUsed = true` instead of spending BONDS. Every
  Hire after the first (or every Hire for anyone else) is unaffected.
- **Solo — STREET SAMURAI**: *"they can choose to have one auto success in
  combat challenge. Once a mission."* A dedicated "STREET SAMURAI:
  Auto-Success" button appears alongside the normal "Roll Combat" button on
  any Combat challenge block, for a Solo with `!job.classAbility
  .samuraiUsed`. Clicking it sets the flag and synthesizes a result
  without calling `resolve()` at all — no dice, no modifiers — feeding
  straight into the same `renderResultBlock()`/Continue flow any genuinely
  rolled result would.
  **Balance pass (chat request)**: originally synthesized a guaranteed Full
  (`{tier: "full", total: 12, ...}`) — the strongest of the four Class
  Abilities, since it was a *free*, *unconditional*, *downside-free*
  guarantee, usable on any Combat roll including a mission's key challenge
  (§21.2). Softened to a guaranteed **Partial** instead (`{tier: "partial",
  total: 8, ...}`): still an unconditional "success" (still wins a Combat
  key challenge outright, §21.2), but now runs through `applyOutcome()`'s
  normal Partial fallout too — a real chance of Harm, gear damage, or a
  wounded Helper, same as an actually-rolled 7-9 — no BOOST-for-a-Full at
  Debrief, and the mission's own payout multiplier lands at Partial Success
  (0.6x) rather than Full (1x) if this was the deciding roll.
- **WRAITH** (chat request, same session) — the odd one out: not gated by
  `character.profession` like the four above, but **earned**. A 2nd
  "Shadow of `<Location>`" (§19.1's own revision note) sets
  `character.wraith = true` instead of stacking a 3rd title, unlocking this
  ability permanently from then on, on whatever Profession/Turf the
  character already has. *"Change one combat in mission to Stealth. Same
  way as GEARHEAD."* — once per job, `wraithEligible` (`c.wraith &&
  !job.classAbility.wraithUsed && rawAttrs.includes("Combat") &&
  !rawAttrs.includes("Stealth")`, no gear prerequisite — it's an earned
  trait, not equipment) offers `"WRAITH — Roll Stealth instead"` as a
  `.swap-option` inside the Combat box, identical placement/UI to Jockey's
  GEARHEAD swap (§21.3, right above). Clicking it sets
  `job.classAbility.wraithUsed = true`.
- **WICKED** (chat request, same session) — WRAITH's mirror: earned off a
  2nd "Killer of `<name>`" (§13.8/§19.1's own revision note,
  `applyHuntKillReward()`) instead of a 2nd Shadow, setting
  `character.wicked = true` the same permanent, profession-independent way.
  *"Change Stealth to Combat once in a mission"* — `wickedEligible`
  (`c.wicked && !job.classAbility.wickedUsed && rawAttrs.includes("Stealth")
  && !rawAttrs.includes("Combat")` — the exact reverse of `wraithEligible`'s
  condition, no gear prerequisite either) offers `"WICKED — Roll Combat
  instead"` as a `.swap-option` inside the **Stealth** box instead of the
  Combat one. Clicking it sets `job.classAbility.wickedUsed = true`. Since
  WRAITH only ever attaches to a Combat box and WICKED only ever to a
  Stealth box, the two can never compete for the same box even on a
  character who's earned both — each still renders as its own single swap
  unless it happens to land alongside NETRUNNER (which can attach to
  either box), in which case the swap picker below applies.

**Two-or-more swaps on the same box — the swap picker (chat request)**:
since WRAITH/WICKED are earned independently of Profession, a character
can now own two swaps contending for the same box at once: a Combat box
gets GEARHEAD+WRAITH (Jockey) or NETRUNNER+WRAITH (Hacker); a Stealth box
gets NETRUNNER+WICKED (Hacker) — the two profession-gated swaps
(GEARHEAD/NETRUNNER) can never coexist on one character, since Professions
are mutually exclusive, and WRAITH/WICKED themselves never compete with
each other since one only ever attaches to Combat and the other only ever
to Stealth. "If you have both wraith and other ability that can change a
combat roll, make them buttons" — `renderChallenge()` collects every
eligible swap for a box into one array first: exactly one renders exactly
as described above (fully expanded, side by side, unchanged); two or more
instead collapse into a `.swap-picker` — a compact column of small toggle
buttons, one per ability, next to the real roll — and none of their full
`renderRollOption()` panels render at all until a button is clicked.
Clicking a swap's button either reveals its panel (mods/BOOST/Ally-Assist/
one-shot checkboxes plus its own "Roll X" confirm button — "you get the
details and can then click the roll confirmation") if nothing else is
showing, hides it again on a second click of that same button ("second
click hides the details"), or — if a different ability's panel is
currently showing — switches straight to the new one without needing to
close the first ("you can click directly to other feature and get
details"). `G.expandedSwap` (ephemeral UI state, never persisted — the
same idiom as `G.shopTab`/`G.gearTab`/`G.peopleTab`) tracks which ability's
key, if any, is currently expanded; a full `render()` rebuild follows every
click, same as any other action in this codebase (§1's rendering model).

**Listed on the sheet (chat request)**: `renderSheet()` (game.js) shows
every Class Ability the character currently has — the one Profession-gated
one plus WRAITH/WICKED if earned, `classFeaturesFor(c)` — as small pill
chips directly under the Attributes section, one job-scoped `used` flag
each but shown regardless of whether this job's copy has already been
spent (the ability itself, not its per-job availability). Each chip's
plain `title="..."` attribute (`CLASS_FEATURE_DESC`) gives a one-line
description on hover via the browser's native tooltip — no JS needed for
the hover itself, just the attribute.

**Resets when you move away from the window (chat request)**: an expanded
swap-picker panel (GEARHEAD/NETRUNNER/WRAITH/WICKED alike) used to carry
`G.expandedSwap` forward across a step/Encounter/Checkpoint change — a
label could stay "expanded" onto a box it no longer belonged to, or an
unrelated ability sharing the same key could render pre-expanded on the
next box by coincidence. `G.expandedSwap = null` now runs at every point a
Challenge roll's result gets finalized and control is about to move
on — `finalizeChallengeCommon()` (Steps/Encounters), `finishCheckpointRoll()`
and `finishCheckpointCombat()` (Checkpoint) — plus a broader safety net in
`render()` itself: whenever `G.phase` differs from the last render
(`G.lastRenderedPhase`, ephemeral), it resets too, catching anything those
three didn't (Abort Mission, a Hunt/Debrief "Return to the Street" button,
Win/Loss). Never reset merely by re-rendering the *same* box (checking a
BOOST box, for instance) — only an actual move to a new context clears it.

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
