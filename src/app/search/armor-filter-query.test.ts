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

  it('matches token inside an OR chain', () => {
    expect(
      armorKvFilterIsActive(
        'setbonus:ferropotent or setbonus:smokejumper',
        'setbonus',
        'smokejumper',
      ),
    ).toBe(true);
  });

  it('does not match substring fragments', () => {
    expect(armorKvFilterIsActive('x tunedstat:melee2', 'tunedstat', 'melee')).toBe(false);
  });

  it('does not confuse keywords', () => {
    expect(armorKvFilterIsActive('tertiarystat:class', 'tunedstat', 'class')).toBe(false);
  });
});

describe('applyArmorKvFilter OR within keyword', () => {
  const keywords: ArmorKvFilterKeyword[] = ['setbonus', 'archetype', 'tunedstat', 'tertiarystat'];

  it.each(keywords)('%s appends extra values joined by or', (kw) => {
    const applied = applyArmorKvFilter(`${kw}:a ${kw}:b`.replace(/\s+/g, ' '), kw, 'c');
    expect(
      applied.includes(`${kw}:a`) && applied.includes(`${kw}:b`) && applied.includes(`${kw}:c`),
    ).toBe(true);
    expect(applied.includes(' or ')).toBe(true);
  });

  it('removing one chip leaves remaining values OR-ed', () => {
    expect(applyArmorKvFilter('setbonus:x or setbonus:y or setbonus:z', 'setbonus', 'y')).toBe(
      'setbonus:x or setbonus:z',
    );
  });

  it('drops stray OR connectors when stripping a clause', () => {
    expect(
      applyArmorKvFilter('is:armor archetype:void or archetype:bulwark', 'archetype', 'void'),
    ).toBe('is:armor archetype:bulwark');
    expect(
      applyArmorKvFilter('is:armor archetype:void or archetype:bulwark', 'archetype', 'bulwark'),
    ).toBe('is:armor archetype:void');
  });

  it('keeps unrelated query text when expanding OR within a keyword', () => {
    const applied = applyArmorKvFilter('foo tunedstat:class', 'tunedstat', 'grenade');
    expect(applied).toBe('foo tunedstat:class or tunedstat:grenade');
    expect(armorKvFilterIsActive(applied, 'tunedstat', 'class')).toBe(true);
    expect(armorKvFilterIsActive(applied, 'tunedstat', 'grenade')).toBe(true);
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
    expect(
      applyArmorKvFilter(
        applyArmorKvFilter('foo archetype:void bar setbonus:x', 'archetype', 'void'),
        'setbonus',
        'x',
      ),
    ).toBe('foo bar');
  });

  it('dedupes duplicate tokens when rewriting', () => {
    expect(applyArmorKvFilter('bar archetype:void archetype:void', 'archetype', 'grenadier')).toBe(
      'bar archetype:void or archetype:grenadier',
    );
  });
});
