// 生成天才篇 8 条故事线事件（每线 5 个，NORMAL 周期链式推进）。
// 内容资产生成器：改内容请直接改本脚本后重新运行，或直接改 assets/story/events/ 下 JSON。
import { writeFileSync, mkdirSync } from 'node:fs';

const dir = 'assets/story/events';
mkdirSync(dir, { recursive: true });

const metric = (metric, delta) => ({ type: 'NARRATIVE_METRIC_CHANGE', metric, delta });
const stat = (stat, delta) => ({ type: 'PLAYER_STAT_CHANGE', stat, delta });
const attr = (attribute, delta) => ({ type: 'ATTRIBUTE_CHANGE', attribute, delta });
const flag = (flagId, name, category, metadata) => ({ type: 'FLAG_ADD', flagId, flag: { id: flagId, name, category, ...(metadata ? { metadata } : {}) } });
const role = (role) => ({ type: 'ROLE_CHANGE', role });

const opt = (id, label, description, baseChance, successEffects, failureEffects, successMessages, failureMessages, next) => ({
  id, label, description, requirements: [], successChance: { baseChance, modifiers: [] },
  outcome: { successEffects, failureEffects, successMessages, failureMessages, successNextEventId: next, failureNextEventId: next },
});

// 事件名后缀（与各线选项 nextEventId 引用一致）
const SLUGS = {
  'lone-hero': ['debut', 'anger', 'carry', 'fork', 'legacy'],
  'young-guns': ['debut', 'hype', 'coach', 'peak', 'future'],
  'silent-ace': ['calm', 'inner', 'core', 'voice', 'zen'],
  'version-victim': ['glory', 'patch', 'slump', 'rebuild', 'answer'],
  'crownless-king': ['dominance', 'curse', 'choke', 'sacrifice', 'crown'],
  'falling-star': ['mvp', 'offer', 'burnout', 'return', 'afterglow'],
  'system-core': ['precision', 'pressure', 'dynasty', 'breakdown', 'legacy'],
  'rule-breaker': ['style', 'chaos', 'breakthrough', 'conform', 'icon'],
};

// 主线门控：每个事件 2 个可选达标通道（ANY），玩家通过日常/随机事件积累数值或获得 FLAG 后推进。
const attrCond = (attribute, minimum) => ({ type: 'ATTRIBUTE', attribute, minimum });
const metricCond = (metric, value, isMaximum = false) => isMaximum ? { type: 'NARRATIVE_METRIC', metric, maximum: value } : { type: 'NARRATIVE_METRIC', metric, minimum: value };
const statCond = (stat, value, isMaximum = false) => isMaximum ? { type: 'PLAYER_STAT', stat, maximum: value } : { type: 'PLAYER_STAT', stat, minimum: value };
const flagCond = (flagId) => ({ type: 'FLAG', flagId, expected: true });
const worldline = (worldlineId) => ({ type: 'WORLDLINE_CHANGE', worldlineId });
const GATES = {
  'lone-hero': [
    [attrCond('CLUTCH', 58), metricCond('FAME', 15)],
    [attrCond('CLUTCH', 62), metricCond('FAME', 28)],
    [attrCond('CLUTCH', 66), metricCond('FAME', 42)],
    [attrCond('CLUTCH', 70), metricCond('FAME', 58)],
  ],
  'young-guns': [
    [attrCond('AIM', 62), metricCond('FAME', 18)],
    [attrCond('AIM', 66), metricCond('FAME', 32)],
    [attrCond('AIM', 70), metricCond('FAME', 48)],
    [attrCond('AIM', 73), metricCond('FAME', 60)],
  ],
  'silent-ace': [
    [attrCond('AIM', 64), attrCond('GAME_SENSE', 60)],
    [attrCond('AIM', 68), metricCond('CLUB_FAVOR', 20)],
    [attrCond('AIM', 72), attrCond('LEADERSHIP', 55)],
    [attrCond('AIM', 75), attrCond('LEADERSHIP', 60)],
  ],
  'version-victim': [
    [attrCond('AIM', 60), metricCond('FAME', 15)],
    [metricCond('FORM', 45), attrCond('GAME_SENSE', 58)],
    [attrCond('GAME_SENSE', 64), metricCond('FAME', 30)],
    [attrCond('GAME_SENSE', 70), attrCond('CONSISTENCY', 62)],
  ],
  'crownless-king': [
    [metricCond('FAME', 20), attrCond('CLUTCH', 60)],
    [metricCond('FAME', 35), attrCond('CLUTCH', 64)],
    [metricCond('FAME', 50), attrCond('LEADERSHIP', 55)],
    [metricCond('FAME', 65), statCond('MORALE', 70)],
  ],
  'falling-star': [
    [metricCond('FAME', 25), statCond('BALANCE', 800)],
    [statCond('STRESS', 40), metricCond('FAME', 35)],
    [statCond('STRESS', 50), metricCond('FORM', 45, true)],
    [flagCond('burnout'), metricCond('FAME', 20)],
  ],
  'system-core': [
    [attrCond('GAME_SENSE', 60), metricCond('TEAM_STATUS', 25)],
    [attrCond('GAME_SENSE', 65), metricCond('FAME', 30)],
    [attrCond('GAME_SENSE', 70), statCond('STRESS', 45)],
    [flagCond('health-warning'), attrCond('GAME_SENSE', 75)],
  ],
  'rule-breaker': [
    [metricCond('FAME', 18), attrCond('CONSISTENCY', 55)],
    [metricCond('FAME', 35), attrCond('CLUTCH', 62)],
    [metricCond('FAME', 50), attrCond('CONSISTENCY', 62)],
    [metricCond('FAME', 65), attrCond('LEADERSHIP', 55)],
  ],
};

const events = [];
const chain = (worldlineId, title, description, options, autoEffects = []) => {
  const siblings = events.filter((event) => event.worldlineId === worldlineId);
  const index = siblings.length;
  const id = `${worldlineId}-${SLUGS[worldlineId]?.[index] ?? `ev${index + 1}`}`;
  const conditions = [];
  const gate = GATES[worldlineId]?.[index - 1];
  if (gate && gate.length) conditions.push({ type: 'ANY', conditions: gate });
  // 无链式顺序：剧情推进只看属性/FLAG/赛事状态（ANY 门控）。
  // priority 按剧情 index 递减，保证同时达标时先解锁的剧情优先出现。
  return { id, worldlineId, title, description, period: 'NORMAL', type: 'CHOICE', priority: 100 - index, options, autoEffects, conditions };
};

