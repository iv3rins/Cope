# AGENTS — COPE 项目开发约束

本文件是给所有在此仓库中写代码的模型（Agent / LLM / 协作工具）的强制性约束。
**动手写接口实现前，必须先阅读本文件，并遵守其中全部规则。**

---

## 0. 最高优先级原则

1. **内容与逻辑分离（数据驱动）**：所有会持续扩充、迭代、被策划/运营修改的内容（事件、文案、评语、总结、赛事、荣誉描述），**必须外置为独立数据文件（JSON）**，禁止硬编码在代码里。
2. **新增内容 ≠ 改代码**：当需要"添加一个新事件 / 一条评语 / 一个赛事"时，应该**只新增数据文件条目**，而**不是**修改任何 `.ts` 源码。
3. **可不断增添与维护**：数据层必须支持无上限扩展（数组/目录追加即可），结构必须稳定、可版本化。
4. **失败要有兜底**：数据缺失/损坏时，代码应优雅降级（默认值、跳过、日志），不得崩溃。

---

## 1. 事件包必须独立（Story Event Pack）

### 1.1 事件包是什么

事件（剧情事件）是**内容资产**，不是代码。每个事件包含：
- 标题（title）
- 描述 / 情境说明（description）
- 世界线归属（worldlineId）
- 触发时期（period）
- 触发条件（conditions）
- 选项（options）：文案（label）、前置条件、成功率、成功/失败结果与效果
- 自动效果（autoEffects）

对应现有接口：`src/engine/graph.ts` 中的 `StoryEvent` / `StoryEventOption` / `EventOutcome` / `EventEffect`。

### 1.2 存放位置与格式

- 事件内容统一放在 **`assets/story/`** 目录（若尚未建立，由实现者创建）。
- 每个事件一个 **JSON 文件**，命名：`事件ID.json`（如 `final_choke.json`）。
- 事件 ID 全局唯一，使用 `kebab-case`。
- JSON 顶层结构必须与 `StoryEvent` 接口字段一一对应（`id / title / description / worldlineId / type / period / conditions / options / autoEffects`）。

示例（示意，字段以 `graph.ts` 为准）：

```json
{
  "id": "final_choke",
  "title": "决赛心魔",
  "description": "你再次站上决赛舞台，但上一次的失误仍在脑海回放……",
  "worldlineId": "prodigy",
  "type": "CHOICE",
  "period": "FINAL_DECISIVE_MOMENT",
  "conditions": [],
  "options": [
    {
      "id": "calm_down",
      "label": "深呼吸，相信肌肉记忆",
      "requirements": [],
      "successChance": { "baseChance": 0.7, "modifiers": [] },
      "outcome": {
        "successEffects": [
          { "type": "PLAYER_STAT_CHANGE", "stat": "MORALE", "delta": 15 }
        ],
        "failureEffects": [
          { "type": "PLAYER_STAT_CHANGE", "stat": "STRESS", "delta": 20 }
        ]
      }
    }
  ],
  "autoEffects": []
}
```

### 1.3 载入与接口实现约束

- `StoryRepository`（`src/engine/graph.ts`）的实现**必须**从事件包目录读取事件，**禁止**在 `.ts` 里手写事件对象数组。
- 提供：
  - `findEvent(eventId)`：从事件包读取单个事件；
  - `findWorldline(worldlineId)`：世界线归属读取。
- 事件包目录需要**遍历加载**：实现应扫描 `assets/story/` 下所有 `*.json` 并建立索引（可缓存），使"新增一个 JSON 文件即新增一个事件"成为唯一必要操作。
- 若事件包目录为空或文件缺失，接口应返回空结果或可辨识的"未找到"，不得抛未捕获异常。
- 条件（`conditions`）与效果（`effects`）的**求值逻辑**可以也必须在代码中实现（它们是规则），但**具体条件/效果的内容**（数值、文案）必须在 JSON 里。

### 1.4 禁止事项

- ❌ 在 `.ts` / `.js` 中直接内联事件对象数组。
- ❌ 把事件文案写死在 UI 组件、常量文件或路由里。
- ❌ 为了让新事件上线而修改引擎/接口代码。
- ❌ 用 `eval` / 动态执行 JSON 内容（事件数据只是数据，不包含可执行逻辑）。

