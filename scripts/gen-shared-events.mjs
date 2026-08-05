// 生成通用随机事件池（worldlineId: 'shared'）——所有故事线的玩家在赛季推进中反复遇到。
// 用法：node scripts/gen-shared-events.mjs（会重写 assets/story/events/shared-*.json）
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/story/events');

const attr = (attribute, delta) => ({ type: 'ATTRIBUTE_CHANGE', attribute, delta });
const stat = (stat, delta) => ({ type: 'PLAYER_STAT_CHANGE', stat, delta });
const metric = (metric, delta) => ({ type: 'NARRATIVE_METRIC_CHANGE', metric, delta });
const flag = (flagId, name, category, metadata = {}) => ({ type: 'FLAG_ADD', flagId, flag: { id: flagId, name, category, metadata } });
const role = (roleId) => ({ type: 'PLAYER_ROLE_CHANGE', roleId });

const opt = (id, label, description, baseChance, successEffects, failureEffects, successMessages, failureMessages, successNextEventId = null, failureNextEventId = null) => ({
  id, label, description,
  requirements: [],
  successChance: { baseChance, modifiers: [] },
  outcome: { successEffects, failureEffects, successMessages, failureMessages, successNextEventId, failureNextEventId },
});

const events = [];

// ============ NORMAL 周期（15）============
events.push({
  id: 'shared-early-training', worldlineId: 'shared', title: '晨训加练',
  description: '天还没亮，训练室只有你一个人。要不要比队友多练一小时？',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('grind', '加练一小时', '手感是练出来的，没人会嫌枪法太准。', 0.75, [attr('AIM', 1), stat('ENERGY', -4)], [stat('ENERGY', -7)], ['你的准星比昨天更稳了。'], ['疲惫让加练变成机械重复。'], null),
    opt('sleep', '回去补觉', '休息也是训练的一部分。', 0.9, [stat('ENERGY', 3)], [stat('ENERGY', -2)], ['你睡了个回笼觉，精神饱满。'], ['闹钟响了三次你才爬起来。'], null),
  ],
});
events.push({
  id: 'shared-film-session', worldlineId: 'shared', title: '录像课',
  description: '教练把昨天的比赛录像一帧帧放给你看，问你："这里为什么不去架点？"',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('absorb', '认真听完', '把每次失误都记进脑子里。', 0.7, [attr('GAME_SENSE', 1), metric('TEAM_STATUS', 3)], [stat('STRESS', 3)], ['你第一次看懂了自己的问题。'], ['越看越觉得自己哪都是漏洞。'], null),
    opt('argue', '为自己辩解', '"当时那个情况只能那么打。"', 0.6, [metric('TEAM_RELATIONSHIP', -3)], [metric('TEAM_RELATIONSHIP', -5)], ['教练没再说话，但眼神凉了。'], ['你赢了争论，输了印象。'], null),
  ],
});
events.push({
  id: 'shared-solo-aim', worldlineId: 'shared', title: '深夜练枪',
  description: '队友都睡了，你在死斗服务器里一打就是两个小时。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('push-through', '练到关服', '肌肉记忆不会骗人。', 0.65, [attr('AIM', 1), stat('ENERGY', -6)], [stat('ENERGY', -9), stat('STRESS', 3)], ['第二天的枪感火热。'], ['第二天你差点睡过头。'], null),
    opt('call-it', '收枪休息', '今天够了，明天还要打比赛。', 0.9, [stat('ENERGY', 2)], [stat('ENERGY', -2)], ['你按点睡了，作息规律。'], ['躺在床上还在想那把残局。'], null),
  ],
});
events.push({
  id: 'shared-team-dinner', worldlineId: 'shared', title: '队内聚餐',
  description: '队友张罗着去吃烤肉，AA 下来一人一百多。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('join', '一起去', '吃顿饭，队内氛围能好不少。', 0.8, [metric('TEAM_RELATIONSHIP', 5), stat('BALANCE', -150)], [metric('TEAM_RELATIONSHIP', 2), stat('BALANCE', -200)], ['饭桌上你们聊到了半夜。'], ['你吃了顿贵的，关系也没拉近多少。'], null),
    opt('skip', '借口训练', '省点钱，也省点应酬。', 0.7, [stat('BALANCE', 0), stat('ENERGY', 2)], [metric('TEAM_RELATIONSHIP', -3)], ['你在训练室安静地待了一晚。'], ['队友觉得你不太合群。'], null),
  ],
});
events.push({
  id: 'shared-teammate-birthday', worldlineId: 'shared', title: '队友生日',
  description: '队里最小的那个今天生日，大家准备凑钱买个蛋糕。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('chip-in', '凑一份', '几十块钱，换一个更团结的更衣室。', 0.85, [metric('TEAM_RELATIONSHIP', 6), stat('BALANCE', -100)], [metric('TEAM_RELATIONSHIP', 2)], ['小队友眼眶红了，说这是他第一次过生日。'], ['蛋糕不错，就是有点贵。'], null),
    opt('pretend-forget', '装不知道', '又不是我生日，关我什么事。', 0.6, [stat('BALANCE', 0)], [metric('TEAM_RELATIONSHIP', -4)], ['你装作不知道，照常训练。'], ['队友切蛋糕时，你成了唯一的局外人。'], null),
  ],
});
events.push({
  id: 'shared-pre-match-nerves', worldlineId: 'shared', title: '赛前失眠',
  description: '明天就是大赛，你翻来覆去睡不着，心率一直降不下来。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('meditate', '冥想放松', '数呼吸，把注意力从比赛上移开。', 0.65, [stat('STRESS', -5)], [stat('STRESS', 3)], ['你终于在天亮前睡了一会儿。'], ['越想放松越清醒。'], null),
    opt('scrim-in-head', '脑子里打比赛', '把明天的地图在脑子里过一遍。', 0.55, [attr('GAME_SENSE', 1), stat('STRESS', 4)], [stat('STRESS', 8)], ['你梦见自己拿下了残局。'], ['你在脑子里输了十次。'], null),
  ],
});
events.push({
  id: 'shared-couch-criticism', worldlineId: 'shared', title: '教练批评',
  description: '复盘会上，教练当着全队的面说你这几场"打得像路人局"。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('take-it', '低头认了，回去加练', '他说得对，那就用训练回应。', 0.7, [attr('GAME_SENSE', 1), stat('MORALE', -2)], [stat('MORALE', -5)], ['你把批评咽下去，练到最晚才走。'], ['那番话在你脑子里转了一整天。'], null),
    opt('talk-back', '当场反驳', '"我数据不差，凭什么说我？"', 0.45, [metric('TEAM_RELATIONSHIP', -4), stat('MORALE', 2)], [metric('TEAM_RELATIONSHIP', -6), metric('TEAM_STATUS', -3)], ['你顶了回去，教练没再接话。'], ['更衣室的气氛降到冰点。'], null),
  ],
});
events.push({
  id: 'shared-fan-letter', worldlineId: 'shared', title: '粉丝来信',
  description: '粉丝群里有人手写了一封信，说看你比赛是他每周唯一的盼头。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('reply', '认真回一封信', '不是所有人都有资格被这样喜欢。', 0.85, [stat('MORALE', 6), flag('fan-base', '忠实粉丝', 'SOCIAL', { source: 'shared-fan-letter' })], [stat('MORALE', 2)], ['你把信收进了抽屉，回了三页纸。'], ['你回了两行字，觉得有点对不起他。'], null),
    opt('screenshot', '截图发动态', '让更多人看到。', 0.7, [metric('FAN_REPUTATION', 4)], [metric('FAN_REPUTATION', -2)], ['那条动态的评论区都是"好暖"。'], ['有人说你在作秀。'], null),
  ],
});
events.push({
  id: 'shared-youth-coach', worldlineId: 'shared', title: '青训教练来电',
  description: '当年带你入门的青训教练打来电话："小子，电视上看到你了。"',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('talk-long', '聊了很久', '从他嘴里，你听回了最开始打 CS 的自己。', 0.85, [stat('MORALE', 6), flag('mentor', '引路人', 'CAREER', { source: 'shared-youth-coach' })], [stat('MORALE', 2)], ['挂了电话，你感觉浑身都是劲。'], ['电话里你只说了几句"还行"。'], null),
    opt('brief', '简单寒暄', '现在不是叙旧的时候。', 0.7, [stat('ENERGY', 1)], [stat('STRESS', 2)], ['你说了句"教练我挺好的"就挂了。'], ['挂断后你有点愧疚。'], null),
  ],
});
events.push({
  id: 'shared-social-media', worldlineId: 'shared', title: '社交媒体',
  description: '你随手发了一条动态："今天手感一般，但赢了。"评论区吵起来了。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('engage', '下场互动', '和粉丝聊聊比赛细节。', 0.7, [metric('FAN_REPUTATION', 5)], [metric('FAN_REPUTATION', -4)], ['评论区风向转成了夸你接地气。'], ['你和黑粉吵到了凌晨。'], null),
    opt('delete', '删了，眼不见为净', '少说少错。', 0.8, [stat('STRESS', -3)], [metric('FAN_REPUTATION', -2)], ['你删了动态，世界清净了。'], ['有人说你"心虚删帖"。'], null),
  ],
});
events.push({
  id: 'shared-transfer-rumor', worldlineId: 'shared', title: '转会传闻',
  description: '媒体开始炒作你要转会："据悉豪门已递出报价。"更衣室气氛微妙。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 45, conditions: [{ type: 'NARRATIVE_METRIC', metric: 'FAME', minimum: 15 }], autoEffects: [],
  options: [
    opt('clarify', '公开澄清', '发一条"我哪儿也不去"，安大家的心。', 0.75, [metric('TEAM_RELATIONSHIP', 4), metric('CLUB_FAVOR', 3)], [metric('CLUB_FAVOR', -2)], ['传闻平息了，队友看你的眼神又对了。'], ['俱乐部觉得你是在借传闻抬价。'], null),
    opt('silent', '不回应', '让他们猜去，猜得越久我身价越高。', 0.6, [metric('FAME', 3), stat('STRESS', 5)], [metric('TEAM_RELATIONSHIP', -4)], ['你的身价在传闻里涨了一截。'], ['队友开始怀疑你心不在焉。'], null),
  ],
});
events.push({
  id: 'shared-endorsement', worldlineId: 'shared', title: '小代言',
  description: '一个外设品牌找上门，想请你拍条广告，报价不高但能刷脸。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 45, conditions: [{ type: 'NARRATIVE_METRIC', metric: 'FAME', minimum: 20 }], autoEffects: [],
  options: [
    opt('sign', '接下来', '钱不多，但曝光是真的。', 0.8, [stat('BALANCE', 600), metric('FAME', 3)], [stat('BALANCE', 200), stat('ENERGY', -4)], ['广告上线，粉丝开始用同款外设。'], ['拍摄占掉了你一下午训练时间。'], null),
    opt('decline', '婉拒', '现在还不是接广告的时候。', 0.7, [stat('ENERGY', 1)], [stat('BALANCE', 0), metric('FAME', -1)], ['你推掉了拍摄，专心训练。'], ['经纪人叹气："多好的机会。"'], null),
  ],
});
events.push({
  id: 'shared-rival-duel', worldlineId: 'shared', title: '与宿敌单挑',
  description: '对面队伍的明星选手在直播间点名："来，训练赛打完，咱们 1v1 赌一百块。"',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 45, conditions: [{ type: 'NARRATIVE_METRIC', metric: 'FAME', minimum: 18 }], autoEffects: [],
  options: [
    opt('accept', '接！', '当着直播间几万人赢他。', 0.55, [attr('CLUTCH', 1), metric('FAME', 4), flag('rivalry', '宿敌', 'SOCIAL', { source: 'shared-rival-duel' })], [stat('BALANCE', -200), metric('FAN_REPUTATION', -3)], ['你赢了，他的直播间标题改成了"请教"两个字。'], ['你输了，弹幕全是"就这？"。'], null),
    opt('decline', '不接', '没意义，训练要紧。', 0.75, [stat('ENERGY', 1)], [metric('FAME', -2)], ['你回了一句"明天比赛见"就下了。'], ['粉丝说你怂了。'], null),
  ],
});
events.push({
  id: 'shared-stress-relief', worldlineId: 'shared', title: '压力释放',
  description: '连败加上训练量，你感觉自己快绷不住了。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 45, conditions: [{ type: 'PLAYER_STAT', stat: 'STRESS', minimum: 40 }], autoEffects: [],
  options: [
    opt('healthy', '去跑步', '把压力跑出汗。', 0.75, [stat('STRESS', -8), stat('MORALE', 3)], [stat('ENERGY', -3)], ['跑完五公里，脑子清醒多了。'], ['跑完更累了，但心里松了一点。'], null),
    opt('vent', '打游戏发泄', '开个小号去路人局炸鱼。', 0.6, [stat('STRESS', -5)], [stat('ENERGY', -4), stat('STRESS', 2)], ['炸鱼确实解压。'], ['路人局输了，你更气了。'], null),
  ],
});
events.push({
  id: 'shared-burnout-warning', worldlineId: 'shared', title: '倦怠预警',
  description: '你盯着屏幕，突然不想动了——这个赛季打得太久，身体在喊停。',
  period: 'NORMAL', type: 'CHOICE', repeatable: true, priority: 45, conditions: [{ type: 'PLAYER_STAT', stat: 'STRESS', minimum: 55 }], autoEffects: [],
  options: [
    opt('rest', '申请休整两天', '身体是革命的本钱。', 0.8, [stat('ENERGY', 6), stat('STRESS', -6)], [metric('TEAM_STATUS', -3)], ['休整回来，你满血复活。'], ['队里少人，训练赛都凑不齐。'], null),
    opt('push', '咬牙硬撑', '赛季还没结束，我不能歇。', 0.5, [metric('TEAM_STATUS', 2)], [stat('STRESS', 8), stat('ENERGY', -5)], ['你撑过来了，这赛季总算没掉链子。'], ['你的状态肉眼可见地垮了。'], null),
  ],
});