// —— lone-hero 极致的孤勇者 ——
const loneHero = 'lone-hero';
events.push({
  ...chain(loneHero, '孤胆首秀', '你以统治级的个人数据完成首秀，但队伍整体实力平庸，胜利依然遥远。',
    [
      opt('keep-firing', '继续全力输出', '保持个人统治力，但队友的短板被进一步放大。', 0.7,
        [metric('FAME', 8), metric('TEAM_STATUS', -4)],
        [metric('FAN_REPUTATION', -3), stat('MORALE', -5)],
        ['你的枪管发热，但胜利依然遥远。'], ['爆发未能延续，质疑声开始出现。'], `${loneHero}-anger`),
      opt('lift-team', '分担队友压力', '牺牲部分数据帮助队伍运转，等待他们成长。', 0.62,
        [metric('TEAM_STATUS', 6), metric('TEAM_RELATIONSHIP', 5)],
        [metric('FAME', -3), stat('STRESS', 5)],
        ['你把资源让给队友，队伍开始像一个整体。'], ['你的牺牲暂时没有换来回报。'], `${loneHero}-anger`),
    ]),
});
events.push({
  ...chain(loneHero, '红怒临界', '关键回合里队友连续失误，你的怒火几乎压不住。',
    [
      opt('vent', '当场发作', '释放情绪，但你与队友的关系出现裂痕。', 0.55,
        [stat('MORALE', 3), metric('TEAM_RELATIONSHIP', -8)],
        [metric('TEAM_RELATIONSHIP', -12), stat('STRESS', 3)],
        ['你把耳机摔在桌上，吼出了积压的不满。'], ['争执让训练室陷入沉默。'], `${loneHero}-carry`),
      opt('swallow', '咽下怒火', '把情绪吞进肚子，维持队内氛围。', 0.75,
        [metric('TEAM_RELATIONSHIP', 5), stat('MORALE', -3)],
        [stat('STRESS', 8), metric('TEAM_STATUS', -2)],
        ['你深吸一口气，继续下一回合。'], ['沉默的愤怒在胸口烧了一整晚。'], `${loneHero}-carry`),
    ]),
});
events.push({
  ...chain(loneHero, '负重前行', '淘汰赛生死局，队伍陷入僵局，所有人都在等你接管。',
    [
      opt('burn', '燃烧自己', '用极限操作强行carry，代价是巨大的消耗。', 0.6,
        [metric('FAME', 10), stat('ENERGY', -12), attr('CLUTCH', 1)],
        [metric('FAN_REPUTATION', -4), stat('ENERGY', -15), stat('STRESS', 6)],
        ['你一个人杀穿了整个回合，队友难以置信地看着屏幕。'], ['极限操作差了零点几秒，遗憾落败。'], `${loneHero}-fork`),
      opt('steady', '等待队友', '控制节奏，给队友创造发挥空间。', 0.68,
        [metric('TEAM_STATUS', 6), metric('FORM', 4)],
        [metric('FAME', -4), metric('TEAM_STATUS', -3)],
        ['你把回合节奏稳了下来。'], ['队友没能接住你创造的窗口。'], `${loneHero}-fork`),
    ]),
});
events.push({
  ...chain(loneHero, '去留抉择', '豪门递来报价，代价是背负"抱团/叛徒"的骂名。',
    [
      opt('leave', '背负骂名跳槽', '去豪门争夺冠军，接受舆论的审视。', 0.6,
        [metric('FAME', 8), metric('FAN_REPUTATION', -5), stat('BALANCE', 1500)],
        [metric('FAN_REPUTATION', -8), stat('MORALE', -5)],
        ['转会官宣，评论区一半祝福一半嘲讽。'], ['转会谈判破裂，你两头落空。'], `${loneHero}-legacy`),
      opt('stay', '留守孤胆', '留在培养你的中游队伍，继续当孤胆英雄。', 0.7,
        [worldline('crownless-king'), metric('CLUB_FAVOR', 10), metric('FAME', 5)],
        [worldline('crownless-king'), stat('STRESS', 8), metric('TEAM_STATUS', -2)],
        ['你选择留下，队友们松了一口气。'], ['球队高层的不满写在脸上。'], `crownless-king-dominance`),
    ]),
});
events.push({
  ...chain(loneHero, '孤勇者的路', '回望职业生涯，你的个人荣誉无人能及，冠军却始终若即若离。',
    [
      opt('accept', '接受孤勇', '承认这条路，把每一场都当成最后的证明。', 0.8,
        [stat('MORALE', 6), metric('FAME', 4)],
        [stat('MORALE', -3)],
        ['你与自己的天赋和解了。'], ['遗憾仍在深夜翻涌。'], null),
      opt('rebel', '拒绝和解', '把不甘化为下一次爆发的燃料。', 0.5,
        [metric('FAME', 6), stat('STRESS', 8)],
        [stat('MORALE', -6), stat('STRESS', 10)],
        ['你要证明一个人也能赢。'], ['执念正在透支你的身体。'], null),
    ]),
});

// —— young-guns 横扫千军的少年天才 ——
const youngGuns = 'young-guns';
events.push({
  ...chain(youngGuns, '少年出道', '16岁的你首次登上职业赛场，用极具侵略性的打法暴打老将。',
    [
      opt('crush', '全力碾压', '用不讲道理的对枪统治比赛。', 0.75,
        [metric('FAME', 10), metric('FAN_REPUTATION', 6)],
        [stat('STRESS', 5), metric('FAME', 2)],
        ['解说反复念着你的ID，弹幕刷屏。'], ['对手摸清了你的套路，吃了亏。'], `${youngGuns}-hype`),
      opt('reserve', '留有余力', '不暴露全部实力，先观察对手。', 0.65,
        [metric('TEAM_STATUS', 5), attr('GAME_SENSE', 1)],
        [metric('FAME', -2), metric('FORM', -2)],
        ['你保留了底牌。'], ['过于保守让你错失表现机会。'], `${youngGuns}-hype`),
    ]),
});
events.push({
  ...chain(youngGuns, '名利冲击', '高薪、粉丝、社交媒体与派对邀请涌向16岁的你。',
    [
      opt('indulge', '享受流量', '接代言、开直播，享受少年成名。', 0.6,
        [metric('FAME', 9), stat('BALANCE', 800), metric('FORM', -5)],
        [metric('FORM', -8), stat('STRESS', 4)],
        ['你的社交账号一夜涨粉十万。'], ['训练时间被直播蚕食。'], `${youngGuns}-coach`),
      opt('block', '屏蔽外界', '关掉手机，专注训练。', 0.7,
        [stat('MORALE', 4), metric('FAME', -3), metric('TEAM_STATUS', 4)],
        [metric('FAME', -5), stat('MORALE', -3)],
        ['你把手机锁进抽屉。'], ['错过曝光机会，经纪人有些不满。'], `${youngGuns}-coach`),
    ]),
});
events.push({
  ...chain(youngGuns, '老将的劝诫', '教练与老将希望你别太"不理智"，却也知道你的本能打法正是武器。',
    [
      opt('instinct', '坚持本能', '保持刚猛的打法，哪怕它不科学。', 0.65,
        [metric('FORM', 6), metric('FAME', 5), metric('TEAM_RELATIONSHIP', -4)],
        [metric('TEAM_RELATIONSHIP', -6), metric('FORM', -2)],
        ['你继续用直觉撕开防线。'], ['不服管教的标签贴上了你的背。'], `${youngGuns}-peak`),
      opt('discipline', '服从纪律', '收敛锋芒融入体系，换取团队的信任。', 0.7,
        [worldline('system-core'), metric('TEAM_STATUS', 7), metric('TEAM_RELATIONSHIP', 6), metric('FAME', -4)],
        [worldline('system-core'), metric('FORM', -3), stat('MORALE', -4)],
        ['你开始打战术里要求的位置。'], ['压抑的玩法让你失去了手感。'], `system-core-precision`),
    ]),
});
events.push({
  ...chain(youngGuns, '巅峰验证', '万众瞩目的关键大赛，所有人都在等你的答卷。',
    [
      opt('rush', '莽撞冲击', '相信直觉，打出一场属于你的比赛。', 0.6,
        [metric('FAME', 12), stat('STRESS', 6)],
        [metric('FAN_REPUTATION', -5), metric('FORM', -4)],
        ['你打出了职业生涯的代表作。'], ['冒进让你送出关键失误。'], `${youngGuns}-future`),
      opt('tempo', '战术克制', '控制节奏，用更成熟的方式赢下比赛。', 0.72,
        [metric('TEAM_STATUS', 7), metric('FAME', 4)],
        [metric('FAME', -2), stat('ENERGY', -6)],
        ['你用冷静赢下了观众的尊重。'], ['赢是赢了，但少了点锋芒。'], `${youngGuns}-future`),
    ]),
});
events.push({
  ...chain(youngGuns, '未来的形状', '天赋只是门票，这条路能走多远取决于你的选择。',
    [
      opt('sharpen', '延续锋芒', '把侵略性打磨到极致。', 0.7,
        [metric('FAME', 6), stat('ENERGY', -8), attr('CONSISTENCY', 1)],
        [stat('ENERGY', -10), metric('FORM', -3)],
        ['你的名字成为对手的噩梦。'], ['极致的风格也在消耗你。'], null),
      opt('polish', '打磨全面性', '补上游戏理解与纪律的短板。', 0.75,
        [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 5), metric('FAME', -2)],
        [metric('FAME', -3), stat('MORALE', -2)],
        ['你变得更全面了。'], ['成长期的阵痛难以避免。'], null),
    ]),
});

