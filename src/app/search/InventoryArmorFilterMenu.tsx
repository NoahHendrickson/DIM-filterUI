import { destinyVersionSelector } from 'app/accounts/selectors';
import { usePopper } from 'app/dim-ui/usePopper';
import { t } from 'app/i18next-t';
import { useD2Definitions } from 'app/manifest/selectors';
import {
  applyArmorKvFilter,
  armorKvFilterIsActive,
  type ArmorKvFilterKeyword,
} from 'app/search/armor-filter-query';
import { realD2ArmorStatHashByName } from 'app/search/d2-known-values';
import { armorArchetypeFilterNames } from 'app/search/items/search-filters/armor-archetype';
import { getArmorSetBonusFilterOptions } from 'app/search/items/search-filters/setbonus';
import { setSearchQuery } from 'app/shell/actions';
import { AppIcon, faAngleRight, faFilter } from 'app/shell/icons';
import { querySelector } from 'app/shell/selectors';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { compareBy } from 'app/utils/comparators';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const BRANCH_ORDER: ArmorKvFilterKeyword[] = ['setbonus', 'archetype', 'tunedstat', 'tertiarystat'];

const FLYOUT_OPEN_DELAY_MS = 120;
const FLYOUT_CLOSE_GRACE_MS = 220;