---

## 2. TOP20 评语（自定义文案）

> 现状：`src/hltv/top20.ts` 目前**没有**评语字段，属于"待实现"能力。
> 约束：未来实现 TOP20 评语时，必须遵守本节。

- 评语是**内容**，必须外置数据文件（建议 `assets/story/` 或 `assets/top20_quotes/`），禁止硬编码评语字符串在算法/接口代码里。
- 评语可按"排名区间 + 荣誉 + 表现特征"配置模板，由实现按选手数据匹配后填充变量（如 {nickname}、{teamName}、{aps}）。
- 匹配不到规则时返回默认评语（也是数据文件里的默认条目），不得抛错。
- TOP20 榜单本身（`Top20RankedEntry`）可以引用评语条目 ID，而不是内嵌评语正文。

---

## 3. 生涯总结（Career Summary）

> 现状：`src` 中**没有**生涯总结模型，且**退役流程尚未实现**（PlayerProfile 无 retired 状态、CareerGame 无 retire() 方法）。
> 约束：未来实现生涯总结时，必须遵守本节。

- 生涯总结由**数据（生涯事实）聚合**而来，不是手写文案：
  - TOP20 记录 → `trophies.top20Records`
  - MVP / EVP / Major / S 级赛事 → `trophies`
  - 逐条赛事历史 → 由赛事结算事实（`TournamentCompletedFact` / `TournamentResult`）归档而来（当前缺失，需新增归档机制，禁止伪造/跳过）
- 总结页面展示用的**标题、分组文案、空状态文案、荣誉描述**等，必须是数据文件（`assets/story/` 或专门的 `assets/career/`），禁止在组件里硬编码中文文案。
- 退役动作（`CareerGame.retire()` 等）实现前，**不得**声称"已支持退役/生涯总结"；接口实现应如实反映当前能力。

---

## 4. 通用实现约束

### 4.1 分层与依赖方向

- `src/hltv/`（HLTV 生态数据）→ `src/engine/`（生涯引擎）→ 组合根 / UI。
- 依赖方向只能从上到下，`hltv` 不得反向依赖 `engine`。
- Engine 通过 `EngineHltvGateway`（`src/engine/hltv-gateway.ts`）访问 HLTV，禁止直接 import `hltv` 具体实现。

### 4.2 数据文件约定

- 所有内容数据放 **`assets/`** 下（已有 `assets/teams/`、`assets/events/`、`assets/mvp/`、`assets/top/`），新增内容目录保持同一模式。
- JSON 文件：
  - UTF-8、`\n` 结尾、2 空格缩进；
  - 顶层字段稳定、版本化（必要时加 `schemaVersion` / `generatedAt`）；
  - 数组类型（如事件列表）支持追加扩展。

### 4.3 错误与兜底

- 读取数据文件用同步读取 + 内存缓存（内容静态），文件缺失时抛出**配置级错误**（启动即暴露），但运行时单条数据缺失应返回空/默认，不崩溃。
- 所有返回给 UI 的可选字段（评语、总结文案）缺省时给出可辨识的默认值。

### 4.4 测试

- 实现"从事件包读取"后，必须补测试：至少覆盖
  - 从 JSON 正确加载事件并映射到 `StoryEvent`；
  - 新增一个 JSON 文件后无需改代码即可被加载（可写一条"新增事件"的测试样例）；
  - 事件缺失/目录为空时不崩溃。

---

## 5. 自查清单（写代码前逐条过）

- [ ] 我要新增的内容（事件/文案/评语/描述）是不是应该放 JSON？
- [ ] 加一个新事件需要改 `.ts` 源码吗？—— 如果是，说明没有做到数据驱动，停下来重构。
- [ ] `StoryRepository` 实现是否从 `assets/story/` 读取？
- [ ] 数据缺失时是否有兜底（空/默认/日志）而非崩溃？
- [ ] 是否遵守 `hltv → engine` 依赖方向？
- [ ] 是否补了事件包加载的测试？