// —— silent-ace 无声的太极大师 ——
const silentAce = 'silent-ace';
events.push({
  ...chain(silentAce, '低调首秀', '你几乎不流汗就拿下了全队最高的数据，连欢呼都显得多余。',
    [
      opt('humble', '保持低调', '让数据替你说话。', 0.75,
        [metric('FAME', -2), metric('TEAM_STATUS', 5), metric('FAN_REPUTATION', 3)],
        [metric('FAN_REPUTATION', -2)],
        ['你安静地打完比赛，安静地离开。'], ['低调让观众记不住你的脸。'], `${silentAce}-inner`),
      opt('express', '主动表达', '试着在镜头前多说话，让更多人认识你。', 0.55,
        [metric('FAME', 6), stat('STRESS', 5)],
        [stat('STRESS', 8), metric('FAME', 2)],
        ['采访里你磕磕绊绊说完了一整句。'], ['紧张让你语无伦次。'], `${silentAce}-inner`),
    ]),
});
events.push({
  ...chain(silentAce, '内向的软肋', '队伍需要沟通，而你总是把想法留在心里。',
    [
      opt('force-talk', '硬着头皮开口', '逼自己参与每一次交流。', 0.6,
        [metric('TEAM_STATUS', 5), stat('STRESS', 8)],
        [stat('STRESS', 10), metric('TEAM_RELATIONSHIP', -2)],
        ['你说出了第一个完整的战术想法。'], ['开口之后你后悔了一整晚。'], `${silentAce}-core`),
      opt('silent-do', '沉默执行', '用操作回应一切，让队友看着你的枪说话。', 0.7,
        [metric('FORM', 5), metric('TEAM_STATUS', -2)],
        [metric('TEAM_STATUS', -4), metric('FAME', -2)],
        ['你又一次用残局终结了比赛。'], ['沉默让你在决策中逐渐被边缘化。'], `${silentAce}-core`),
    ]),
});
events.push({
  ...chain(silentAce, '被推上核心', '队内老将退役，你被推上绝对核心的位置，所有人都期待你开口指挥。',
    [
      opt('take-core', '接过核心', '承担领袖职责，哪怕那让你窒息。', 0.55,
        [metric('CLUB_FAVOR', 8), stat('STRESS', 10), metric('FAME', 4)],
        [stat('STRESS', 14), metric('TEAM_STATUS', -4)],
        ['队长袖标落在了你手上。'], ['压力让你连训练赛都打不好。'], `${silentAce}-voice`),
      opt('decline', '婉拒核心', '把位置让给更外向的队友。', 0.7,
        [metric('TEAM_STATUS', 4), stat('MORALE', 3)],
        [metric('CLUB_FAVOR', -6), metric('FAME', -3)],
        ['你退回了舒适区。'], ['俱乐部高层觉得你不够有担当。'], `${silentAce}-voice`),
    ]),
});
events.push({
  ...chain(silentAce, '领袖抉择', '是继续做纯粹的输出机器，还是逼自己成为声量十足的领袖？',
    [
      opt('become-leader', '逼自己开口', '牺牲一部分手感，换来团队的化学反应。', 0.5,
        [attr('LEADERSHIP', 2), metric('TEAM_STATUS', 7), metric('FORM', -4)],
        [metric('FORM', -6), stat('STRESS', 8)],
        ['你的声音开始被队友习惯。'], ['分心指挥让你的枪法直线下滑。'], `${silentAce}-zen`),
      opt('stay-machine', '保持输出机器', '把天赋留给枪口，让数据证明价值。', 0.72,
        [metric('FORM', 6), metric('FAME', 5), metric('TEAM_STATUS', -4)],
        [metric('TEAM_STATUS', -5), metric('TEAM_RELATIONSHIP', -3)],
        ['你的rating依旧恐怖。'], ['队伍缺少声音的问题依旧存在。'], `${silentAce}-zen`),
      opt('join-system', '把天赋交给体系', '你不想当领袖，只想成为体系里最锋利的一块。', 0.7,
        [worldline('system-core'), attr('GAME_SENSE', 1), metric('TEAM_STATUS', 4)],
        [worldline('system-core'), stat('MORALE', -3)],
        ['你退到体系里，安静地做那把刀。'], ['沉默让队伍误解了你的决定。'], 'system-core-precision'),
    ]),
});
events.push({
  ...chain(silentAce, '无声的王者', '你终于找到了自己的节奏——不喧哗，但无可替代。',
    [
      opt('integrate', '内外兼修', '用行动带队，用成绩说话。', 0.7,
        [attr('LEADERSHIP', 1), stat('MORALE', 6), metric('FAME', 3)],
        [stat('MORALE', -3)],
        ['你成了队伍里最可靠的定海神针。'], ['改变总是需要时间。'], null),
      opt('flow', '顺其自然', '不再勉强自己，让一切自然发生。', 0.75,
        [metric('FAME', 4), metric('FAN_REPUTATION', 4)],
        [metric('FAME', -2)],
        ['你看上去还是不流汗，但胜利越来越多。'], ['平静之下暗流涌动。'], null),
    ]),
});

// —— version-victim 版本之子与落幕者 ——
const versionVictim = 'version-victim';
events.push({
  ...chain(versionVictim, '版本红利', '你抓住了版本的答案，用不可思议的方式统治赛场。',
    [
      opt('exploit', '吃满红利', '把所有资源投入当前版本的主流打法。', 0.75,
        [metric('FAME', 9), metric('FAN_REPUTATION', 6)],
        [stat('STRESS', 4)],
        ['版本之子，当之无愧。'], ['对手开始疯狂研究你。'], `${versionVictim}-patch`),
      opt('prepare', '未雨绸缪', '在吃红利的同时储备转型能力。', 0.65,
        [attr('GAME_SENSE', 1), metric('FAME', 2)],
        [metric('FAME', -3), metric('FORM', -2)],
        ['你在训练里悄悄练习新套路。'], ['分心储备让你当前版本统治力下降。'], `${versionVictim}-patch`),
    ]),
});
events.push({
  ...chain(versionVictim, '版本更新', '官方发布大版本更新，你的核心机制被直接削弱。',
    [
      opt('adapt', '接受转型', '承认版本变了，从头适应。', 0.55,
        [attr('GAME_SENSE', 2), stat('MORALE', 3), metric('FORM', -4)],
        [metric('FORM', -6), stat('STRESS', 8)],
        ['你开始重新学习这个游戏。'], ['转型比想象中痛苦得多。'], `${versionVictim}-slump`),
      opt('resist', '抵触版本', '拒绝承认削弱，坚持老套路。', 0.6,
        [metric('FAME', -2), stat('MORALE', 4)],
        [metric('FAN_REPUTATION', -6), metric('FORM', -8)],
        ['你固执地按老方法打。'], ['战绩一路下滑，质疑铺天盖地。'], `${versionVictim}-slump`),
    ],
  [{ type: 'ATTRIBUTE_CHANGE', attribute: 'AIM', delta: -12 }]),
});
events.push({
  ...chain(versionVictim, '状态下滑', '版本更新后你的数据断崖式下跌，替补席的阴影开始靠近。',
    [
      opt('grind', '苦练适应', '每天十几个小时泡在训练室，用汗水追版本。', 0.6,
        [attr('CONSISTENCY', 1), stat('ENERGY', -12), stat('MORALE', -2)],
        [stat('ENERGY', -16), stat('STRESS', 10)],
        ['你比任何人都早到训练室。'], ['过度训练让身体发出警报。'], `${versionVictim}-rebuild`),
      opt('escape', '逃避训练', '打不出状态，干脆少练。', 0.6,
        [stat('STRESS', -5), metric('FAME', -3)],
        [metric('FORM', -8), metric('TEAM_STATUS', -5)],
        ['你给自己放了几天假。'], ['松懈让状态雪上加霜。'], `${versionVictim}-rebuild`),
    ]),
});
events.push({
  ...chain(versionVictim, '转型抉择', '是死守旧套路在叹息中滑落，还是痛苦地转型？',
    [
      opt('rebuild', '彻底转型', '放弃曾经的招牌打法，拥抱新版本。', 0.55,
        [attr('GAME_SENSE', 2), metric('FAME', 3), metric('FORM', -3)],
        [metric('FORM', -5), stat('MORALE', -6)],
        ['你放下了曾经的荣光。'], ['转型期的战绩让人心碎。'], `${versionVictim}-answer`),
      opt('old-way', '死守旧路', '相信自己的本能，等版本"转回来"。', 0.45,
        [metric('FAME', 2), metric('FAN_REPUTATION', 3)],
        [metric('FAN_REPUTATION', -8), metric('TEAM_STATUS', -6)],
        ['你相信版本会绕回来。'], ['观众只记得你还在用旧打法。'], `${versionVictim}-answer`),
    ]),
});
events.push({
  ...chain(versionVictim, '版本的答案', '你终于找到了与新版本共存的方式。',
    [
      opt('embrace', '拥抱版本', '成为新版本的定义者。', 0.65,
        [attr('CONSISTENCY', 1), metric('FAME', 5)],
        [metric('FORM', -2), stat('ENERGY', -6)],
        ['你重新站在了版本之巅。'], ['新的统治来得比想象中艰难。'], null),
      opt('reinvent', '另辟蹊径', '放弃枪手路线，转型成为战术大脑。', 0.6,
        [worldline('tactical-captain'), role('IGL'), attr('LEADERSHIP', 2), metric('FAME', 2)],
        [worldline('tactical-captain'), metric('FORM', -6), stat('MORALE', -4)],
        ['你以另一种方式留在了赛场上。'], ['指挥的担子比想象中重。'], `tactical-captain-decline`),
    ]),
});