function formatArchetypeLabel(name: string) {
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function branchTitle(branch: ArmorKvFilterKeyword): string {
  switch (branch) {
    case 'setbonus':
      return t('Header.ArmorFilterSectionSetBonus');
    case 'archetype':
      return t('Header.ArmorFilterSectionArchetype');
    case 'tunedstat':
      return t('Header.ArmorFilterSectionTuning');
    case 'tertiarystat':
      return t('Header.ArmorFilterSectionTertiary');
  }
}

/**
 * Inventory-only quick picker for armor-related search filters. Appends `setbonus:`,
 * `archetype:`, `tunedstat:`, and `tertiarystat:` clauses using the same syntax as the search box.
 * Multiple selections in a section combine with `or` (implicit `and` with other terms).
 */
export default function InventoryArmorFilterMenu() {
  const defs = useD2Definitions();
  const destinyVersion = useSelector(destinyVersionSelector);
  const dispatch = useThunkDispatch();
  const query = useSelector(querySelector);
  const [open, setOpen] = useState(false);
  const [activeBranch, setActiveBranch] = useState<ArmorKvFilterKeyword | null>(null);
  const [setBonusSearch, setSetBonusSearch] = useState('');

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const flyoutAnchorRef = useRef<HTMLButtonElement | null>(null);
  const categoryRowRefs = useRef<Partial<Record<ArmorKvFilterKeyword, HTMLButtonElement>>>({});
  const flyoutOpenTimerRef = useRef<number | undefined>(undefined);
  const flyoutCloseTimerRef = useRef<number | undefined>(undefined);
  const openFlyoutViaKeyboardRef = useRef(false);

  const clearFlyoutTimers = useCallback(() => {
    if (flyoutOpenTimerRef.current !== undefined) {
      clearTimeout(flyoutOpenTimerRef.current);
      flyoutOpenTimerRef.current = undefined;
    }
    if (flyoutCloseTimerRef.current !== undefined) {
      clearTimeout(flyoutCloseTimerRef.current);
      flyoutCloseTimerRef.current = undefined;
    }
  }, []);

  const setCategoryRowRef = useCallback(
    (branch: ArmorKvFilterKeyword) => (el: HTMLButtonElement | null) => {
      categoryRowRefs.current[branch] = el ?? undefined;
    },
    [],
  );

  const setBonuses = useMemo(() => (defs ? getArmorSetBonusFilterOptions(defs) : []), [defs]);

  const filteredSetBonuses = useMemo(() => {
    const q = setBonusSearch.trim().toLowerCase();
    if (!q) {
      return setBonuses;
    }
    return setBonuses.filter(
      (o) => o.label.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q),
    );
  }, [setBonuses, setBonusSearch]);

  const tuningKeys = useMemo(
    () =>
      Object.keys(realD2ArmorStatHashByName).sort(
        compareBy((k) => (tuningStatLabels[k] ?? k).toLowerCase()),
      ),
    [],
  );

  useLayoutEffect(() => {
    flyoutAnchorRef.current = activeBranch ? (categoryRowRefs.current[activeBranch] ?? null) : null;
  }, [activeBranch, open]);

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

  usePopper(
    {
      contents: flyoutRef,
      reference: flyoutAnchorRef,
      placement: 'right-start',
      fixed: true,
      offset: 6,
    },
    [open, activeBranch],
  );

  useLayoutEffect(() => {
    if (!open || !activeBranch || !openFlyoutViaKeyboardRef.current || !flyoutRef.current) {
      return;
    }
    openFlyoutViaKeyboardRef.current = false;
    const root = flyoutRef.current;
    const search = root.querySelector<HTMLInputElement>('input[type="search"]');
    const opt = root.querySelector<HTMLButtonElement>('button[data-armor-flyout-option]');
    (search ?? opt)?.focus();
  }, [open, activeBranch]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside =
        menuRef.current?.contains(target) ||
        flyoutRef.current?.contains(target) ||
        btnRef.current?.contains(target);
      if (!inside) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSetBonusSearch('');
      setActiveBranch(null);
      clearFlyoutTimers();
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.matches('input[type="search"]') &&
        (flyoutRef.current?.contains(target) || menuRef.current?.contains(target)) &&
        (target as HTMLInputElement).value
      ) {
        e.preventDefault();
        setSetBonusSearch('');
        return;
      }
      if (activeBranch) {
        e.preventDefault();
        setActiveBranch(null);
        clearFlyoutTimers();
        return;
      }
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, activeBranch, clearFlyoutTimers]);

  const scheduleFlyoutOpen = useCallback(
    (branch: ArmorKvFilterKeyword) => {
      clearFlyoutTimers();
      flyoutOpenTimerRef.current = window.setTimeout(() => {
        flyoutOpenTimerRef.current = undefined;
        setActiveBranch(branch);
      }, FLYOUT_OPEN_DELAY_MS);
    },
    [clearFlyoutTimers],
  );

  const scheduleFlyoutClose = useCallback(() => {
    if (flyoutOpenTimerRef.current !== undefined) {
      clearTimeout(flyoutOpenTimerRef.current);
      flyoutOpenTimerRef.current = undefined;
    }
    flyoutCloseTimerRef.current = window.setTimeout(() => {
      flyoutCloseTimerRef.current = undefined;
      setActiveBranch(null);
    }, FLYOUT_CLOSE_GRACE_MS);
  }, []);

  const cancelFlyoutClose = useCallback(() => {
    if (flyoutCloseTimerRef.current !== undefined) {
      clearTimeout(flyoutCloseTimerRef.current);
      flyoutCloseTimerRef.current = undefined;
    }
  }, []);

  useEffect(
    () => () => {
      clearFlyoutTimers();
    },
    [clearFlyoutTimers],
  );

  const applyFilter = useCallback(
    (keyword: ArmorKvFilterKeyword, value: string) => {
      dispatch(setSearchQuery(applyArmorKvFilter(query, keyword, value), true));
    },
    [dispatch, query],
  );

  const isActive = useCallback(
    (keyword: ArmorKvFilterKeyword, value: string) => armorKvFilterIsActive(query, keyword, value),
    [query],
  );

  const focusCategory = useCallback((branch: ArmorKvFilterKeyword) => {
    categoryRowRefs.current[branch]?.focus();
  }, []);

  const focusNeighborCategory = useCallback(
    (branch: ArmorKvFilterKeyword, delta: number) => {
      const idx = BRANCH_ORDER.indexOf(branch);
      const next = (idx + delta + BRANCH_ORDER.length) % BRANCH_ORDER.length;
      const nb = BRANCH_ORDER[next];
      if (nb) {
        focusCategory(nb);
      }
    },
    [focusCategory],
  );

  const openFlyoutNow = useCallback(
    (branch: ArmorKvFilterKeyword) => {
      clearFlyoutTimers();
      setActiveBranch(branch);
    },
    [clearFlyoutTimers],
  );

  const onCategoryKeyDown = useCallback(
    (branch: ArmorKvFilterKeyword) => (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusNeighborCategory(branch, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusNeighborCategory(branch, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        openFlyoutViaKeyboardRef.current = true;
        openFlyoutNow(branch);
      }
    },
    [focusNeighborCategory, openFlyoutNow],
  );

  const onFlyoutKeyDown = useCallback(
    (branch: ArmorKvFilterKeyword) => (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveBranch(null);
        clearFlyoutTimers();
        focusCategory(branch);
      }
    },
    [clearFlyoutTimers, focusCategory],
  );

  const renderFlyoutOptions = (branch: ArmorKvFilterKeyword) => {
    switch (branch) {
      case 'setbonus':
        return (
          <>
            <div className={styles.flyoutHeader}>
              <input
                type="search"
                className={styles.flyoutSearch}
                value={setBonusSearch}
                onChange={(e) => setSetBonusSearch(e.target.value)}
                placeholder={t('Header.ArmorFilterSetBonusSearchPlaceholder')}
                aria-label={t('Header.ArmorFilterSetBonusSearchLabel')}
              />
            </div>
            <div className={styles.flyoutBody}>
              {filteredSetBonuses.map(({ slug, label }) => (
                <button
                  key={slug}
                  type="button"
                  data-armor-flyout-option
                  className={clsx(
                    styles.optionRow,
                    isActive('setbonus', slug) && styles.optionRowActive,
                  )}
                  title={`setbonus:${slug}`}
                  role="menuitemcheckbox"
                  aria-checked={isActive('setbonus', slug)}
                  onClick={() => applyFilter('setbonus', slug)}
                >
                  {label}
                </button>
              ))}
            </div>
            {filteredSetBonuses.length === 0 && setBonusSearch.trim() !== '' && (
              <div className={styles.flyoutEmpty}>{t('Header.ArmorFilterSetBonusNoMatches')}</div>
            )}
          </>
        );
      case 'archetype':
        return (
          <div className={styles.flyoutBody}>
            {armorArchetypeFilterNames.map((name) => (
              <button
                key={name}
                type="button"
                data-armor-flyout-option
                className={clsx(
                  styles.optionRow,
                  isActive('archetype', name) && styles.optionRowActive,
                )}
                title={`archetype:${name}`}
                role="menuitemcheckbox"
                aria-checked={isActive('archetype', name)}
                onClick={() => applyFilter('archetype', name)}
              >
                {formatArchetypeLabel(name)}
              </button>
            ))}
          </div>
        );
      case 'tunedstat':
        return (
          <div className={styles.flyoutBody}>
            {tuningKeys.map((key) => (
              <button
                key={key}
                type="button"
                data-armor-flyout-option
                className={clsx(
                  styles.optionRow,
                  isActive('tunedstat', key) && styles.optionRowActive,
                )}
                title={`tunedstat:${key}`}
                role="menuitemcheckbox"
                aria-checked={isActive('tunedstat', key)}
                onClick={() => applyFilter('tunedstat', key)}
              >
                {tuningStatLabels[key] ?? key}
              </button>
            ))}
          </div>
        );
      case 'tertiarystat':
        return (
          <div className={styles.flyoutBody}>
            {tuningKeys.map((key) => (
              <button
                key={key}
                type="button"
                data-armor-flyout-option
                className={clsx(
                  styles.optionRow,
                  isActive('tertiarystat', key) && styles.optionRowActive,
                )}
                title={`tertiarystat:${key}`}
                role="menuitemcheckbox"
                aria-checked={isActive('tertiarystat', key)}
                onClick={() => applyFilter('tertiarystat', key)}
              >
                {tuningStatLabels[key] ?? key}
              </button>
            ))}
          </div>
        );
    }
  };

  if (destinyVersion !== 2 || !defs) {
    return null;
  }

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
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-label={t('Header.ArmorFilterMenu')}
        >
          {BRANCH_ORDER.map((branch) => (
            <button
              key={branch}
              type="button"
              ref={setCategoryRowRef(branch)}
              className={clsx(
                styles.categoryRow,
                activeBranch === branch && styles.categoryRowOpen,
              )}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeBranch === branch}
              onMouseEnter={() => {
                cancelFlyoutClose();
                scheduleFlyoutOpen(branch);
              }}
              onMouseLeave={() => scheduleFlyoutClose()}
              onFocus={() => cancelFlyoutClose()}
              onBlur={(e) => {
                const next = e.relatedTarget as Node | null;
                if (menuRef.current?.contains(next) || flyoutRef.current?.contains(next)) {
                  return;
                }
                scheduleFlyoutClose();
              }}
              onKeyDown={onCategoryKeyDown(branch)}
              onClick={() => {
                clearFlyoutTimers();
                setActiveBranch((b) => (b === branch ? null : branch));
              }}
            >
              <span className={styles.categoryLabel}>{branchTitle(branch)}</span>
              <AppIcon icon={faAngleRight} className={styles.categoryChevron} />
            </button>
          ))}
        </div>
      )}
      {open && activeBranch && (
        <div
          ref={flyoutRef}
          className={styles.flyout}
          role="menu"
          aria-label={branchTitle(activeBranch)}
          onMouseEnter={cancelFlyoutClose}
          onMouseLeave={scheduleFlyoutClose}
          onKeyDown={onFlyoutKeyDown(activeBranch)}
        >
          {renderFlyoutOptions(activeBranch)}
        </div>
      )}
    </>
  );
}
