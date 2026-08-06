# COPE 事件包创作指南（Wiki / API Docs）

> 面向玩家与社区创作者。读完本文，你就能写出一份可以被游戏加载的事件 JSON。
> 所有内容均为数据文件，**不修改任何代码**；引擎会自动扫描加载。
> 提交前请通读「校验与提交流程」一节，本地自测可极大加快审核。

---

## 1. 总览：事件包是什么

游戏的故事由三种「事件」组成，全部以 JSON 存放，引擎启动时加载：

| 类型 | 含义 | 示例 |
|---|---|---|
| 主线事件 | 归属于某条世界线（worldline），构成该线的命运弧 | `lone-hero-debut` |
| 支线事件 | 归属 `shared`，由 FLAG 驱动，任何玩家获得对应标记后触发 | `health-checkup` |
| 日常事件 | 归属 `shared`，赛季中随机填充 | `cyber-cafe-hero-budget` 等 |

**一条世界线 = 一个 `worldlines/*.json`**；**一个事件 = 一个 `events/*.json`**。
所有事件文件名必须在 `manifest.json` 中登记，引擎才会加载它。

### 目录结构

```
assets/story/
├── manifest.json            # 清单：登记所有事件与世界线文件（必改）
├── worldlines/
│   └── worldline_<id>.json  # 世界线定义
├── events/
│   └── <event-id>.json      # 事件定义（一个文件一个事件）
└── DESIGN.md                # 官方叙事设计蓝本（创作前先读）
```

---

## 2. 文件格式约定（硬性要求）

- UTF-8 编码，`\n` 换行结尾，**2 空格缩进**
- 顶层字段必须与下文 schema 一一对应
- 事件 ID 全局唯一，使用 `kebab-case`（如 `rival-rematch`）
- **禁止**在 JSON 中写可执行逻辑（无函数、无 eval）；引擎只读取数据
- 数值缺省、条件缺省时引擎会优雅降级，但推荐写全

---

## 3. 世界线文件（worldlines）