// —— crownless-king 功亏一篑的无冕之王 ——
const crownlessKing = 'crownless-king';
events.push({
  ...chain(crownlessKing, '常规赛统治', '除了一线大赛决赛，你在所有比赛里都是无解的。',
    [
      opt('enjoy', '享受统治', '享受冠军拿到手软的日子。', 0.7,
        [metric('FAME', 7), stat('MORALE', 4)],
        [metric('FORM', -2)],
        ['奖杯陈列柜又添了一座。'], ['胜利变得有些理所当然。'], `${crownlessKing}-curse`),
      opt('hungry', '保持饥渴', '提醒自己还差一个最重要的冠军。', 0.7,
        [stat('MORALE', 3), stat('STRESS', 5)],
        [stat('STRESS', 7)],
        ['你把Major的遗憾贴在训练室墙上。'], ['执念开始侵蚀日常。'], `${crownlessKing}-curse`),
    ]),
});
events.push({
  ...chain(crownlessKing, '决赛心魔', '又一次站在决赛舞台，熟悉的名场面失误如约而至。',
    [
      opt('review', '直面复盘', '反复看录像，直面那个失误的自己。', 0.6,
        [stat('MORALE', 4), stat('STRESS', 6)],
        [stat('STRESS', 9), metric('FAME', -2)],
        ['你在录像里看到了自己的手在抖。'], ['复盘变成自我折磨。'], `${crownlessKing}-choke`),
      opt('blame', '归咎运气', '把失败推给运气和临场因素。', 0.65,
        [stat('STRESS', -4), metric('FAME', -3)],
        [metric('FAN_REPUTATION', -4)],
        ['"只是差了一点运气。"'], ['逃避让你离真相越来越远。'], `${crownlessKing}-choke`),
    ]),
});
events.push({
  ...chain(crownlessKing, '关键局手抖', '一年一度的决赛再度上演，你的准星在最后一刻失准。',
    [
      opt('clench', '咬牙硬撑', '不信邪，继续用枪证明自己。', 0.5,
        [attr('CONSISTENCY', 1), stat('STRESS', 10)],
        [stat('STRESS', 13), metric('FAN_REPUTATION', -6)],
        ['你咬着牙打完了加时。'], ['决赛魔咒再一次应验。'], `${crownlessKing}-sacrifice`),
      opt('therapy', '寻求心理辅导', '承认心魔存在，找专业人士帮忙。', 0.7,
        [stat('MORALE', 7), metric('FAME', -3), stat('STRESS', -4)],
        [stat('MORALE', -3), metric('FAME', -4)],
        ['你开始学着与压力共处。'], ['"心理问题"的标签让你有些难堪。'], `${crownlessKing}-sacrifice`),
    ]),
});
events.push({
  ...chain(crownlessKing, '核心地位的代价', '教练建议你兼任指挥，用脑子赢下决赛，但那会削弱你的个人数据。',
    [
      opt('become-igl', '转任指挥', '牺牲个人数据，掌控全局节奏。', 0.55,
        [role('IGL'), attr('LEADERSHIP', 2), attr('AIM', -3)],
        [metric('FORM', -6), stat('STRESS', 8)],
        ['你开始用另一种方式赢比赛。'], ['指挥分散了你的枪感。'], `${crownlessKing}-crown`),
      opt('stay-rifler', '死守枪位', '相信自己的枪就是夺冠的答案。', 0.6,
        [metric('FAME', 5), stat('STRESS', 8)],
        [stat('STRESS', 11), metric('TEAM_STATUS', -3)],
        ['你拒绝了指挥的位置。'], ['决赛的阴影继续笼罩。'], `${crownlessKing}-crown`),
    ]),
});
events.push({
  ...chain(crownlessKing, '加冕或遗憾', '生涯尾声，那座奖杯依然近在咫尺又远在天涯。',
    [
      opt('last-push', '最后一搏', '把一切都押在最后一场决赛。', 0.5,
        [metric('FAME', 7), stat('ENERGY', -12)],
        [metric('FAN_REPUTATION', -4), stat('MORALE', -8)],
        ['你打出了生涯最好的决赛——这次没有失误。'], ['奖杯擦肩而过。'], null),
      opt('accept-fate', '接受无冕', '与心魔和解，承认自己的伟大不需要一座奖杯证明。', 0.75,
        [stat('MORALE', 8), metric('FAN_REPUTATION', 5)],
        [stat('MORALE', -2)],
        ['你终于放下了那个执念。'], ['深夜偶尔还是会梦见那个空枪。'], null),
    ]),
});

// —— falling-star 闪耀即熄灭的流星 ——
const fallingStar = 'falling-star';
events.push({
  ...chain(fallingStar, '年少封王', '你以破纪录的年龄捧起大赛MVP，全世界都记住了你的名字。',
    [
      opt('celebrate', '享受巅峰', '沉浸在荣耀与赞美的海洋里。', 0.65,
        [metric('FAME', 10), metric('FORM', -3)],
        [metric('FORM', -5), stat('MORALE', 2)],
        ['你被记者和粉丝包围了整整一周。'], ['庆祝的余波让训练荒废了几天。'], `${fallingStar}-offer`),
      opt('stay-sharp', '保持训练', 'MVP只是起点，你继续泡在训练室。', 0.7,
        [metric('FORM', 5), metric('FAME', 2)],
        [metric('FAME', -2), stat('MORALE', -2)],
        ['奖杯摆在训练室角落，你继续练枪。'], ['你错过了许多本可享受的荣光。'], `${fallingStar}-offer`),
    ]),
});
events.push({
  ...chain(fallingStar, '高薪诱惑', '一支豪门开出天价合同，但你要离开把你培养成MVP的体系。',
    [
      opt('leave', '接受高薪', '为了更高的薪水离开舒适区。', 0.65,
        [stat('BALANCE', 2000), metric('FAN_REPUTATION', 4), metric('TEAM_STATUS', -6)],
        [metric('TEAM_RELATIONSHIP', -8), stat('MORALE', -4)],
        ['转会官宣，旧队友的眼神有些复杂。'], ['谈判中的不愉快让离开变得尴尬。'], `${fallingStar}-burnout`),
      opt('stay', '留在体系', '拒绝诱惑，继续留在熟悉的环境。', 0.7,
        [metric('CLUB_FAVOR', 8), metric('FAME', -3)],
        [metric('FAME', -4), stat('BALANCE', -500)],
        ['你留了下来，队伍松了口气。'], ['经纪人直呼你错过了一个时代。'], `${fallingStar}-burnout`),
    ]),
});
events.push({
  ...chain(fallingStar, '心理衰竭', '太早到达顶峰之后，你对比赛失去了热情，训练变成煎熬。',
    [
      opt('push-through', '硬撑下去', '告诉自己这是职业，必须打。', 0.5,
        [stat('STRESS', 12), metric('FORM', -5)],
        [stat('STRESS', 15), metric('FORM', -8)],
        ['你机械地打完每一场。'], ['burnout让你的操作完全变形。'], `${fallingStar}-return`),
      opt('reset', '强制休息', '给自己放一个长假，离开赛场。', 0.7,
        [stat('MORALE', 7), metric('FAME', -5)],
        [metric('FAME', -6), metric('TEAM_STATUS', -4)],
        ['你关掉了所有直播和训练软件。'], ['缺席让队伍不得不找替补。'], `${fallingStar}-return`),
    ],
  [{ type: 'FLAG_ADD', flagId: 'burnout', flag: { id: 'burnout', name: '心理衰竭', category: 'MENTAL', metadata: { trigger: 'falling-star' } } }]),
});
events.push({
  ...chain(fallingStar, '复出抉择', '你的状态在下滑，是接受降薪去二三线熬过寒冬，还是在黄金年龄退役？',
    [
      opt('demote', '降薪重来', '接受降薪，去二三线队伍重新证明自己。', 0.6,
        [worldline('late-bloomer'), stat('MORALE', 6), metric('FAME', -5), stat('BALANCE', -800)],
        [worldline('late-bloomer'), metric('FAME', -6), stat('MORALE', -4)],
        ['你背起行囊，从头开始。'], ['低级别赛场的节奏让你更加迷茫。'], `late-bloomer-start`),
      opt('retire-now', '急流勇退', '在还能留下体面的时候选择离开。', 0.65,
        [stat('MORALE', 4), metric('FAN_REPUTATION', 6)],
        [stat('MORALE', -6)],
        ['退役公告里，你感谢了所有人。'], ['深夜你反复问自己：真的甘心吗？'], `${fallingStar}-afterglow`),
    ]),
});
events.push({
  ...chain(fallingStar, '余晖', '无论选择哪条路，那段最亮的光芒已经写进了历史。',
    [
      opt('rekindle', '找回热爱', '重新找到最初打CS的快乐。', 0.65,
        [stat('MORALE', 9), metric('FAME', 2)],
        [stat('MORALE', -3)],
        ['你在低级别比赛里打出了久违的笑容。'], ['热爱与现实的差距依然存在。'], null),
      opt('farewell', '体面告别', '把最好的自己留在回忆里。', 0.75,
        [metric('FAN_REPUTATION', 8), metric('FAME', 4)],
        [metric('FAME', -2)],
        ['粉丝说：他是那颗最亮的流星。'], ['有人说你本可以更亮。'], null),
    ]),
});

