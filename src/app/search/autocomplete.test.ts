import { Search, SearchType } from '@destinyitemmanager/dim-api-types';
import {
  autocompleteTermSuggestions,
  filterSortRecentSearches,
  getGhostSuffix,
  makeFilterComplete,
  SearchItem,
  SearchItemType,
} from './autocomplete';
import { buildItemSearchConfig } from './items/item-search-filter';
import { quoteFilterString } from './query-parser';

/**
 * Given a string like "foo ba|r", find where the "|" is and remove it,
 * returning its index. This allows for readable test cases that depend on
 * cursor position. If the cursor should be at the end of the string, it can be
 * omitted entirely.
 */
function extractCaret(stringWithCaretPlaceholder: string): [caretIndex: number, query: string] {
  const caretIndex = stringWithCaretPlaceholder.indexOf('|');
  if (caretIndex === -1) {
    return [stringWithCaretPlaceholder.length, stringWithCaretPlaceholder];
  }
  return [caretIndex, stringWithCaretPlaceholder.replace('|', '')];
}

describe('autocompleteTermSuggestions', () => {
  const searchConfig = buildItemSearchConfig(2, 'en');
  const filterComplete = makeFilterComplete(searchConfig);

  const cases: [query: string, expected: string][] = [
    ['is:haspower is:b', 'is:haspower is:bow'],
    ['(is:blue ju|n)', '(is:blue tag:junk)'],
    ['is:bow is:v|oi', 'is:bow is:void'],
    ['season:>outl', 'season:>outlaw'],
    ['not(', 'Expected failure'],
    ['memento:', 'memento:any'],
    ['foo memento:', 'foo memento:any'],
  ];

  const plainStringCases: [query: string, mockCandidate: string][] = [['jotu', 'jötunn']];

  test.each(plainStringCases)(
    'autocomplete within query for plain string match {%s} - {%s}',
    (queryWithCaret, mockCandidate) => {
      const [caretIndex, query] = extractCaret(queryWithCaret);
      const candidates = autocompleteTermSuggestions(
        query,
        caretIndex,
        () => [`name:"${mockCandidate}"`],
        searchConfig,
      );
      expect(candidates).toMatchSnapshot();
    },
  );

  test.each(cases)(
    'autocomplete within query for {%s}',
    (queryWithCaret: string, expected: string) => {
      const [caretIndex, query] = extractCaret(queryWithCaret);
      const candidates = autocompleteTermSuggestions(
        query,
        caretIndex,
        filterComplete,
        searchConfig,
      );
      expect(candidates[0]?.query.body ?? 'Expected failure').toBe(expected);
    },
  );

  const multiWordCases: [query: string, expected: string][] = [
    ['arctic haz', 'name:"arctic haze"'],
    ['is:weapon arctic haz| -is:exotic', 'is:weapon name:"arctic haze" -is:exotic'],
    ['name:"arctic haz', 'name:"arctic haze"'],
    ["name:'arctic haz", 'name:"arctic haze"'],
    ['name:"foo" arctic haz', 'name:"foo" name:"arctic haze"'],
    ["ager's sce", 'name:"ager\'s scepter"'],
    ['the last word', 'name:"the last word"'],
    ['acd/0 fee', 'name:"acd/0 feedback fence"'],
    ['stat:rpm:200 first in, last', 'stat:rpm:200 name:"first in, last out"'],
    ['two-tail', 'name:"two-tailed fox"'],
    ['(is:a or is:b) and (is:c or multi w|)', '(is:a or is:b) and (is:c or name:"multi word")'],
    ['"rare curio" arctic haz', '"rare curio" name:"arctic haze"'],
    ['"rare curio" or arctic haz', '"rare curio" or name:"arctic haze"'],
    ['toil and trou', 'name:"toil and trouble"'],
    ['perkname:"fate of', 'perkname:"fate of all fools"'],
    ['perkname:fate of', 'perkname:"fate of all fools"'],
    // Expected (or at least not yet supported) failures:
    ['rare curio or arctic haz', 'rare curio or name:"arctic haze"'],
    ['name:heritage arctic haze', 'name:heritage name:"arctic haze"'], // this actually works in the app but relies on the full manifest
    ['adept pali', 'adept name:"the palindrome"'],
  ];

  // Item names the autocompleter should know about for the above multiWordCases to complete
  const itemNames = [
    'heritage',
    'arctic haze',
    "ager's scepter",
    'the last word',
    'acd/0 feedback fence',
    'first in, last out',
    'two-tailed fox',
    'multi word',
    'toil and trouble',
    'not forgotten',
    'fate of all fools',
    'the palindrome',
  ];

  // Mocked out filterComplete function that only knows a few tricks
  const filterCompleteMock = (term: string) => {
    const parts = term.split(':');
    let filter = 'name';
    if (parts.length > 1) {
      filter = parts.shift()!;
    }

    let value = parts[0];
    if (value.startsWith("'") || value.startsWith('"')) {
      value = value.slice(1);
    }
    if (value.endsWith("'") || value.endsWith('"')) {
      value = value.slice(0, value.length - 1);
    }
    const result = itemNames.find((i) => i.includes(value));
    return result ? [`${filter}:${quoteFilterString(result)}`] : [];
  };

  test.each(multiWordCases)(
    'autocomplete within multi-word query for {%s} should suggest {%s}',
    (queryWithCaret: string, expected: string) => {
      const [caretIndex, query] = extractCaret(queryWithCaret);
      const candidates = autocompleteTermSuggestions(
        query,
        caretIndex,
        filterCompleteMock,
        searchConfig,
      );
      expect(candidates[0]?.query.body).toBe(expected);
    },
  );
});

