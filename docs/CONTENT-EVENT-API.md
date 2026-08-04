# COPE Story Event Content API

Version: 1
Audience: DeepSeek and other content-maintenance agents
Repository: COPE CS Career Simulator

This document is the source of truth for editing, adding, and validating career story events. Read this document together with `AGENTS.md`. Story content is data. Do not put event titles, descriptions, option labels, result messages, salary offers, buyout amounts, or release narratives into TypeScript or UI code.

## 1. Non-Negotiable Rules

1. One event is one UTF-8 JSON file under `assets/story/events/`.
2. Event IDs are globally unique and use `kebab-case`.
3. Every event file must be registered in `assets/story/manifest.json`.
4. Every event must belong to an existing worldline. The event ID must also appear in that worldline JSON file.
5. Never invent condition or effect types. Use only the enums in this document and the TypeScript contracts in `src/engine/condition.ts`, `src/engine/graph.ts`, and `src/engine/contract.ts`.
6. Do not edit `src/engine`, `src/hltv`, `app.js`, or UI code merely to add or rewrite story content.
7. Do not use JavaScript execution, expressions, templates, `eval`, or callbacks inside JSON. JSON contains data only.
8. Every option must have both success and failure message arrays. An empty failure branch is valid, but `failureMessages` must still exist.
9. Every `nextEventId` must point to an existing event in the same worldline.
10. Do not claim that a feature is implemented if the current TypeScript contracts do not support it.

## 2. File Layout

```text
assets/story/
  manifest.json
  worldlines/
    worldline_rookie.json
    worldline_prodigy.json
    worldline_grinder.json
    worldline_comeback.json
    worldline_matchfixing.json
  events/
    one-event-id.json
```

The browser story reader loads the event filenames from `manifest.json`. The filesystem reader scans JSON files in the events directory. Keep both registration styles consistent: always update the manifest, and update the matching worldline `eventIds` list.

## 3. Event JSON Contract

Minimal valid event:

```json
{
  "id": "free-agent-example",
  "title": "经纪人来电",
  "description": "经纪人带来一份需要你评估的试训机会。",
  "worldlineId": "rookie",
  "type": "CHOICE",
  "period": "OFFSEASON",
  "conditions": [],
  "options": [
    {
      "id": "take-trial",
      "label": "参加试训",
      "requirements": [],
      "successChance": {
        "baseChance": 0.65,
        "modifiers": []
      },
      "outcome": {
        "successEffects": [],
        "failureEffects": [],
        "successMessages": ["你获得了下一轮试训名额。"],
        "failureMessages": ["试训没有通过，暂时没有新报价。"]
      }
    }
  ],
  "autoEffects": [],
  "phase": "POST_TOURNAMENT",
  "weight": 1,
  "priority": 50
}
```

Fields:

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `id` | string | yes | Unique kebab-case ID. Must equal the filename without `.json`. |
| `title` | string | yes | Event title shown by UI. Chinese content belongs here, not in code. |
| `description` | string | yes | Situation and context. Use concrete CS professional details. |
| `worldlineId` | string | yes | Existing worldline ID. |
| `type` | `CHOICE` or `MANDATORY` | yes | Current UI supports option selection; use `CHOICE` unless the engine path explicitly supports mandatory handling. |
| `period` | enum | yes | Scheduling window. |
| `conditions` | array | yes | Event-level eligibility conditions. Empty array means no event-level condition. |
| `options` | array | yes | At least one option. |
| `autoEffects` | array | yes | Effects applied with the selected outcome. Usually `[]`. |
| `phase` | enum | recommended | `PRE_TOURNAMENT`, `IN_TOURNAMENT`, or `POST_TOURNAMENT`. |
| `weight` | number | recommended | Positive relative selection weight. Use `0` to disable selection. |
| `priority` | number | recommended | Higher priority is selected before lower priority. Current assets use `0..100`. |
| `repeatable` | boolean | optional | Allows the event to appear again. Use only for deliberately repeatable events. |
| `allowedModes` | array | optional | `HARDCORE` and/or `POWER_FANTASY`. |

### Period values

- `NORMAL`: ordinary career flow.
- `TRANSFER_WINDOW`: transfer negotiation and offer events.
- `OFFSEASON`: contract reviews, release decisions, free-agent planning.
- `AFTER_TOP20`: post-ranking and annual report events.
- `FINAL_DECISIVE_MOMENT`: live tournament decision events.

### Phase values

`phase` is not the same as `period`. Never write `"phase": "NORMAL"` or `"phase": "OFFSEASON"`.

- `PRE_TOURNAMENT`
- `IN_TOURNAMENT`
- `POST_TOURNAMENT`