// —— system-core 战术解构者 ——
const systemCore = 'system-core';
events.push({
  ...chain(systemCore, '精密开局', '你像机器一样执行着每一个战术动作，极少犯错。',
    [
      opt('perfect', '追求完美', '每个细节都要做到极致。', 0.7,
        [metric('TEAM_STATUS', 6), stat('STRESS', 6)],
        [stat('STRESS', 9), metric('FORM', -2)],
        ['你的每一步都精确到秒。'], ['完美主义让你把自己逼得太紧。'], `${systemCore}-pressure`),
      opt('relax', '张弛有度', '接受偶尔的失误，保持心态平稳。', 0.72,
        [stat('MORALE', 4), metric('TEAM_STATUS', 2)],
        [metric('TEAM_STATUS', -2)],
        ['你学会了在训练里放松。'], ['队友觉得你少了点拼劲。'], `${systemCore}-pressure`),
    ]),
});
events.push({
  ...chain(systemCore, '完美主义的代价', '长期高压让你开始失眠，健康警报拉响。',
    [
      opt('face', '正视压力', '去看医生，接受心理疏导。', 0.68,
        [stat('MORALE', 6), stat('STRESS', -4), metric('FAME', -2)],
        [metric('FAME', -3), stat('MORALE', -2)],
        ['你开始规律作息与治疗。'], ['治疗期间状态起伏不定。'], `${systemCore}-dynasty`),
      opt('suppress', '压抑情绪', '把不适咽下去，继续上场比赛。', 0.55,
        [metric('FAME', 3), stat('STRESS', 10)],
        [stat('STRESS', 13), metric('FORM', -4)],
        ['你在止痛药和咖啡因里继续打。'], ['身体用更糟的方式向你抗议。'], `${systemCore}-dynasty`),
    ],
  [{ type: 'FLAG_ADD', flagId: 'health-warning', flag: { id: 'health-warning', name: '健康警报', category: 'CAREER', metadata: { trigger: 'system-core' } } }]),
});
events.push({
  ...chain(systemCore, '王朝时代', '在你的体系支撑下，队伍建立了一个时代。',
    [
      opt('sustain', '全力维系', '不惜代价维持王朝的统治力。', 0.65,
        [metric('FAME', 9), stat('ENERGY', -12)],
        [stat('ENERGY', -15), stat('STRESS', 8)],
        ['你们又一次捧起了冠军奖杯。'], ['王朝的齿轮开始发出异响。'], `${systemCore}-breakdown`),
      opt('plan-ahead', '未雨绸缪', '在巅峰期就开始培养接班人。', 0.7,
        [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 5)],
        [metric('FAME', -3)],
        ['你把自己的战术笔记倾囊相授。'], ['新人还接不住你的体系。'], `${systemCore}-breakdown`),
    ]),
});
events.push({
  ...chain(systemCore, '王朝崩塌', '核心队友接连离队，你的身体也在报警——休赛调养，还是带病坚持？',
    [
      opt('sabbatical', '休赛一年', '放下一切调养身心，接受被新人取代的风险。', 0.65,
        [stat('MORALE', 8), metric('FORM', -8), metric('FAME', -4)],
        [metric('FAME', -6), stat('MORALE', -5)],
        ['你宣布暂时离开赛场。'], ['休赛期你的名字渐渐被遗忘。'], `${systemCore}-legacy`),
      opt('stay-sick', '带病坚持', '撑着病体留在场上，赌自己能撑过去。', 0.5,
        [metric('FAME', 4), stat('STRESS', 14)],
        [stat('STRESS', 16), metric('FORM', -6), metric('TEAM_STATUS', -4)],
        ['你咬着牙打完了整个赛季。'], ['身体在赛季末彻底垮掉。'], `${systemCore}-legacy`),
    ]),
});
events.push({
  ...chain(systemCore, '传奇的延续', '你重新定义了自己的职业生涯。',
    [
      opt('new-system', '建立新体系', '用沉淀的智慧再建一支队伍。', 0.65,
        [attr('LEADERSHIP', 2), metric('FAME', 4)],
        [stat('STRESS', 8), metric('TEAM_STATUS', -2)],
        ['你开始书写第二个时代。'], ['重建比想象中漫长。'], null),
      opt('exit-gracefully', '急流勇退', '在传奇的顶点选择离开。', 0.75,
        [stat('MORALE', 8), metric('FAN_REPUTATION', 7)],
        [metric('FAME', -2)],
        ['你留给赛场一个完美的背影。'], ['王朝的记忆随你一起落幕。'], null),
    ]),
});

