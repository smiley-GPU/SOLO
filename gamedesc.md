# SOLO — Design Doc

A single-player, browser-based (HTML + JavaScript) cyberpunk "job runner" game.
Procedurally generated missions ("Jobs"), a small dice-resolution engine, and a
persistent character who builds Rep and Cred over repeated runs. Played like a
solo journaling game: the app generates the fiction (people, places, jobs),
the player narrates/decides, dice resolve outcomes.

Save state: `localStorage` (character sheet, Cred, Rep, Heat per Location,
Contacts, Gear). No backend required for v1.

---

## 1. Character

- **Name**
- **Profession** — starting skill bias, starting Gear, one Signature Move
  - **Solo**: +Combat, +Stealth. Starts with a weapon and armor.
  - **Hacker**: +Hacking, +Social. Starts with a Deck (hacking gear) and one Program.
  - **Rocker**: +Social, +Driving. Starts with a vehicle and a Crew contact.
- **Background / Turf** — starting Contacts, starting Faction standing, home Location
  - **Nomad**: starts with a vehicle + Nomad Family contact. +Driving.
  - **Corpo**: starts with Cred + a Corp contact (favor owed either way). +Hacking or +Social.
  - **Street**: starts with a Gang contact + local Rep. +Stealth or +Combat.
- **Rep** — reputation tracks, 0–5 each, raised by completing Jobs in that style.
  Represents *how* you're known to operate; grants a signature bonus and
  fictional leverage (fear/respect), not raw combat skill.
  - **Gun**: 0-5
  - **Knife**: 0-5
  - **Car**: 0-5
  - *Bonus*: when an action fits your highest Rep's style (e.g. shooting your
    way out with Gun Rep 3+), add +1 to that roll. At Rep 5 unlock a
    Signature Move (see §3.4).
- **Attributes** (skills used to resolve Challenges), 1–3 at creation, cap 5:
  - Combat, Driving, Hacking, Social, Stealth
  - Start at 1, Profession gives +1 to two, Turf gives +1 to one (may stack, cap 3 at creation).
- **Health**: 3 boxes (Hurt/Wounded/Down). Harm marks a box; Down = Job fails, forced retreat, possible Cred/Rep loss.
- **Cred**: starting 200. Currency for Gear Up phase, bribes, medical.
- **Gear**: list of items (weapons, armor, deck, programs, vehicle). Each Job's
  Gear Up phase can add/consume items.
- **Contacts** (the "People" pool): list of {Name, Faction, Relationship,
  Favor owed (+/-)}. Seeded from Turf; every Employer, mission Target,
  Adversary, and Hireling you ever cross paths with lands here too — this is
  the game's whole recurring cast, not just friendly names. See §5 for how
  roles are cast from it.

---

## 2. Core Mechanic

**Roll 2d6 + Attribute (+1 Rep bonus if applicable) vs a Challenge.**

| Total | Result |
|---|---|
| 10+ | **Full success.** You get what you wanted. |
| 7–9 | **Partial success.** You get it, but pick 1 from the Complication table for that Challenge type (cost, exposure, harm, or Heat). |
| 6−  | **Fail.** Roll on the Fallout table for that Challenge type — Harm, lost Gear, Heat spike, or the Job goes sideways (jump to a worse branch). |

- Every Job step is one Challenge roll (occasionally two in sequence).
- Difficulty is expressed as a **penalty/bonus to the roll**, not a variable
  target number, so the 2d6 table above never changes:
  - Adversary/Guard tier: weak −0, tough −1, elite −2 (subtract from roll).
  - Location Heat 4–5: −1 to any Combat/Stealth roll (authorities are twitchy).
  - Good prep in Gear Up (right tool for the job): +1.
  - Outnumbered / no plan: −1.

---

## 3. The Job — Phases

### 3.1 Mission Briefing
- Generate **Employer** (Person/Faction, §5) and **Mission** (§4: type + fields).
- Player may **accept**, or **reroll once** at a small Cred/Rep cost (word gets around you're picky).
- Employer states payout (Cred) and any bonus (Rep, Gear, favor) up front.

### 3.2 Gear Up / Hire Phase
- Spend Cred at a generated Fixer's stock (3 random items rolled from Gear
  tables, price scaled to item tier).
- Optionally hire a **Hireling** (a rolled NPC, costs Cred, adds +1 to one
  Challenge type for this Job, can take Harm instead of you once).
