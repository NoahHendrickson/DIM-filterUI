import { destinyVersionSelector } from 'app/accounts/selectors';
import { usePopper } from 'app/dim-ui/usePopper';
import { t } from 'app/i18next-t';
import { useD2Definitions } from 'app/manifest/selectors';
import {
  applyArmorKvFilter,
  type ArmorKvFilterKeyword,
} from 'app/search/armor-filter-query';
import { realD2ArmorStatHashByName } from 'app/search/d2-known-values';
import { armorArchetypeFilterNames } from 'app/search/items/search-filters/armor-archetype';
import { getArmorSetBonusFilterOptions } from 'app/search/items/search-filters/setbonus';
import { setSearchQuery } from 'app/shell/actions';
import { AppIcon, faFilter } from 'app/shell/icons';
import { querySelector } from 'app/shell/selectors';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { compareBy } from 'app/utils/comparators';
import clsx from 'clsx';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as styles from './InventoryArmorFilterMenu.m.scss';

const tuningStatLabels: Record<string, string> = {
  weapons: 'Weapon',
  grenade: 'Grenade',
  melee: 'Melee',
  health: 'Health',
  class: 'Class',
  super: 'Super',
};

function formatArchetypeLabel(name: string) {
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

/**
 * Inventory-only quick picker for armor-related search filters. Appends `setbonus:`,
 * `archetype:`, `tuning:`, and `tertiarystat:` clauses using the same syntax as the search box.
 */
export default function InventoryArmorFilterMenu() {
  const defs = useD2Definitions();
  const destinyVersion = useSelector(destinyVersionSelector);
  const dispatch = useThunkDispatch();
  const query = useSelector(querySelector);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setBonuses = useMemo(() => (defs ? getArmorSetBonusFilterOptions(defs) : []), [defs]);

  const tuningKeys = useMemo(
    () =>
      Object.keys(realD2ArmorStatHashByName).sort(
        compareBy((k) => (tuningStatLabels[k] ?? k).toLowerCase()),
      ),
    [],
  );

  usePopper(
    {
      contents: menuRef,
      reference: btnRef,
      placement: 'bottom-end',
      fixed: true,
      offset: 8,
    },
    [open],
  );

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !btnRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (destinyVersion !== 2 || !defs) {
    return null;
  }

  const applyFilter = (keyword: ArmorKvFilterKeyword, value: string) => {
    dispatch(setSearchQuery(applyArmorKvFilter(query, keyword, value), true));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={styles.menuButton}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('Header.ArmorFilterMenu')}
        onClick={() => setOpen((o) => !o)}
      >
        <AppIcon icon={faFilter} />
      </button>
      {open && (
        <div ref={menuRef} className={styles.menu} role="menu">
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('Header.ArmorFilterSectionSetBonus')}</div>
            <div className={clsx(styles.sectionBody, styles.sectionBodyScroll)}>
              {setBonuses.map(({ slug, label }) => (
                <button
                  key={slug}
                  type="button"
                  className={styles.chip}
                  role="menuitem"
                  title={`setbonus:${slug}`}
                  onClick={() => applyFilter('setbonus', slug)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('Header.ArmorFilterSectionArchetype')}</div>
            <div className={styles.sectionBody}>
              {armorArchetypeFilterNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={styles.chip}
                  role="menuitem"
                  title={`archetype:${name}`}
                  onClick={() => applyFilter('archetype', name)}
                >
                  {formatArchetypeLabel(name)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('Header.ArmorFilterSectionTuning')}</div>
            <div className={styles.sectionBody}>
              {tuningKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={styles.chip}
                  role="menuitem"
                  title={`tuning:${key}`}
                  onClick={() => applyFilter('tuning', key)}
                >
                  {tuningStatLabels[key] ?? key}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>{t('Header.ArmorFilterSectionTertiary')}</div>
            <div className={styles.sectionBody}>
              {tuningKeys.map((key) => (
                <button
                  key={`tertiary-${key}`}
                  type="button"
                  className={styles.chip}
                  role="menuitem"
                  title={`tertiarystat:${key}`}
                  onClick={() => applyFilter('tertiarystat', key)}
                >
                  {tuningStatLabels[key] ?? key}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
