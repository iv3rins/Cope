// 生成平凡篇 8 条故事线事件（每线 5 个，NORMAL 周期链式推进）。
import { writeFileSync, mkdirSync } from 'node:fs';

const dir = 'assets/story/events';
mkdirSync(dir, { recursive: true });

const metric = (metric, delta) => ({ type: 'NARRATIVE_METRIC_CHANGE', metric, delta });
const stat = (stat, delta) => ({ type: 'PLAYER_STAT_CHANGE', stat, delta });
const attr = (attribute, delta) => ({ type: 'ATTRIBUTE_CHANGE', attribute, delta });
const flag = (flagId, name, category, metadata) => ({ type: 'FLAG_ADD', flagId, flag: { id: flagId, name, category, ...(metadata ? { metadata } : {}) } });

const opt = (id, label, description, baseChance, successEffects, failureEffects, successMessages, failureMessages, next) => ({
  id, label, description, requirements: [], successChance: { baseChance, modifiers: [] },
  outcome: { successEffects, failureEffects, successMessages, failureMessages, successNextEventId: next, failureNextEventId: next },
});

const SLUGS = {
  'late-bloomer': ['start', 'blow', 'mentor', 'prime', 'crown'],
  'team-battery': ['sacrifice', 'abuse', 'loyalty', 'demand', 'legacy'],
  'cyber-cafe-hero': ['start', 'budget', 'qualifier', 'offer', 'rise'],
  'revenge-squad': ['betrayal', 'assemble', 'grudge', 'decision', 'redemption'],
  'region-guardian': ['home', 'ceiling', 'invite', 'stay', 'legacy'],
  'grind-machine': ['debut', 'discipline', 'social', 'peak', 'habit'],
  'tactical-captain': ['decline', 'switch', 'overload', 'trust', 'general'],
  'injury-warrior': ['injury', 'surgery', 'pain', 'injection', 'lastdance'],
};

const events = [];
// 事件按剧情阶段设置年龄窗口：16 岁开局只看到事件 1，随赛季推进逐年解锁后续剧情。
const AGE_WINDOWS = [null, 17, 18, 19, 20, 21, 22, 24];
const chain = (worldlineId, title, description, options, autoEffects = []) => {
  const siblings = events.filter((event) => event.worldlineId === worldlineId);
  const index = siblings.length;
  const id = `${worldlineId}-${SLUGS[worldlineId]?.[index] ?? `ev${index + 1}`}`;
  const conditions = [];
  const ageMinimum = AGE_WINDOWS[index];
  if (ageMinimum) conditions.push({ type: 'AGE', minimum: ageMinimum });
  const gate = GATES[worldlineId]?.[index - 1];
  if (gate && gate.length) conditions.push({ type: 'ANY', conditions: gate });
  // 无链式顺序：剧情推进只看属性/FLAG/赛事/年龄（ANY + AGE 门控）。
  // priority 按剧情 index 递减，保证同时达标时先解锁的剧情优先出现。
  return { id, worldlineId, title, description, period: 'NORMAL', type: 'CHOICE', priority: 100 - index, options, autoEffects, conditions };
};

// 主线门控：每个事件 2 个可选达标通道（ANY），玩家通过日常/随机事件积累数值或获得 FLAG 后推进。
const attrCond = (attribute, minimum) => ({ type: 'ATTRIBUTE', attribute, minimum });
const metricCond = (metric, value, isMaximum = false) => isMaximum ? { type: 'NARRATIVE_METRIC', metric, maximum: value } : { type: 'NARRATIVE_METRIC', metric, minimum: value };
const statCond = (stat, value, isMaximum = false) => isMaximum ? { type: 'PLAYER_STAT', stat, maximum: value } : { type: 'PLAYER_STAT', stat, minimum: value };
const flagCond = (flagId) => ({ type: 'FLAG', flagId, expected: true });
const worldline = (worldlineId) => ({ type: 'WORLDLINE_CHANGE', worldlineId });
const GATES = {
  'late-bloomer': [
    [{ type: 'ALL', conditions: [{ type: 'AGE', minimum: 26 }, metricCond('FORM', 45)] }, { type: 'ALL', conditions: [{ type: 'AGE', minimum: 26 }, attrCond('GAME_SENSE', 58)] }],
    [attrCond('GAME_SENSE', 62), metricCond('TEAM_STATUS', 25)],
    [attrCond('GAME_SENSE', 66), metricCond('FORM', 52)],
    [attrCond('GAME_SENSE', 70), metricCond('FAME', 40)],
  ],
  'team-battery': [
    [metricCond('TEAM_STATUS', 20), metricCond('FAME', 10)],
    [metricCond('CLUB_FAVOR', 20), metricCond('TEAM_STATUS', 30)],
    [metricCond('CLUB_FAVOR', 30), metricCond('FORM', 50)],
    [metricCond('CLUB_FAVOR', 40), metricCond('FAN_REPUTATION', 30)],
  ],
  'cyber-cafe-hero': [
    [statCond('BALANCE', 300), metricCond('FAME', 10)],
    [statCond('BALANCE', 500), metricCond('FAME', 20)],
    [metricCond('FAME', 30), statCond('BALANCE', 800)],
    [metricCond('FAME', 45), metricCond('CLUB_FAVOR', 25)],
  ],
  'revenge-squad': [
    [metricCond('FAME', 12), metricCond('TEAM_STATUS', 20)],
    [metricCond('FAME', 25), attrCond('CLUTCH', 58)],
    [metricCond('FAME', 38), metricCond('TEAM_STATUS', 35)],
    [metricCond('FAME', 52), statCond('MORALE', 70)],
  ],
  'region-guardian': [
    [metricCond('FAN_REPUTATION', 15), metricCond('FAME', 15)],
    [metricCond('FAN_REPUTATION', 30), metricCond('FAME', 30)],
    [metricCond('FAN_REPUTATION', 40), metricCond('CLUB_FAVOR', 25)],
    [metricCond('FAN_REPUTATION', 55), attrCond('LEADERSHIP', 60)],
  ],
  'grind-machine': [
    [attrCond('CONSISTENCY', 55), attrCond('GAME_SENSE', 55)],
    [attrCond('CONSISTENCY', 60), metricCond('FAME', 15)],
    [attrCond('CONSISTENCY', 65), attrCond('GAME_SENSE', 62)],
    [attrCond('CONSISTENCY', 70), statCond('MORALE', 65)],
  ],
  'tactical-captain': [
    [attrCond('GAME_SENSE', 58), metricCond('FORM', 48, true)],
    [attrCond('GAME_SENSE', 62), metricCond('TEAM_STATUS', 25)],
    [attrCond('GAME_SENSE', 66), attrCond('LEADERSHIP', 55)],
    [attrCond('GAME_SENSE', 72), attrCond('LEADERSHIP', 62)],
  ],
  'injury-warrior': [
    [flagCond('wrist-injury'), statCond('ENERGY', 55, true)],
    [statCond('ENERGY', 50, true), statCond('STRESS', 40)],
    [statCond('STRESS', 55), statCond('MORALE', 45, true)],
    [flagCond('wrist-injury'), metricCond('FAME', 40)],
  ],
};