// —— rule-breaker 打破规则的叛逆者 ——
const ruleBreaker = 'rule-breaker';
events.push({
  ...chain(ruleBreaker, '混烟狂徒', '你的打法与传统教科书完全相反，却总能打乱对手的节奏。',
    [
      opt('style', '贯彻风格', '继续混烟、刷闪、暴力干拉。', 0.65,
        [metric('FAME', 8), metric('TEAM_RELATIONSHIP', -3)],
        [metric('TEAM_RELATIONSHIP', -5), metric('FORM', -2)],
        ['对手教练气得摔了白板笔。'], ['队友觉得你是在胡闹。'], `${ruleBreaker}-chaos`),
      opt('conventional', '收敛打常规', '暂时放弃个人风格，先融入体系。', 0.68,
        [metric('TEAM_STATUS', 5), metric('FORM', -3)],
        [metric('FAME', -4), stat('MORALE', -4)],
        ['你打了一整场的"教科书"。'], ['失去风格的你泯然众人。'], `${ruleBreaker}-chaos`),
    ]),
});
events.push({
  ...chain(ruleBreaker, '双刃剑', '面对严密战术队，你的冒险可能打乱对手，也可能送出首杀。',
    [
      opt('gamble', '继续冒险', '把比赛变成一场豪赌。', 0.5,
        [metric('FAME', 7), metric('FORM', 3)],
        [metric('FAN_REPUTATION', -5), metric('FORM', -4)],
        ['你的干拉撕裂了对手的防线。'], ['你又成了第一个白给的人。'], `${ruleBreaker}-breakthrough`),
      opt('stabilize', '减少赌博', '增加纪律性，减少无谓的冒险。', 0.7,
        [attr('CONSISTENCY', 1), metric('FAME', -3)],
        [metric('FAME', -4), metric('FORM', -2)],
        ['你开始打"合理"的CS。'], ['观众觉得你没以前好看了。'], `${ruleBreaker}-breakthrough`),
    ]),
});
events.push({
  ...chain(ruleBreaker, '历史突破', '你的风格终于为弱势赛区带来了历史性的突破。',
    [
      opt('push', '乘胜追击', '趁着势头继续冲击更高荣誉。', 0.6,
        [metric('FAME', 10), stat('ENERGY', -10)],
        [stat('ENERGY', -12), metric('FORM', -3)],
        ['整个赛区都在为你欢呼。'], ['势头没能延续到下一站。'], `${ruleBreaker}-conform`),
      opt('pace', '保持节奏', '赢下历史性一战后稳住心态。', 0.7,
        [metric('FORM', 5), metric('FAME', 4)],
        [metric('FAME', -2)],
        ['你平静地庆祝，然后回去训练。'], ['有人觉得你不够兴奋。'], `${ruleBreaker}-conform`),
    ]),
});
events.push({
  ...chain(ruleBreaker, '风格的代价', '战术体系要求你放弃混烟和冒险——你愿意牺牲个人风格吗？',
    [
      opt('sacrifice', '牺牲风格', '迎合常规打法，换取体系的信任。', 0.6,
        [metric('TEAM_STATUS', 7), metric('FORM', -5), metric('FAME', -3)],
        [metric('FORM', -7), stat('MORALE', -5)],
        ['你收起了那些"不理智"的操作。'], ['失去了灵魂的打法让你痛苦。'], `${ruleBreaker}-icon`),
      opt('stay-rogue', '坚持风格', '即使被质疑，也把反叛贯彻到底。', 0.55,
        [metric('FAME', 6), metric('TEAM_RELATIONSHIP', -5)],
        [metric('TEAM_RELATIONSHIP', -8), metric('TEAM_STATUS', -4)],
        ['你继续做那个"不听话"的选手。'], ['教练和你的矛盾逐渐公开化。'], `${ruleBreaker}-icon`),
      opt('weaponize', '把反叛变成战术', '你厌倦了独狼的日子，把混烟的直觉献给指挥位。', 0.6,
        [worldline('tactical-captain'), attr('LEADERSHIP', 1), metric('FAME', 2)],
        [worldline('tactical-captain'), metric('FORM', -3)],
        ['你第一次以指挥身份复盘，思路清奇。'], ['体系化让你浑身不自在。'], 'tactical-captain-decline'),
    ]),
});
events.push({
  ...chain(ruleBreaker, '反叛图腾', '你的打法最终影响了整整一代年轻选手。',
    [
      opt('school', '开宗立派', '把自己的风格整理成方法论，教给后来者。', 0.65,
        [attr('LEADERSHIP', 1), metric('FAME', 6), metric('FAN_REPUTATION', 5)],
        [metric('FAME', -2)],
        ['年轻选手们开始模仿你的混烟。'], ['也有人学不会你的天赋。'], null),
      opt('return', '回归正统', '最终与学院派和解，成为体系的一部分。', 0.72,
        [metric('TEAM_STATUS', 6), stat('MORALE', 3)],
        [metric('FAN_REPUTATION', -3)],
        ['你笑着承认：当年确实太莽了。'], ['老粉丝叹息那个叛逆者不见了。'], null),
    ]),
});

// —— 骨架扩展：每条线追加 cost / climax / finale 三段（事件 6-8）——
for (const line of Object.keys(SLUGS)) SLUGS[line].push('cost', 'climax', 'finale');
GATES['lone-hero'].push(
  [attrCond('CLUTCH', 72), metricCond('FAME', 60)],
  [attrCond('CLUTCH', 75), metricCond('FAME', 68)],
  [attrCond('CLUTCH', 78), metricCond('FAME', 75)],
);
GATES['young-guns'].push(
  [attrCond('AIM', 75), metricCond('FAME', 65)],
  [attrCond('AIM', 77), metricCond('FAME', 72)],
  [attrCond('AIM', 80), metricCond('FAME', 78)],
);
GATES['silent-ace'].push(
  [attrCond('AIM', 76), attrCond('GAME_SENSE', 70)],
  [attrCond('AIM', 78), attrCond('LEADERSHIP', 62)],
  [attrCond('AIM', 80), attrCond('LEADERSHIP', 65)],
);
GATES['version-victim'].push(
  [attrCond('GAME_SENSE', 72), attrCond('CONSISTENCY', 64)],
  [attrCond('GAME_SENSE', 75), metricCond('FAME', 45)],
  [attrCond('GAME_SENSE', 78), attrCond('CONSISTENCY', 70)],
);
GATES['crownless-king'].push(
  [metricCond('FAME', 68), attrCond('CLUTCH', 68)],
  [metricCond('FAME', 72), attrCond('LEADERSHIP', 60)],
  [metricCond('FAME', 75), statCond('MORALE', 75)],
);
GATES['falling-star'].push(
  [metricCond('FAME', 30), statCond('STRESS', 45)],
  [metricCond('FAME', 40), metricCond('FORM', 55)],
  [metricCond('FAME', 50), statCond('MORALE', 65)],
);
GATES['system-core'].push(
  [attrCond('GAME_SENSE', 73), statCond('STRESS', 50)],
  [attrCond('GAME_SENSE', 76), metricCond('TEAM_STATUS', 40)],
  [attrCond('GAME_SENSE', 78), attrCond('LEADERSHIP', 65)],
);
GATES['rule-breaker'].push(
  [metricCond('FAME', 55), attrCond('CONSISTENCY', 65)],
  [metricCond('FAME', 62), attrCond('CLUTCH', 68)],
  [metricCond('FAME', 70), attrCond('LEADERSHIP', 60)],
);

// —— 新增事件（每线 cost/climax/finale）——
const loneHero2 = 'lone-hero';
events.push({ ...chain(loneHero2, '透支的枪管', '常年一人carry，身体开始报警，训练时长不得不腰斩。', [
  opt('keep-burning', '继续燃烧', '状态重要，身体可以晚点再说。', 0.6, [metric('FAME', 4), stat('ENERGY', -10)], [stat('ENERGY', -13), stat('STRESS', 6)], ['你的枪依然滚烫。'], ['身体用酸痛抗议。'], `${loneHero2}-climax`),
  opt('learn-rest', '学会休息', '留得青山在，才能继续当孤胆英雄。', 0.72, [stat('ENERGY', 6), metric('FAME', -2)], [metric('FAME', -3)], ['你学会了在赛季中给自己放假。'], ['休息的代价是暂时的数据下滑。'], `${loneHero2}-climax`),
]) });
events.push({ ...chain(loneHero2, '最后的独奏', '最重要的一场大赛，队伍依然指望你一个人。', [
  opt('solo', '孤注一掷', '把整支队伍扛在肩上。', 0.55, [attr('CLUTCH', 1), metric('FAME', 7), stat('STRESS', 7)], [stat('STRESS', 10), metric('FAN_REPUTATION', -3)], ['你打出了震古烁今的一战。'], ['独木终究难支。'], `${loneHero2}-finale`),
  opt('trust-team', '相信队友', '把胜利交给五个人。', 0.68, [metric('TEAM_STATUS', 5), metric('FAME', 2)], [metric('TEAM_STATUS', -3), metric('FAME', -3)], ['队友终于接住了你递出的手。'], ['他们还是没能做到。'], `${loneHero2}-finale`),
]) });
events.push({ ...chain(loneHero2, '迟来的答案', '回望孤勇的一生，你终于能与自己和解。', [
  opt('seal', '封存骄傲', '那些一个人的胜利，够吹一辈子了。', 0.75, [stat('MORALE', 9), metric('FAME', 4)], [stat('MORALE', -2)], ['你在退役发布会上笑了。'], ['荣誉室里还差一座团队奖杯。'], null),
  opt('keep-walking', '继续独行', '只要还能打，就继续一个人抬着队伍走。', 0.55, [metric('FAME', 5), stat('STRESS', 6)], [stat('STRESS', 8), metric('FORM', -3)], ['你背起了下一个赛季。'], ['岁月不饶人。'], null),
]) });

