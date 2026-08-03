/** 玩家选择的生涯体验模式；该值会随 PlayerProfile 和完整存档持久化。 */
export type GameDifficultyMode = 'HARDCORE' | 'POWER_FANTASY';

/** 模式创建档案时提供的初始资源和基础体验规则。 */
export interface GameModeRule {
  readonly mode: GameDifficultyMode;
  /** 模式专属的初始存款加成，最终值由 PlayerProgressionService 写入 life.balance。 */
  readonly initialBalanceBonus: number;
  /** 模式专属的初始士气加成。 */
  readonly initialMoraleBonus: number;
  /** 模式专属的初始精力加成。 */
  readonly initialEnergyBonus: number;
  /** 应用于所有带成功率选项的基础成功率加成。 */
  readonly storySuccessChanceBonus: number;
  /** 爽文模式可屏蔽极度折磨型强制事件；硬核模式通常为 false。 */
  readonly suppressExtremeNegativeMandatoryEvents: boolean;
}

/** 模式规则仓储，允许后续平衡调整而不修改 PlayerProfile 或 StoryEvent 契约。 */
export interface GameModeRuleRepository {
  find(mode: GameDifficultyMode): Promise<GameModeRule>;
}