// —— late-bloomer 十载饮冰的老将 ——
const lateBloomer = 'late-bloomer';
events.push({
  ...chain(lateBloomer, '不被看好的人', '职业首秀前，外界认为你的天赋上限有限。这是你第一次有机会用正式比赛改变评价。',
    [
      opt('persist', '继续坚持', '相信时间会给出答案。', 0.7,
        [stat('MORALE', 4), metric('FAME', 2)],
        [stat('MORALE', -4), stat('STRESS', 4)],
        ['你又一次站上了训练场。'], ['坚持的信念开始动摇。'], `${lateBloomer}-blow`),
      opt('doubt', '心生动摇', '身边的人一个个崭露头角，你还在为一个首发位置挣扎。', 0.6,
        [stat('STRESS', 6), metric('FAME', -2)],
        [stat('MORALE', -6)],
        ['你在深夜反复问自己值不值。'], ['退役的念头第一次出现。'], `${lateBloomer}-blow`),
    ]),
});
events.push({
  ...chain(lateBloomer, '再遭冷遇', '你输掉了一场关键比赛，随后被队伍以"打法不再被需要"为由放走。',
    [
      opt('accept', '接受现实', '收拾行李，去一支愿意给机会的队伍。', 0.7,
        [stat('MORALE', 3), metric('FAME', -3), metric('TEAM_STATUS', 3)],
        [metric('FAME', -4), stat('MORALE', -3)],
        ['你平静地收拾好储物柜，离开了这支队伍。'], ['告别比想象中更难。'], `${lateBloomer}-mentor`),
      opt('rage', '咽不下这口气', '把愤怒化为训练动力，证明他们错了。', 0.55,
        [stat('STRESS', 8), metric('FORM', 3)],
        [stat('STRESS', 10), stat('MORALE', -3)],
        ['你恨每一个说你老了的人。'], ['愤怒也在透支你。'], `${lateBloomer}-mentor`),
    ]),
});
events.push({
  ...chain(lateBloomer, '提携新人', '队伍给你配了两个刚出道的年轻人，他们把你当偶像。',
    [
      opt('mentor', '倾囊相授', '把十年的经验毫无保留地教给他们。', 0.7,
        [attr('LEADERSHIP', 1), metric('TEAM_STATUS', 6), metric('FAME', -2)],
        [metric('TEAM_STATUS', 3), stat('ENERGY', -6)],
        ['你手把手教他们每一个残局处理。'], ['年轻人的成长需要时间。'], `${lateBloomer}-prime`),
      opt('selfish', '先顾自己', '把资源留给自己，先保住首发位置。', 0.65,
        [metric('FORM', 3), metric('TEAM_RELATIONSHIP', -4)],
        [metric('TEAM_RELATIONSHIP', -5), metric('TEAM_STATUS', -3)],
        ['你选择优先保证自己的数据。'], ['年轻人的眼神里有了疏远。'], `${lateBloomer}-prime`),
    ]),
});
events.push({
  ...chain(lateBloomer, '迟来的巅峰', '你的反应在下降，但十年积累的经验开始兑现成胜利。',
    [
      opt('sage', '转型智慧打法', '用经验与残局阅读弥补操作的下滑。', 0.68,
        [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 5), metric('FORM', -2)],
        [metric('FORM', -3), metric('FAME', -2)],
        ['你成了队里的"老狐狸"。'], ['转型的阵痛难以避免。'], `${lateBloomer}-crown`),
      opt('last-spark', '最后一搏', '把剩余的能量全部押在枪法上。', 0.5,
        [attr('CLUTCH', 1), stat('ENERGY', -12)],
        [stat('ENERGY', -14), metric('FORM', -5)],
        ['你打出了近年最狠的一个月。'], ['身体开始抗议你的透支。'], `${lateBloomer}-crown`),
    ]),
});
events.push({
  ...chain(lateBloomer, '迟到的加冕', '十载饮冰，你终于等来了属于自己的高光。',
    [
      opt('climb', '再进一步', '趁着手感还在，冲击最后的冠军。', 0.55,
        [metric('FAME', 8), stat('MORALE', 7), stat('ENERGY', -8)],
        [stat('ENERGY', -10), metric('FAME', -2)],
        ['你把奖杯举过头顶，队友都在喊你的名字。'], ['差一步，但你已经证明了自己。'], null),
      opt('wrap', '光荣收官', '带着这份迟来的尊重，体面地告别。', 0.75,
        [stat('MORALE', 8), metric('FAN_REPUTATION', 6), metric('FAME', 3)],
        [metric('FAME', -2)],
        ['你在掌声中退役，无怨无悔。'], ['有人惋惜你没能再打一年。'], null),
    ]),
});

// —— team-battery 团队的隐形干电池 ——
const teamBattery = 'team-battery';
events.push({
  ...chain(teamBattery, '牺牲位', '你每把只能拿冲锋枪，把经济全部发给队里的天才选手。',
    [
      opt('devote', '默默奉献', '接受这个位置，把队伍的胜利放在第一位。', 0.72,
        [metric('TEAM_STATUS', 6), metric('FAME', -4)],
        [metric('FAME', -5), stat('MORALE', -3)],
        ['你把攒了三回合的经济丢给了队友。'], ['你的付出暂时无人看见。'], `${teamBattery}-abuse`),
      opt('complain', '索要资源', '凭什么总是牺牲我？', 0.6,
        [metric('FAME', 3), metric('TEAM_RELATIONSHIP', -5)],
        [metric('TEAM_RELATIONSHIP', -6), metric('TEAM_STATUS', -3)],
        ['你第一次在训练里顶撞了战术安排。'], ['队内的气氛变得微妙。'], `${teamBattery}-abuse`),
    ]),
});
events.push({
  ...chain(teamBattery, '舆论毒舌', '你的战绩常常是8-18，弹幕和评论区铺天盖地地骂你"水货"。',
    [
      opt('ignore', '无视舆论', '相信懂的人自然懂。', 0.7,
        [stat('MORALE', 3), stat('STRESS', 4)],
        [stat('STRESS', 6), metric('FAME', -3)],
        ['你关掉了所有社交软件。'], ['恶评还是会钻进你的耳朵。'], `${teamBattery}-loyalty`),
      opt('fight-back', '下场回击', '忍不住和黑粉对线。', 0.55,
        [stat('STRESS', -4), metric('FAN_REPUTATION', -5)],
        [metric('FAN_REPUTATION', -7), stat('STRESS', 3)],
        ['你和黑粉吵了整整一夜。'], ['俱乐部发来警告：别在公共平台发言。'], `${teamBattery}-loyalty`),
    ]),
});
events.push({
  ...chain(teamBattery, '队内的价值', '教练和核心选手都知道：没有你，这套体系转不起来。',
    [
      opt('stay-sacrifice', '继续牺牲', '把这份信任当作最大的荣誉。', 0.7,
        [metric('CLUB_FAVOR', 8), metric('FAME', -3)],
        [stat('MORALE', -3)],
        ['教练说：你是我见过最职业的选手。'], ['但合同谈判时，你的薪资依然最低。'], `${teamBattery}-demand`),
      opt('ask-credit', '索要认可', '让外界知道你的价值。', 0.55,
        [metric('FAME', 4), metric('TEAM_RELATIONSHIP', -4)],
        [metric('TEAM_RELATIONSHIP', -5), metric('CLUB_FAVOR', -3)],
        ['你在采访里说了句"请看看比赛，别只看数据"。'], ['部分队友觉得你开始飘了。'], `${teamBattery}-demand`),
    ]),
});
events.push({
  ...chain(teamBattery, '转岗抉择', '有队伍邀请你去做明星选手的位子，代价是离开熟悉的一切。',
    [
      opt('leave', '要求换岗', '去一支需要你的队伍，争一争数据与尊严。', 0.6,
        [metric('FAME', 5), metric('FORM', 4), metric('CLUB_FAVOR', -4)],
        [metric('FORM', -3), metric('FAME', -4)],
        ['你终于拿到了主枪手的资源。'], ['新体系并不像想象中那样围绕你。'], `${teamBattery}-legacy`),
      opt('stay-devoted', '继续牺牲', '这支队伍需要你，这就够了。', 0.72,
        [metric('CLUB_FAVOR', 7), metric('TEAM_STATUS', 4), metric('FAME', -4)],
        [metric('FAME', -5)],
        ['你拒绝了报价，继续发枪。'], ['又一年过去，你的数据依旧难看。'], `${teamBattery}-legacy`),
      opt('switch-captain', '转岗当指挥', '你发现自己的价值不只是送死——让脑子也参与比赛。', 0.6,
        [worldline('tactical-captain'), attr('LEADERSHIP', 1), metric('TEAM_STATUS', 3)],
        [worldline('tactical-captain'), metric('FORM', -3)],
        ['你开始研究每一张图的经济与站位。'], ['指挥的思考让你手忙脚乱。'], 'tactical-captain-decline'),
    ]),
});
events.push({
  ...chain(teamBattery, '无名功臣', '多年之后，人们终于开始谈论你的价值。',
    [
      opt('content', '接受身份', '你为胜利而生，不需要数据证明。', 0.75,
        [stat('MORALE', 9), metric('FAN_REPUTATION', 4)],
        [stat('MORALE', -2)],
        ['退役那天，无数职业选手发文致敬你。'], ['你依旧不习惯被聚光灯照着。'], null),
      opt('regret', '心有不甘', '如果当年选择要数据，人生会不同吗？', 0.55,
        [metric('FAME', 3), stat('MORALE', -4)],
        [stat('MORALE', -6), metric('FAME', 2)],
        ['你在直播里偶尔会想起那个岔路口。'], ['遗憾成为深夜常客。'], null),
    ]),
});

