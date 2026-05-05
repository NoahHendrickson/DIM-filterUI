import { tl } from 'app/i18next-t';
import { realD2ArmorStatHashByName } from 'app/search/d2-known-values';
import { getArmor3TuningStat } from 'app/utils/item-utils';
import { ItemFilterDefinition } from '../item-filter-types';

const tuningFilters: ItemFilterDefinition[] = [
  {
    keywords: 'tuning',
    /** Prefer `tunedstat:` (same behavior for stat names); keep parsing legacy searches. */
    deprecated: true,
    description: tl('Filter.TuningStat'),
    format: 'query',
    suggestions: Object.keys(realD2ArmorStatHashByName),
    destinyVersion: 2,
    filter: ({ filterValue }) => {
      const targetHash = realD2ArmorStatHashByName[filterValue];
      if (targetHash === undefined) {
        return () => false;
      }
      return (item) => getArmor3TuningStat(item) === targetHash;
    },
  },
];

export default tuningFilters;