// ============ OFFSEASON 周期（3）============
events.push({
  id: 'shared-offseason-camp', worldlineId: 'shared', title: '夏训营',
  description: '休赛期队伍组织集训，强度拉满，很多人都请假了。',
  period: 'OFFSEASON', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('attend', '全程参加', '休赛期是拉开差距的时候。', 0.7, [attr('AIM', 1), attr('GAME_SENSE', 1), stat('ENERGY', -8)], [stat('ENERGY', -10), stat('STRESS', 4)], ['集训结束，你的状态比谁都好。'], ['高强度的两周让你差点累倒。'], null),
    opt('skip-half', '只去一半', '给自己留点休息时间。', 0.8, [stat('ENERGY', 3)], [attr('AIM', 0), metric('FORM', -3)], ['你带着半满的电量迎接新赛季。'], ['新赛季前几场，你的手感生疏了。'], null),
  ],
});
events.push({
  id: 'shared-offseason-travel', worldlineId: 'shared', title: '休假旅行',
  description: '休赛期，你终于有时间出去走走——代价是钱包和训练时长。',
  period: 'OFFSEASON', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('travel', '去海边', '看看世界，回来打得更明白。', 0.85, [stat('MORALE', 6), stat('ENERGY', 6), stat('BALANCE', -500)], [stat('BALANCE', -800)], ['海风把压力都吹走了。'], ['钱包瘪了，心也野了。'], null),
    opt('stay-home', '在家躺平', '省钱，也养精神。', 0.8, [stat('ENERGY', 4)], [stat('MORALE', -2)], ['你打了半个月单机游戏。'], ['假期结束，你居然有点想比赛了。'], null),
  ],
});
events.push({
  id: 'shared-offseason-review', worldlineId: 'shared', title: '赛季总结',
  description: '经纪人说："今年打得不错，明年定个目标吧。"',
  period: 'OFFSEASON', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('ambitious', '定个大的', '不给自己留退路。', 0.6, [stat('STRESS', 6), stat('MORALE', 3)], [stat('STRESS', 8)], ['你写下了"进 Major"三个字。'], ['目标太大，反而让你焦虑。'], null),
    opt('realistic', '务实一点', '一步步来。', 0.8, [stat('STRESS', -3)], [stat('MORALE', -1)], ['你定了几个够得着的目标。'], ['计划赶不上变化。'], null),
  ],
});

