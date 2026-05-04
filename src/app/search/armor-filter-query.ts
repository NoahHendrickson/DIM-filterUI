export type ArmorKvFilterKeyword = 'setbonus' | 'archetype' | 'tuning';

const keywordPattern: Record<ArmorKvFilterKeyword, RegExp> = {
  setbonus: /\bsetbonus:\S+/g,
  archetype: /\barchetype:\S+/g,
  tuning: /\btuning:\S+/g,
};

/** Replaces any existing `keyword:value` token, then appends the new clause (space-separated AND). */
export function applyArmorKvFilter(
  query: string,
  keyword: ArmorKvFilterKeyword,
  value: string,
): string {
  const stripped = query.replace(keywordPattern[keyword], '').replace(/\s+/g, ' ').trim();
  const clause = `${keyword}:${value}`;
  return stripped ? `${stripped} ${clause}` : clause;
}
