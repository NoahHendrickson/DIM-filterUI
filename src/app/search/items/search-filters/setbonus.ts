import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import { tl } from 'app/i18next-t';
import { uniqBy } from 'app/utils/collections';
import { compareBy } from 'app/utils/comparators';
import { DestinyEquipableItemSetDefinition } from 'bungie-api-ts/destiny2';
import { ItemFilterDefinition } from '../item-filter-types';

export function slugifySetBonusName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Armor sets whose definitions include at least one perk requiring 2 or 4 equipped pieces. */
function hasTwoOrFourPieceBonuses(set: DestinyEquipableItemSetDefinition): boolean {
  return Boolean(set.setPerks?.some((p) => p.requiredSetCount === 2 || p.requiredSetCount === 4));
}

export function getArmorSetBonusFilterOptions(defs: D2ManifestDefinitions): {
  slug: string;
  label: string;
}[] {
  const rows: { slug: string; label: string }[] = [];
  for (const setBonus of Object.values(defs.EquipableItemSet.getAll())) {
    const label = setBonus.displayProperties?.name;
    if (!label || !hasTwoOrFourPieceBonuses(setBonus)) {
      continue;
    }
    const slug = slugifySetBonusName(label);
    if (!slug) {
      continue;
    }
    rows.push({ slug, label });
  }
  return uniqBy(rows, (r) => r.slug).sort(compareBy((r) => r.label.toLowerCase()));
}

const setBonusFilters: ItemFilterDefinition[] = [
  {
    keywords: 'setbonus',
    description: tl('Filter.SetBonus'),
    // Manifest-driven slugs: suggestions come from suggestionsGenerator only.
    // `query` format requires static `suggestions` for validation/matching; without it,
    // matchFilter throws on undefined suggestions and crashes the inventory UI.
    format: 'freeform',
    destinyVersion: 2,
    suggestionsGenerator: ({ d2Definitions }) => {
      if (!d2Definitions) {
        return [];
      }
      return getArmorSetBonusFilterOptions(d2Definitions).map((o) => o.slug);
    },
    filter:
      ({ filterValue }) =>
      (item) => {
        const name = item.setBonus?.displayProperties?.name;
        return name !== undefined && slugifySetBonusName(name) === filterValue;
      },
  },
];

export default setBonusFilters;