const youngGuns2 = 'young-guns';
events.push({ ...chain(youngGuns2, '流量的反噬', '全网关注变成压力，每一次失误都被无限放大。', [
  opt('face-it', '正面回应', '把质疑当成燃料。', 0.6, [stat('MORALE', 3), stat('STRESS', 6), metric('FORM', 2)], [stat('STRESS', 9), metric('FORM', -3)], ['你发文：下一场见。'], ['回应让风波更大。'], `${youngGuns2}-climax`),
  opt('cool-down', '冷处理', '关掉社交媒体，让表现说话。', 0.72, [metric('FORM', 4), metric('FAME', -3)], [metric('FAME', -4), stat('MORALE', -3)], ['你的账号沉默了一个月。'], ['安静让你失去了热度。'], `${youngGuns2}-climax`),
]) });
events.push({ ...chain(youngGuns2, '蜕变之战', '你不再是那个只会暴打的少年，你要赢下真正重要的比赛。', [
  opt('carry', '接管比赛', '用天赋碾压一切质疑。', 0.6, [metric('FAME', 7), stat('STRESS', 6)], [metric('FORM', -4), metric('FAME', -3)], ['你打出了赛季最强一战。'], ['天赋也有失灵的时候。'], `${youngGuns2}-finale`),
  opt('lead', '团队胜利', '学会把胜利分给队友。', 0.7, [metric('TEAM_STATUS', 7), metric('FAME', 3)], [metric('FAME', -2), stat('MORALE', -3)], ['队伍第一次因你而完整。'], ['指挥让你束手束脚。'], `${youngGuns2}-finale`),
]) });
events.push({ ...chain(youngGuns2, '传奇正传', '当年的少年天才，如今成了这个时代的注脚。', [
  opt('sharpen', '保持锋利', '把侵略性打磨到退役。', 0.68, [attr('CONSISTENCY', 1), metric('FAME', 5)], [stat('ENERGY', -8), metric('FORM', -2)], ['你的风格成了后辈的模板。'], ['锋利也在磨损。'], null),
  opt('define-era', '定义时代', '用打法定义一代人的理解。', 0.65, [attr('LEADERSHIP', 1), metric('FAME', 7)], [metric('FORM', -3), stat('STRESS', 5)], ['你的名字和"天才"绑在了一起。'], ['定义时代的人也被时代定义。'], null),
]) });

const silentAce2 = 'silent-ace';
events.push({ ...chain(silentAce2, '沉默的隔阂', '你在沉默中独自消化一切，队伍却以为你不在乎。', [
  opt('break-ice', '主动破冰', '把想法说出来，哪怕笨拙。', 0.62, [metric('TEAM_STATUS', 6), stat('STRESS', 6)], [stat('STRESS', 9), metric('TEAM_RELATIONSHIP', -2)], ['你第一次主动开了个会。'], ['开口后的尴尬让你后悔。'], `${silentAce2}-climax`),
  opt('by-numbers', '让数据说话', '用表现堵住所有嘴。', 0.7, [metric('FORM', 5), metric('TEAM_STATUS', -2)], [metric('TEAM_STATUS', -4)], ['你的rating说明了一切。'], ['数据之外，隔阂依旧。'], `${silentAce2}-climax`),
]) });
events.push({ ...chain(silentAce2, '开口的时刻', '决胜局，队伍需要一个声音，而那个声音只能是你。', [
  opt('shout', '开口指挥', '第一次在赛场喊出战术。', 0.58, [attr('LEADERSHIP', 1), metric('TEAM_STATUS', 6)], [stat('STRESS', 9), metric('FORM', -3)], ['你喊完之后，队友愣了半秒，然后赢了。'], ['你的声音在关键局破了音。'], `${silentAce2}-finale`),
  opt('demonstrate', '以身作则', '用残局和操作回答所有问题。', 0.68, [metric('FORM', 5), metric('FAME', 4)], [metric('TEAM_STATUS', -3)], ['你用一打二终结了比赛。'], ['胜利没能弥合沟通的裂痕。'], `${silentAce2}-finale`),
]) });
events.push({ ...chain(silentAce2, '禅意落幕', '你始终没有学会大声说话，但所有人都听你的。', [
  opt('quiet-exit', '功成身退', '在安静中告别赛场。', 0.75, [stat('MORALE', 9), metric('FAN_REPUTATION', 5)], [metric('FAME', -2)], ['退役声明只有一行字。'], ['有人遗憾你没多说几句。'], null),
  opt('keep-calm', '继续沉淀', '把沉默变成一种力量。', 0.7, [attr('GAME_SENSE', 1), metric('FAME', 3)], [stat('ENERGY', -6)], ['你还在用最安静的方式赢比赛。'], ['沉淀的岁月也很长。'], null),
]) });

const versionVictim2 = 'version-victim';
events.push({ ...chain(versionVictim2, '转型的阵痛', '新打法一次次撞上南墙，外界开始劝你退役。', [
  opt('grind-on', '咬牙坚持', '数据再难看也要打完这个版本。', 0.6, [attr('GAME_SENSE', 1), stat('MORALE', -3)], [stat('MORALE', -6), metric('FORM', -4)], ['你在训练室熬过了最长的夜。'], ['坚持的代价是质疑翻倍。'], `${versionVictim2}-climax`),
  opt('rethink', '重新评估', '停下来想清楚，什么才是自己的答案。', 0.68, [stat('STRESS', -5), attr('GAME_SENSE', 1)], [metric('FORM', -3), stat('MORALE', -3)], ['你花了一周重新认识自己。'], ['休息让你错过了窗口期。'], `${versionVictim2}-climax`),
]) });
events.push({ ...chain(versionVictim2, '版本答案之战', '你用新打法赢下了质疑者们口中的"不可能"。', [
  opt('go-all', '全力一战', '把所有理解押在这场比赛上。', 0.6, [metric('FAME', 7), stat('ENERGY', -9)], [metric('FAME', -4), metric('FORM', -4)], ['你重新定义了这套体系。'], ['一战成名与一战出局只差一步。'], `${versionVictim2}-finale`),
  opt('steady', '稳步推进', '用系列赛的胜利慢慢回应。', 0.7, [metric('TEAM_STATUS', 6), metric('FAME', 3)], [metric('FAME', -2)], ['你一步步打回了尊重。'], ['稳扎稳打少了几分戏剧性。'], `${versionVictim2}-finale`),
]) });
events.push({ ...chain(versionVictim2, '重新定义', '你不再是版本之子，你成了版本本身。', [
  opt('school', '开创新流派', '把转型经验写成方法论。', 0.65, [attr('GAME_SENSE', 1), metric('FAME', 6)], [stat('ENERGY', -7)], ['年轻选手开始研究你的录像。'], ['门徒们学不到你的手感。'], null),
  opt('pass-on', '传承经验', '把自己变成队伍的导师。', 0.7, [attr('LEADERSHIP', 1), metric('FAME', 3)], [metric('FAME', -2)], ['你的存在本身就是财富。'], ['导师的身份让你提前退出聚光灯。'], null),
]) });

const crownlessKing2 = 'crownless-king';
events.push({ ...chain(crownlessKing2, '心魔的纠缠', '又一年，又是决赛，又是那个熟悉的失误。', [
  opt('face-demon', '直面心魔', '把每一次失误都摊开来看。', 0.58, [stat('MORALE', 4), stat('STRESS', 7)], [stat('STRESS', 10), metric('FAME', -2)], ['你在镜子里与自己对视。'], ['直视深渊的代价是失眠。'], `${crownlessKing2}-climax`),
  opt('divert', '转移注意', '把精力投进训练，不去想那座奖杯。', 0.68, [metric('FORM', 4), stat('STRESS', -4)], [metric('FORM', -2)], ['你练到忘记紧张。'], ['逃避让心魔藏得更深。'], `${crownlessKing2}-climax`),
]) });
events.push({ ...chain(crownlessKing2, '终极决赛', '所有人都知道，这可能是你最后一次机会。', [
  opt('gamble', '放手一搏', '把十年积攒的一切押在今晚。', 0.52, [attr('CLUTCH', 1), metric('FAME', 8), stat('STRESS', 8)], [metric('FAN_REPUTATION', -5), stat('MORALE', -7)], ['今晚的你没有失误。'], ['奖杯再次与你擦肩。'], `${crownlessKing2}-finale`),
  opt('zen', '平常心', '把决赛当成普通的一场比赛。', 0.68, [stat('MORALE', 6), metric('FAME', 3)], [metric('FAME', -2)], ['你平静地打完了决赛。'], ['平静让你错过了那口气。'], `${crownlessKing2}-finale`),
]) });
events.push({ ...chain(crownlessKing2, '加冕或释然', '无冕之王的最后一块拼图。', [
  opt('crown', '捧起奖杯', '在生涯末尾，终于听到那句"世界冠军"。', 0.6, [metric('FAME', 10), stat('MORALE', 9)], [stat('MORALE', -5), metric('FAME', -3)], ['你哭得像个孩子。'], ['命运再次开了玩笑。'], null),
  opt('embrace', '拥抱遗憾', '与那个空枪和解，承认自己的伟大。', 0.75, [stat('MORALE', 9), metric('FAN_REPUTATION', 6)], [stat('MORALE', -2)], ['你终于能笑着谈起那场比赛。'], ['深夜仍会梦见决赛的枪声。'], null),
]) });

