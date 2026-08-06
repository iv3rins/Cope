# COPE 生涯叙事设计（v3）

> 本文档是事件包的设计蓝本。事件 JSON 必须能追溯到本文档中的设计条目；
> 新增事件时先在这里补设计，再落地 JSON。
>
> **v3 变更**：主线体系从旧的 16 条蓝图更新为 20 条候选线（天才 10 + 凡人 10）。
> 当前已实现 12 条（天才 7 + 凡人 5），每条 10 事件（4 链 + 6 可选）。
> 未实现的 8 条候选线与全部支线/老将/荣誉事件为待办蓝图。

## 一、叙事哲学

1. **生涯是一张网，不是一条线。** 主线（20 条候选线）决定玩家的"命运底色"，支线（FLAG 体系）制造戏剧冲突，日常事件让赛季有呼吸感。三者按赛季节奏编排。
2. **戏剧冲突 > 情感煽情。** 这是 CS 职业选手生涯模拟器，玩家要看的是对抗、反转、背叛、羞辱、黑幕、打脸。事件以冲突为骨架，情感只是冲突的余波——占比不超过两成，且必须是"赢回来之后"才配抒情。
3. **冲突要有代价，代价要看得见。** 站队、背刺、硬刚、认怂——每个选项改变队内关系/俱乐部信任/公众形象/金钱中的至少两项，且后果在后续事件里兑现（FLAG 记录）。
4. **玩家视角的合理性。** 年龄、属性、处境决定事件何时出现：16 岁新人不会"巅峰期伤病"，FAME 不够不会收到豪门报价，STRESS 爆表才会触发倦怠。
5. **代价与回报对称。** 每个选项都是 trade-off：属性成长换精力、人情换金钱、流量换压力，不允许无代价白嫖。

## 二、三层事件结构

| 层 | 性质 | 数量 | 节奏 |
|---|---|---|---|
| 主线 | 20 条候选线 × 10 事件（4 链 + 6 可选） | 当前已实现 12 条 / 90 事件 | 链事件按序推进，可选事件按条件触发 |
| 支线 | FLAG 驱动的跨线冲突线 | 11（蓝图，待实现） | 获得 FLAG 后触发，1 条线 2-3 个节点 |
| 日常 | 无 FLAG 的赛季填充 | 21（蓝图，待实现） | 赛季中随机，同赛季去重 |

## 三、主线（20 条候选线）

### 3.1 事件结构：10 事件骨架（4 链 + 6 可选）

每条线固定 10 个事件，分为两部分：

**链事件（4 个，强链推进）**：`start`（必触发）→ `stage`（赛中）→ `crossroads`（命运岔口）→ `finale`（终局）。前一个完成后经 `nextEventId` 指向下一个。

**可选事件（6 个，条件门控）**：在链事件的间隙按窗口出现在候选池，**不满足事件级 `conditions` 的玩家看不到该事件**——事件不是人人都会触发。门控条件类型（按文案对齐选择）：
- `ATTRIBUTE`（属性门槛，如 AIM/CLUTCH/GAME_SENSE/CONSISTENCY/LEADERSHIP）
- `PLAYER_STAT`（状态门槛，如 STRESS/ENERGY/MORALE）
- `NARRATIVE_METRIC`（声望/关系门槛，如 FAME/FAN_REPUTATION/TEAM_RELATIONSHIP/CLUB_FAVOR）
- `FLAG`（结局/状态 FLAG 门控，如 finale 结局后才解锁"余波"事件）
- `AGE`（年龄门控，如"老将""最后一舞"）
- `PLAYER_ROLE`（角色门控）
- 复合 `ANY` / `ALL`

**门控与文案对齐原则**：文案里出现的每个系统状态声称（成名、透支、队内关系破裂、年龄）都必须有对应条件；条件不满足的事件不出现，玩家感知为"命运不同"而非"事件缺失"。

### 3.2 候选线清单（用户定稿 20 条，标注实现状态）

**天才基调 10 条**：

