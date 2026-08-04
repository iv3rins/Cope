/**
 * matchfixing 世界线内容（假赛风波）。
 * 入口为既有 matchfixing-offer；本文件内容 gated 在 done(matchfixing-offer) 之后。
 * 本世界线以极端事件为主：调查、黑钱、审判、赎罪。
 */
import {
  attr, stat, flag, rmFlag, wl, transfer, role, trophy, cstat,
  done, hasFlag, age, statCond, attrCond, ANY, ALL, NONE, gm,
  MORALE, ENERGY, BALANCE, STRESS, RATING2,
  AIM, GAME_SENSE, LEADERSHIP, CLUTCH, CONSISTENCY, TEAM_CONFLICT,
} from './helpers.js';

const GATE = done('matchfixing-offer');
const COOPERATING = hasFlag('COOPERATING');
const SILENT = hasFlag('SILENT');
const CLEAN = hasFlag('CLEAN_HANDS');
const SUSPECTED = hasFlag('UNDER_SUSPICION');

export default [
  // ============ 主线：传闻与选择 ============
  {
    id: 'matchfixing-aftermath', title: '传闻发酵', period: 'NORMAL', conds: [GATE],
    desc: '你和分析师那晚的谈话被人看见了。队里开始流传「你和外面的人走得很近」。',
    options: [
      { id: 'cooperate-open', label: '主动向调查方澄清', chance: 0.65,
        s: { fx: [flag('COOPERATING', '配合调查', 'CAREER'), stat(MORALE, 8), stat(STRESS, -4)], msg: ['你主动联系了赛事方，把当晚的事讲清楚。', '他们说：配合调查的态度很重要。'], next: 'matchfixing-suspicion-spread' },
        f: { fx: [stat(STRESS, 12)], msg: ['你打了电话，但紧张得语无伦次。', '对方让你「等通知」。'], next: 'matchfixing-suspicion-spread' } },
      { id: 'stay-silent', label: '保持沉默', chance: 0.6,
        s: { fx: [flag('SILENT', '保持沉默', 'CAREER'), stat(STRESS, 6)], msg: ['你选择什么都不说，等风波过去。', '但沉默有时候会被当成默认。'], next: 'matchfixing-suspicion-spread' },
        f: { fx: [stat(STRESS, 10), stat(MORALE, -4)], msg: ['你想说话，但不知道从哪说起。', '你最终还是没开口。'], next: 'matchfixing-suspicion-spread' } },
    ],
  },
  {
    id: 'matchfixing-suspicion-spread', title: '怀疑蔓延', period: 'NORMAL', conds: [done('matchfixing-aftermath')],
    desc: '更衣室的气氛变了。有人开始回避你，训练赛的配合也变得僵硬。',
    options: [
      { id: 'talk-team', label: '找队友当面说清', chance: 0.55,
        s: { fx: [stat(TEAM_CONFLICT, -4), stat(MORALE, 8)], msg: ['你把事情原原本本说给队友听。', '有人信了，有人半信半疑。'], next: 'matchfixing-teammate-test' },
        f: { fx: [stat(TEAM_CONFLICT, 4), stat(STRESS, 8)], msg: ['你解释得越急，越像心虚。', '训练室更沉默了。'], next: 'matchfixing-teammate-test' } },
      { id: 'let-it-pass', label: '让时间证明', chance: 0.65,
        s: { fx: [stat(STRESS, -6)], msg: ['你选择不解释，专注比赛。', '打了几场好球后，议论小了一些。'], next: 'matchfixing-teammate-test' },
        f: { fx: [stat(MORALE, -6)], msg: ['不解释让误会越来越深。', '你开始被孤立。'], next: 'matchfixing-teammate-test' } },
    ],
  },
  {
    id: 'matchfixing-teammate-test', title: '队友试探', period: 'NORMAL', conds: [done('matchfixing-suspicion-spread')],
    desc: '有个队友深夜约你，绕了半天弯子问：「如果真有人出钱，你会不会考虑？」',
    options: [
      { id: 'shut-down', label: '直接打断', chance: 0.6,
        s: { fx: [stat(MORALE, 8), stat(TEAM_CONFLICT, -2)], msg: ['你说：这种话不要再讲。', '他讪讪地结束了话题。'], next: 'matchfixing-insider-tip' },
        f: { fx: [stat(STRESS, 10)], msg: ['你打断了他，但「会不会考虑」的问题缠了你一夜。', '你第一次意识到，诱惑无孔不入。'], next: 'matchfixing-insider-tip' } },
      { id: 'test-him', label: '反问他为什么问', chance: 0.55,
        s: { fx: [attr(GAME_SENSE, 2), stat(MORALE, 6)], msg: ['你反问他：你是不是知道什么。', '他立刻否认，但你记住了他的表情。'], next: 'matchfixing-insider-tip' },
        f: { fx: [stat(TEAM_CONFLICT, 3), stat(STRESS, 8)], msg: ['你的反问让他警觉，之后更疏远你。', '你觉得自己可能吓到了不该吓的人。'], next: 'matchfixing-insider-tip' } },
    ],
  },
  {
    id: 'matchfixing-insider-tip', title: '圈内风声', period: 'NORMAL', conds: [done('matchfixing-teammate-test')],
    desc: '一位关系不错的圈内前辈悄悄告诉你：有人在调查你们队，而且名单上有你。',
    options: [
      { id: 'gather-info', label: '打听细节', chance: 0.6,
        s: { fx: [attr(GAME_SENSE, 2), stat(STRESS, 6)], msg: ['你从前辈那拼凑出了一些信息。', '调查的重点，好像不是你。'], next: 'matchfixing-manager-meeting' },
        f: { fx: [stat(STRESS, 10)], msg: ['你问得太急，前辈不愿多说。', '「你自己小心」成了最后的忠告。'], next: 'matchfixing-manager-meeting' } },
      { id: 'stay-calm', label: '稳住别慌', chance: 0.65,
        s: { fx: [stat(STRESS, -6), attr(CONSISTENCY, 2)], msg: ['你告诉自己：身正不怕影子斜。', '你继续正常训练。'], next: 'matchfixing-manager-meeting' },
        f: { fx: [stat(STRESS, 10)], msg: ['「名单上有你」这句话让你失眠。', '你开始反复回忆那天晚上的每个细节。'], next: 'matchfixing-manager-meeting' } },
    ],
  },
  {
    id: 'matchfixing-manager-meeting', title: '经理谈话', period: 'NORMAL', conds: [done('matchfixing-insider-tip')],
    desc: '经理把你叫进办公室，关上门。「我就问一次：你和盘口有没有关系？」',
    options: [
      { id: 'tell-truth', label: '如实回答', chance: 0.7,
        s: { fx: [stat(MORALE, 10), stat(STRESS, -6)], msg: ['你说了全部实情，包括那张纸条。', '经理沉默了很久，说：我知道了。'], next: 'matchfixing-evidence-gathering' },
        f: { fx: [stat(STRESS, 12)], msg: ['你紧张到语无伦次。', '经理的眼神里写满了失望。'], next: 'matchfixing-evidence-gathering' } },
      { id: 'hedge-answer', label: '含糊其辞', chance: 0.5,
        s: { fx: [stat(STRESS, 8), stat(MORALE, -4)], msg: ['你说「没有」，但语气不够坚定。', '经理没有追问，但你的档案上多了一个问号。'], next: 'matchfixing-evidence-gathering' },
        f: { fx: [stat(STRESS, 14), stat(MORALE, -8)], msg: ['你谎称不知道那晚的事。', '但经理显然已经知道了。'], next: 'matchfixing-evidence-gathering' } },
    ],
  },
  {
    id: 'matchfixing-evidence-gathering', title: '证据收集', period: 'NORMAL', conds: [done('matchfixing-manager-meeting')],
    desc: '调查组约你做了正式笔录。他们问得很细：时间、地点、对话内容。',
    options: [
      { id: 'full-cooperate', label: '全力配合', chance: 0.7,
        s: { fx: [stat(MORALE, 8), stat(STRESS, -4)], msg: ['你事无巨细地交代了。', '调查员说：你的配合很有价值。'], next: 'matchfixing-mole-hunt' },
        f: { fx: [stat(STRESS, 12)], msg: ['笔录过程中你紧张得直冒汗。', '有几处细节你记不清，看起来像隐瞒。'], next: 'matchfixing-mole-hunt' } },
      { id: 'minimize', label: '轻描淡写', chance: 0.5,
        s: { fx: [stat(STRESS, -4)], msg: ['你说那晚只是「普通的闲聊」。', '调查员记下了，但眼神存疑。'], next: 'matchfixing-mole-hunt' },
        f: { fx: [stat(STRESS, 12)], msg: ['你的轻描淡写和已知线索对不上。', '你的嫌疑反而加重了。'], next: 'matchfixing-mole-hunt' } },
    ],
  },
  {
    id: 'matchfixing-mole-hunt', title: '寻找内鬼', period: 'NORMAL', conds: [done('matchfixing-evidence-gathering')],
    desc: '调查组暗示：你们队里有人和盘口有长期联系。他们想知道你看见过什么。',
    options: [
      { id: 'point-fingers', label: '提供怀疑对象', chance: 0.55,
        s: { fx: [attr(GAME_SENSE, 2), stat(MORALE, 6)], msg: ['你说了那个深夜试探你的队友。', '调查组开始注意他。'], next: 'matchfixing-black-money' },
        f: { fx: [stat(TEAM_CONFLICT, 4), stat(STRESS, 10)], msg: ['你指认错了人，被对方记恨。', '你的处境更微妙了。'], next: 'matchfixing-black-money' } },
      { id: 'stay-neutral2', label: '不指认任何人', chance: 0.65,
        s: { fx: [stat(STRESS, -4)], msg: ['你说自己不清楚队内情况。', '调查组没说什么，但你的「不清楚」显得刻意。'], next: 'matchfixing-black-money' } ,
        f: { fx: [stat(MORALE, -4)], msg: ['不指认让调查组觉得你在包庇。', '你的配合度被打上了折扣。'], next: 'matchfixing-black-money' } },
    ],
  },
  // ============ 极端事件：黑钱与威胁 ============
  {
    id: 'matchfixing-black-money', title: '黑钱诱惑', period: 'NORMAL', conds: [done('matchfixing-mole-hunt')],
    desc: '那个分析师又来了，这次带着现金。「只要一场，这些全是你的。」一摞钞票放在你面前。',
    options: [
      { id: 'refuse-cash', label: '拒绝并录音', chance: 0.65,
        s: { fx: [stat(MORALE, 10), flag('REFUSED_FIX', '拒绝假赛', 'ACHIEVEMENT')], msg: ['你偷偷录了音，然后拒绝了他。', '这段录音，后来成了你的护身符。'], next: 'matchfixing-pressure-pay' },
        f: { fx: [stat(STRESS, 12)], msg: ['你拒绝了，但没敢录音。', '对方离开时的笑容让你不安。'], next: 'matchfixing-pressure-pay' } },
      { id: 'touch-cash', label: '犹豫了', chance: 0.4,
        s: { fx: [stat(STRESS, 14), stat(MORALE, -8), flag('TEMPTER_HOOK', '被诱惑过', 'MENTAL')], msg: ['你伸手碰了一下那摞钱。', '那一刻，你听见自己心跳的声音。'], next: 'matchfixing-pressure-pay' },
        f: { fx: [stat(STRESS, 16), stat(MORALE, -10)], msg: ['你碰了钱，然后推了回去。', '但「碰过」这件事，成了你的秘密。'], next: 'matchfixing-pressure-pay' } },
    ],
  },
  {
    id: 'matchfixing-pressure-pay', title: '催款压力', period: 'NORMAL', conds: [done('matchfixing-black-money')],
    desc: '有人开始给你施压：短信、电话，甚至有人「顺路」出现在你家楼下。',
    options: [
      { id: 'report-threats', label: '报警并上报', chance: 0.6,
        s: { fx: [stat(MORALE, 10), stat(STRESS, -8)], msg: ['你报了警，也上报了俱乐部。', '警方开始保护你的安全。'], next: 'matchfixing-fix-request' },
        f: { fx: [stat(STRESS, 14)], msg: ['你犹豫是否报警，害怕事情闹大。', '威胁没有停止。'], next: 'matchfixing-fix-request' } },
      { id: 'buy-time', label: '拖延周旋', chance: 0.55,
        s: { fx: [attr(CLUTCH, 2), stat(STRESS, 10)], msg: ['你假装考虑，争取时间。', '你清楚，拖得越久越危险。'], next: 'matchfixing-fix-request' },
        f: { fx: [stat(STRESS, 14)], msg: ['拖延被识破，对方直接摊牌。', '他们给了你一个最后期限。'], next: 'matchfixing-fix-request' } },
    ],
  },
  {
    id: 'matchfixing-fix-request', title: '假赛要求', period: 'NORMAL', conds: [done('matchfixing-pressure-pay')],
    desc: '最后通牒来了：下周的比赛，「放两分」。他们已经安排好了盘口。',
    options: [
      { id: 'final-refuse', label: '坚决拒绝', chance: 0.6,
        s: { fx: [stat(MORALE, 12), stat(STRESS, -6)], msg: ['你说：不可能。', '挂断电话，你的手在抖，但心很定。'], next: 'matchfixing-whistleblower' },
        f: { fx: [stat(STRESS, 14), stat(MORALE, -6)], msg: ['你拒绝了，但声音在发抖。', '对方说：你会后悔的。'], next: 'matchfixing-whistleblower' } },
      { id: 'play-along', label: '先假意答应', chance: 0.45,
        s: { fx: [attr(CLUTCH, 2), stat(STRESS, 14), flag('PLAYED_ALONG', '假意周旋', 'MENTAL')], msg: ['你假装答应，心里在盘算脱身的办法。', '这个谎言，你必须演到底。'], next: 'matchfixing-whistleblower' },
        f: { fx: [stat(STRESS, 16), stat(MORALE, -10)], msg: ['假意答应被识破，你彻底暴露在明处。', '你只能硬着头皮面对。'], next: 'matchfixing-whistleblower' } },
    ],
  },
  {
    id: 'matchfixing-whistleblower', title: '吹哨人', period: 'NORMAL', conds: [done('matchfixing-fix-request')],
    desc: '你决定成为吹哨人。但你知道，吹哨意味着你可能会失去职业生涯。',
    options: [
      { id: 'blow-whistle', label: '向赛事方揭发', chance: 0.6,
        s: { fx: [stat(MORALE, 12), flag('WHISTLEBLOWER', '吹哨人', 'ACHIEVEMENT')], msg: ['你把所有证据交给了赛事方。', '提交完的那一刻，你反而轻松了。'], next: 'matchfixing-leak-proof' },
        f: { fx: [stat(STRESS, 14)], msg: ['你准备好了材料，却没有勇气提交。', '那份文件在你的抽屉里躺了三天。'], next: 'matchfixing-leak-proof' } },
      { id: 'stay-hidden', label: '暗中配合调查', chance: 0.65,
        s: { fx: [attr(GAME_SENSE, 2), stat(MORALE, 8)], msg: ['你选择配合调查但不出头。', '调查组说：这样更安全。'], next: 'matchfixing-leak-proof' },
        f: { fx: [stat(STRESS, 12)], msg: ['暗中配合需要隐瞒一切。', '你的演技和压力都在极限。'], next: 'matchfixing-leak-proof' } },
    ],
  },
  {
    id: 'matchfixing-leak-proof', title: '留下证据', period: 'NORMAL', conds: [done('matchfixing-whistleblower')],
    desc: '你翻出手机，里面存着他们的所有聊天记录。你决定把这些整理成一份完整的证据链。',
    options: [
      { id: 'organize-proof', label: '整理全部证据', chance: 0.65,
        s: { fx: [attr(GAME_SENSE, 3), stat(MORALE, 8)], msg: ['你把时间线、金额、对话全部整理好。', '这份证据链，足以让调查组立案。'], next: 'matchfixing-destroy-evidence' },
        f: { fx: [stat(STRESS, 10)], msg: ['证据太多太乱，你整理到一半放弃了。', '但关键的部分还在。'], next: 'matchfixing-destroy-evidence' } },
      { id: 'backup-everywhere', label: '多处备份', chance: 0.6,
        s: { fx: [stat(MORALE, 8), stat(STRESS, -4)], msg: ['你把证据备份到三个地方。', '安全感回来了。'], next: 'matchfixing-destroy-evidence' },
        f: { fx: [stat(STRESS, 8)], msg: ['备份时被队友撞见。', '你解释说在整理照片。'], next: 'matchfixing-destroy-evidence' } },
    ],
  },
  {
    id: 'matchfixing-destroy-evidence', title: '销毁证据', period: 'NORMAL', conds: [done('matchfixing-leak-proof')],
    desc: '对方发现你在收集证据，托人传话：「把东西删了，对大家都好。」',
    options: [
      { id: 'keep-proof', label: '拒不删除', chance: 0.6,
        s: { fx: [stat(MORALE, 12), stat(STRESS, 6)], msg: ['你没有删。', '那句「对大家都好」，恰恰说明他们怕了。'], next: 'matchfixing-betrayer' },
        f: { fx: [stat(STRESS, 12)], msg: ['你嘴上说不删，夜里还是把备份挪了位置。', '你怕了，但没打算低头。'], next: 'matchfixing-betrayer' } },
      { id: 'delete-part', label: '删掉一部分', chance: 0.5,
        s: { fx: [stat(STRESS, -6), stat(MORALE, -4)], msg: ['你删掉了一些「没那么关键」的记录。', '后来你才知道，删掉的正是关键证据。'], next: 'matchfixing-betrayer' },
        f: { fx: [stat(STRESS, 14)], msg: ['你删了，但对方根本不知道你删了。', '你白害怕了一场，还损失了证据。'], next: 'matchfixing-betrayer' } },
    ],
  },
  {
    id: 'matchfixing-betrayer', title: '被出卖', period: 'NORMAL', conds: [done('matchfixing-destroy-evidence')],
    desc: '你自认保密周全，但消息还是走漏了。出卖你的人，是你觉得最不可能的那个。',
    options: [
      { id: 'confront-traitor', label: '当面质问', chance: 0.5,
        s: { fx: [stat(TEAM_CONFLICT, -4), stat(MORALE, 8)], msg: ['你找到他，他不敢看你。', '他说：他们也有我的把柄。'], next: 'matchfixing-hearing' },
        f: { fx: [stat(TEAM_CONFLICT, 5), stat(STRESS, 12)], msg: ['他对质时反咬一口。', '你被倒打一耙。'], next: 'matchfixing-hearing' } },
      { id: 'cut-loose', label: '切断联系', chance: 0.6,
        s: { fx: [stat(STRESS, -4)], msg: ['你不质问，直接切断一切往来。', '但你知道，他出卖你的信息已经传出去了。'], next: 'matchfixing-hearing' },
        f: { fx: [stat(MORALE, -6)], msg: ['切断联系也堵不住消息。', '你只能等事情自己发酵。'], next: 'matchfixing-hearing' } },
    ],
  },
  // ============ 极端事件：审判 ============
  {
    id: 'matchfixing-hearing', title: '听证会', period: 'NORMAL', conds: [done('matchfixing-betrayer')],
    desc: '赛事纪律委员会召开听证会。你坐在房间里，对面是一排面无表情的委员。',
    options: [
      { id: 'present-proof', label: '提交证据陈述', chance: 0.65,
        s: { fx: [stat(MORALE, 10), stat(STRESS, -6)], msg: ['你一条条陈述，证据链完整。', '有委员点了点头。'], next: 'matchfixing-verdict-clean' },
        f: { fx: [stat(STRESS, 12)], msg: ['陈述时你声音发抖。', '有几处逻辑你自己都觉得牵强。'], next: 'matchfixing-verdict-guilty' } },
      { id: 'lawyer-speak', label: '让律师代言', chance: 0.6,
        s: { fx: [cstat('CAREER_EARNINGS', -2000), stat(STRESS, -6)], msg: ['你请了律师，让他替你陈述。', '律师的专业让听证会有条不紊。'], next: 'matchfixing-verdict-clean' },
        f: { fx: [stat(STRESS, 12)], msg: ['律师没预料到对方出示了新证据。', '场面一度失控。'], next: 'matchfixing-verdict-guilty' } },
    ],
  },
  {
    id: 'matchfixing-verdict-clean', title: '清白裁决', period: 'NORMAL', conds: [done('matchfixing-hearing')],
    desc: '裁决书下来了：证据不足，你被认定清白。走出委员会大楼，阳光刺眼。',
    options: [
      { id: 'breathe-easy', label: '长舒一口气', chance: 0.7,
        s: { fx: [stat(MORALE, 14), stat(STRESS, -14), rmFlag('UNDER_SUSPICION'), flag('VINDICATED', '沉冤得雪', 'ACHIEVEMENT')], msg: ['你站在门口，深深地吸了一口气。', '清白两个字，比冠军更重。'], next: 'matchfixing-clean-return' },
        f: { fx: [stat(STRESS, 8)], msg: ['清白裁决让你如释重负。', '但阴影没有立刻散去。'], next: 'matchfixing-clean-return' } },
      { id: 'demand-apology', label: '要求公开澄清', chance: 0.6,
        s: { fx: [stat(MORALE, 10)], msg: ['你要求赛事方公开澄清。', '声明发出后，舆论开始转向。'], next: 'matchfixing-clean-return' },
        f: { fx: [stat(TEAM_CONFLICT, 2), stat(STRESS, 6)], msg: ['澄清声明来得很慢。', '你只能先自己面对剩下的议论。'], next: 'matchfixing-clean-return' } },
    ],
  },
  {
    id: 'matchfixing-verdict-guilty', title: '有罪裁决', period: 'NORMAL', conds: [done('matchfixing-hearing')],
    desc: '裁决书下来了：认定你「知情未报」，禁赛两年。你大脑一片空白。',
    options: [
      { id: 'appeal', label: '提起申诉', chance: 0.55,
        s: { fx: [stat(MORALE, 6), stat(STRESS, 8)], msg: ['你决定申诉。', '律师说：有希望，但过程很长。'], next: 'matchfixing-appeal' },
        f: { fx: [stat(STRESS, 12), stat(MORALE, -8)], msg: ['你被裁决击垮了，放弃了申诉。', '两年，成了你必须接受的事实。'], next: 'matchfixing-appeal' } },
      { id: 'accept-punishment', label: '接受处罚', chance: 0.65,
        s: { fx: [stat(STRESS, -6), stat(MORALE, 4)], msg: ['你选择接受，不再纠缠。', '认了，但心里有一块地方是冷的。'], next: 'matchfixing-appeal' } ,
        f: { fx: [stat(STRESS, 10)], msg: ['接受处罚让你憋屈。', '但你确实没有报警在先，这是事实。'], next: 'matchfixing-appeal' } },
    ],
  },
  {
    id: 'matchfixing-appeal', title: '申诉之路', period: 'NORMAL', conds: [done('matchfixing-verdict-guilty')],
    desc: '申诉材料递上去之后是漫长的等待。每一周都像一年。',
    options: [
      { id: 'gather-more', label: '补充证据', chance: 0.6,
        s: { fx: [attr(GAME_SENSE, 2), stat(MORALE, 6)], msg: ['你找到了新的证据支持申诉。', '律师说：胜算大了些。'], next: 'matchfixing-social-court' },
        f: { fx: [stat(STRESS, 10)], msg: ['你翻遍了所有记录，没找到新证据。', '等待变得更加煎熬。'], next: 'matchfixing-social-court' } },
      { id: 'wait-quiet', label: '安静等待', chance: 0.65,
        s: { fx: [stat(STRESS, -4)], msg: ['你让自己忙起来，不去想结果。', '日子居然过得快了一点。'], next: 'matchfixing-social-court' },
        f: { fx: [stat(STRESS, 8)], msg: ['等待让你反复想最坏的结果。', '你的睡眠越来越差。'], next: 'matchfixing-social-court' } },
    ],
  },
  {
    id: 'matchfixing-social-court', title: '全网审判', period: 'NORMAL', conds: [done('matchfixing-appeal')],
    desc: '你的名字上了热搜，标题是「假赛嫌疑选手」。评论区的恶意像海啸。',
    options: [
      { id: 'shut-social', label: '关闭所有账号', chance: 0.6,
        s: { fx: [stat(STRESS, -10), stat(MORALE, 4)], msg: ['你注销了社交账号。', '世界清净了，但孤独也来了。'], next: 'matchfixing-family-shame' },
        f: { fx: [stat(STRESS, 12)], msg: ['你关不掉，总忍不住去看。', '那些字像针一样。'], next: 'matchfixing-family-shame' } },
      { id: 'statement-out', label: '发声明澄清', chance: 0.5,
        s: { fx: [stat(MORALE, 8), stat(STRESS, 4)], msg: ['你发了长声明，说明全部经过。', '有人信了，有人骂得更凶。'], next: 'matchfixing-family-shame' },
        f: { fx: [stat(STRESS, 14), stat(MORALE, -6)], msg: ['声明被断章取义，舆论更汹涌。', '你删掉了声明。'], next: 'matchfixing-family-shame' } },
    ],
  },
  {
    id: 'matchfixing-family-shame', title: '家人蒙羞', period: 'NORMAL', conds: [done('matchfixing-social-court')],
    desc: '妈妈打电话来，声音很轻：「新闻上说的是你吗？」你张了张嘴，说不出话。',
    options: [
      { id: 'tell-family', label: '如实告诉家人', chance: 0.65,
        s: { fx: [stat(MORALE, 8), stat(STRESS, -8)], msg: ['你讲了全部经过。', '妈妈说：妈信你。'], next: 'matchfixing-fan-exit' },
        f: { fx: [stat(STRESS, 12)], msg: ['你只说「是误会」。', '但妈妈听出了你的声音在抖。'], next: 'matchfixing-fan-exit' } },
      { id: 'hide-truth', label: '瞒着家里', chance: 0.55,
        s: { fx: [stat(STRESS, 6)], msg: ['你说没事，过段时间就好了。', '撒谎让你心里更堵。'], next: 'matchfixing-fan-exit' },
        f: { fx: [stat(STRESS, 10), stat(MORALE, -6)], msg: ['瞒着瞒着，家里还是从新闻里知道了。', '那通电话里，妈妈的声音很失望。'], next: 'matchfixing-fan-exit' } },
    ],
  },
  {
    id: 'matchfixing-fan-exit', title: '粉丝流失', period: 'NORMAL', conds: [done('matchfixing-family-shame')],
    desc: '后援会解散了，直播间里只剩下阴阳怪气。曾经的支持者一夜之间消失。',
    options: [
      { id: 'count-real', label: '数还剩下谁', chance: 0.6,
        s: { fx: [stat(MORALE, 8)], msg: ['你发现还有几十个人在私信里鼓励你。', '「这些人，比几万人珍贵。」'], next: 'matchfixing-friend-test' },
        f: { fx: [stat(STRESS, 8), stat(MORALE, -4)], msg: ['你盯着掉光的关注数发呆。', '那些数字像判决书。'], next: 'matchfixing-friend-test' } },
      { id: 'ignore-numbers', label: '不看数据', chance: 0.65,
        s: { fx: [stat(STRESS, -6)], msg: ['你卸载了所有看数据的软件。', '眼不见，心不烦。'], next: 'matchfixing-friend-test' },
        f: { fx: [stat(MORALE, -4)], msg: ['不看数据也挡不住别人的议论。', '你决定换个环境生活。'], next: 'matchfixing-friend-test' } },
    ],
  },
  {
    id: 'matchfixing-friend-test', title: '朋友考验', period: 'NORMAL', conds: [done('matchfixing-fan-exit')],
    desc: '平时称兄道弟的人大多消失了。只剩一个老友，照常约你吃饭。',
    options: [
      { id: 'go-dinner', label: '赴约', chance: 0.7,
        s: { fx: [stat(MORALE, 10), flag('TRUE_FRIEND', '真朋友', 'CAREER')], msg: ['饭桌上他没提那件事。', '只说：最近瘦了，多吃点。'], next: 'matchfixing-real-friends' },
        f: { fx: [stat(STRESS, 6)], msg: ['你不敢赴约，怕连累朋友。', '但他没放弃，又约了两次。'], next: 'matchfixing-real-friends' } },
      { id: 'ask-him', label: '问他为什么还信我', chance: 0.6,
        s: { fx: [stat(MORALE, 8)], msg: ['他说：我认识你八年了。', '这一句话比所有证据都管用。'], next: 'matchfixing-real-friends' },
        f: { fx: [stat(STRESS, 8)], msg: ['你问了，他答了，但你还在怀疑。', '那顿饭吃得有点累。'], next: 'matchfixing-real-friends' } },
    ],
  },
  {
    id: 'matchfixing-real-friends', title: '真朋友', period: 'NORMAL', conds: [done('matchfixing-friend-test')],
    desc: '老友说：就算你打不了职业了，你还有我。这句话让你在深夜哭了很久。',
    options: [
      { id: 'hold-onto', label: '抓住这份情谊', chance: 0.7,
        s: { fx: [stat(MORALE, 12), stat(STRESS, -8)], msg: ['你开始重新相信人。', '低谷里，这是最贵的东西。'], next: 'matchfixing-clean-return' },
        f: { fx: [stat(STRESS, 6)], msg: ['你感动，却不敢依赖任何人。', '那道裂痕还在。'], next: 'matchfixing-clean-return' } },
      { id: 'give-back', label: '也当他的后盾', chance: 0.6,
        s: { fx: [attr(LEADERSHIP, 2), stat(MORALE, 10)], msg: ['后来老友创业失败，你陪着他。', '「朋友」两个字，从此有了分量。'], next: 'matchfixing-clean-return' },
        f: { fx: [stat(ENERGY, -4)], msg: ['你想帮，但自己都在泥里。', '你只能陪着，说些没营养的话。'], next: 'matchfixing-clean-return' } },
    ],
  },
  // ============ 分支：清白回归 / 禁赛岁月 ============
  {
    id: 'matchfixing-clean-return', title: '清白回归', period: 'NORMAL', conds: [done('matchfixing-real-friends'), ANY([hasFlag('COOPERATING'), hasFlag('CLEAN_HANDS')])],
    desc: '清白裁决 + 调查配合，赛事方同意你立即恢复参赛资格。',
    options: [
      { id: 'return-quick', label: '尽快复出', chance: 0.65,
        s: { fx: [stat(MORALE, 10), flag('RETURN_TO_PRO', '重返职业', 'ACHIEVEMENT')], msg: ['你回到了赛场。', '第一场比赛前，你深呼吸了很久。'], next: 'matchfixing-return-to-pro' },
        f: { fx: [stat(STRESS, 8)], msg: ['复出前的压力让你发挥不稳。', '但站上舞台的感觉回来了。'], next: 'matchfixing-return-to-pro' } },
      { id: 'slow-return', label: '慢慢来', chance: 0.7,
        s: { fx: [attr(CONSISTENCY, 2), stat(MORALE, 6)], msg: ['你先从训练赛找状态。', '不让复出变得太急。'], next: 'matchfixing-return-to-pro' },
        f: { fx: [stat(STRESS, 6)], msg: ['慢慢来的代价是错过了一次大赛。', '但你更看重安全。'], next: 'matchfixing-return-to-pro' } },
    ],
  },
  {
    id: 'matchfixing-suspended-life', title: '禁赛岁月', period: 'NORMAL', conds: [done('matchfixing-real-friends'), ANY([hasFlag('SILENT'), hasFlag('UNDER_SUSPICION')])],
    desc: '禁赛期开始了。你不能打比赛，不能直播游戏，只能看着别人打。',
    options: [
      { id: 'find-work', label: '找份工作', chance: 0.6,
        s: { fx: [cstat('CAREER_EARNINGS', 800), stat(MORALE, 8)], msg: ['你找了份电竞培训的兼职。', '教小孩子打游戏，让你找回了一点价值。'], next: 'matchfixing-side-job' },
        f: { fx: [stat(STRESS, 8)], msg: ['你不想去上班，把自己关在屋里。', '日子一天天过去，你越来越像行尸走肉。'], next: 'matchfixing-side-job' } },
      { id: 'train-hidden', label: '偷偷保持手感', chance: 0.55,
        s: { fx: [attr(AIM, 2), stat(MORALE, 6)], msg: ['你用朋友账号保持训练。', '手感没丢，但心里总觉得亏欠。'], next: 'matchfixing-side-job' },
        f: { fx: [stat(STRESS, 10)], msg: ['偷偷训练被发现了。', '处罚加重，你的禁赛期更长。'], next: 'matchfixing-side-job' } },
    ],
  },
  {
    id: 'matchfixing-side-job', title: '禁赛期打工', period: 'NORMAL', conds: [done('matchfixing-suspended-life')],
    desc: '你在一家网吧当夜班管理员。有个常客认出你，没嘲讽，只是问：「还会回来吗？」',
    options: [
      { id: 'honest-answer', label: '说会回来', chance: 0.65,
        s: { fx: [stat(MORALE, 10)], msg: ['你说：会。', '那个常客说：那我等你。'], next: 'matchfixing-tempt-again' },
        f: { fx: [stat(STRESS, 6)], msg: ['你含糊地回答「不知道」。', '说完自己心里也空落落的。'], next: 'matchfixing-tempt-again' } },
      { id: 'save-money', label: '攒钱还债', chance: 0.6,
        s: { fx: [cstat('CAREER_EARNINGS', 600), stat(STRESS, -6)], msg: ['夜班工资不多，但你还清了几笔账。', '无债一身轻的感觉很好。'], next: 'matchfixing-tempt-again' },
        f: { fx: [stat(STRESS, 8)], msg: ['工资太低，还债遥遥无期。', '你的焦虑又开始累积。'], next: 'matchfixing-tempt-again' } },
    ],
  },
  {
    id: 'matchfixing-tempt-again', title: '再次诱惑', period: 'NORMAL', conds: [done('matchfixing-side-job')],
    desc: '禁赛期快结束的时候，有人又找上门：「这次更安全，绝对查不出来。」',
    options: [
      { id: 'resist-again', label: '再次拒绝', chance: 0.7,
        s: { fx: [stat(MORALE, 12), flag('REFUSED_FIX', '拒绝假赛', 'ACHIEVEMENT')], msg: ['你直接关上了门。', '上一次的代价，你已经付过了。'], next: 'matchfixing-resist-final' },
        f: { fx: [stat(STRESS, 10)], msg: ['你拒绝了，但关门的手有点抖。', '「如果再来一次……」的念头闪过。'], next: 'matchfixing-resist-final' } },
      { id: 'report-again', label: '上报这次接触', chance: 0.6,
        s: { fx: [stat(MORALE, 10), stat(STRESS, -6)], msg: ['你主动上报了这次接触。', '调查组说：你的态度，他们都记得。'], next: 'matchfixing-resist-final' },
        f: { fx: [stat(STRESS, 10)], msg: ['上报后对方销声匿迹。', '但你知道他们还在暗处。'], next: 'matchfixing-resist-final' } },
    ],
  },
  {
    id: 'matchfixing-resist-final', title: '最终拒绝', period: 'NORMAL', conds: [done('matchfixing-tempt-again')],
    desc: '你对着镜子说：我不会再碰那个东西。这句话，你说给自己听。',
    options: [
      { id: 'vow-clean', label: '立誓清白', chance: 0.7,
        s: { fx: [stat(MORALE, 12), stat(STRESS, -8), flag('CLEAN_HEART', '问心无愧', 'ACHIEVEMENT')], msg: ['你把这个誓言写进了备忘录。', '有些线，跨过就不能回头。'], next: 'matchfixing-redemption' },
        f: { fx: [stat(STRESS, 6)], msg: ['你立了誓，但心里还有一丝动摇。', '你决定用行动把它摁死。'], next: 'matchfixing-redemption' } },
      { id: 'act-clean', label: '用行动证明', chance: 0.65,
        s: { fx: [attr(CONSISTENCY, 2), stat(MORALE, 8)], msg: ['你不说漂亮话，只做干净事。', '每一天，都在把那个自己留在过去。'], next: 'matchfixing-redemption' },
        f: { fx: [stat(STRESS, 8)], msg: ['想证明清白，反而患得患失。', '你提醒自己：做对的事，不问结果。'], next: 'matchfixing-redemption' } },
    ],
  },
  {
    id: 'matchfixing-redemption', title: '赎罪之路', period: 'NORMAL', conds: [done('matchfixing-resist-final')],
    desc: '你开始做一些「没有回报」的事：义务给青训队当陪练，帮赛事方做反假赛宣传。',
    options: [
      { id: 'serve-community', label: '坚持做公益', chance: 0.65,
        s: { fx: [stat(MORALE, 10), attr(LEADERSHIP, 2)], msg: ['你坚持了大半年。', '圈内开始有人私下说：他不一样了。'], next: 'matchfixing-report-mastermind' },
        f: { fx: [stat(ENERGY, -6)], msg: ['公益做得断断续续。', '但每次去，你心里都会踏实一点。'], next: 'matchfixing-report-mastermind' } },
      { id: 'mentor-youth', label: '用心带青训', chance: 0.6,
        s: { fx: [attr(LEADERSHIP, 2), stat(MORALE, 8)], msg: ['你把踩过的坑讲给孩子们听。', '「别碰盘口」这句话，你说得很重。'], next: 'matchfixing-report-mastermind' },
        f: { fx: [stat(STRESS, 6)], msg: ['带青训让你想起自己的初心。', '那些孩子眼里的光，让你羞愧又温暖。'], next: 'matchfixing-report-mastermind' } },
    ],
  },
  {
    id: 'matchfixing-report-mastermind', title: '揭发主谋', period: 'NORMAL', conds: [done('matchfixing-redemption')],
    desc: '调查组再次联系你：掌握主谋的完整证据链，需要你作证。这一次，你毫不犹豫。',
    options: [
      { id: 'testify', label: '出庭作证', chance: 0.65,
        s: { fx: [stat(MORALE, 12), flag('MASTERMIND_CAUGHT', '主谋落网', 'ACHIEVEMENT')], msg: ['你出庭作证，把一切讲清楚。', '主谋被判了刑。'], next: 'matchfixing-witness' },
        f: { fx: [stat(STRESS, 10)], msg: ['作证前你彻夜未眠。', '但你坚持做完了。'], next: 'matchfixing-witness' } },
      { id: 'written-statement', label: '书面作证', chance: 0.7,
        s: { fx: [stat(MORALE, 10)], msg: ['你用书面证词完成了指证。', '虽然没有出庭，但同样有效。'], next: 'matchfixing-witness' },
        f: { fx: [stat(STRESS, 6)], msg: ['书面证词写得反复。', '你删改了很多遍才提交。'], next: 'matchfixing-witness' } },
    ],
  },
  {
    id: 'matchfixing-witness', title: '证人保护', period: 'NORMAL', conds: [done('matchfixing-report-mastermind')],
    desc: '由于你指证了主谋，调查组建议你暂时换个住处。你的人生第一次像电影。',
    options: [
      { id: 'accept-protection', label: '接受保护', chance: 0.7,
        s: { fx: [stat(STRESS, -8), stat(MORALE, 6)], msg: ['你搬进了临时住处。', '那段时间，你反而睡得很安稳。'], next: 'matchfixing-return-to-pro' },
        f: { fx: [stat(STRESS, 10)], msg: ['你拒绝了保护，坚持留在原地。', '好在没有出事。'], next: 'matchfixing-return-to-pro' } },
      { id: 'stay-calm3', label: '保持正常生活', chance: 0.65,
        s: { fx: [attr(CONSISTENCY, 2), stat(MORALE, 6)], msg: ['你选择照常生活，不让自己活在恐惧里。', '「害怕才是他们想要的。」'], next: 'matchfixing-return-to-pro' },
        f: { fx: [stat(STRESS, 8)], msg: ['嘴上说不怕，夜里还是醒了好几次。', '日子在熬，也在过。'], next: 'matchfixing-return-to-pro' } },
    ],
  },
  {
    id: 'matchfixing-return-to-pro', title: '重返职业', period: 'NORMAL', conds: [done('matchfixing-witness')],
    desc: '禁赛期满（或确认清白后），你恢复了职业资格。重返赛场的路，比离开时更陡。',
    options: [
      { id: 'comeback-hard', label: '从训练营开始', chance: 0.6,
        s: { fx: [attr(CONSISTENCY, 2), stat(MORALE, 8)], msg: ['你先回训练营找状态。', '两个月后，有队伍向你伸出了手。'], next: 'matchfixing-transfer-rehab' },
        f: { fx: [stat(STRESS, 10)], msg: ['重返训练营，你的状态大不如前。', '「他们还愿意要你吗」的怀疑缠着你。'], next: 'matchfixing-transfer-rehab' } },
      { id: 'find-team', label: '主动找队伍', chance: 0.55,
        s: { fx: [transfer('pain'), stat(MORALE, 8)], msg: ['你主动联系了几家队伍。', '一支队伍愿意给你试训机会。'], next: 'matchfixing-transfer-rehab' },
        f: { fx: [stat(STRESS, 12), stat(MORALE, -6)], msg: ['大部分队伍一听你的名字就挂了电话。', '「假赛」的标签比冠军更响亮。'], next: 'matchfixing-transfer-rehab' } },
    ],
  },
  {
    id: 'matchfixing-transfer-rehab', title: '转会康复', period: 'NORMAL', conds: [done('matchfixing-return-to-pro')],
    desc: '新队伍给了你合同，但有附加条款：前三个月没有首发保证。',
    options: [
      { id: 'prove-again', label: '接受条件证明自己', chance: 0.6,
        s: { fx: [cstat('CAREER_EARNINGS', 3000), stat(MORALE, 8)], msg: ['你接受了条款，从替补打起。', '三个月后，你抢回了首发。'], next: 'matchfixing-lesson' },
        f: { fx: [stat(STRESS, 10)], msg: ['替补身份让你压力很大。', '你担心自己再也回不去。'], next: 'matchfixing-lesson' } },
      { id: 'no-conditions', label: '要求对等条款', chance: 0.5,
        s: { fx: [stat(MORALE, 6)], msg: ['你坚持要平等的合同。', '谈判拖了很久，最终各让一步。'], next: 'matchfixing-lesson' },
        f: { fx: [stat(STRESS, 12)], msg: ['谈判崩了，你错过了这个机会。', '「又要重来一次」的疲惫感袭来。'], next: 'matchfixing-lesson' } },
    ],
  },
  // ============ 极端事件：深渊 ============
  {
    id: 'matchfixing-abyss', title: '深渊边缘', period: 'NORMAL', conds: [done('matchfixing-transfer-rehab')],
    desc: '有个人深夜找到你，说他知道你「碰过钱」那次的事。他要的不是钱，是「合作」。',
    options: [
      { id: 'lawyer-up2', label: '直接找律师', chance: 0.6,
        s: { fx: [stat(MORALE, 10), cstat('CAREER_EARNINGS', -1500)], msg: ['律师给他发了警告函。', '他从此再没出现过。'], next: 'matchfixing-double-life' },
        f: { fx: [stat(STRESS, 12)], msg: ['你犹豫要不要找律师，怕事情闹大。', '他趁你犹豫，加码了。'], next: 'matchfixing-double-life' } },
      { id: 'face-him', label: '当面拒绝', chance: 0.55,
        s: { fx: [stat(MORALE, 10), stat(STRESS, 4)], msg: ['你当面说：我死过一次了，不介意再死一次。', '他愣了。'], next: 'matchfixing-double-life' },
        f: { fx: [stat(STRESS, 14)], msg: ['你的强硬激怒了他。', '他开始散布新的谣言。'], next: 'matchfixing-double-life' } },
    ],
  },
  {
    id: 'matchfixing-double-life', title: '双面生活', period: 'NORMAL', conds: [done('matchfixing-abyss')],
    desc: '你一边打比赛，一边要应付暗处的人的试探。你学会了在镜头前和镜头后切换。',
    options: [
      { id: 'keep-clean2', label: '坚持干净', chance: 0.65,
        s: { fx: [attr(CONSISTENCY, 2), stat(MORALE, 8)], msg: ['你每次接到可疑电话都会录音。', '干净，是你现在唯一的武器。'], next: 'matchfixing-lie-layers' },
        f: { fx: [stat(STRESS, 10)], msg: ['双面生活让你心力交瘁。', '你开始分不清哪个是真的自己。'], next: 'matchfixing-lie-layers' } },
      { id: 'trust-system', label: '信任调查组', chance: 0.6,
        s: { fx: [stat(STRESS, -8)], msg: ['你把所有异常都汇报给了调查组。', '有人替你挡在暗处。'], next: 'matchfixing-lie-layers' },
        f: { fx: [stat(STRESS, 10)], msg: ['你汇报了，但调查组也有力所不及。', '你得学会自己保护自己。'], next: 'matchfixing-lie-layers' } },
    ],
  },
  {
    id: 'matchfixing-lie-layers', title: '谎言累积', period: 'NORMAL', conds: [done('matchfixing-double-life')],
    desc: '为了圆一个谎，你说了更多的谎。现在你连自己都快要记不清哪句是真的。',
    options: [
      { id: 'cut-lies', label: '停止撒谎', chance: 0.6,
        s: { fx: [stat(MORALE, 8), stat(STRESS, -6)], msg: ['你对亲近的人说了实话。', '担子卸下来了一半。'], next: 'matchfixing-truth-day' },
        f: { fx: [stat(STRESS, 10)], msg: ['你想停止，但谎言已经缠成团。', '你只能继续演。'], next: 'matchfixing-truth-day' } },
      { id: 'small-truths', label: '一点点说真话', chance: 0.65,
        s: { fx: [attr(GAME_SENSE, 2), stat(MORALE, 6)], msg: ['你从最不重要的事开始说实话。', '说真话的次数多了，心里慢慢透气。'], next: 'matchfixing-truth-day' },
        f: { fx: [stat(STRESS, 8)], msg: ['小真话被当成新谎言。', '你意识到，信任需要慢慢重建。'], next: 'matchfixing-truth-day' } },
    ],
  },
  {
    id: 'matchfixing-truth-day', title: '真相之日', period: 'NORMAL', conds: [done('matchfixing-lie-layers')],
    desc: '调查组告诉你：当年的事已经结案，你是清白的，也可以重新开始。',
    options: [
      { id: 'accept-clean2', label: '接受清白', chance: 0.7,
        s: { fx: [stat(MORALE, 14), rmFlag('UNDER_SUSPICION'), flag('TRUTH_DAY', '真相大白', 'ACHIEVEMENT')], msg: ['你站了很久，然后哭了。', '清白迟到，但终究来了。'], next: 'matchfixing-final-verdict' },
        f: { fx: [stat(STRESS, 8)], msg: ['你听到「清白」两个字时愣住了。', '你等这句话，等得太久了。'], next: 'matchfixing-final-verdict' } },
      { id: 'write-it-down', label: '写下来封存', chance: 0.65,
        s: { fx: [stat(MORALE, 10)], msg: ['你把这段经历写成了一封信，封存起来。', '有些事，写下来才算真的翻篇。'], next: 'matchfixing-final-verdict' },
        f: { fx: [stat(STRESS, 6)], msg: ['你提笔又放下，写不完整。', '但你知道，它已经过去了。'], next: 'matchfixing-final-verdict' } },
    ],
  },
  {
    id: 'matchfixing-final-verdict', title: '最终审判', period: 'FINAL_DECISIVE_MOMENT', conds: [done('matchfixing-truth-day')],
    desc: '你的故事被写进了行业反假赛教材。编辑问你：你想对后来的选手说什么？',
    options: [
      { id: 'warn-others', label: '写下警告', chance: 0.65,
        s: { fx: [stat(MORALE, 12), flag('CAUTION_TALE', '前车之鉴', 'ACHIEVEMENT')], msg: ['你写道：碰一次，就回不了头了。', '这句话被印在了教材第一页。'], next: 'matchfixing-clean-life' },
        f: { fx: [stat(STRESS, 6)], msg: ['你写了很久，最后只写了一句话。', '但足够了。'], next: 'matchfixing-clean-life' } },
      { id: 'share-hope', label: '写希望', chance: 0.6,
        s: { fx: [stat(MORALE, 10)], msg: ['你写道：错了不可怕，可怕的是错到底。', '「回头」两个字，是你能给的最好的礼物。'], next: 'matchfixing-clean-life' },
        f: { fx: [stat(STRESS, 6)], msg: ['写希望时你想到自己走过的路。', '笔尖有点抖。'], next: 'matchfixing-clean-life' } },
    ],
  },
  {
    id: 'matchfixing-clean-life', title: '清白人生', period: 'NORMAL', conds: [done('matchfixing-final-verdict')],
    desc: '风波终于过去。你重新站上赛场，对手不再用异样的眼光看你。',
    options: [
      { id: 'live-clean', label: '干干净净地打', chance: 0.7,
        s: { fx: [stat(MORALE, 12), attr(CONSISTENCY, 2)], msg: ['你每场比赛都问心无愧。', '清白的人生，比冠军更踏实。'], next: 'matchfixing-lesson' },
        f: { fx: [stat(STRESS, 6)], msg: ['你有时还会想起那段日子。', '但你知道，它真的过去了。'], next: 'matchfixing-lesson' } },
      { id: 'help-others', label: '帮助后来者', chance: 0.65,
        s: { fx: [attr(LEADERSHIP, 2), stat(MORALE, 10)], msg: ['你成了反假赛宣传的常客。', '每次讲完，都会有人私信你说谢谢。'], next: 'matchfixing-lesson' },
        f: { fx: [stat(ENERGY, -4)], msg: ['宣讲多了有点累。', '但值得。'], next: 'matchfixing-lesson' } },
    ],
  },
  // ============ 世界线转换 ============
  {
    id: 'matchfixing-comeback-sacrifice', title: '赎罪复出', period: 'NORMAL', conds: [done('matchfixing-clean-life')],
    desc: '有支队伍听说了你的故事，愿意给你一份「救赎合同」：低薪，但有完整上场时间。',
    options: [
      { id: 'accept-redemption', label: '接受救赎合同', chance: 0.65,
        s: { fx: [wl('comeback'), stat(MORALE, 12), flag('CROSSED_TO_COMEBACK', '转入复出线', 'CUSTOM')], msg: ['你签了救赎合同。', '从污点里爬出来的人，最知道干净的珍贵。'], next: null },
        f: { fx: [stat(STRESS, 8)], msg: ['你担心救赎合同是怜悯。', '你犹豫了，没有签。'], next: 'matchfixing-grinder-return' } },
      { id: 'decline-sacrifice', label: '不想被怜悯', chance: 0.7,
        s: { fx: [stat(MORALE, 6)], msg: ['你谢绝了「救赎」的说法。', '你想凭实力回去，而不是凭故事。'], next: 'matchfixing-grinder-return' },
        f: { fx: [stat(MORALE, -4)], msg: ['拒绝之后你有点后悔。', '「故事」也是一种资源。'], next: 'matchfixing-grinder-return' } },
    ],
  },
  {
    id: 'matchfixing-grinder-return', title: '禁赛归来', period: 'NORMAL', conds: [done('matchfixing-clean-life')],
    desc: '你决定从最低级别重新开始。没有人认识你，没有人记得那件事。',
    options: [
      { id: 'start-low', label: '从底层再来', chance: 0.65,
        s: { fx: [wl('grinder'), stat(MORALE, 10), flag('CROSSED_TO_GRINDER', '转入磨砺线', 'CUSTOM')], msg: ['你回到了低级别联赛。', '这一次，没人给你特殊待遇，你也不想要。'], next: null },
        f: { fx: [stat(STRESS, 8)], msg: ['从底层再来让你心里没底。', '你怕自己走不到头。'], next: 'matchfixing-prodigy-clean' } },
      { id: 'stay-middle', label: '留在原级别', chance: 0.6,
        s: { fx: [stat(MORALE, 6)], msg: ['你留在原级别，慢慢找回位置。', '慢一点，但稳一点。'], next: 'matchfixing-prodigy-clean' },
        f: { fx: [stat(MORALE, -4)], msg: ['留在原级别，那件事偶尔还是会被提起。', '你只能一次次面对。'], next: 'matchfixing-prodigy-clean' } },
    ],
  },
  {
    id: 'matchfixing-prodigy-clean', title: '清白再启程', period: 'NORMAL', conds: [done('matchfixing-clean-life')],
    desc: '一家豪门看了你的反假赛宣传和回归表现，向你抛出了橄榄枝。',
    options: [
      { id: 'big-stage2', label: '登上大舞台', chance: 0.65,
        s: { fx: [wl('prodigy'), stat(MORALE, 12), flag('CROSSED_TO_PRODIGY', '转入天才线', 'CUSTOM')], msg: ['你接受了豪门的邀约。', '从深渊到顶点，这一次，你走得很干净。'], next: null },
        f: { fx: [stat(STRESS, 8)], msg: ['你担心豪门的聚光灯会放大你的过去。', '你犹豫了。'], next: 'matchfixing-z-anonymous-training' } },
      { id: 'stay-humble4', label: '留在中等舞台', chance: 0.7,
        s: { fx: [stat(MORALE, 6)], msg: ['你选择留在中等舞台。', '光环太大，有时候会盖住人。'], next: 'matchfixing-z-anonymous-training' },
        f: { fx: [stat(MORALE, -4)], msg: ['留在中等舞台，你偶尔会想「如果」。', '但你知道，安稳也是一种选择。'], next: 'matchfixing-z-anonymous-training' } },
    ],
  },
  // ============ 尾声 ============
  {
    id: 'matchfixing-lesson', title: '前车之鉴', period: 'NORMAL', conds: [done('matchfixing-clean-life')],
    desc: '你受邀去青训营演讲。台下都是 17 岁的少年，眼睛亮得像当年的你。',
    options: [
      { id: 'teach-truth', label: '讲最真实的故事', chance: 0.65,
        s: { fx: [attr(LEADERSHIP, 3), stat(MORALE, 12)], msg: ['你讲了那段最灰暗的日子。', '有个少年举手问：你后悔吗？'], next: 'matchfixing-z-diary' },
        f: { fx: [stat(STRESS, 6)], msg: ['你讲着讲着停住了。', '台下的安静让你有点哽咽。'], next: 'matchfixing-z-diary' } },
      { id: 'keep-short', label: '点到为止', chance: 0.7,
        s: { fx: [stat(MORALE, 6)], msg: ['你只说了三句话，然后请他们好好训练。', '有些道理，说太多反而记不住。'], next: 'matchfixing-z-diary' },
        f: { fx: [stat(MORALE, -4)], msg: ['话说得太少，少年们有点失望。', '但你后来在门口又补了一句忠告。'], next: 'matchfixing-z-diary' } },
    ],
  },
  // ============ 风味日常（可重复） ============
  {
    id: 'matchfixing-z-diary', title: '日记习惯', period: 'NORMAL', conds: [], repeatable: true,
    desc: '风波之后你养成了写日记的习惯。今天写什么？',
    options: [
      { id: 'write-honest', label: '如实写', chance: 0.7,
        s: { fx: [stat(STRESS, -4), stat(MORALE, 4)], msg: ['你把今天的焦虑写了下来。', '写完，心里松快了些。'], next: 'matchfixing-z-anonymous-training' },
        f: { fx: [stat(STRESS, 4)], msg: ['写到一半写不下去了。', '你合上本子，去打了会儿训练。'], next: 'matchfixing-z-anonymous-training' } },
      { id: 'gratitude-log', label: '写感恩的事', chance: 0.65,
        s: { fx: [stat(MORALE, 6)], msg: ['你写下三件值得感恩的事。', '日子艰难的时候，这个清单很有用。'], next: 'matchfixing-z-anonymous-training' },
        f: { fx: [stat(STRESS, 3)], msg: ['你想不出值得感恩的事。', '最后还是写了：还活着。'], next: 'matchfixing-z-anonymous-training' } },
    ],
  },
  {
    id: 'matchfixing-z-anonymous-training', title: '匿名训练', period: 'NORMAL', conds: [], repeatable: true,
    desc: '你用小号打训练赛，没人知道你是谁。这种感觉反而让你专注。',
    options: [
      { id: 'focus-anon', label: '专注提升', chance: 0.65,
        s: { fx: [attr(AIM, 1), stat(MORALE, 4)], msg: ['匿名让你敢尝试新打法。', '进步发生在没人盯着你的时候。'], next: 'matchfixing-z-chat' },
        f: { fx: [stat(ENERGY, -4)], msg: ['匿名训练打得太随意。', '你提醒自己：训练就是训练。'], next: 'matchfixing-z-chat' } },
      { id: 'test-calm', label: '练心态', chance: 0.6,
        s: { fx: [attr(CONSISTENCY, 1), stat(STRESS, -4)], msg: ['你练习在逆风局稳住心态。', '心态这东西，练了总有用。'], next: 'matchfixing-z-chat' },
        f: { fx: [stat(STRESS, 4)], msg: ['逆风局你还是会急躁。', '但你知道自己在进步。'], next: 'matchfixing-z-chat' } },
    ],
  },
  {
    id: 'matchfixing-z-chat', title: '安静聊天', period: 'NORMAL', conds: [], repeatable: true,
    desc: '老友约你视频，聊的都是些鸡毛蒜皮。你发现，平凡的对话也是奢侈品。',
    options: [
      { id: 'enjoy-chat', label: '好好聊', chance: 0.7,
        s: { fx: [stat(MORALE, 6)], msg: ['你们聊了一个小时，什么都没聊。', '但挂电话时，你笑了。'], next: 'matchfixing-z-diary' },
        f: { fx: [stat(STRESS, 3)], msg: ['你心不在焉，聊了几句就挂了。', '挂完你有点后悔。'], next: 'matchfixing-z-diary' } },
      { id: 'talk-sports', label: '聊比赛聊游戏', chance: 0.65,
        s: { fx: [stat(MORALE, 4), stat(TEAM_CONFLICT, -1)], msg: ['你们讨论了最新的战术改动。', '聊游戏的时候，你还是会两眼放光。'], next: 'matchfixing-z-diary' },
        f: { fx: [stat(ENERGY, -3)], msg: ['聊得太晚，第二天有点困。', '但值得。'], next: 'matchfixing-z-diary' } },
    ],
  },
];
