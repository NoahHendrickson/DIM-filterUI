export type ArmorKvFilterKeyword = 'setbonus' | 'archetype' | 'tuning' | 'tertiarystat';

const keywordPattern: Record<ArmorKvFilterKeyword, RegExp> = {
  setbonus: /\bsetbonus:\S+/g,
  archetype: /\barchetype:\S+/g,
  tuning: /\btuning:\S+/g,
  tertiarystat: /\btertiarystat:\S+/g,
};

/** True when the trimmed query contains a whitespace-delimited token `keyword:value` (case-insensitive keyword and value match). */
export function armorKvFilterIsActive(
  query: string,
  keyword: ArmorKvFilterKeyword,
  value: string,
): boolean {
  const needle = `${keyword}:${value}`;
  const lower = needle.toLowerCase();
  for (const token of query.trim().split(/\s+/)) {
    if (token.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

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