| 线 | 主题 | 状态 | 10 事件状态 |
|---|---|---|---|
| `prodigy-debut` | 天降紫微星（m0NESY/ZywOo） | ✅ 已实现 | 4 链 + 6 可选 |
| `1v9-prison` | 院长坐牢（s1mple） | ✅ 已实现 | 4 链 + 6 可选 |
| `arrogant-tyrant` | 赛场暴君（早期 s1mple/NiKo） | ✅ 已实现 | 4 链 + 6 可选 |
| `major-choker` | 大赛软脚虾（NiKo） | ✅ 已实现 | 4 链 + 6 可选 |
| `crownless-king` | 无冕之王（GuardiaN） | ✅ 已实现 | 4 链 + 6 可选 |
| `golden-era-core` | 王朝核心（dev1ce/s1mple） | ✅ 已实现 | 4 链（含 FLAG/ANY 门控可选化） |
| `injured-shooting-star` | 伤病流星（olofmeister/dev1ce） | ✅ 已实现 | 4 链（伤病状态门控） |
| `mercenary-god` | 顶级雇佣兵（Twistzz/Magisk） | ⏳ 候选 | — |
| `washed-up-star` | 巅峰陨落（kennyS/coldzera） | ⏳ 候选 | — |
| `second-spring` | 老树盘根（f0rest） | ⏳ 候选 | — |

**凡人基调 10 条**：

| 线 | 主题 | 状态 | 10 事件状态 |
|---|---|---|---|
| `grinder-rookie` | 底层青训苦爹（drop/b1t） | ✅ 已实现 | 4 链 + 6 可选 |
| `tactical-mastermind` | 极致大脑（karrigan/HooXi） | ✅ 已实现 | 4 链 + 6 可选 |
| `support-slave` | 极致绿叶（Sanji/interz） | ✅ 已实现 | 4 链（PLAYER_ROLE 门控） |
| `emotional-leader` | 激情领袖（cadiaN/apEX） | ✅ 已实现 | 4 链（FAN_REPUTATION 门控） |
| `scapegoat-kicked` | 宫斗背锅侠（Aleksib） | ✅ 已实现 | 4 链（含 FORCE_CONTRACT_TERMINATION） |
| `revenge-arc` | 复仇者（Aleksib/cadiaN） | ⏳ 候选 | — |
| `toxic-environment` | 内讧绞肉机（法国宫斗） | ⏳ 候选 | — |
| `t2-gatekeeper` | T2 皇帝（BIG/syrsoN） | ⏳ 候选 | — |
| `cinderella-run` | 灰姑娘爆种（Zeus/Jame） | ⏳ 候选 | — |
| `veteran-mentor` | 老将带新（Snappi/FalleN） | ⏳ 候选 | — |

## 四、命运岔口与跨线转换

**实现方式（v3 定稿）**：岔口事件（`{线}-crossroads`）在 stage 后、finale 前出现。A 选项留在原线（`nextEventId` = 本线 finale）；B 选项成功触发 **`WORLDLINE_CHANGE` + `nextEventId` = 目标线 start**，玩家从目标线事件 1 重新走链。**转换是后台静默的**——文案只写外部动作选择（删录像/收奖牌/换训练计划），绝不写"世界线变更/换线"字样；玩家只看到选择，不知道命运在后台换了轨道。

**基调限制**：只允许同天赋基调内部流动（天才 ↔ 天才 / 凡人 ↔ 凡人）。天赋基调是出身属性——凡人再努力成不了天才，天才陨落也只是天才的陨落。

**已实现 12 条的转换映射**：

```
天才环：
  prodigy-debut  ⇄  major-choker  ⇄  crownless-king
  1v9-prison    ⇄  arrogant-tyrant
  golden-era-core → crownless-king（单向）
  injured-shooting-star → crownless-king（单向）
凡人链：
  grinder-rookie → tactical-mastermind → emotional-leader → scapegoat-kicked → support-slave → grinder-rookie
```

**属性带入**：WORLDLINE_CHANGE 只改 worldlineId，属性/FLAG/指标全部保留——能否走目标线的硬核路线取决于原线积累；走不了就走目标线 A 选项保底，永不卡链。

## 五、可选事件门控约束（引擎事实）

