import {
  applyArmorKvFilter,
  armorKvFilterIsActive,
  type ArmorKvFilterKeyword,
} from './armor-filter-query';

describe('armorKvFilterIsActive', () => {
  it('matches standalone token case-insensitively', () => {
    expect(armorKvFilterIsActive('tuning:Melee', 'tuning', 'melee')).toBe(true);
    expect(armorKvFilterIsActive('TUNING:melee', 'tuning', 'melee')).toBe(true);
  });

  it('matches token among others', () => {
    expect(armorKvFilterIsActive('is:armor archetype:void', 'archetype', 'void')).toBe(true);
  });

  it('does not match substring fragments', () => {
    expect(armorKvFilterIsActive('x tuning:melee2', 'tuning', 'melee')).toBe(false);
  });

  it('does not confuse keywords', () => {
    expect(
      armorKvFilterIsActive('tertiarystat:class', 'tuning', 'class'),
    ).toBe(false);
  });

  describe('paired with applyArmorKvFilter', () => {
    const keywords: ArmorKvFilterKeyword[] = ['setbonus', 'archetype', 'tuning', 'tertiarystat'];

    it.each(keywords)(
      '%s replaces prior same-keyword token so active stays one chip',
      (keyword) => {
        const applied = applyArmorKvFilter(`${keyword}:a ${keyword}:b`, keyword, 'c');
        expect(armorKvFilterIsActive(applied, keyword, 'c')).toBe(true);
        expect(armorKvFilterIsActive(applied, keyword, 'a')).toBe(false);
      },
    );
  });
});
