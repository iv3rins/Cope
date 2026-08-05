# COPE 生涯叙事设计（v2）

> 本文档是事件包的设计蓝本。事件 JSON 必须能追溯到本文档中的设计条目；
> 新增事件时先在这里补设计，再落地 JSON。

## 一、叙事哲学

1. **生涯是一张网，不是一条线。** 主线（16 条故事线）决定玩家的"命运底色"，支线（FLAG 体系）让生涯有记忆，日常事件让赛季有呼吸感。三者按赛季节奏编排。
2. **事件之间要有因果。** FLAG 是跨事件的"记忆"：获得一个 FLAG，才解锁后续事件；FLAG 让玩家的选择"留下来"。
3. **玩家视角的合理性。** 年龄、属性、处境决定事件何时出现：16 岁新人不会"巅峰期伤病"，FAME 不够不会收到豪门报价，STRESS 爆表才会触发倦怠。
4. **代价与回报对称。** 每个选项都是 trade-off：属性成长换精力、人情换金钱、流量换压力，不允许无代价白嫖。

## 二、三层事件结构

| 层 | 性质 | 数量 | 节奏 |
|---|---|---|---|
| 主线 | 16 条线 × 8 事件，性格弧 | 128 | 每年最多 1-2 个（AGE 门控） |
| 支线 | FLAG 驱动的跨线关系线 | 14 | 获得 FLAG 后触发，1 条线 3-4 个节点 |
| 日常 | 无 FLAG 的赛季填充 | 21 | 赛季中随机，同赛季去重 |

## 三、主线（16 条线弧表）

每条线 8 事件：start → 2 → 3 → 4（命运岔口，可跨线转换）→ 5 → cost（代价）→ climax（高潮）→ finale（终局）。

| 线 | 主题 | 弧线 | 命运岔口（事件 4） |
|---|---|---|---|
| lone-hero | 孤勇 | 独C→透支→终极独奏→和解 | 留守孤胆 → **crownless-king** |
| young-guns | 年少轻狂 | 出道→流量→蜕变→定义时代 | 服从纪律 → **system-core** |
| silent-ace | 沉默天才 | 数据说话→隔阂→开口→禅意 | 把天赋交给体系 → **system-core** |
| version-victim | 版本之子 | 称王→版本更迭→转型→重定义 | 转指挥 → **tactical-captain** |
| crownless-king | 无冕之王 | 统治→心魔→终极决赛→加冕/释然 | —（留守型终局） |
| falling-star | 流星坠落 | 巅峰→崩塌→谷底→复出→余韵 | 降薪重来 → **late-bloomer** |
| system-core | 体系核心 | 精密→警报→王朝→传承 | —（王朝型终局） |
| rule-breaker | 反叛者 | 成名→反噬→最狂一战→开宗立派 | 收编进体系 → **tactical-captain** |
| late-bloomer | 大器晚成 | 被低估→爆发→引路人→迟来巅峰 | —（后发终局） |
| team-battery | 队魂电池 | 牺牲→被消耗→忠诚→觉醒 | 转指挥 → **tactical-captain** |
| cyber-cafe-hero | 网吧少年 | 草根→省吃俭用→预选赛→被看见 | —（逆袭终局） |
| revenge-squad | 复仇者 | 背叛→聚队→宿怨→抉择 | 放下恩怨 → **region-guardian** |
| region-guardian | 赛区守望 | 家乡→天花板→邀约→留守 | 追随冠军 → **crownless-king** |
| grind-machine | 苦练成神 | 首秀→自律→社交隔离→习惯成自然 | 释放天性 → **rule-breaker** |
| tactical-captain | 战术大脑 | 转型→负担→信任→大将军 | —（主帅终局） |
| injury-warrior | 伤病斗士 | 受伤→手术→硬扛→最后一舞 | —（悲壮终局） |