// —— cyber-cafe-hero 黑网吧走出的追梦者 ——
const cyberCafe = 'cyber-cafe-hero';
events.push({
  ...chain(cyberCafe, '黑网吧起步', '你的家乡没有青训营，只有一间风扇轰鸣的黑网吧。',
    [
      opt('boost', '白天代练', '靠代练攒钱，晚上再练自己的枪。', 0.68,
        [stat('BALANCE', 300), stat('ENERGY', -8)],
        [stat('ENERGY', -10), metric('FORM', -2)],
        ['你的手指在键盘上磨出了茧。'], ['代练单子挤占了训练时间。'], `${cyberCafe}-budget`),
      opt('grind', '熬夜训练', '把所有时间砸进游戏，等一个机会。', 0.6,
        [metric('FORM', 3), stat('BALANCE', -150)],
        [stat('BALANCE', -200), stat('ENERGY', -8)],
        ['网吧老板认识了你：又是那个通宵的。'], ['生活费见底了。'], `${cyberCafe}-budget`),
    ]),
});
events.push({
  ...chain(cyberCafe, '生存压力', '你的队伍凑不出基地租金，机票钱要靠众筹。',
    [
      opt('stream', '开播贴补', '一边直播一边打，赚点生活费。', 0.65,
        [stat('BALANCE', 400), metric('FAME', 2), stat('ENERGY', -6)],
        [stat('ENERGY', -8), metric('FORM', -2)],
        ['你的直播间只有二十个观众，但够付水电了。'], ['直播占用了复盘时间。'], `${cyberCafe}-qualifier`),
      opt('scrimp', '省吃俭用', '把每一分钱都花在刀刃上。', 0.7,
        [stat('BALANCE', -150), stat('MORALE', 4)],
        [stat('MORALE', -3)],
        ['你学会了十块钱吃一天。'], ['营养跟不上，状态忽高忽低。'], `${cyberCafe}-qualifier`),
    ]),
});
events.push({
  ...chain(cyberCafe, '国际预选', '你们靠众筹的机票飞往国际赛场，落地睡机场地毯。',
    [
      opt('go-all-in', '全力出线', '把命押在这几场比赛上。', 0.55,
        [metric('FAME', 8), stat('ENERGY', -12), metric('TEAM_STATUS', 5)],
        [stat('ENERGY', -14), metric('FAME', -3)],
        ['你们爆冷杀进了正赛，全场都在喊你们的名字。'], ['出线差一步，但你已经证明了自己。'], `${cyberCafe}-offer`),
      opt('conserve', '保存体力', '先把状态稳住，别在预选就燃尽。', 0.68,
        [metric('FORM', 4), metric('FAME', 2)],
        [metric('FAME', -3)],
        ['你稳扎稳打地打完了预选。'], ['保守让队伍错过了关键的机会。'], `${cyberCafe}-offer`),
    ]),
});
events.push({
  ...chain(cyberCafe, '豪门邀请', '欧洲豪门发来高薪替补邀请——去，还是留在老家继续吃苦？',
    [
      opt('go-abroad', '出国加盟', '为了现实生活与更大的舞台。', 0.62,
        [stat('BALANCE', 1800), metric('FAME', 5), metric('TEAM_STATUS', -3)],
        [metric('FAME', -3), stat('MORALE', -5)],
        ['你踏上了飞往欧洲的航班。'], ['语言与文化的隔阂扑面而来。'], `${cyberCafe}-rise`),
      opt('stay-home', '留守老家', '和兄弟们把赛区的火种带起来。', 0.7,
        [worldline('region-guardian'), metric('CLUB_FAVOR', 7), metric('FAN_REPUTATION', 5), metric('FAME', -3)],
        [worldline('region-guardian'), stat('BALANCE', -400)],
        ['你拒绝了报价，家乡的网吧挂起了你的海报。'], ['日子依旧清贫，但心是热的。'], `region-guardian-home`),
    ]),
});
events.push({
  ...chain(cyberCafe, '草根传奇', '从黑网吧到世界舞台，你的故事成了赛区的灯塔。',
    [
      opt('keep-dream', '继续追梦', '把这条路走到更远的地方。', 0.65,
        [stat('MORALE', 9), metric('FAME', 5), stat('ENERGY', -6)],
        [stat('ENERGY', -8)],
        ['你站在世界赛的舞台上，想起黑网吧的风扇声。'], ['梦想的下一站依然遥远。'], null),
      opt('give-back', '衣锦还乡', '回到家乡，把经验和资源带回去。', 0.72,
        [metric('FAN_REPUTATION', 7), metric('FAME', 3), attr('LEADERSHIP', 1)],
        [metric('FAME', -3)],
        ['你在家乡开了第一家真正的电竞俱乐部。'], ['有人说你本可以走得更远。'], null),
    ]),
});

// —— revenge-squad 被抛弃者的复仇记 ——
const revengeSquad = 'revenge-squad';
events.push({
  ...chain(revengeSquad, '被放弃的新人', '你被寄予厚望，却在一场青训赛后被队伍放弃——理由是"不适合这支队伍"。',
    [
      opt('rage', '燃起怒火', '记住这份羞辱，向所有人证明他们错了。', 0.6,
        [stat('STRESS', 8), metric('FORM', 3), stat('MORALE', -4)],
        [stat('STRESS', 10), stat('MORALE', -6)],
        ['你收拾储物柜时手在发抖。'], ['愤怒让夜里的复盘变成了折磨。'], `${revengeSquad}-assemble`),
      opt('calm', '冷静处理', '体面离开，把不甘收进背包。', 0.7,
        [stat('MORALE', 3), metric('FAME', -3)],
        [stat('MORALE', -3)],
        ['你和每个人都握了手。'], ['礼貌之下，野心在暗涌。'], `${revengeSquad}-assemble`),
    ]),
});
events.push({
  ...chain(revengeSquad, '搜罗弃子', '你找了一群同样被各队淘汰的"弃子"，组建自己的队伍。',
    [
      opt('wide-net', '广撒网', '先把队伍凑起来，磨合的事再说。', 0.65,
        [metric('TEAM_STATUS', 4), metric('FAME', 2)],
        [metric('TEAM_STATUS', 2), stat('STRESS', 5)],
        ['五个人，五个被放弃的故事。'], ['纸面实力看着有些寒酸。'], `${revengeSquad}-grudge`),
      opt('careful', '精挑细选', '宁缺毋滥，只找和你一样饿的人。', 0.6,
        [attr('LEADERSHIP', 1), metric('TEAM_STATUS', 5)],
        [metric('TEAM_STATUS', 2), metric('FAME', -3)],
        ['你面试了二十多个人，留下了三个。'], ['阵容凑齐用了整整两个月。'], `${revengeSquad}-grudge`),
    ]),
});
events.push({
  ...chain(revengeSquad, '复仇羁绊', '赛程表出来了——首轮就要对阵你的老东家。',
    [
      opt('grudge-match', '死磕老东家', '把全部资源砸在这场复仇战上。', 0.5,
        [metric('FAME', 7), attr('CLUTCH', 1), metric('TEAM_RELATIONSHIP', -3)],
        [metric('FAME', -4), stat('STRESS', 8)],
        ['你们赢了！旧队友的脸色精彩极了。'], ['复仇的执念让你在赛前失眠。'], `${revengeSquad}-decision`),
      opt('professional', '公事公办', '只当这是一场普通比赛。', 0.7,
        [metric('TEAM_STATUS', 5), metric('FAME', 2)],
        [metric('FAME', -2)],
        ['你平静地打完了比赛。'], ['赢是赢了，但心里总缺了点什么。'], `${revengeSquad}-decision`),
    ]),
});
events.push({
  ...chain(revengeSquad, '恩怨与远方', '复仇之战消耗了太多，接下来的联赛积分同样重要。',
    [
      opt('keep-grudge', '继续死磕', '以后每遇老东家都要全力打。', 0.55,
        [metric('FAME', 6), stat('ENERGY', -10), metric('TEAM_STATUS', -2)],
        [stat('ENERGY', -12), metric('TEAM_STATUS', -4)],
        ['"见一次打一次。"你对着镜头说。'], ['全队都被复仇情绪带偏了节奏。'], `${revengeSquad}-redemption`),
      opt('let-go', '放下恩怨', '把精力留给冠军，而不是旧伤。', 0.7,
        [metric('TEAM_STATUS', 7), stat('MORALE', 5)],
        [metric('FAME', -3)],
        ['你选择向前看。'], ['老东家觉得你"怂了"。'], `${revengeSquad}-redemption`),
      opt('guard-region', '放下恩怨，守护赛区', '复仇没那么重要了，你想让更多像你的人有地方可去。', 0.65,
        [worldline('region-guardian'), metric('FAN_REPUTATION', 4), metric('CLUB_FAVOR', 4)],
        [worldline('region-guardian'), stat('MORALE', -3)],
        ['你留在了赛区，开始带新人。'], ['留下意味着放弃更大的舞台。'], 'region-guardian-home'),
    ]),
});
events.push({
  ...chain(revengeSquad, '复仇或放下', '这支由弃子组成的队伍，最终走到了你从未想过的高度。',
    [
      opt('forgive', '与过去和解', '你终于明白，被抛弃有时是另一种成全。', 0.72,
        [stat('MORALE', 9), metric('FAN_REPUTATION', 5)],
        [stat('MORALE', -2)],
        ['夺冠那天，你在采访里感谢了所有人，包括他们。'], ['和解来得比想象中晚了一些。'], null),
      opt('complete', '完成复仇', '用冠军奖杯向所有看轻你的人宣战。', 0.55,
        [metric('FAME', 8), stat('MORALE', 5), stat('ENERGY', -8)],
        [stat('ENERGY', -10), metric('FAME', -2)],
        ['你举着奖杯，看着观众席，笑了。'], ['复仇完成了，但心里空了一块。'], null),
    ]),
});