// ============ TRANSFER_WINDOW 周期（2）============
events.push({
  id: 'shared-transfer-feelers', worldlineId: 'shared', title: '接触试探',
  description: '转会窗口，有俱乐部通过经纪人递了话："愿不愿意聊聊？"',
  period: 'TRANSFER_WINDOW', type: 'CHOICE', repeatable: true, priority: 50, conditions: [{ type: 'NARRATIVE_METRIC', metric: 'FAME', minimum: 22 }], autoEffects: [],
  options: [
    opt('hear-out', '听听报价', '转会市场本来就是双向选择。', 0.65, [stat('BALANCE', 400), metric('CLUB_FAVOR', -3)], [metric('CLUB_FAVOR', -5), metric('TEAM_RELATIONSHIP', -3)], ['报价比你现在的薪水高了不少。'], ['谈判谈崩了，消息还走漏了。'], null),
    opt('shut-down', '一口回绝', '合同期内，我只想好好打。', 0.8, [metric('CLUB_FAVOR', 4)], [stat('BALANCE', 0)], ['你回绝了，俱乐部高层很满意。'], ['经纪人觉得你错过了机会。'], null),
  ],
});
events.push({
  id: 'shared-contract-extension', worldlineId: 'shared', title: '续约谈判',
  description: '俱乐部主动找你谈续约，开出的条件比现在好，但也没好到哪去。',
  period: 'TRANSFER_WINDOW', type: 'CHOICE', repeatable: true, priority: 50, conditions: [{ type: 'NARRATIVE_METRIC', metric: 'CLUB_FAVOR', minimum: 10 }], autoEffects: [],
  options: [
    opt('sign', '签字', '安稳是职业选手的奢侈品。', 0.8, [stat('BALANCE', 500), metric('CLUB_FAVOR', 5)], [metric('CLUB_FAVOR', 1)], ['你签了三年，心里踏实了。'], ['签字笔落下的瞬间，你有点不甘心。'], null),
    opt('wait', '再想想', '等转会窗口最后几天再说。', 0.55, [stat('STRESS', 5)], [metric('CLUB_FAVOR', -4)], ['你拖到了窗口最后一天。'], ['俱乐部觉得你心不在此。'], null),
  ],
});

// ============ FINAL_DECISIVE_MOMENT 周期（1）============
events.push({
  id: 'shared-decisive-warmup', worldlineId: 'shared', title: '决战热身',
  description: '赛季收官战前一小时，队友都在热身，你坐在椅子上发呆。',
  period: 'FINAL_DECISIVE_MOMENT', type: 'CHOICE', repeatable: true, priority: 50, conditions: [], autoEffects: [],
  options: [
    opt('fire-up', '调动状态', '让自己兴奋起来，把这场比赛当最后一场打。', 0.6, [attr('CLUTCH', 1), stat('STRESS', 5)], [stat('STRESS', 9)], ['你像换了个人一样走上赛场。'], ['过度兴奋让你开局就失误。'], null),
    opt('stay-calm', '保持冷静', '比赛而已，按平时打。', 0.75, [stat('STRESS', -4)], [metric('FORM', -2)], ['你平静地打完了收官战。'], ['太平静了，少了一口气。'], null),
  ],
});

// 写出 shared 事件文件
for (const event of events) {
  const file = `${dir}/${event.id}.json`;
  writeFileSync(file, JSON.stringify(event, null, 2) + '\n');
  console.log('created', file);
}
console.log(`total ${events.length} shared events`);