跨线转换共 10 条（见上表箭头），由玩家在岔口的选择触发，**转换后保留全部 FLAG 与数值**——命运可变，记忆延续。

## 四、支线设计（FLAG 体系）——本轮新增

支线的规则：**每个支线有"起点事件"（种下 FLAG）→ 1-2 个中期节点（FLAG + 数值/年龄门控）→ 终局节点（收束情感）**。支线事件不归属任何故事线（worldlineId: 'shared'），任何玩家获得对应 FLAG 后都能进入。

### 4.1 引路人（mentor）

起点：`shared-youth-coach`（青训教练来电，种下 `mentor`）

| 节点 | 事件 | 门控 | 内容 | 情感落点 |
|---|---|---|---|---|
| 中期 | `mentor-watch-live` | mentor + AGE≥18 | 教练来现场看你比赛 | 他为你骄傲，你想让他看到最好的自己 |
| 低潮 | `mentor-phone-call` | mentor + STRESS≥40 | 连败低谷，教练主动打来 | 他一句话点醒你 |
| 终局 | `mentor-farewell` | mentor + AGE≥22 | 教练病重/退役，最后一面 | 你把他的口头禅带进了你的赛场 |

### 4.2 忠实粉丝（fan-base）

起点：`shared-fan-letter`（粉丝来信，种下 `fan-base`）

| 节点 | 事件 | 门控 | 内容 | 情感落点 |
|---|---|---|---|---|
| 中期 | `fan-arena-sign` | fan-base + FAME≥20 | 看台上有举着你名字的牌子 | 你在比赛里看到了他 |
| 低潮 | `fan-message` | fan-base + MORALE≤45 | 连败时收到粉丝私信 | "输赢都看你" |
| 终局 | `fan-last-match` | fan-base + AGE≥23 | 生涯最后一战，他还在看台 | 你朝他举了个躬 |

### 4.3 宿敌（rivalry）

起点：`shared-rival-duel`（与宿敌 1v1，种下 `rivalry`）

| 节点 | 事件 | 门控 | 内容 | 情感落点 |
|---|---|---|---|---|
| 中期 | `rival-rematch` | rivalry + AGE≥19 | 大赛半决赛再遇，他进步了 | 你们互相逼出了更好的自己 |
| 终局 | `rival-handshake` | rivalry + AGE≥22 + FAME≥45 | 决赛后他在领奖台等你握手 | 对手是最懂你的人 |

### 4.4 健康线（health）

起点：`shared-burnout-warning`（倦怠预警，种下 `health-warning`）

| 节点 | 事件 | 门控 | 内容 | 情感落点 |
|---|---|---|---|---|
| 中期 | `health-checkup` | health-warning + ENERGY≤45 | 体检报告亮黄灯 | 医生看着你的手腕摇头 |

## 五、赛季节奏编排

```
SEASON_START     主线事件（若 AGE 解锁）或 赛季目标（日常）
赛季中 (NORMAL)  支线节点（FLAG 触发）> 主线 > 日常
SEASON_END       决战热身 / 支线大赛节点（rival-handshake 等）
OFFSEASON        夏训营 / 休假 / 赛季总结（日常）
TRANSFER_WINDOW  接触试探 / 续约谈判（日常）
```

编排原则：一个赛季最多 4 个事件；主线事件只在 AGE 解锁后出现（16 岁只见事件 1）；支线事件按 FLAG + 数值门控分散在多个赛季，避免"一赛季把一条支线走完"。

## 六、落地规则

1. 事件 JSON 与本文档条目一一对应（`id` 可反查 DESIGN.md 章节）。
2. 支线事件 `worldlineId: 'shared'`、`repeatable: false`（每条支线一生一次）、`priority` 高于日常、低于主线。
3. 所有 FLAG 在 `assets/story/events/*.json` 的 `FLAG_ADD` 中定义，`flag.id` 全局唯一（kebab-case）。
4. 修改故事体系先改本文档，再改事件 JSON。