// —— region-guardian 守擂赛区的寂寞孤勇者 ——
const regionGuardian = 'region-guardian';
events.push({
  ...chain(regionGuardian, '家乡的赛场', '你的枪法足以进入任何豪门，但你选择留在电竞荒漠般的家乡。',
    [
      opt('root', '扎根家乡', '先在家乡打出身价，让这里的孩子看到希望。', 0.7,
        [metric('CLUB_FAVOR', 6), metric('FAME', -2), metric('FAN_REPUTATION', 4)],
        [metric('FAME', -3), stat('MORALE', -2)],
        ['你的海报贴满了本地的网吧。'], ['舞台太小，你的光芒照不出去。'], `${regionGuardian}-ceiling`),
      opt('look-out', '眺望海外', '心里清楚，想拿冠军就得离开。', 0.6,
        [metric('FAME', 3), metric('CLUB_FAVOR', -3)],
        [stat('MORALE', -3)],
        ['你在深夜翻看海外赛区的转会新闻。'], ['犹豫让你两边都难以投入。'], `${regionGuardian}-ceiling`),
    ]),
});
events.push({
  ...chain(regionGuardian, '赛区天花板', '队友的实力决定了你们的上限，世界冠军遥不可及。',
    [
      opt('accept', '接受命运', '用一己之力把队伍抬到不属于他们的高度。', 0.65,
        [stat('MORALE', 3), metric('TEAM_STATUS', 5), metric('FAME', 3)],
        [stat('MORALE', -3), stat('STRESS', 5)],
        ['你一个人拖着队伍打进了世界赛。'], ['每次出局，你都是那个最亮也最孤独的。'], `${regionGuardian}-invite`),
      opt('frustrate', '心生不甘', '凭什么我要困在这里？', 0.55,
        [stat('STRESS', 8), metric('FORM', 2)],
        [stat('STRESS', 10), metric('TEAM_RELATIONSHIP', -4)],
        ['你在训练里发了火。'], ['队友们看你的眼神变得小心翼翼。'], `${regionGuardian}-invite`),
    ]),
});
events.push({
  ...chain(regionGuardian, '豪门邀约', '欧洲顶级豪门第三次发来邀请，条件优渥到让人无法拒绝。',
    [
      opt('tempted', '心动', '去看看更大的世界，也许冠军就在那里。', 0.6,
        [metric('FAME', 3), stat('STRESS', 6)],
        [stat('STRESS', 8), metric('CLUB_FAVOR', -3)],
        ['你把邀请函看了又看。'], ['犹豫被媒体写成了"身在曹营心在汉"。'], `${regionGuardian}-stay`),
      opt('steadfast', '不为所动', '家乡的孩子需要有人证明这条路走得通。', 0.7,
        [metric('CLUB_FAVOR', 6), stat('MORALE', 4), metric('FAME', -2)],
        [metric('FAME', -3)],
        ['你婉拒了豪门，本地论坛炸了锅。'], ['有人说你傻，有人说你是英雄。'], `${regionGuardian}-stay`),
    ]),
});
events.push({
  ...chain(regionGuardian, '守门人', '去豪门当争冠拼图，还是留在家乡做永远无法捧杯的英雄？',
    [
      opt('stay', '留守赛区', '做那个守护星火的守门人。', 0.7,
        [metric('CLUB_FAVOR', 9), metric('FAN_REPUTATION', 6), metric('FAME', -4)],
        [metric('FAME', -5), stat('MORALE', -3)],
        ['你留下了，整个赛区都松了一口气。'], ['深夜你会想：如果当年走了呢？'], `${regionGuardian}-legacy`),
      opt('leave', '出走豪门', '为自己活一次，去争那座冠军奖杯。', 0.6,
        [metric('FAME', 7), metric('FAN_REPUTATION', -5), stat('BALANCE', 1500)],
        [metric('FAN_REPUTATION', -7), stat('MORALE', -4)],
        ['你离开了，家乡的孩子们在直播里骂你叛徒。'], ['豪门的光环并没有想象中温暖。'], `${regionGuardian}-legacy`),
    ]),
});
events.push({
  ...chain(regionGuardian, '星火守望', '无论你去了哪里，这片赛区都因你而不同。',
    [
      opt('pass-torch', '薪火相传', '把经验与技术教给下一代。', 0.68,
        [attr('LEADERSHIP', 2), metric('FAME', 3), metric('FAN_REPUTATION', 5)],
        [stat('ENERGY', -6)],
        ['你带出的年轻人开始在世界赛崭露头角。'], ['培养新人比你想象的更花时间。'], null),
      opt('no-regret', '无悔守望', '选择本身，就是答案。', 0.75,
        [stat('MORALE', 8), metric('FAN_REPUTATION', 4)],
        [stat('MORALE', -2)],
        ['"如果重来一次，我还是会留下。"'], ['偶尔的遗憾在奖杯面前显得很轻。'], null),
    ]),
});

// —— grind-machine 死磕一万小时的死斗狂人 ——
const grindMachine = 'grind-machine';
events.push({
  ...chain(grindMachine, '被质疑的开挂者', '你的预判准得不像人类，出道第一年就被怀疑开挂。',
    [
      opt('prove-silently', '默默训练', '用成绩说话，不辩解。', 0.7,
        [stat('MORALE', 4), metric('FAME', -2)],
        [stat('STRESS', 5), metric('FAME', -3)],
        ['你照常每天打完训练计划。'], ['质疑声并不会因为你沉默就消失。'], `${grindMachine}-discipline`),
      opt('prove-publicly', '公开自证', '直播练枪房，让所有人看到你练了什么。', 0.6,
        [metric('FAME', 4), stat('STRESS', 5)],
        [stat('STRESS', 7), metric('FAN_REPUTATION', -3)],
        ['你把练枪录像公开，弹幕逐渐安静了。'], ['公开透明也让你背上了表演的质疑。'], `${grindMachine}-discipline`),
    ]),
});
events.push({
  ...chain(grindMachine, '一万小时', '你的日常是四小时练枪、十小时看Demo，单调得像苦行僧。',
    [
      opt('push-harder', '再加练', '天赋不够，时间凑。', 0.62,
        [attr('CONSISTENCY', 1), stat('ENERGY', -10), metric('FAME', -3)],
        [stat('ENERGY', -13), stat('STRESS', 6)],
        ['你比队里任何人都早到训练室。'], ['透支开始影响睡眠。'], `${grindMachine}-social`),
      opt('balanced', '劳逸结合', '科学训练，保证休息。', 0.7,
        [metric('FORM', 4), stat('MORALE', 3)],
        [metric('FORM', -2)],
        ['你把训练计划调整得更科学了。'], ['效率上去了，但心里总觉得练得不够。'], `${grindMachine}-social`),
    ]),
});
events.push({
  ...chain(grindMachine, '社交的代价', '队友在聚会放假，你独自留在训练室；家人也在催你找对象。',
    [
      opt('keep-grinding', '继续独行', '孤独是变强的代价。', 0.65,
        [attr('CONSISTENCY', 1), stat('MORALE', -4), metric('FAME', -2)],
        [stat('MORALE', -6), stat('STRESS', 5)],
        ['训练室只剩你一个人和沙袋碰撞声。'], ['你在深夜感到前所未有的孤独。'], `${grindMachine}-peak`),
      opt('socialize', '分心生活', '试着融入大家，兼顾感情。', 0.6,
        [stat('MORALE', 5), metric('FORM', -4)],
        [metric('FORM', -6), stat('MORALE', -2)],
        ['你参加了久违的队内聚餐。'], ['休息带来的手感下滑让你焦虑。'], `${grindMachine}-peak`),
    ]),
});
events.push({
  ...chain(grindMachine, '纪律兑现', '关键时刻，一万小时的肌肉记忆替你做出了最冷静的选择。',
    [
      opt('execute', '冷酷执行', '相信纪律，永远站该站的位置。', 0.72,
        [metric('FORM', 6), metric('FAME', 5)],
        [metric('FAME', -2), stat('ENERGY', -5)],
        ['你像机器一样终结了比赛，解说反复回放你的站位。'], ['执行失误时，纪律的漏洞格外刺眼。'], `${grindMachine}-habit`),
      opt('improvise', '即兴发挥', '偶尔也相信一次直觉。', 0.55,
        [attr('CLUTCH', 1), metric('FAME', 3), metric('FORM', -2)],
        [metric('FORM', -4), metric('FAME', -2)],
        ['你赌了一把，赌赢了。'], ['赌徒式的操作让你心有余悸。'], `${grindMachine}-habit`),
      opt('break-free', '释放一次天性', '自律了太久，你想试试不按剧本打一天。', 0.55,
        [worldline('rule-breaker'), metric('FAME', 3), metric('FAN_REPUTATION', 3)],
        [worldline('rule-breaker'), metric('FORM', -4)],
        ['那天你混烟、干拉、打出了久违的野性。'], ['野性的代价是纪律的崩盘。'], 'rule-breaker-style'),
    ]),
});
events.push({
  ...chain(grindMachine, '习惯成自然', '当年那个被质疑开挂的少年，成了别人眼中的标杆。',
    [
      opt('keep-habit', '保持苦修', '把这份自律带到职业生涯的终点。', 0.68,
        [attr('CONSISTENCY', 1), stat('ENERGY', -7), metric('FAME', 3)],
        [stat('ENERGY', -9)],
        ['你的作息比闹钟还准，队友都习惯了。'], ['苦修的日子还在继续。'], null),
      opt('ease-up', '松开一点', '终于学会，生活不止有CS。', 0.7,
        [stat('MORALE', 6), metric('FAME', -2)],
        [metric('FORM', -2)],
        ['你开始偶尔休假、学做饭、交朋友。'], ['放松的日子让手感有些生疏。'], null),
    ]),
});