## 4. Option Contract

```json
{
  "id": "accept-contract",
  "label": "接受低薪首发合同",
  "requirements": [
    { "type": "FREE_AGENCY", "expected": true }
  ],
  "successChance": {
    "baseChance": 1,
    "modifiers": []
  },
  "outcome": {
    "successEffects": [
      {
        "type": "TEAM_TRANSFER",
        "teamId": "rareatom",
        "salaryPerMonth": 700,
        "buyoutAmount": 1800
      }
    ],
    "failureEffects": [],
    "successMessages": ["新合同已创建，你重新获得正式队伍和赛事资格。"],
    "failureMessages": ["合同条款没有完成签署。"],
    "successNextEventId": "next-event-id",
    "failureNextEventId": "fallback-event-id"
  }
}
```

Rules:

- `id` is unique within the event.
- `label` is the complete user-facing action. Do not rely on UI code to add missing semantics.
- `requirements` must use known conditions.
- `successChance.baseChance` is between `0` and `1`.
- `modifiers` use player attributes and are additive. Keep modifiers small and explainable.
- `successEffects` and `failureEffects` are arrays, even when empty.
- `successMessages` and `failureMessages` are arrays. Use one or more concrete messages.
- `successNextEventId` and `failureNextEventId` are optional, but must reference an existing event in the same worldline when present.

## 5. Condition API

All conditions are evaluated by `ConditionEvaluatorImpl`. Unknown or missing domain facts fail closed. Use `ALL`, `ANY`, and `NONE` to avoid one-variable instant punishments.

### Attribute conditions

```json
{ "type": "ATTRIBUTE", "attribute": "CONSISTENCY", "minimum": 60 }
```

Attributes:

- `AIM`
- `GAME_SENSE`
- `LEADERSHIP`
- `CLUTCH`
- `CONSISTENCY`
- `TEAM_CONFLICT`

`TEAM_CONFLICT` is adverse: higher is worse.

### Player stat conditions

```json
{ "type": "PLAYER_STAT", "stat": "STRESS", "minimum": 70 }
```

Stats:

- `MORALE`
- `ENERGY`
- `BALANCE`
- `STRESS`
- `RATING2`

### Other basic conditions

```json
{ "type": "AGE", "minimum": 30 }
{ "type": "TEAM", "teamId": "rareatom" }
{ "type": "WORLDLINE", "worldlineId": "rookie" }
{ "type": "COMPLETED_EVENT", "eventId": "previous-event" }
{ "type": "TOP20_RANK", "maximum": 20 }
{ "type": "GAME_MODE", "modes": ["HARDCORE"] }
{ "type": "RANDOM", "chance": 0.35 }
{ "type": "FLAG", "flagId": "TRIAL_PASSED", "expected": true }
```

### Career lifecycle conditions

```json
{ "type": "ACTIVE_CONTRACT", "expected": true }
{ "type": "FREE_AGENCY", "expected": true }
{ "type": "TEAM_VRS_RANK", "maximum": 80 }
{ "type": "RATING_STREAK", "minimum": 2 }
{ "type": "ADVANCED_MAPS", "minimum": 3 }
```

Meaning:

- `ACTIVE_CONTRACT`: the player has an active contract in the current save.
- `FREE_AGENCY`: the player has no current team or has `freeAgencyStatus: FREE_AGENT`.
- `TEAM_VRS_RANK`: current team snapshot rank. Missing rank fails the condition.
- `RATING_STREAK`: consecutive archived tournament ratings below `1.0`, counted from the latest archive backward.
- `ADVANCED_MAPS`: archived maps from `T1` and `MAJOR` tournaments.

### Composite conditions

```json
{
  "type": "ALL",
  "conditions": [
    { "type": "ACTIVE_CONTRACT", "expected": true },
    {
      "type": "ANY",
      "conditions": [
        { "type": "RATING_STREAK", "minimum": 2 },
        { "type": "PLAYER_STAT", "stat": "MORALE", "maximum": 30 }
      ]
    }
  ]
}
```

Use `ALL` for durable multi-factor decisions. Use `ANY` when several independent warning signs can lead to the same soft intervention. Use `NONE` sparingly.

Every condition supports optional:

```json
{ "negate": true }
```

Do not use `target` unless the current evaluator supports the selected target for that condition.

## 6. Effect API

### Attribute change

```json
{ "type": "ATTRIBUTE_CHANGE", "attribute": "CONSISTENCY", "delta": 2 }
```

Attributes are clamped by the engine to `0..100`.

### Player stat change

```json
{ "type": "PLAYER_STAT_CHANGE", "stat": "STRESS", "delta": 8 }
```