```json
{
  "id": "lone-hero",
  "name": "极致的孤勇者",
  "description": "拥有统治级枪法，却在"自己爆种但队伍输球"的折磨中寻找出路。",
  "startEventId": "lone-hero-debut",
  "eventIds": [
    "lone-hero-debut",
    "lone-hero-anger",
    "lone-hero-cost",
    "lone-hero-finale"
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 世界线 ID，`kebab-case`，全局唯一 |
| `name` | string | ✅ | 展示名 |
| `description` | string | 可选 | 一句话介绍 |
| `startEventId` | string | ✅ | 开局进入该线时第一个展示的事件 ID |
| `eventIds` | string[] | ✅ | 该线全部事件 ID（含 startEventId） |

> 文件名推荐 `worldline_<id>.json`。新建世界线 = 新建文件 + 在 `manifest.json.worldlines` 登记。

---

## 4. 事件文件（events）——完整 Schema

### 4.0 事件调度：你的事件何时出现、如何被选中（重要）

引擎按以下顺序为每个流程窗口寻找事件（`findCareerEvent`），**命中即停**：

1. **强制系统事件**：触发规则（`trigger-rules.json`）生成的 `pendingSystemEvents` 中 `period` 匹配的事件（如"合同到期"）。
2. **事务事件**：存在待处理转会报价时，`system:true` 且 `consumesTransferOffer:true` 的事件（用于转会确认）。
3. **当前故事线事件**：存档中 `currentStoryEventId` 指向的事件（主线推进）。
4. **同阶段候选事件**：先取 `priority` 最高的一档形成候选池，池内按 `weight` 加权随机抽取（`weight` ≤ 0 视为不可抽取，缺省 1）。

**配额与间隔（balance 配置 `narrative`）**
- 非 `system` 事件每赛季最多出现 `maxEventsPerSeason` 个（当前 2）。
- 两次剧情事件之间至少间隔 `minimumTournamentGap` 场赛事（当前 1）。
- `system:true` 事件豁免以上配额。

**去重语义**
- `repeatable:true`：同赛季内不重复出现（引擎记录 `{eventId, season}`）。
- 非 repeatable（默认）：整个生涯只触发一次。

**窗口 → period 映射**（决定事件在哪个 UI 窗口出现）

| window | 实际查询的 period |
|---|---|
| SEASON_START / PRE_TOURNAMENT / POST_TOURNAMENT | `NORMAL` |
| SEASON_END | `FINAL_DECISIVE_MOMENT` |
| REPORT | `AFTER_TOP20` |
| TRANSFER_WINDOW | `TRANSFER_WINDOW` |
| OFFSEASON | `OFFSEASON` |

**phase 推导**（未显式写 `phase` 时）：`FINAL_DECISIVE_MOMENT` → `IN_TOURNAMENT`；`AFTER_TOP20` / `OFFSEASON` / `TRANSFER_WINDOW` → `POST_TOURNAMENT`；其余 → `PRE_TOURNAMENT`。

> 创作要点：想让事件"一定出现"用 `system:true`（豁免配额）；想让事件"优先出现"调高 `priority`；想让候选池内分布可控用 `weight`；想整生涯只播一次就别设 `repeatable`。

### 4.1 顶层字段

```json
{
  "id": "rival-rematch",
  "worldlineId": "shared",
  "title": "宿敌再遇",
  "description": "大赛半决赛，你和他隔网对视——他进步了。",
  "period": "FINAL_DECISIVE_MOMENT",
  "phase": "IN_TOURNAMENT",
  "type": "CHOICE",
  "system": false,
  "repeatable": false,
  "priority": 50,
  "weight": 1,
  "allowedModes": ["HARDCORE", "POWER_FANTASY"],
  "consumesTransferOffer": false,
  "conditions": [],
  "options": [],
  "autoEffects": []
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 事件 ID，`kebab-case`，全局唯一；文件名须与之一致 |
| `worldlineId` | string | ✅ | 归属世界线；支线/日常用 `"shared"` |
| `title` | string | ✅ | 事件标题 |
| `description` | string | ✅ | 情境描述（玩家看到的正文） |
| `period` | string | ✅ | 触发周期，见 §4.2 |
| `phase` | string | 可选 | 赛事阶段，见 §4.3；缺省由 period 推导 |
| `type` | string | ✅ | `"CHOICE"`（有选项）或 `"MANDATORY"`（自动发生） |
| `system` | boolean | 可选 | `true` = 系统事务事件，不受每赛季剧情配额限制（如合同到期） |
| `repeatable` | boolean | 可选 | `true` = 可跨赛季重复出现（默认 false 只触发一次） |
| `priority` | number | 可选 | 同窗口候选事件的抽取优先级，越大越优先；默认 50 |
| `weight` | number | 可选 | 同优先级下相对出现权重；非正数视为不可抽取 |
| `allowedModes` | string[] | 可选 | 限定模式：`HARDCORE` / `POWER_FANTASY` |
| `consumesTransferOffer` | boolean | 可选 | 决策完成时消费当前待处理转会报价（用于转会确认事件） |
| `conditions` | array | ✅ | 事件触发条件，见 §5；可为 `[]` |
| `options` | array | ✅ | 选项列表，见 §6；`MANDATORY` 事件可为 `[]` |
| `autoEffects` | array | ✅ | 进入事件即生效的效果，见 §7；可为 `[]` |

### 4.2 period（触发周期）枚举

| 值 | 含义 |
|---|---|
| `NORMAL` | 赛季常规阶段 |
| `FINAL_DECISIVE_MOMENT` | 决赛决定时刻（大结局前） |
| `TRANSFER_WINDOW` | 转会窗 |
| `OFFSEASON` | 休赛期 |
| `AFTER_TOP20` | 年度 TOP20 公布后 |

### 4.3 phase（赛事阶段）枚举（可选）

`PRE_TOURNAMENT`（赛前） / `IN_TOURNAMENT`（赛中） / `POST_TOURNAMENT`（赛后）

---

## 5. 条件（conditions / requirements）

每个条件是一个对象，通用字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | string | 条件类型，见下表 |
| `negate` | boolean | 可选，`true` = 取反 |
| `target` | string | 可选：`PLAYER` / `CURRENT_TEAM` / `OPPONENT_TEAM`，默认 `PLAYER` |

数值类条件用 `minimum` / `maximum`（含端点）限定区间。

| type | 专属字段 | 说明 | 示例 |
|---|---|---|---|
| `ATTRIBUTE` | `attribute` + 区间 | 属性：`AIM`/`GAME_SENSE`/`LEADERSHIP`/`CLUTCH`/`CONSISTENCY`/`TEAM_CONFLICT` | `{"type":"ATTRIBUTE","attribute":"AIM","minimum":80}` |
| `PLAYER_STAT` | `stat` + 区间 | 状态：`MORALE`/`ENERGY`/`BALANCE`/`STRESS`/`RATING2` | `{"type":"PLAYER_STAT","stat":"ENERGY","maximum":45}` |
| `NARRATIVE_METRIC` | `metric` + 区间 | 剧情指标：`FAME`/`TEAM_STATUS`/`TEAM_RELATIONSHIP`/`FORM`/`CLUB_FAVOR`/`FAN_REPUTATION`（`MENTALITY`=士气、`BALANCE`=存款） | `{"type":"NARRATIVE_METRIC","metric":"FAME","minimum":45}` |
| `AGE` | 区间 | 年龄 | `{"type":"AGE","minimum":19}` |
| `PLAYER_ORIGIN_REGION` | `regions` | 出生地区：`EUROPE`/`AMERICAS`/`ASIA`/`OCEANIA`/`MIDDLE_EAST`/`AFRICA` | `{"type":"PLAYER_ORIGIN_REGION","regions":["ASIA"]}` |
| `PLAYER_ROLE` | `roles` | 位置：`IGL`/`AWPER`/`ENTRY_FRAGGER`/`SUPPORT`/`LURKER` | `{"type":"PLAYER_ROLE","roles":["IGL","AWPER"]}` |
| `FLAG` | `flagId` + `expected` | 是否持有某 FLAG | `{"type":"FLAG","flagId":"rivalry","expected":true}` |
| `TEAM` | `teamId` | 当前效力某队（真实队伍 ID） | `{"type":"TEAM","teamId":"vitality"}` |
| `WORLDLINE` | `worldlineId` | 当前世界线 | `{"type":"WORLDLINE","worldlineId":"crownless-king"}` |
| `COMPLETED_EVENT` | `eventId` | 已完成某事件 | `{"type":"COMPLETED_EVENT","eventId":"lone-hero-debut"}` |
| `ACTIVE_CONTRACT` | `expected` | 是否持有有效合同 | `{"type":"ACTIVE_CONTRACT","expected":true}` |
| `CONTRACT_ENDS_WITHIN` | `days` | 合同在 N 天内到期 | `{"type":"CONTRACT_ENDS_WITHIN","days":90}` |
| `FREE_AGENCY` | `expected` | 是否为自由球员 | `{"type":"FREE_AGENCY","expected":true}` |
| `TRANSFER_WINDOW` | `expected` | 转会窗是否开启 | `{"type":"TRANSFER_WINDOW","expected":true}` |
| `TRANSFER_OFFER` | `expected` | 是否有待处理转会报价 | `{"type":"TRANSFER_OFFER","expected":true}` |
| `TEAM_VRS_RANK` | 区间 | 当前队伍 VRS 排名区间 | `{"type":"TEAM_VRS_RANK","maximum":32}` |
| `RATING_STREAK` | 区间 | 近期连续低 Rating 场次 | `{"type":"RATING_STREAK","minimum":3}` |
| `ADVANCED_MAPS` | 区间 | 生涯已打 T1/Major 地图数 | `{"type":"ADVANCED_MAPS","minimum":40}` |
| `TOP20_RANK` | 区间 | 最近年度 TOP20 名次（未上榜视为不满足） | `{"type":"TOP20_RANK","minimum":1,"maximum":20}` |
| `GAME_MODE` | `modes` | 模式过滤 | `{"type":"GAME_MODE","modes":["HARDCORE"]}` |
| `RANDOM` | `chance` | 概率（0~1） | `{"type":"RANDOM","chance":0.3}` |
| `ALL` / `ANY` / `NONE` | `conditions` | 复合：全部/任一/均不满足 | `{"type":"ANY","conditions":[{...},{...}]}` |

---

## 6. 选项（options，仅 CHOICE 事件）

```json
{
  "id": "calm-down",
  "label": "深呼吸，相信肌肉记忆",
  "description": "压制情绪，按训练时的节奏打。",
  "requirements": [],
  "allowedModes": ["HARDCORE"],
  "successChance": {
    "baseChance": 0.7,
    "modifiers": [
      { "attribute": "CLUTCH", "perPoint": 0.004, "minimum": 60 }
    ]
  },
  "outcome": {
    "successEffects": [ { "type": "PLAYER_STAT_CHANGE", "stat": "MORALE", "delta": 15 } ],
    "failureEffects": [ { "type": "PLAYER_STAT_CHANGE", "stat": "STRESS", "delta": 20 } ],
    "successMessages": [ "你稳住了。" ],
    "failureMessages": [ "手还是抖了。" ],
    "successNextEventId": "lone-hero-climax",
    "failureNextEventId": null
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 选项 ID，事件内唯一 |
| `label` | string | ✅ | 选项文案 |
| `description` | string | 可选 | 收益/隐患说明 |
| `requirements` | array | ✅ | 选项级前置条件（同 §5 条件），可为 `[]` |
| `allowedModes` | string[] | 可选 | 模式过滤 |
| `successChance` | object | 可选 | 成功率；缺省 = 100% |
| `outcome` | object | ✅ | 结果定义 |

### successChance

| 字段 | 类型 | 说明 |
|---|---|---|
| `baseChance` | number | 基础成功率 0~1 |
| `modifiers` | array | 属性加成：`{ "attribute": "CLUTCH", "perPoint": 0.004, "minimum"?, "maximum"? }`，每点属性按 perPoint 累加 |

### outcome

| 字段 | 类型 | 说明 |
|---|---|---|
| `successEffects` | array | 成功时效果（§7） |
| `failureEffects` | array | 失败时效果 |
| `successMessages` | string[] | 可选，成功结果文案 |
| `failureMessages` | string[] | 可选，失败结果文案 |
| `successNextEventId` | string/null | 成功后的下一事件；`null` 结束 |
| `failureNextEventId` | string/null | 失败后的下一事件 |

---

## 7. 效果（effects）

效果可出现在 `successEffects`、`failureEffects`、`autoEffects` 中。

| type | 专属字段 | 说明 |
|---|---|---|
| `ATTRIBUTE_CHANGE` | `attribute` + `delta` | 属性变化（0~100 自动 clamp） |
| `PLAYER_STAT_CHANGE` | `stat` + `delta` | 状态变化：`MORALE`/`ENERGY`/`BALANCE`/`STRESS`/`RATING2` |
| `NARRATIVE_METRIC_CHANGE` | `metric` + `delta` | 剧情指标变化（0~100 clamp；`MENTALITY`→士气、`BALANCE`→存款） |
| `TEAM_TRANSFER` | `teamId`、`offerRef:"CURRENT_TRANSFER_OFFER"`、`salaryPerMonth`、`lengthMonths`、`buyoutAmount`、`endsAt` | 转会/换队；`offerRef` 消费当前报价 |
| `ROLE_CHANGE` | `role` | 位置变化：`IGL`/`AWPER`/`ENTRY_FRAGGER`/`SUPPORT`/`LURKER` |
| `WORLDLINE_CHANGE` | `worldlineId` | 跨线转换（命运岔口） |
| `FLAG_ADD` | `flagId` + `flag` | 添加 FLAG；`flag` 含 `{ id, name, category, expiresAt? }` |
| `FLAG_REMOVE` | `flagId` | 移除 FLAG |
| `TROPHY_CHANGE` | `trophy` + `delta` | 荣誉：`MAJOR`/`S_TIER`/`MVP`/`EVP` |
| `CAREER_STAT_CHANGE` | `stat` + `delta` | 生涯统计：`TOTAL_KILLS`/`MAPS_PLAYED`/`CLUTCH_WON`/`CAREER_EARNINGS` |
| `ADVANCE_STORY` | `eventId` | 推进到指定剧情事件 |
| `TOURNAMENT_INTERVENTION` | `editionId`、`interventionType`、`delta?`、`opponentTeamId?`、`forceUpset?`、`description` | 赛事干预：`TEAM_STRENGTH`/`OPPONENT_STRENGTH`/`UPSET_CHANCE`/`FORCE_UPSET`；`FORCE_UPSET` 用 `forceUpset:true/false` |
| `CONTRACT_RENEWAL` | `lengthMonths`、`salaryMultiplier`、`buyoutMultiplier` | 续约（决策后由引擎结算） |
| `FORCE_CONTRACT_TERMINATION` | `requirements`、`reason`、`note` | 强制解约 |

---

## 8. manifest.json 注册（必做）

新增任何事件/世界线文件后，**必须**在 `assets/story/manifest.json` 登记：

```json
{
  "schemaVersion": 1,
  "events": [
    "...",
    "my-new-event.json"
  ],
  "worldlines": [
    "...",
    "worldline_my-line.json"
  ]
}
```

引擎按清单加载；未登记的文件不会被加载，清单与磁盘不一致会触发测试失败。

---

## 9. 校验与提交流程

### 9.1 本地自测（推荐，极快）

仓库根目录执行：

```bash
npm test
```

其中 `tests/story-pack.test.ts` 会自动校验：
- 清单与磁盘严格一致
- 每个事件通过深层 schema 校验（字段类型、枚举白名单、条件/效果合法性）
- 世界线成员与 startEventId 完整、链路可达

> 只新增一个 JSON + 登记 manifest，无需改任何代码——这本身就是校验通过的证明。

### 9.2 提交给审核方

1. 提供：新事件 JSON、worldline JSON（如有）、`manifest.json` 的改动 diff
2. 说明：事件属于主线 / 支线（需指定 FLAG）/ 日常；触发周期与前置条件的设计意图
3. 审核方会跑 `npm test` 校验 schema，再决定是否合入

### 9.3 服务器上线

审核通过后，将 `assets/story/` 下的变更随新构建发布（事件是纯数据，发布即生效，无需改引擎）。

---

## 10. 创作规范（来自官方叙事设计）

1. **冲突要有代价**：每个选项都应改变至少两项（队内关系 / 俱乐部信任 / 公众形象 / 金钱），后果用 FLAG 在后续事件兑现
2. **代价要对称**：属性成长换精力、人情换金钱、流量换压力；禁止无代价白嫖
3. **合理性**：年龄 / 属性 / 处境决定事件何时出现（16 岁新人不该"巅峰期伤病"，FAME 不够不该收到豪门报价）
4. **戏剧冲突 > 情感煽情**：站队、背刺、硬刚、认怂是骨架；抒情只出现在"赢回来之后"
5. **事件包是数据**：只写 JSON，不写逻辑；数值、文案全部在数据文件里

---

## 附：完整示例

`assets/story/events/shared-contract-expired.json`（系统事件、FREE_AGENCY 门控、repeatable）与 `assets/story/events/cyber-cafe-hero-start.json`（CHOICE、成功率、双选项）是官方范本，可直接参考。