// —— tactical-captain 从枪头转战术的铁血队长 ——
const tacticalCaptain = 'tactical-captain';
events.push({
  ...chain(tacticalCaptain, '枪法不出众', '你的枪法在同龄人里算不上顶尖，对枪总是差一口气——想留下来，只能靠脑子。',
    [
      opt('deny', '不服气', '继续和更强的对手对枪，用子弹证明自己。', 0.5,
        [metric('FAME', 2), stat('ENERGY', -10), metric('FORM', -4)],
        [stat('ENERGY', -12), metric('FORM', -7)],
        ['你又一次白给，弹幕开始刷"退役吧"。'], ['不服气让你和替补席越来越近。'], `${tacticalCaptain}-switch`),
      opt('accept', '承认现实', '枪不行了，就用脑子打。', 0.68,
        [stat('MORALE', 3), metric('TEAM_STATUS', 3), metric('FAME', -3)],
        [metric('FAME', -4)],
        ['你主动找教练谈转型。'], ['放下枪手身份的滋味不好受。'], `${tacticalCaptain}-switch`),
    ]),
});
events.push({
  ...chain(tacticalCaptain, '转任指挥', '你成了队里的指挥官，死记硬背了三百套战术。',
    [
      opt('memorize', '死记战术', '用努力把每一套战术刻进肌肉记忆。', 0.65,
        [attr('GAME_SENSE', 1), stat('STRESS', 7), metric('TEAM_STATUS', 4)],
        [stat('STRESS', 9), metric('FORM', -3)],
        ['你在笔记本上画满了战术图。'], ['指挥的脑子常常过载。'], `${tacticalCaptain}-overload`),
      opt('refuse', '拒绝转型', '宁可替补，也不当指挥。', 0.6,
        [metric('FORM', 4), metric('TEAM_STATUS', -4)],
        [metric('TEAM_STATUS', -6), metric('FAME', -3)],
        ['你拒绝了队长的袖标。'], ['队伍不得不另找指挥，你的位置更尴尬了。'], `${tacticalCaptain}-overload`),
    ]),
});
events.push({
  ...chain(tacticalCaptain, '大脑过载', '比赛中你要同时算经济、猜战术、吼位置，大脑疲劳值狂涨。',
    [
      opt('simplify', '简化体系', '砍掉花哨战术，只留最扎实的几套。', 0.7,
        [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 5), stat('STRESS', -4)],
        [metric('TEAM_STATUS', 2)],
        ['队伍的执行力明显变强了。'], ['对手开始摸清你们的套路。'], `${tacticalCaptain}-trust`),
      opt('overload', '硬撑复杂', '把每个细节都算到，哪怕累垮自己。', 0.55,
        [metric('FAME', 3), stat('STRESS', 10), metric('FORM', -4)],
        [stat('STRESS', 12), metric('FORM', -6)],
        ['你神乎其技的指挥让对手头皮发麻。'], ['赛后你在休息室躺了很久。'], `${tacticalCaptain}-trust`),
    ]),
});
events.push({
  ...chain(tacticalCaptain, '信任危机', '你的战术被对手识破，自己的对枪又连续输掉——队员开始质疑你。',
    [
      opt('roar', '吼出气势', '用嗓门和气势稳住军心，哪怕数据难看。', 0.6,
        [attr('LEADERSHIP', 1), metric('TEAM_STATUS', 5), stat('STRESS', 7)],
        [stat('STRESS', 9), metric('TEAM_RELATIONSHIP', -3)],
        ['你在暂停时吼醒了全队。'], ['大嗓门也掩盖不了成绩的下滑。'], `${tacticalCaptain}-general`),
      opt('analyze', '冷静复盘', '用数据说服所有人。', 0.68,
        [stat('STRESS', 4), metric('TEAM_STATUS', 3)],
        [metric('TEAM_STATUS', -2)],
        ['你拿出录像，逐帧指出问题。'], ['理性在士气低迷时显得无力。'], `${tacticalCaptain}-general`),
    ]),
});
events.push({
  ...chain(tacticalCaptain, '铁血指挥官', '你终于把"打不好枪的突破手"活成了"整个赛区都怕的战术大脑"。',
    [
      opt('general', '终成帅才', '用脑子赢下职业生涯的黄金期。', 0.65,
        [attr('LEADERSHIP', 2), metric('FAME', 6), metric('TEAM_STATUS', 4)],
        [stat('ENERGY', -8)],
        ['你的队伍成了战术教科书的案例。'], ['指挥的担子越来越重。'], null),
      opt('exit', '光荣转身', '在声望最高时，把指挥棒交给年轻人。', 0.72,
        [stat('MORALE', 8), metric('FAN_REPUTATION', 6)],
        [metric('FAME', -2)],
        ['你退役时，无数指挥选手说受你启发。'], ['也有人遗憾你没再带一届。'], null),
    ]),
});