1. **start 事件（SEASON_START 窗口）不能加依赖赛季中数据快照的条件**：`TEAM_VRS_RANK` / `RATING_STREAK` 等条件在开局时 fail-closed（VRS 快照尚未冻结），加了会导致开局主线丢失（story-pack 测试强制 SEASON_START 返回 start 事件）。这类条件只能放事件 2/3 的选项级（A 选项无条件保底）。
2. **事件级条件不满足 = 事件不出现**（非报错）；链事件靠 `currentStoryEventId` + `nextEventId` 推进，可选事件靠候选池 priority 抽取。
3. **选项级门槛必须保证至少一个选项可用**（A 选项轻门槛/无条件保底），否则 0 选项事件会被过滤导致链断。
4. `FLAG` 条件常用双结局闭环：finale 种下结局 FLAG → "余波"事件 `ANY [结局A FLAG, 结局B FLAG]` 门控，终局后按结局解锁。

## 六、支线设计（FLAG 体系，蓝图待实现）

支线的规则：**每个支线有"起点事件"（种下 FLAG）→ 1-2 个中期节点（FLAG + 数值/年龄门控）→ 终局节点（收束冲突）**。支线事件不归属任何故事线（worldlineId: 'shared'），任何玩家获得对应 FLAG 后都能进入。

| 支线 | 起点 | 节点 | 终局 |
|---|---|---|---|
| 宿敌（rivalry） | `shared-rival-duel` | `rival-rematch`（AGE≥19） | `rival-handshake`（AGE≥22+FAME≥45） |
| 健康（health） | `shared-burnout-warning` | `health-checkup`（ENERGY≤45） | — |
| 队友（teammate） | `teammate-depart` | — | `teammate-reunion`（AGE≥20+FAME≥30） |
| 老板（owner） | `owner-talk`（FAME≥25 或 TEAM_STATUS≥30） | `owner-crisis`（TEAM_STATUS≤30） | — |
| 媒体（media） | `media-interview`（FAME≥20） | `media-backlash`（FAME≥35） | — |
| 宫斗（locker-room） | `locker-room-friction` | `locker-room-blowup`（TEAM_STATUS≤40） | `locker-room-ultimatum`（AGE≥20） |
| 转会背刺（transfer-drama） | `transfer-approach`（FAME≥20） | `transfer-leak`（CLUB_FAVOR≤40） | `transfer-backstab`（AGE≥21） |
| 舆论风暴（scandal） | `scandal-rumor`（FAME≥30） | `scandal-hearing`（AGE≥19） | `scandal-verdict`（AGE≥20） |
| 黑马羞辱（upset） | `upset-trash-talk` | `upset-favorites`（FAME≥25） | `upset-revenge`（AGE≥20+决赛周期） |

## 七、赛季节奏编排

```
SEASON_START     主线 start（必触发）
赛季中 (NORMAL)  主线可选事件（条件门控）> 支线节点 > 日常
SEASON_END       主线 stage / crossroads / finale（链推进）
TRANSFER_WINDOW  转会类主线事件（如 scapegoat-kicked-call）
```

编排原则：链事件每年最多推进 1-2 个；可选事件按条件自然散落在多个赛季；支线事件按 FLAG + 数值门控分散，避免"一赛季把一条支线走完"。

## 八、落地规则

1. 事件 JSON 与本文档条目一一对应（`id` 可反查 DESIGN.md 章节）。
2. 链事件 `worldlineId` = 线 id；支线事件 `worldlineId: 'shared'`、`repeatable: false`。
3. 所有 FLAG 在事件 JSON 的 `FLAG_ADD` 中定义，`flag.id` 全局唯一（kebab-case）。
4. 修改故事体系先改本文档，再改事件 JSON。
5. **条件与文案对齐**：文案中的系统状态声称必须有对应条件；条件数值与初始属性档位匹配（天才线门槛 80+，凡人线门槛 45-65）。

## 九、生涯后期与荣誉时刻（蓝图待实现）

主线 finale（终局，如 crownless-king AGE≥24）之后，生涯进入老将阶段，由状态驱动的 shared 事件继续推进，直到退役。核心冲突：被后浪挑战、状态下滑、俱乐部施压、舆论造"最后一舞"。荣誉时刻由 TOP20_RANK 门控（首次上榜 / TOP10 / TOP5 逐级解锁）。此阶段全部事件待实现。