`MORALE`, `ENERGY`, and `STRESS` are clamped to `0..100`. `BALANCE` and career `RATING2` are not clamped by this effect.

### Team transfer and contract creation

```json
{
  "type": "TEAM_TRANSFER",
  "teamId": "gamerlegion",
  "salaryPerMonth": 750,
  "endsAt": "2028-01-01T00:00:00.000Z",
  "buyoutAmount": 2200
}
```

Use a real team ID from `assets/teams/teams.json` or the existing transfer target asset. Current contract aggregation does the following:

- closes the previous active contract as `EXPIRED` during normal transfer;
- creates one new `ACTIVE` contract;
- updates `currentTeamId` and `currentContractId`;
- marks the player as `SIGNED`;
- keeps career `teamHistory` behavior in the existing profile flow.

Do not use a random team ID. Do not omit salary for a signing event unless a zero salary is intentionally part of the content.

`endsAt` is optional in the current effect contract. If omitted, the runtime creates a default two-year end date from the current clock.

### Force contract termination

```json
{
  "type": "FORCE_CONTRACT_TERMINATION",
  "requirements": [
    { "type": "ACTIVE_CONTRACT", "expected": true }
  ],
  "reason": "TEAM_DECISION",
  "note": "阵容重组释放合同名额"
}
```

Allowed `reason` values in this effect:

- `EVENT_DECISION`
- `ATTRIBUTE_THRESHOLD`
- `TEAM_DECISION`
- `MUTUAL_AGREEMENT`

Runtime behavior:

- active contract becomes `TERMINATED`;
- termination stores `reason`, `terminatedAt`, source event ID, source option ID, matched conditions, and `note`;
- `currentTeamId` becomes `null`;
- `currentContractId` becomes `null`;
- player enters `FREE_AGENT` state;
- previous team history and tournament archive remain intact.

Important current limitation: the current event-effect path uses `FORCE_CONTRACT_TERMINATION` for contract-end/non-renewal story content as well. Do not claim that an event creates `EXPIRED` status unless the engine contract has been explicitly extended for a separate expiry operation.

### Role change

```json
{ "type": "ROLE_CHANGE", "role": "SUPPORT" }
```

Roles:

- `IGL`
- `AWPER`
- `ENTRY_FRAGGER`
- `SUPPORT`
- `LURKER`

### Flags

Add:

```json
{
  "type": "FLAG_ADD",
  "flagId": "TRIAL_PASSED",
  "flag": {
    "id": "TRIAL_PASSED",
    "name": "试训通过",
    "category": "CAREER"
  }
}
```

Remove:

```json
{ "type": "FLAG_REMOVE", "flagId": "TRIAL_PASSED" }
```

Flag categories:

- `MENTAL`
- `ACHIEVEMENT`
- `EVENT`
- `CAREER`
- `CUSTOM`

### Worldline change

```json
{ "type": "WORLDLINE_CHANGE", "worldlineId": "comeback" }
```

The target worldline must exist in `assets/story/worldlines/`.

### Career statistics and trophies

```json
{ "type": "CAREER_STAT_CHANGE", "stat": "MAPS_PLAYED", "delta": 3 }
{ "type": "TROPHY_CHANGE", "trophy": "MVP", "delta": 1 }
```

Career stats:

- `TOTAL_KILLS`
- `MAPS_PLAYED`
- `CLUTCH_WON`
- `CAREER_EARNINGS`

Trophies:

- `MAJOR`
- `S_TIER`
- `MVP`
- `EVP`

### Tournament intervention

```json
{
  "type": "TOURNAMENT_INTERVENTION",
  "editionId": "edition-id",
  "interventionType": "TEAM_STRENGTH",
  "delta": 5,
  "opponentTeamId": null,
  "forceUpset": null,
  "description": "赛事前心理准备改善团队执行"
}
```

Only use an `interventionType` that exists in `src/hltv/tournament.ts`. The description is content and belongs in JSON. This effect requires a tournament gateway at runtime.

## 7. Contract and Free-Agent Content Patterns

### Existing player with contract

Use:

```json
{
  "type": "ALL",
  "conditions": [
    { "type": "ACTIVE_CONTRACT", "expected": true },
    { "type": "TEAM_VRS_RANK", "maximum": 100 }
  ]
}
```

Appropriate events:

- performance warning
- bench or demotion
- renewal review
- transfer negotiation
- roster rebuild
- release meeting

Do not make one low rating immediately terminate a contract. Use streaks, archive size, morale, conflict, age, or contract context.

### Free agent

Use:

```json
{
  "type": "ALL",
  "conditions": [
    { "type": "FREE_AGENCY", "expected": true },
    { "type": "PLAYER_STAT", "stat": "BALANCE", "maximum": 300 }
  ]
}
```

Appropriate events:

- agent meeting
- public tryout
- T2/T3 trial
- no offers
- economic pressure
- short contract
- return to former team
- reject offer
- coaching/analysis transition warning

A free-agent signing must use `TEAM_TRANSFER`. The player is not automatically added to a team without an event outcome.

### Transfer offer realism

Use team IDs and salary values from the existing transfer target assets. Do not make every player eligible for top teams. Combine:

- `ATTRIBUTE`
- `TEAM_VRS_RANK`
- `RATING_STREAK`
- `AGE`
- `TEAM_CONFLICT`
- `FREE_AGENCY`
- `TOP20_RANK`

## 8. Content Writing Guidelines

Good event descriptions mention real operational details:

- coach review
- analyst report
- scrim samples
- map pool
- VRS rank
- roster slot
- buyout clause
- club budget
- role competition
- public qualifier
- agent call
- community pressure
- travel and event exposure

Avoid vague outcome copy such as:

- “局面被你拿下”
- “局势已经落定”
- “你成为传奇”
- “你直接加入豪门”

An outcome message should state the concrete state consequence:

- contract created or closed
- salary changed
- team role changed
- trial passed or failed
- balance decreased
- morale or stress changed
- free-agent status retained or ended
- next event scheduled

## 9. Registration Procedure

When adding or renaming an event:

1. Create or rename `assets/story/events/<id>.json`.
2. Set JSON `id` to the same `<id>`.
3. Add `<id>.json` to `assets/story/manifest.json` under `events`.
4. Add `<id>` to the matching worldline JSON `eventIds` array.
5. Check every `successNextEventId` and `failureNextEventId`.
6. Check every `worldlineId` and `WORLDLINE_CHANGE.worldlineId`.
7. Check every `TEAM_TRANSFER.teamId` against existing team/transfer assets.
8. Check every condition and effect type against this document.
9. Run the event-pack tests.
10. Run the full unit test and build commands before reporting completion.

For content-only work, do not modify TypeScript. If a desired rule cannot be expressed with the existing condition/effect contract, stop and report an interface gap instead of inventing JSON fields.

## 10. Validation Commands

From repository root:

```bash
npm run test:unit
npm run build
npm run test:e2e
```

The event-pack test is:

```bash
npx vitest run tests/unit/story-pack.test.ts
```

Expected validation includes:

- every event parses as JSON;
- every event has required StoryEvent fields;
- every event has at least one option;
- every option has a label and outcome;
- every worldline reference exists;
- every worldline event reference exists;
- every next-event reference exists in the same worldline;
- new professional-lifecycle event IDs are registered;
- phase values are valid;
- no undefined condition/effect type is used.

## 11. DeepSeek Editing Prompt

Use this instruction when asking DeepSeek to edit story content:

> Read `AGENTS.md` and `docs/CONTENT-EVENT-API.md` completely before editing. Work only on JSON story assets unless an interface gap is proven. For each new or changed event, validate the StoryEvent shape, use only documented condition/effect types, keep all Chinese content in JSON, update `assets/story/manifest.json` and the matching worldline JSON, and verify all next-event/team/worldline references. Do not invent fields, APIs, team IDs, or contract statuses. After editing, run `npx vitest run tests/unit/story-pack.test.ts`, `npm run test:unit`, and `npm run build`. Report changed files, event IDs, behavior, test results, and any unsupported requirement.

## 12. Current Capability Boundary

Implemented and safe to use in content:

- JSON event packs and manifest loading
- worldline registration
- event conditions and composite conditions
- player attributes and stats
- active-contract and free-agent gating
- rating streak and advanced map facts
- VRS rank gating
- team transfer contract creation
- normal transfer contract closure
- forced contract termination and free-agent entry
- result messages and next-event links
- role, flag, trophy, career-stat, and tournament intervention effects

Not safe to assume without a code change:

- automatic contract expiration based only on date
- a separate `EXPIRED` event effect
- roster-slot occupancy simulation
- dynamic offer generation directly from a story JSON file
- automatic public tournament scheduling for free agents
- coach/analyst/streamer career state beyond existing player job fields
- termination of a contract through UI code
- arbitrary new condition or effect types

When a content request needs one of the unsupported capabilities, report the gap using:

```text
[Architecture Contract Gap]
Requested capability:
Existing contract:
Why JSON-only content cannot express it:
Minimal interface extension:
Affected callers:
Backward-compatible save strategy:
Required tests:
```