// —— injury-warrior 战胜伤病与衰老的老兵 ——
const injuryWarrior = 'injury-warrior';
events.push({
  ...chain(injuryWarrior, '伤病爆发', '刚打出一点名堂，你的手腕突然传来撕裂般的剧痛——腱鞘炎。',
    [
      opt('surgery-now', '立即手术', '长痛不如短痛，接受手术。', 0.68,
        [stat('ENERGY', -10), stat('MORALE', 3), metric('FORM', -6)],
        [stat('MORALE', -4), metric('FORM', -8)],
        ['手术很成功，但康复期以月计算。'], ['手术后的手腕依然不听使唤。'], `${injuryWarrior}-surgery`),
      opt('bandage', '保守治疗', '打固定、吃药，先撑过这赛季。', 0.55,
        [metric('FORM', -3), stat('STRESS', 6)],
        [metric('FORM', -6), stat('STRESS', 9)],
        ['你缠着绷带继续打完了季后赛。'], ['保守治疗让伤情反反复复。'], `${injuryWarrior}-surgery`),
    ],
  [flag('wrist-injury', '手腕旧伤', 'CAREER', { trigger: 'injury-warrior' })]),
});
events.push({
  ...chain(injuryWarrior, '手术之后', '康复期的每一次握拳都在告诉你：巅峰回不去了。',
    [
      opt('rehab', '配合康复', '老老实实做理疗，接受缓慢的恢复。', 0.7,
        [stat('ENERGY', 6), stat('MORALE', 4), metric('FORM', -4)],
        [stat('MORALE', -3)],
        ['你每天泡在理疗室，手腕一点点找回知觉。'], ['恢复的速度让你心急如焚。'], `${injuryWarrior}-pain`),
      opt('rush-back', '提前复出', '队里需要你，你不能缺席。', 0.5,
        [metric('FORM', 2), stat('STRESS', 10), stat('ENERGY', -8)],
        [metric('FORM', -6), stat('STRESS', 12), stat('ENERGY', -10)],
        ['你提前三个月回到了赛场。'], ['复出首战，你的手腕再次报警。'], `${injuryWarrior}-pain`),
    ]),
});
events.push({
  ...chain(injuryWarrior, '疼痛回归', '每一场比赛后手腕都会剧烈疼痛，你的训练量必须减半。',
    [
      opt('physio', '物理治疗', '把治疗当成训练的一部分。', 0.7,
        [stat('ENERGY', 6), metric('FORM', 3), stat('BALANCE', -200)],
        [stat('ENERGY', -5)],
        ['你的行李箱里永远装着理疗仪。'], ['治疗费用让钱包有些吃紧。'], `${injuryWarrior}-injection`),
      opt('grin-bear', '强忍训练', '疼就疼吧，比赛不等人。', 0.55,
        [metric('FORM', 4), stat('STRESS', 8)],
        [metric('FORM', -5), stat('STRESS', 11)],
        ['你咬着牙完成了全部训练量。'], ['当晚你疼得睡不着觉。'], `${injuryWarrior}-injection`),
    ]),
});
events.push({
  ...chain(injuryWarrior, '生死局的选择', '赛季最重要的一场比赛，医生警告：打封闭上场可能永久损伤手腕。',
    [
      opt('injection', '打封闭上场', '用巅峰状态赌一场比赛，哪怕赔上职业生涯。', 0.5,
        [attr('CLUTCH', 2), metric('FAME', 6), stat('STRESS', 12), metric('FORM', 4)],
        [metric('FAME', -4), stat('STRESS', 14), metric('FORM', -6)],
        ['你打出了职业生涯最辉煌的一战。'], ['针头拔出的瞬间，你知道代价已经付下。'], `${injuryWarrior}-lastdance`),
      opt('bench', '打替补', '把位置让给健康的人，自己看着队伍战斗。', 0.7,
        [worldline('late-bloomer'), metric('TEAM_STATUS', 4), stat('MORALE', -4), metric('FAME', -3)],
        [worldline('late-bloomer'), stat('MORALE', -6)],
        ['你坐在替补席上，看着队伍赢下了比赛。'], ['赢了，但你缺席了最重要的战场。'], `late-bloomer-start`),
    ]),
});
events.push({
  ...chain(injuryWarrior, '最后一舞', '伤病给了你倒计时，但你决定用自己喜欢的方式告别。',
    [
      opt('grand-final', '完美谢幕', '在状态允许的最后一年，拼尽全力不留遗憾。', 0.55,
        [metric('FAME', 9), stat('MORALE', 7), stat('ENERGY', -10)],
        [stat('ENERGY', -12), metric('FAME', -2)],
        ['你在退役战打出了全场最佳。'], ['谢幕战差一点就是冠军，但你已经笑了。'], null),
      opt('linger', '坚持到底', '只要还能握住鼠标，就继续打。', 0.5,
        [metric('FAME', 3), stat('STRESS', 9), stat('MORALE', 3)],
        [stat('STRESS', 12), metric('FORM', -6)],
        ['你打到了医生严令禁止的那一天。'], ['身体最终替你做下了决定。'], null),
    ]),
});

// —— 骨架扩展：每条线追加 cost / climax / finale 三段（事件 6-8）——
for (const line of Object.keys(SLUGS)) SLUGS[line].push('cost', 'climax', 'finale');
GATES['late-bloomer'].push(
  [attrCond('GAME_SENSE', 72), metricCond('FORM', 55)],
  [attrCond('GAME_SENSE', 75), metricCond('FAME', 45)],
  [attrCond('GAME_SENSE', 78), metricCond('FAME', 55)],
);
GATES['team-battery'].push(
  [metricCond('CLUB_FAVOR', 42), metricCond('TEAM_STATUS', 40)],
  [metricCond('CLUB_FAVOR', 48), metricCond('FORM', 55)],
  [metricCond('CLUB_FAVOR', 52), metricCond('FAN_REPUTATION', 40)],
);
GATES['cyber-cafe-hero'].push(
  [statCond('BALANCE', 900), metricCond('FAME', 35)],
  [metricCond('FAME', 45), metricCond('TEAM_STATUS', 30)],
  [metricCond('FAME', 55), metricCond('CLUB_FAVOR', 35)],
);
GATES['revenge-squad'].push(
  [metricCond('FAME', 45), metricCond('TEAM_STATUS', 40)],
  [metricCond('FAME', 55), attrCond('CLUTCH', 65)],
  [metricCond('FAME', 62), statCond('MORALE', 75)],
);
GATES['region-guardian'].push(
  [metricCond('FAN_REPUTATION', 45), metricCond('FAME', 40)],
  [metricCond('FAN_REPUTATION', 55), metricCond('FAME', 50)],
  [metricCond('FAN_REPUTATION', 65), attrCond('LEADERSHIP', 65)],
);
GATES['grind-machine'].push(
  [attrCond('CONSISTENCY', 72), attrCond('GAME_SENSE', 65)],
  [attrCond('CONSISTENCY', 75), metricCond('FAME', 30)],
  [attrCond('CONSISTENCY', 78), statCond('MORALE', 70)],
);
GATES['tactical-captain'].push(
  [attrCond('GAME_SENSE', 68), statCond('STRESS', 50)],
  [attrCond('GAME_SENSE', 74), attrCond('LEADERSHIP', 60)],
  [attrCond('GAME_SENSE', 78), attrCond('LEADERSHIP', 66)],
);
GATES['injury-warrior'].push(
  [statCond('STRESS', 60), statCond('ENERGY', 45, true)],
  [statCond('STRESS', 65), metricCond('FAME', 45)],
  [metricCond('FAME', 50), statCond('MORALE', 55)],
);

// —— 新增事件（每线 cost/climax/finale）——
const lateBloomer2 = 'late-bloomer';
events.push({ ...chain(lateBloomer2, '与年轻人为敌', '每一年都有更强的年轻人出现，你的反应在肉眼可见地变慢。', [
  opt('duel', '硬碰硬', '用经验补上反应，和他们正面较量。', 0.6, [metric('FORM', 3), stat('ENERGY', -8)], [metric('FORM', -4), metric('FAME', -3)], ['你赢了那批年轻人。'], ['年轻人让你看清了岁月。'], `${lateBloomer2}-climax`),
  opt('mentor', '以老带新', '把位置让一半，换一种方式留在这支队伍。', 0.72, [attr('LEADERSHIP', 1), metric('FAME', -2)], [metric('FAME', -3), metric('TEAM_STATUS', -2)], ['你带的新人开始发光。'], ['让步让你失去了首发。'], `${lateBloomer2}-climax`),
]) });
events.push({ ...chain(lateBloomer2, '迟来的巅峰', '十载饮冰，你终于站上了最有分量的决赛舞台。', [
  opt('burn-decade', '燃烧十年', '把攒了十年的力气全用在这一晚。', 0.55, [attr('CLUTCH', 1), stat('ENERGY', -10), metric('FAME', 6)], [stat('ENERGY', -12), metric('FAME', -3)], ['你打出了生涯最佳一战。'], ['燃烧的尽头是遗憾。'], `${lateBloomer2}-finale`),
  opt('sage-win', '智慧取胜', '用十年经验拆解对手。', 0.68, [attr('GAME_SENSE', 1), metric('FAME', 4)], [metric('FAME', -2)], ['你像下棋一样赢下了决赛。'], ['老练有时也被说成无趣。'], `${lateBloomer2}-finale`),
]) });
events.push({ ...chain(lateBloomer2, '迟到的加冕', '奖杯终于等到了它的主人。', [
  opt('lift', '捧起奖杯', '把十年前的梦想举过头顶。', 0.65, [metric('FAME', 10), stat('MORALE', 9)], [stat('MORALE', -4), metric('FAME', -3)], ['你举杯的手在抖。'], ['命运又开了最后一个玩笑。'], null),
  opt('no-regret', '无悔收官', '无论结局如何，这条路已经值了。', 0.75, [stat('MORALE', 9), metric('FAN_REPUTATION', 5)], [stat('MORALE', -2)], ['你笑着转身，没有遗憾。'], ['有人说你差点就能夺冠了。'], null),
]) });

