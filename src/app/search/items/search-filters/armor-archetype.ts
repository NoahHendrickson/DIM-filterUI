import { tl } from 'app/i18next-t';
import { getArmorArchetype } from 'app/utils/socket-utils';
import { ItemFilterDefinition } from '../item-filter-types';

// TODO: regenerate from manifest if archetype roster changes
export const armorArchetypeFilterNames = [
  'gunner',
  'grenadier',
  'brawler',
  'specialist',
  'paragon',
  'bulwark',
] as const;

const archetypeFilters: ItemFilterDefinition[] = [
  {
    keywords: 'archetype',
    description: tl('Filter.Archetype'),
    format: 'query',
    suggestions: [...armorArchetypeFilterNames],
    destinyVersion: 2,
    filter:
      ({ filterValue }) =>
      (item) =>
        getArmorArchetype(item)?.displayProperties.name.toLowerCase() === filterValue,
  },
];

export default archetypeFilters;