- Choices here set the +1/−1 prep modifiers used during the Job (right tool
  for the mission type = +1 on the matching Challenge).

### 3.3 Random Encounter (pre-Job, optional)
- Chance = Location's **Heat** rating × 10% per phase.
- If triggered: generate an Adversary/Faction patrol (§5) at the Location; one
  Challenge roll (usually Stealth or Social to avoid, Combat to push through)
  before the Job proper continues. Failure can cost Health/Gear/Cred but does
  not cancel the Job.

### 3.4 Mission Start
- Resolve the mission type's **Challenge sequence** (see §4 — each mission
  type lists 2–4 ordered Challenges, e.g. Stealth in → Combat/Hacking at
  target → Driving/Stealth out).
- Each step: one 2d6+Attribute roll, apply result per §2.
- **Signature Move** (unlocked at Rep 5 in a track) may be spent once per Job
  to auto-upgrade a Fail to a Partial, or a Partial to a Full success.

### 3.5 Random Encounter (post-Job, optional)
- Same as 3.3, using the Location's Heat as raised by the Job (fights/Hacking
  alarms/Heist noise raise Heat for the rest of this Job).

### 3.6 Mission De-briefing
- Return to Employer's Location (or a designated drop point).
- Resolve payout: full Cred/Rep/favor on success, partial (and a complication
  from Employer, e.g. reduced pay, a future favor demanded) on partial chains,
  none plus possible Employer relationship hit on failure.
- Update: Cred, Rep (per §1), Contacts (Employer relationship shifts),
  Location Heat (decays by 1 per Job cycle if not visited/triggered again).

---

## 4. Mission

Each Job rolls one **Type**, then fills its fields from the Person/Location
tables (§5/§6). The **Challenge sequence** is the default order of Challenge
rolls during Mission Start (3.4); the app can let harder tiers add a step.

- **Assassination** — kill or take out a Target.
  - Target: Person (§5) | Location | Guards/Adversaries (1–3 rolled Adversaries)
  - Sequence: *Stealth* (approach) → *Combat or Hacking* (neutralize, hacker
    route = disable security instead of kill) → *Stealth or Driving* (escape)
- **Heist** — steal an Item or extract a Person.
  - Target: Item or Person | Location | Guards/Adversaries
  - Sequence: *Hacking or Stealth* (breach) → *Stealth* (grab) → *Driving*
    (getaway)
- **Transport** — move an Item or Person between two Locations.
  - Target: Item or Person | Location From | Location To | Vehicle
  - Sequence: *Driving* (transit, roll per leg or per checkpoint) → optional
    *Social* (talk past a checkpoint) or *Combat* (ambush) depending on route Heat
- **Delay** — stall a Person or Item at/in a Location for a Time period.
  - Target: Person or Item | Location | Time period (Short/Medium/Long =
    1/2/3 Challenge rolls) | Adversaries
  - Sequence: repeat *Social, Stealth, or Combat* (player's choice of
    approach) once per Time unit; each Fail shortens the delay achieved.
- **Hold** — defend/occupy a Location, Item, or Person for a Time period.
  - Target: Location or Item or Person | in a Location | Time
  - Sequence: repeat *Combat or Stealth* once per Time unit (waves of
    Adversaries scale with Location Heat); a Fail costs Health or the Hold breaks early.

---

## 5. Person / Adversary (generator)