describe('filterSortRecentSearches', () => {
  const recentSearches: Search[] = [
    {
      query: 'recent saved',
      usageCount: 1,
      saved: true,
      lastUsage: Date.now(),
      type: SearchType.Item,
    },
    {
      query: 'yearold saved',
      usageCount: 1,
      saved: true,
      lastUsage: Date.now() - 365 * 24 * 60 * 60 * 1000,
      type: SearchType.Item,
    },
    {
      query: 'yearold unsaved',
      usageCount: 1,
      saved: false,
      lastUsage: Date.now() - 365 * 24 * 60 * 60 * 1000,
      type: SearchType.Item,
    },
    {
      query: 'yearold highuse',
      usageCount: 100,
      saved: false,
      lastUsage: Date.now() - 365 * 24 * 60 * 60 * 1000,
      type: SearchType.Item,
    },
    {
      query: 'dayold highuse',
      usageCount: 15,
      saved: false,
      lastUsage: Date.now() - 1 * 24 * 60 * 60 * 1000,
      type: SearchType.Item,
    },
    {
      query: 'dim api autosuggest',
      usageCount: 0,
      saved: false,
      lastUsage: 0,
      type: SearchType.Item,
    },
  ];

  for (let day = 0; day < 30; day++) {
    for (let usageCount = 1; usageCount < 10; usageCount++) {
      recentSearches.push({
        query: `${day} days old, ${usageCount} uses`,
        lastUsage: Date.now() - day * 24 * 60 * 60 * 1000,
        usageCount,
        saved: false,
        type: SearchType.Item,
      });
    }
  }

  const cases = [[''], ['high']];

  test.each(cases)('filter/sort recent searches for query |%s|', (query) => {
    const candidates = filterSortRecentSearches(query, recentSearches);
    expect(candidates.map((c) => c.query.fullText)).toMatchSnapshot();
  });

  const savedSearches: Search[] = [
    {
      query: 'is:patternunlocked -is:crafted',
      usageCount: 1,
      saved: true,
      lastUsage: Date.now(),
      type: SearchType.Item,
    },
    {
      query: '/* random-roll craftable guns */ is:patternunlocked -is:crafted',
      usageCount: 1,
      saved: true,
      lastUsage: Date.now() - 24 * 60 * 60 * 1000,
      type: SearchType.Item,
    },
  ];
  const highlightCases: string[] = ['', 'craft', 'craftable', 'crafted'];
  test.each(highlightCases)('check saved search highlighting for query |%s|', (query: string) => {
    const candidates = filterSortRecentSearches(query, savedSearches);
    expect(candidates).toMatchSnapshot();
  });
});

