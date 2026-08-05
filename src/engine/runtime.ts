/** 时间和随机性必须由实现注入，确保存档回放与测试结果一致。 */
export interface GameClock {
  now(): string;
}

/** 返回 [0, 1) 的随机值；每次关键掷骰都应写入事件或赛事结果。 */
export interface RandomSource {
  /** 可持久化随机源返回已消费次数；旧实现可省略。 */
  cursor?(): number;
  next(): number;
}

/** 第一版存档的顶层包装，用于版本迁移与一致性校验。 */
export interface CareerSave<TProfile> {
  readonly version: number;
  readonly savedAt: string;
  readonly profile: TProfile;
}

export interface CareerSaveRepository<TProfile> {
  load(slotId: string): Promise<CareerSave<TProfile> | null>;
  save(slotId: string, save: CareerSave<TProfile>): Promise<void>;
}
