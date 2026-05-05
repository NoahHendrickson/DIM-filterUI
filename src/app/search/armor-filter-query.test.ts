import {
  applyArmorKvFilter,
  armorKvFilterIsActive,
  type ArmorKvFilterKeyword,
} from './armor-filter-query';

describe('armorKvFilterIsActive', () => {
  it('matches standalone token case-insensitively', () => {
    expect(armorKvFilterIsActive('tunedstat:Melee', 'tunedstat', 'melee')).toBe(true);
    expect(armorKvFilterIsActive('TUNEDSTAT:melee', 'tunedstat', 'melee')).toBe(true);
  });

  it('matches token among others', () => {
    expect(armorKvFilterIsActive('is:armor archetype:void', 'archetype', 'void')).toBe(true);
  });

  it('does not match substring fragments', () => {
    expect(armorKvFilterIsActive('x tunedstat:melee2', 'tunedstat', 'melee')).toBe(false);
  });

  it('does not confuse keywords', () => {
    expect(armorKvFilterIsActive('tertiarystat:class', 'tunedstat', 'class')).toBe(false);
  });

  describe('paired with applyArmorKvFilter', () => {
    const keywords: ArmorKvFilterKeyword[] = ['setbonus', 'archetype', 'tunedstat', 'tertiarystat'];

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

describe('applyArmorKvFilter toggle', () => {
  it('removes the token when the same chip is applied again', () => {
    expect(applyArmorKvFilter('is:armor tunedstat:melee', 'tunedstat', 'melee')).toBe('is:armor');
  });

  it('toggle is case-insensitive vs query token', () => {
    expect(applyArmorKvFilter('TUNEDSTAT:melee', 'tunedstat', 'melee')).toBe('');
  });

  it('leaves other parts of the query intact', () => {
    expect(applyArmorKvFilter('foo archetype:void bar setbonus:x', 'archetype', 'void')).toBe(
      'foo bar setbonus:x',
    );
  });
});
