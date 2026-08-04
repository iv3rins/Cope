/**
 * 事件内容写作辅助（仅供 scripts/gen_story_events.mjs 使用的构建期工具，不进入运行时）。
 * 所有输出结构必须与 src/engine/graph.ts 的 StoryEvent / StoryEventOption / EventOutcome 对齐。
 */

// —— 效果辅助 ——
export const stat = (s, delta) => ({ type: 'PLAYER_STAT_CHANGE', stat: s, delta });
// TEAM_CONFLICT is adverse: positive deltas increase conflict and are negative effects.
export const attr = (attribute, delta) => ({ type: 'ATTRIBUTE_CHANGE', attribute, delta });
export const flag = (id, name, category = 'CAREER') => ({ type: 'FLAG_ADD', flagId: id, flag: { id, name, category } });
export const rmFlag = (id) => ({ type: 'FLAG_REMOVE', flagId: id });
export const wl = (worldlineId) => ({ type: 'WORLDLINE_CHANGE', worldlineId });
export const transfer = (teamId) => ({ type: 'TEAM_TRANSFER', teamId });
export const role = (r) => ({ type: 'ROLE_CHANGE', role: r });
export const trophy = (t, delta) => ({ type: 'TROPHY_CHANGE', trophy: t, delta });
export const cstat = (cs, delta) => ({ type: 'CAREER_STAT_CHANGE', stat: cs, delta });

// —— 条件辅助 ——
export const done = (eventId) => ({ type: 'COMPLETED_EVENT', eventId });
export const hasFlag = (flagId, expected = true) => ({ type: 'FLAG', flagId, expected });
export const age = (minimum, maximum) => ({ type: 'AGE', minimum, maximum });
export const statCond = (stat, minimum, maximum) => ({ type: 'PLAYER_STAT', stat, minimum, maximum });
export const attrCond = (attribute, minimum, maximum) => ({ type: 'ATTRIBUTE', attribute, minimum, maximum });
export const wlCond = (worldlineId) => ({ type: 'WORLDLINE', worldlineId });
export const teamCond = (teamId) => ({ type: 'TEAM', teamId });
export const gm = (modes) => ({ type: 'GAME_MODE', modes });
export const rand = (chance) => ({ type: 'RANDOM', chance });
export const ALL = (conditions) => ({ type: 'ALL', conditions });
export const ANY = (conditions) => ({ type: 'ANY', conditions });
export const NONE = (conditions) => ({ type: 'NONE', conditions });

// —— 常用组合 ——
export const MORALE = 'MORALE', ENERGY = 'ENERGY', BALANCE = 'BALANCE', STRESS = 'STRESS', RATING2 = 'RATING2';
export const AIM = 'AIM', GAME_SENSE = 'GAME_SENSE', LEADERSHIP = 'LEADERSHIP', CLUTCH = 'CLUTCH', CONSISTENCY = 'CONSISTENCY', TEAM_CONFLICT = 'TEAM_CONFLICT';
export const ENTRY = 'ENTRY', AWP = 'AWP', IGL = 'IGL', SUPPORT = 'SUPPORT', LURK = 'LURK';
export const MAJOR = 'MAJOR', S_TIER = 'S_TIER', MVP = 'MVP', EVP = 'EVP';
export const TOTAL_KILLS = 'TOTAL_KILLS', MAPS_PLAYED = 'MAPS_PLAYED', CLUTCH_WON = 'CLUTCH_WON', CAREER_EARNINGS = 'CAREER_EARNINGS';
