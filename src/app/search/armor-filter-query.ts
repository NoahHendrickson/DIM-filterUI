export type ArmorKvFilterKeyword = 'setbonus' | 'archetype' | 'tunedstat' | 'tertiarystat';

const keywordPattern: Record<ArmorKvFilterKeyword, RegExp> = {
  setbonus: /\bsetbonus:\S+/g,
  archetype: /\barchetype:\S+/g,
  tunedstat: /\btunedstat:\S+/g,
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

/**
 * If `keyword:value` is already in the query, removes it. Otherwise replaces any existing token for
 * that keyword (e.g. all `tunedstat:*`) and appends the new clause (space-separated AND).
 */
export function applyArmorKvFilter(
  query: string,
  keyword: ArmorKvFilterKeyword,
  value: string,
): string {
  if (armorKvFilterIsActive(query, keyword, value)) {
    const remove = `${keyword}:${value}`.toLowerCase();
    const next = query
      .trim()
      .split(/\s+/)
      .filter((t) => t.toLowerCase() !== remove)
      .join(' ')
      .trim();
    return next;
  }
  const stripped = query.replace(keywordPattern[keyword], '').replace(/\s+/g, ' ').trim();
  const clause = `${keyword}:${value}`;
  return stripped ? `${stripped} ${clause}` : clause;
}