const teamBattery2 = 'team-battery';
events.push({ ...chain(teamBattery2, '牺牲的账单', '多年的牺牲在身体上记了账，你的手腕和腰开始抗议。', [
  opt('keep-devote', '继续付出', '只要队伍还在赢，就值得。', 0.65, [metric('CLUB_FAVOR', 6), stat('ENERGY', -7)], [stat('ENERGY', -10), metric('FORM', -3)], ['你把止痛药塞进了抽屉。'], ['身体的账单越欠越多。'], `${teamBattery2}-climax`),
  opt('bargain', '讨价还价', '让俱乐部看见你的价值。', 0.6, [stat('BALANCE', 400), metric('TEAM_RELATIONSHIP', -3)], [metric('TEAM_RELATIONSHIP', -5), metric('CLUB_FAVOR', -3)], ['你谈下了更高的薪水。'], ['谈薪让管理层皱了眉。'], `${teamBattery2}-climax`),
]) });
events.push({ ...chain(teamBattery2, '大舞台的证明', '决赛的赛点局，教练把最脏的活交给了你。', [
  opt('silent-work', '默默付出', '冲烟、探点、发枪——你做了所有没人记得的事。', 0.68, [metric('TEAM_STATUS', 7), metric('FAME', -2)], [metric('FAME', -4), metric('FORM', -3)], ['你们赢了，你在角落笑了。'], ['胜利的采访没有你的镜头。'], `${teamBattery2}-finale`),
  opt('spotlight', '抢一次镜头', '这次，让数据也好看一回。', 0.55, [metric('FAME', 5), metric('FORM', 2)], [metric('FORM', -4), metric('TEAM_STATUS', -3)], ['你打出了生涯最亮的一局。'], ['抢镜的代价是队伍的失误。'], `${teamBattery2}-finale`),
]) });
events.push({ ...chain(teamBattery2, '无名功臣', '退役多年后，人们才开始谈论你的价值。', [
  opt('accept-title', '接受称号', '"没有他，队伍赢不了"——这句话就够了。', 0.75, [stat('MORALE', 9), metric('FAN_REPUTATION', 5)], [stat('MORALE', -2)], ['年度致敬短片里，第一个是你。'], ['致敬来得有些晚。'], null),
  opt('own-moment', '为自己争一次', '在告别前，打一场属于自己的比赛。', 0.58, [metric('FAME', 5), stat('MORALE', 4)], [metric('FORM', -4), metric('FAME', -2)], ['你终于打了一回主枪手。'], ['那把枪在你手里有些陌生。'], null),
]) });

const cyberCafe2 = 'cyber-cafe-hero';
events.push({ ...chain(cyberCafe2, '贫瘠的磨炼', '赛区的训练条件依然简陋，对手的基地却越来越豪华。', [
  opt('rough-it', '苦中作乐', '设备差没关系，赢就行。', 0.68, [stat('MORALE', 5), stat('ENERGY', -6)], [stat('ENERGY', -9), metric('FORM', -3)], ['你们用二十块的电竞椅打进了四强。'], ['掉帧让关键局功亏一篑。'], `${cyberCafe2}-climax`),
  opt('sponsor', '找赞助', '出去路演、打广告，给队伍换套设备。', 0.6, [stat('BALANCE', 600), metric('FAME', -2)], [stat('BALANCE', -300), metric('FAME', -3)], ['你拉来了第一笔赞助。'], ['赞助商只想要你的脸，不想要你的队伍。'], `${cyberCafe2}-climax`),
]) });
events.push({ ...chain(cyberCafe2, '世界赛之夜', '你们第一次站上世界赛的舞台，灯光晃得人睁不开眼。', [
  opt('go-big', '放手一搏', '让全世界记住你们的名字。', 0.58, [metric('FAME', 8), stat('STRESS', 6)], [metric('FAME', -3), metric('FORM', -4)], ['你们赢了世界赛首战，弹幕刷屏。'], ['世界赛的强度远超想象。'], `${cyberCafe2}-finale`),
  opt('enjoy', '享受舞台', '能站在这里，已经是很多人的梦了。', 0.72, [stat('MORALE', 6), metric('FORM', 3)], [metric('FAME', -2)], ['你打出了久违的轻松。'], ['享受比赛也让成绩平庸。'], `${cyberCafe2}-finale`),
]) });
events.push({ ...chain(cyberCafe2, '衣锦还乡', '黑网吧门口挂满了你的海报，当年的老板请你吃饭。', [
  opt('give-back', '回报家乡', '把赞助和经验带回去，让更多人追梦。', 0.7, [metric('FAN_REPUTATION', 8), metric('CLUB_FAVOR', 6), attr('LEADERSHIP', 1)], [stat('ENERGY', -6)], ['你在家乡开了第一家青训营。'], ['投入比想象中大得多。'], null),
  opt('expedition', '继续远征', '梦还没有做完，继续打下去。', 0.62, [metric('FAME', 6), stat('ENERGY', -7)], [stat('ENERGY', -9), metric('FORM', -3)], ['你背上行囊，再次出发。'], ['远征的终点还是家乡。'], null),
]) });

const revengeSquad2 = 'revenge-squad';
events.push({ ...chain(revengeSquad2, '复仇的代价', '执念让队伍的成绩忽高忽低，队友开始疲惫。', [
  opt('ease', '放下部分', '冠军比复仇更重要。', 0.66, [metric('TEAM_STATUS', 5), metric('FAME', -2)], [metric('FAME', -3), stat('MORALE', -3)], ['你试着把恩怨放回抽屉。'], ['放弃执念让你失眠了一周。'], `${revengeSquad2}-climax`),
  opt('fuel', '加倍执念', '把恨意烧得更旺。', 0.55, [metric('FAME', 5), stat('STRESS', 8)], [stat('STRESS', 10), metric('TEAM_STATUS', -4)], ['你们的气势让所有人害怕。'], ['恨意也在啃噬你们自己。'], `${revengeSquad2}-climax`),
]) });
events.push({ ...chain(revengeSquad2, '巅峰对决', '决赛对阵老东家，全世界都在看这场恩怨。', [
  opt('full-revenge', '全力复仇', '把这场当成生涯最重要的比赛。', 0.55, [attr('CLUTCH', 1), metric('FAME', 8)], [metric('FAME', -5), stat('MORALE', -5)], ['你们赢了，旧队友的脸色精彩极了。'], ['复仇失败了，场面一度尴尬。'], `${revengeSquad2}-finale`),
  opt('calm-match', '平常心', '只当一场普通决赛来打。', 0.7, [metric('TEAM_STATUS', 6), stat('MORALE', 4)], [metric('FAME', -2)], ['你平静地赢下了比赛。'], ['赢得很干净，但少了点故事性。'], `${revengeSquad2}-finale`),
]) });
events.push({ ...chain(revengeSquad2, '尘埃落定', '恩怨终有尽时，这支弃子之师走到了谁也想不到的高度。', [
  opt('done', '完成复仇', '你们举起了奖杯，旧东家只能仰望。', 0.62, [metric('FAME', 9), stat('MORALE', 6)], [stat('MORALE', -4)], ['夺冠那天，你在更衣室哭了。'], ['复仇完成的瞬间，心里空了。'], null),
  opt('release', '彻底放下', '原来放下恩怨之后，世界这么大。', 0.74, [stat('MORALE', 10), metric('FAN_REPUTATION', 6)], [stat('MORALE', -2)], ['你和旧东家握了手。'], ['有人觉得你"软了"。'], null),
]) });

