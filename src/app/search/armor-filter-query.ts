export type ArmorKvFilterKeyword = 'setbonus' | 'archetype' | 'tunedstat' | 'tertiarystat';

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

function escapeKeywordForRegexp(keyword: ArmorKvFilterKeyword): string {
  return keyword.replaceAll(/[\^$\\.*+?()[\]{}|]/g, String.raw`\$&`);
}

/** Collect ordered unique `keyword:` values appearing as whitespace-separated tokens (`or` is skipped). */
function collectArmorKvKeywordValues(query: string, keyword: ArmorKvFilterKeyword): string[] {
  const kw = keyword.toLowerCase();
  const seenNorm = new Set<string>();
  const values: string[] = [];

  for (const tok of query.trim().split(/\s+/)) {
    if (!tok.includes(':')) {
      continue;
    }
    const idx = tok.indexOf(':');
    if (idx < 1) {
      continue;
    }
    if (tok.slice(0, idx).toLowerCase() !== kw) {
      continue;
    }
    const val = tok.slice(idx + 1);
    const norm = val.toLowerCase();
    if (seenNorm.has(norm)) {
      continue;
    }
    seenNorm.add(norm);
    values.push(val);
  }
  return values;
}

/** Unique `keyword:value` tokens for `keyword:` in `query`, after deduping by value (case-insensitive). */
export function armorKvKeywordSelectionCount(query: string, keyword: ArmorKvFilterKeyword): number {
  return collectArmorKvKeywordValues(query, keyword).length;
}

/** Drop contiguous `keyword:*` OR-chains and any stray same-keyword tokens outside those chains. */
function stripArmorKvKeywordTokens(query: string, keyword: ArmorKvFilterKeyword): string {
  const k = escapeKeywordForRegexp(keyword);
  const chainRe = new RegExp(`\\b${k}:\\S+(?:\\s+or\\s+${k}:\\S+)*`, 'gi');
  const singleRe = new RegExp(`\\b${k}:\\S+`, 'gi');
  let s = query;
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(chainRe, '').replace(/\s+/g, ' ').trim();
  }
  s = s.replace(singleRe, '').replace(/\s+/g, ' ').trim();
  return s;
}

function buildArmorKvKeywordClause(keyword: ArmorKvFilterKeyword, values: string[]): string {
  if (values.length === 0) {
    return '';
  }
  const parts = values.map((v) => `${keyword}:${v}`);
  return parts.length === 1 ? parts[0]! : parts.join(' or ');
}

/**
 * Toggles `keyword:value` like the menu chips: removes that token when present; otherwise adds it.
 * Multiple values for the same `keyword` are combined with `or` so they behave as OR within that section,
 * consistent with perk-style queries (e.g. `archetype:a or archetype:b` AND-ed with surrounding terms).
 */
export function applyArmorKvFilter(
  query: string,
  keyword: ArmorKvFilterKeyword,
  value: string,
): string {
  const norm = value.toLowerCase();
  const existing = collectArmorKvKeywordValues(query, keyword);

  let nextVals: string[];
  if (existing.some((v) => v.toLowerCase() === norm)) {
    nextVals = existing.filter((v) => v.toLowerCase() !== norm);
  } else {
    nextVals = [...existing, value];
  }

  const stripped = stripArmorKvKeywordTokens(query, keyword);
  const clause = buildArmorKvKeywordClause(keyword, nextVals);

  if (!clause) {
    return stripped;
  }
  return stripped ? `${stripped} ${clause}` : clause;
}