- **Name**: rolled from a Name table (First × Surname/Handle, split by Turf/Faction flavor).
- **Faction or Freelance**: rolled from the active Faction list, or "Freelance" (no faction bonuses/allies).
- **Profession**: Fixer, Corp Exec, Ganger, Nomad, Netrunner, Solo, Media, Cop, Civilian…
- **Relationship network**: if Faction, add 1–2 linked Contacts/Adversaries
  from the same Faction (influences future Employer/Adversary rolls and how
  a Job's outcome ripples — hurting one member shifts standing with the whole Faction).
- **Threat tier** (Adversary only): Weak / Tough / Elite — sets the Challenge
  roll penalty in §2 and, for Combat, how many Health boxes it takes to drop them.

**Recurring cast.** Every Employer, mission Target, Adversary, and Hireling
is drawn from the same pool (§1 Contacts) instead of always being a fresh
name. **8 times out of 10**, a role is filled by reusing an existing pooled
person instead of generating a new one; the rest of the time (or if the pool
has no eligible candidate yet) a new person is generated and added to the
pool. Which pooled people are eligible for a role follows their
**relationship**: negative relationship casts them into opposition roles
(Adversary, Assassination Target); zero-or-positive casts them into
cooperative roles (Employer, Hireling, and Targets for every other mission
type). A newly-generated person starts at relationship 0 (cooperative roles)
or slightly negative (opposition roles), and drifts from there — Combat
against an Adversary deepens the grudge, a Job's outcome nudges its Employer,
Hireling, and (for Transport/Hold) its Target.

Outcomes can retire people for good: a successful Assassination kills its
Target, and a failed Transport or Hold kills the person who was being
moved/protected. Dead people move to the **Graveyard** and are never drawn
again.

## 6. Location

- **Name**: generated (district/venue name table, flavored by Area).
- **Area**: Rural / Urban / Corpo — biases which Factions/Adversary types and
  Mission types are more likely to roll here (Corpo → Heist/Assassination
  vs. security; Rural/Nomad turf → Transport/Delay; Urban/Street → all types, higher Encounter odds).
- **Faction**: optional controlling Faction (affects who you owe/anger).
- **Heat**: 0–5. How much fighting/hacking noise draws authority attention here.
  - Drives Random Encounter chance (§3.3/3.5) and the Combat/Stealth roll
    penalty at Heat 4–5.
  - Rises by 1 per Combat/failed-Stealth/failed-Hacking roll during a Job at
    that Location (session-scoped); persists between Jobs but decays by 1 per
    Job cycle where nothing happens there.

---

## 7. Challenges (resolution reference)

Five Challenge types, each mapped to an Attribute and its own Complication/Fallout flavor:

| Challenge | Attribute | Partial (7-9) complication | Fail (6-) fallout |
|---|---|---|---|
| Combat | Combat | Take 1 Harm, or burn ammo/Gear | Take 1 Harm, Heat +1 |
| Driving | Driving | Vehicle damaged, or a worse route | Crash: 1 Harm + Gear (vehicle) damaged |
| Hacking | Hacking | Alarm partially tripped: Heat +1 | Trace: Heat +2, Program/Deck damaged |
| Social | Social | Get it, but owe a favor | Rebuffed: Contact relationship −1 |
| Stealth | Stealth | Spotted but not IDed: Heat +1 | Caught: forced into a Combat or Social roll now |

Each app screen for a Challenge shows: Attribute + modifiers (Rep bonus,
prep bonus, Adversary tier penalty, Heat penalty), the 2d6 roll, and the
resulting branch text pulled from the table above.

---

## 8. Progression & Economy

- **Rep** rises by 1 in the matching track (Gun/Knife/Car — mapped from which
  Attribute/approach carried the Job's key roll) whenever a Job is completed
  with at least one Full success using that style. Caps at 5; at 5 unlock the
  track's Signature Move.
- **Attributes** rise by spending Cred+Rep at "downtime" between Jobs (cost
  scales with new rank), cap 5.
- **Cred** earned from Job payouts, spent on Gear Up, Hirelings, Attribute
  training, medical (clear Health boxes).
- **Gear tiers**: Street (cheap, −0), Professional (mid, +0 baseline, meets
  most Jobs), Military/Black-market (expensive, +1 prep bonus, raises Heat if seen).

---

## 9. App Architecture Notes (HTML + JS)

- **State machine** driving the UI, one screen per phase: `Briefing → GearUp
  → (Encounter) → MissionSteps[] → (Encounter) → Debrief → (loop)`.
- **Data-driven tables**: all generator content (Names, Factions, Locations,
  Gear, Adversary templates, Complication/Fallout text) live as JS
  arrays/JSON, not hardcoded in logic, so content is easy to extend.
- **Character sheet + world state** (Cred, Rep, Attributes, Health, Gear,
  Contacts, per-Location Heat) persisted to `localStorage`, loaded on start.
- **Roll engine**: single `resolve(attributeRank, modifiers[])` function
  returning `{roll, total, tier: 'full'|'partial'|'fail'}`; every Challenge
  screen calls it and renders the matching table row from §7.
- **Journaling log**: append a text line per generated element and per roll
  result to a scrollable log, so a full Job reads back as a short story;
  exportable as text.
