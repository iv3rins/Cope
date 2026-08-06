import type { Top20RankedEntry } from './top20';

/** 评语模板：按排名区间 + 荣誉 + 表现特征匹配，支持 {nickname}/{teamName}/{aps}/{rank} 变量。 */
export interface Top20QuoteTemplate {
  readonly id: string;
  /** 匹配的排名区间（含端点）；缺省匹配任意排名。 */
  readonly rankRange?: { readonly minimum: number; readonly maximum: number };
  /** 需要持有该等级荣誉才匹配（ELITE/SUPER_ELITE/MAJOR）；缺省不限。 */
  readonly honorClass?: 'ELITE' | 'SUPER_ELITE' | 'MAJOR';
  /** 最低年度 Rating；缺省不限。 */
  readonly minimumRating?: number;
  /** 评语正文模板。 */
  readonly template: string;
}

export interface Top20QuoteAsset {
  readonly schemaVersion: number;
  /** 按声明顺序匹配，命中第一条即使用。 */
  readonly templates: readonly Top20QuoteTemplate[];
  /** 未命中任何模板时使用的默认评语模板。 */
  readonly defaultTemplate: string;
}

export interface Top20QuoteMatch {
  readonly quoteId: string;
  readonly quote: string;
}

function fillTemplate(template: string, entry: Top20RankedEntry): string {
  return template
    .replaceAll('{nickname}', entry.identity.nickname)
    .replaceAll('{teamName}', entry.identity.teamName)
    .replaceAll('{aps}', entry.metrics.aps.toFixed(0))
    .replaceAll('{rank}', String(entry.rank));
}

function honorClassOf(entry: Top20RankedEntry): 'ELITE' | 'SUPER_ELITE' | 'MAJOR' | null {
  const classes = new Set(entry.evidence.tournaments.flatMap((event) => event.honors.map((honor) => honor.honorClass)));
  if (classes.has('MAJOR')) return 'MAJOR';
  if (classes.has('SUPER_ELITE')) return 'SUPER_ELITE';
  if (classes.has('ELITE')) return 'ELITE';
  return null;
}

/** 纯函数评语匹配；数据缺失/损坏时返回默认评语，不抛错。 */
export function matchTop20Quote(entry: Top20RankedEntry, asset: Top20QuoteAsset): Top20QuoteMatch {
  const honorClass = honorClassOf(entry);
  const matched = asset?.templates?.find((template) => {
    if (template.rankRange && (entry.rank < template.rankRange.minimum || entry.rank > template.rankRange.maximum)) return false;
    if (template.honorClass && honorClass !== template.honorClass) return false;
    if (template.minimumRating !== undefined && entry.metrics.annualRating < template.minimumRating) return false;
    return true;
  });
  if (matched) return { quoteId: matched.id, quote: fillTemplate(matched.template, entry) };
  const fallback = asset?.defaultTemplate?.trim() || '{nickname} 凭借全年稳定表现进入年度 TOP20。';
  return { quoteId: 'default', quote: fillTemplate(fallback, entry) };
}