describe('filterComplete', () => {
  const searchConfig = buildItemSearchConfig(2, 'en');
  const filterComplete = makeFilterComplete(searchConfig);

  const terms = [['is:b'], ['jun'], ['sni'], ['stat:mob'], ['stat'], ['stat:'], ['ote']];

  test.each(terms)('autocomplete terms for |%s|', (term) => {
    const candidates = filterComplete(term);
    expect(candidates).toMatchSnapshot();
  });
});

describe('getGhostSuffix', () => {
  // Builds a minimal Autocomplete SearchItem stand-in without going through the search config.
  const autocompleteItem = (fullText: string, range?: [number, number]): SearchItem => ({
    type: SearchItemType.Autocomplete,
    query: { fullText, body: fullText },
    highlightRange: range ? { section: 'body', range } : undefined,
  });

  test('returns the suffix when the suggestion strictly extends typed text at end of input (key stage)', () => {
    const item = autocompleteItem('tunedstat:', [0, 10]);
    expect(getGhostSuffix('tu', 2, item)).toBe('nedstat:');
  });

  test('returns the suffix at the value stage after the colon', () => {
    const item = autocompleteItem('tunedstat:weapon', [0, 16]);
    expect(getGhostSuffix('tunedstat:', 10, item)).toBe('weapon');
  });

  test('returns the suffix when typing the start of a value', () => {
    const item = autocompleteItem('season:>outlaw', [0, 14]);
    expect(getGhostSuffix('season:>outl', 12, item)).toBe('aw');
  });

  test('returns the suffix when extending later in a multi-clause query', () => {
    const item = autocompleteItem('is:haspower is:bow', [12, 18]);
    expect(getGhostSuffix('is:haspower is:b', 16, item)).toBe('ow');
  });

  test('matches case-insensitively for the typed prefix', () => {
    const item = autocompleteItem('tunedstat:', [0, 10]);
    expect(getGhostSuffix('TU', 2, item)).toBe('nedstat:');
  });

  test('returns null when the suggestion would replace earlier characters (fuzzy / multi-word)', () => {
    // The freeform multi-word case wraps user input in name:"..." which does not extend the typed text
    const item = autocompleteItem('name:"arctic haze"', [0, 18]);
    expect(getGhostSuffix('arctic haz', 10, item)).toBeNull();
  });

  test('returns null when the suggestion replaces a fuzzy mid-term match', () => {
    // "(is:blue ju" -> "(is:blue tag:junk" replaces "ju" with "tag:junk"; not a strict extension
    const item = autocompleteItem('(is:blue tag:junk', [9, 17]);
    expect(getGhostSuffix('(is:blue ju', 11, item)).toBeNull();
  });

  test('returns null when the caret is not at the end of input', () => {
    const item = autocompleteItem('tunedstat:', [0, 10]);
    expect(getGhostSuffix('tu baz', 2, item)).toBeNull();
  });

  test('returns null when the suggestion has the same text as typed (the self-echo queryItem)', () => {
    const item = autocompleteItem('tu');
    expect(getGhostSuffix('tu', 2, item)).toBeNull();
  });

  test('returns null for non-Autocomplete item types', () => {
    const recent: SearchItem = {
      type: SearchItemType.Recent,
      query: { fullText: 'tunedstat:weapon', body: 'tunedstat:weapon' },
    };
    expect(getGhostSuffix('tu', 2, recent)).toBeNull();
  });

  test('feeds end-to-end from autocompleteTermSuggestions: tu -> tunedstat: ghost is "nedstat:"', () => {
    const searchConfig = buildItemSearchConfig(2, 'en');
    const filterComplete = makeFilterComplete(searchConfig);
    const candidates = autocompleteTermSuggestions('tu', 2, filterComplete, searchConfig);
    expect(candidates.length).toBeGreaterThan(0);
    const top = candidates[0];
    expect(top.query.fullText).toBe('tunedstat:');
    expect(getGhostSuffix('tu', 2, top)).toBe('nedstat:');
  });
});