const regionGuardian2 = 'region-guardian';
events.push({ ...chain(regionGuardian2, '独守的深夜', '赛区只有你一个能打的人，训练室里常常只有你。', [
  opt('solo-practice', '独自加练', '一个人也要练出整个赛区的希望。', 0.66, [attr('CONSISTENCY', 1), stat('ENERGY', -8)], [stat('ENERGY', -10), stat('MORALE', -4)], ['你对着空训练室打了一晚上。'], ['孤独在深夜放大。'], `${regionGuardian2}-climax`),
  opt('grow-others', '培养新人', '把种子种下去，总有一天会长成森林。', 0.7, [attr('LEADERSHIP', 1), metric('FAME', -2)], [metric('FAME', -3)], ['你开始带三个十六岁的孩子。'], ['新人的成长比你想象的慢。'], `${regionGuardian2}-climax`),
]) });
events.push({ ...chain(regionGuardian2, '家乡保卫战', '本土举办的大赛，整个赛区的人都来看你。', [
  opt('one-man-wall', '一夫当关', '用一场胜利回报这片土地的等待。', 0.55, [metric('FAME', 8), stat('ENERGY', -10)], [stat('ENERGY', -12), metric('FAME', -3)], ['你一个人守住了赛区的尊严。'], ['一个人的墙终究会塌。'], `${regionGuardian2}-finale`),
  opt('team-first', '团队至上', '让年轻人也站上这个舞台。', 0.68, [metric('TEAM_STATUS', 7), metric('FAME', 2)], [metric('FAME', -3), metric('FORM', -3)], ['你们打出了赛区史上最好的成绩。'], ['团队的默契还差一些火候。'], `${regionGuardian2}-finale`),
]) });
events.push({ ...chain(regionGuardian2, '星火燎原', '你守了一辈子的赛区，终于长出了自己的大树。', [
  opt('witness', '见证崛起', '看着家乡的队伍走向世界，你比谁都骄傲。', 0.72, [stat('MORALE', 10), metric('FAN_REPUTATION', 7)], [stat('MORALE', -2)], ['你退役那天，全赛区都在送别。'], ['荣耀属于年轻人，你退到了幕后。'], null),
  opt('keep-guard', '继续守望', '只要还能打，就再守一年。', 0.6, [metric('CLUB_FAVOR', 7), stat('ENERGY', -6)], [stat('ENERGY', -9), metric('FORM', -4)], ['你又签了一年。'], ['守望的日子看不到尽头。'], null),
]) });

const grindMachine2 = 'grind-machine';
events.push({ ...chain(grindMachine2, '孤独的边界', '自律是一堵墙，墙外是生活，墙内是你一个人。', [
  opt('another-year', '再熬一年', '等拿了冠军，再谈生活。', 0.64, [attr('CONSISTENCY', 1), stat('MORALE', -4)], [stat('MORALE', -6), metric('FORM', -3)], ['你把训练表又排满了一年。'], ['孤独开始侵蚀状态。'], `${grindMachine2}-climax`),
  opt('live-a-little', '分心生活', '试着谈恋爱、交朋友、过周末。', 0.6, [stat('MORALE', 6), metric('FORM', -3)], [metric('FORM', -5)], ['你第一次休了完整的假期。'], ['假期回来，手感凉了。'], `${grindMachine2}-climax`),
]) });
events.push({ ...chain(grindMachine2, '纪律的绽放', '一万小时的肌肉记忆，在最重要的大赛里全部兑现。', [
  opt('execute', '机械执行', '站该站的位置，打该打的枪。', 0.7, [metric('FORM', 7), metric('FAME', 5)], [metric('FORM', -4), metric('FAME', -2)], ['你像机器一样终结了比赛。'], ['机器也会过热。'], `${grindMachine2}-finale`),
  opt('let-go', '放开手脚', '今天，让直觉代替纪律一次。', 0.55, [attr('CLUTCH', 1), metric('FAME', 4)], [metric('FORM', -5), metric('FAME', -3)], ['你打出了从没有过的操作。'], ['放开之后，你差点找不回纪律。'], `${grindMachine2}-finale`),
]) });
events.push({ ...chain(grindMachine2, '习惯的传承', '当年的质疑者早已闭嘴，你的训练表成了新的传说。', [
  opt('hand-down', '传给新人', '把一万小时的方法论写下来，教给他们。', 0.68, [attr('LEADERSHIP', 1), metric('FAME', 4)], [stat('ENERGY', -6)], ['你的训练笔记被抢着复印。'], ['没人能复刻你的十年。'], null),
  opt('rest', '享受生活', '终于可以睡个懒觉了。', 0.74, [stat('MORALE', 9)], [metric('FAME', -2)], ['退役后的第一件事：关掉闹钟。'], ['戒掉自律比自律更难。'], null),
]) });

const tacticalCaptain2 = 'tactical-captain';
events.push({ ...chain(tacticalCaptain2, '指挥的重压', '每一场比赛都在透支你的大脑，赛后你常常头痛欲裂。', [
  opt('simplify', '简化体系', '砍掉华而不实的战术，只留最扎实的。', 0.68, [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 4)], [metric('TEAM_STATUS', -3), stat('STRESS', -3)], ['队伍的执行力直线上升。'], ['简单的战术容易被摸透。'], `${tacticalCaptain2}-climax`),
  opt('carry-load', '硬扛', '把所有细节都装进脑子。', 0.55, [metric('FAME', 3), stat('STRESS', 9)], [stat('STRESS', 12), metric('FORM', -5)], ['你的指挥让人叹为观止。'], ['赛后你在休息室躺了很久。'], `${tacticalCaptain2}-climax`),
]) });
events.push({ ...chain(tacticalCaptain2, '战术大师之夜', '决赛，你像一个下棋的人，对手每走一步都被你算到。', [
  opt('grandmaster', '算无遗策', '用大脑赢下最漂亮的一场。', 0.62, [metric('FAME', 8), stat('STRESS', 7)], [metric('FAME', -4), metric('FORM', -4)], ['对手教练赛后说：他像开了上帝视角。'], ['算尽一切，也算不到那次空枪。'], `${tacticalCaptain2}-finale`),
  opt('instinct', '信任直觉', '关键时刻相信队员的本能。', 0.68, [attr('CLUTCH', 1), metric('TEAM_STATUS', 5)], [metric('FAME', -2)], ['你把最后一击交给了年轻人的直觉。'], ['直觉没有站在你们这边。'], `${tacticalCaptain2}-finale`),
]) });
events.push({ ...chain(tacticalCaptain2, '铁血的传承', '你的嗓门和战术板，成了这支队伍的图腾。', [
  opt('heir', '培养继任者', '把指挥棒交给下一任队长。', 0.68, [attr('LEADERSHIP', 2), metric('FAME', 3)], [stat('ENERGY', -6)], ['新队长第一次开口，用的是你的句式。'], ['继任者撑不起你的体系。'], null),
  opt('last-roar', '最后一吼', '用一场胜利作为谢幕。', 0.6, [stat('MORALE', 8), metric('FAME', 4)], [stat('MORALE', -4), metric('FAME', -2)], ['你吼完最后一声，转身离开。'], ['谢幕战输了，你沉默地走回更衣室。'], null),
]) });

const injuryWarrior2 = 'injury-warrior';
events.push({ ...chain(injuryWarrior2, '病痛的反复', '旧伤在赛季中段复发，治疗和上场开始拉扯。', [
  opt('therapy', '坚持理疗', '把身体放在第一位。', 0.7, [stat('ENERGY', 6), stat('BALANCE', -300)], [stat('ENERGY', -4), metric('FORM', -3)], ['你缺席了半个赛季。'], ['理疗的费用让钱包吃紧。'], `${injuryWarrior2}-climax`),
  opt('play-through', '忍痛上场', '队伍需要你，上场。', 0.55, [metric('FORM', 4), stat('STRESS', 8)], [metric('FORM', -5), stat('STRESS', 11)], ['你缠着绷带打完了系列赛。'], ['赛后你疼得直不起腰。'], `${injuryWarrior2}-climax`),
]) });
events.push({ ...chain(injuryWarrior2, '最后一场', '教练告诉你：这是你合同年的最后一场比赛。', [
  opt('injection-finale', '打封闭', '用最后的手腕，打出最响的一枪。', 0.5, [attr('CLUTCH', 1), metric('FAME', 7), stat('STRESS', 9)], [metric('FAME', -4), stat('STRESS', 12), metric('FORM', -5)], ['那一枪，全场起立。'], ['针头拔掉后，你知道这是终点。'], `${injuryWarrior2}-finale`),
  opt('goodbye', '好好告别', '打一场不疼的比赛，认真说再见。', 0.7, [stat('MORALE', 7), metric('FAME', 3)], [metric('FAME', -2)], ['你笑着打完了最后一场。'], ['告别战没有赢，但你没有遗憾。'], `${injuryWarrior2}-finale`),
]) });
events.push({ ...chain(injuryWarrior2, '谢幕与新生', '伤病夺走了你的手腕，但没有夺走你的热爱。', [
  opt('exit', '转身离开', '把鼠标轻轻放下。', 0.74, [stat('MORALE', 10), metric('FAN_REPUTATION', 7)], [stat('MORALE', -2)], ['退役发布会，你感谢了那双不肯好的手腕。'], ['深夜你还会下意识地活动手指。'], null),
  opt('coach', '转型教练', '换一种方式留在赛场。', 0.66, [attr('LEADERSHIP', 2), metric('FAME', 3)], [stat('ENERGY', -6)], ['你成了最懂疼痛的教练。'], ['看着别人打，比手疼更难受。'], null),
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