const fallingStar2 = 'falling-star';
events.push({ ...chain(fallingStar2, '谷底的星光', '你在低级别赛场上重新学会了打球，也重新学会了自己。', [
  opt('struggle', '继续挣扎', '哪怕爬不起来，也要爬。', 0.58, [stat('STRESS', 7), metric('FORM', 2)], [stat('STRESS', 10), metric('FORM', -3)], ['你一场一场地熬。'], ['谷底比想象中更深。'], `${fallingStar2}-climax`),
  opt('rekindle', '找回初心', '想起那个第一次握鼠标的自己。', 0.72, [stat('MORALE', 6), metric('FORM', 3)], [metric('FORM', -2)], ['你在训练里笑了，久违的。'], ['初心不能当饭吃。'], `${fallingStar2}-climax`),
]) });
events.push({ ...chain(fallingStar2, '复出之战', '你在所有人都不看好的舞台，打回了聚光灯下。', [
  opt('all-in', '倾尽全力', '证明那颗流星还能再亮一次。', 0.6, [metric('FAME', 6), stat('ENERGY', -10)], [metric('FAME', -3), stat('ENERGY', -12)], ['全场都在喊你的名字。'], ['这一次的燃烧比想象中短。'], `${fallingStar2}-finale`),
  opt('steady', '稳扎稳打', '不追求高光，只求还站在这里。', 0.7, [metric('FORM', 5), metric('FAME', 2)], [metric('FAME', -2)], ['你稳稳地打完了整个赛季。'], ['观众期待的是流星，不是恒星。'], `${fallingStar2}-finale`),
]) });
events.push({ ...chain(fallingStar2, '流星的余韵', '无论以哪种方式，你都曾在夜空中亮过。', [
  opt('farewell', '体面告别', '在还能控制结局的时候离开。', 0.75, [metric('FAN_REPUTATION', 7), stat('MORALE', 7)], [stat('MORALE', -3)], ['退役的那天，弹幕都是那句"曾经"。'], ['有人说你本可以。'], null),
  opt('reignite', '再燃一次', '让最后的余晖烧得再旺一点。', 0.55, [metric('FAME', 5), stat('STRESS', 7)], [stat('STRESS', 9), metric('FORM', -4)], ['你打出了生涯最后一个高光。'], ['余晖之后是长夜。'], null),
]) });

const systemCore2 = 'system-core';
events.push({ ...chain(systemCore2, '身体的警报', '精密运转的机器开始出现裂纹，医生第三次劝你休息。', [
  opt('rest', '强制休整', '把身体当成最重要的系统来维护。', 0.7, [stat('ENERGY', 7), metric('FAME', -3)], [stat('ENERGY', -4), metric('FAME', -4)], ['你第一次完整地休了一个月假。'], ['缺席让你在体系里的位置松动。'], `${systemCore2}-climax`),
  opt('push-season', '硬扛赛季', '赛季结束再谈身体。', 0.55, [metric('FAME', 3), stat('STRESS', 10)], [stat('STRESS', 13), metric('FORM', -5)], ['你咬着牙打完了整个赛季。'], ['赛季结束，你被送进了医院。'], `${systemCore2}-climax`),
]) });
events.push({ ...chain(systemCore2, '王朝终章', '最后的战役，你要么完美收官，要么轰然倒塌。', [
  opt('perfect-end', '完美收官', '用一座奖杯给王朝画上句号。', 0.6, [metric('FAME', 8), stat('STRESS', 7)], [metric('FAME', -4), stat('MORALE', -5)], ['王朝以最体面的方式落幕。'], ['王朝的句号画歪了。'], `${systemCore2}-finale`),
  opt('exit-early', '急流勇退', '在崩塌之前离开。', 0.72, [stat('MORALE', 8), metric('FAME', 2)], [metric('FAME', -3)], ['你宣布退役，队伍措手不及。'], ['有人骂你逃兵。'], `${systemCore2}-finale`),
]) });
events.push({ ...chain(systemCore2, '传承', '你毕生构建的体系，成了后人的教科书。', [
  opt('teach', '倾囊相授', '把全部笔记交给下一代。', 0.68, [attr('LEADERSHIP', 2), metric('FAME', 3)], [stat('ENERGY', -6)], ['你培养出了下一个体系核心。'], ['传承比夺冠更难。'], null),
  opt('quiet', '悄然离开', '把一切留在训练室，不带走一片云彩。', 0.75, [stat('MORALE', 8), metric('FAN_REPUTATION', 4)], [metric('FAME', -2)], ['你走的那天，训练室静了很久。'], ['有人到现在还觉得你没走。'], null),
]) });

const ruleBreaker2 = 'rule-breaker';
events.push({ ...chain(ruleBreaker2, '反叛的反噬', '冒险开始付出代价，队伍的战绩因你的风格起伏。', [
  opt('balance', '收放自如', '在疯狂与纪律之间找到平衡点。', 0.62, [attr('CONSISTENCY', 1), metric('FORM', -2)], [metric('FORM', -4), metric('FAME', -2)], ['你开始知道什么时候该疯。'], ['收放之间，手感也飘忽。'], `${ruleBreaker2}-climax`),
  opt('defiant', '死不悔改', '让他们适应你的节奏，而不是反过来。', 0.55, [metric('FAME', 5), metric('TEAM_RELATIONSHIP', -5)], [metric('TEAM_RELATIONSHIP', -8), metric('TEAM_STATUS', -4)], ['你继续我行我素。'], ['队内矛盾终于爆发。'], `${ruleBreaker2}-climax`),
]) });
events.push({ ...chain(ruleBreaker2, '最狂的一战', '历史性决赛，你的打法让全世界屏住了呼吸。', [
  opt('wild', '疯狂到底', '把反叛烧成这个夜晚的火焰。', 0.55, [attr('CLUTCH', 1), metric('FAME', 9)], [metric('FAN_REPUTATION', -5), metric('FAME', -3)], ['你赢下了史上最"不科学"的一场决赛。'], ['疯狂在决赛夜失效了。'], `${ruleBreaker2}-finale`),
  opt('clutch', '关键收敛', '最后几个回合，打得像教科书。', 0.68, [metric('TEAM_STATUS', 6), metric('FAME', 4)], [metric('FAME', -2)], ['你收起锋芒，赢了冠军。'], ['观众遗憾没看到你的表演。'], `${ruleBreaker2}-finale`),
]) });
events.push({ ...chain(ruleBreaker2, '开宗立派', '曾经被嘲笑的打法，成了一代人的信仰。', [
  opt('write', '著书立说', '把自己的理念整理成方法论。', 0.65, [attr('LEADERSHIP', 1), metric('FAME', 6)], [stat('ENERGY', -7)], ['《混烟的艺术》成了销量冠军。'], ['纸上得来终觉浅。'], null),
  opt('origin', '回归本源', '回到最初那种纯粹的打CS的快乐。', 0.72, [stat('MORALE', 7), metric('FAME', 2)], [metric('FAME', -3)], ['你在低级别比赛里打出了笑容。'], ['粉丝觉得你"堕落"了。'], null),
]) });

// 去掉链式顺序：把指向"本线事件"的 next 清空（保留指向其他线的跨线转换 next）
for (const event of events) {
  for (const option of event.options) {
    for (const key of ['successNextEventId', 'failureNextEventId']) {
      const next = option.outcome[key];
      if (typeof next === 'string' && next.startsWith(`${event.worldlineId}-`)) option.outcome[key] = null;
    }
  }
}

// 写出事件文件
for (const event of events) {
  const file = `${dir}/${event.id}.json`;
  writeFileSync(file, JSON.stringify(event, null, 2) + '\n');
  console.log('created', file);
}
