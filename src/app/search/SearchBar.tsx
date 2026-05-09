import { SearchType } from '@destinyitemmanager/dim-api-types';
import ArmorySheet from 'app/armory/ArmorySheet';
import { saveSearch, searchDeleted, searchUsed } from 'app/dim-api/basic-actions';
import { languageSelector, recentSearchesSelector } from 'app/dim-api/selectors';
import BungieImage from 'app/dim-ui/BungieImage';
import KeyHelp from 'app/dim-ui/KeyHelp';
import { Loading } from 'app/dim-ui/Loading';
import Sheet from 'app/dim-ui/Sheet';
import UserGuideLink from 'app/dim-ui/UserGuideLink';
import { useFixOverscrollBehavior } from 'app/dim-ui/useFixOverscrollBehavior';
import { t } from 'app/i18next-t';
import { d2ManifestSelector } from 'app/manifest/selectors';
import { toggleSearchResults } from 'app/shell/actions';
import { useIsPhonePortrait } from 'app/shell/selectors';
import { useThunkDispatch } from 'app/store/thunk-dispatch';
import { isiOSBrowser } from 'app/utils/browsers';
import { Portal } from 'app/utils/temp-container';
import clsx from 'clsx';
import { UseComboboxState, UseComboboxStateChangeOptions, useCombobox } from 'downshift';
import { debounce } from 'es-toolkit';
import { AnimatePresence, LayoutGroup, Variants, motion } from 'motion/react';
import React, {
  Suspense,
  lazy,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { createSelector } from 'reselect';
import {
  AppIcon,
  closeIcon,
  disabledIcon,
  expandDownIcon,
  expandUpIcon,
  faClock,
  helpIcon,
  searchIcon,
  starIcon,
  starOutlineIcon,
  unTrackedIcon,
} from '../shell/icons';
import HighlightedText from './HighlightedText';
import * as styles from './SearchBar.m.scss';
import { buildArmoryIndex } from './armory-search';
import createAutocompleter, {
  SearchItem,
  SearchItemType,
  inlineCompletion,
  makeFilterComplete,
} from './autocomplete';
import { searchConfigSelector, validateQuerySelector } from './items/item-search-filter';
import {
  loadoutSearchConfigSelector,
  validateLoadoutQuerySelector,
} from './loadouts/loadout-search-filter';
import { canonicalizeQuery, parseQuery } from './query-parser';
import './search-filter.scss';

export const searchButtonAnimateVariants: Variants = {
  hidden: { scale: 0 },
  shown: { scale: 1 },
};

const searchItemIcons: { [key in SearchItemType]: string } = {
  [SearchItemType.Recent]: faClock,
  [SearchItemType.Saved]: starIcon,
  [SearchItemType.Suggested]: unTrackedIcon, // TODO: choose a real icon
  [SearchItemType.Autocomplete]: searchIcon, // TODO: choose a real icon
  [SearchItemType.Help]: helpIcon,
  [SearchItemType.ArmoryEntry]: helpIcon,
};

const armoryIndexSelector = createSelector(d2ManifestSelector, languageSelector, buildArmoryIndex);

const autoCompleterSelector = createSelector(
  searchConfigSelector,
  armoryIndexSelector,
  createAutocompleter,
);

const loadoutAutoCompleterSelector = createSelector(
  loadoutSearchConfigSelector,
  () => undefined,
  createAutocompleter,
);

const filterCompleteSelector = createSelector(searchConfigSelector, makeFilterComplete);
const loadoutFilterCompleteSelector = createSelector(
  loadoutSearchConfigSelector,
  makeFilterComplete,
);

const LazyFilterHelp = lazy(() => import(/* webpackChunkName: "filter-help" */ './FilterHelp'));

const RowContents = memo(({ item }: { item: SearchItem }) => {
  function highlight(text: string, section: string) {
    return item.highlightRange?.section === section ? (
      <HighlightedText
        text={text}
        startIndex={item.highlightRange.range[0]}
        endIndex={item.highlightRange.range[1]}
        className={styles.textHighlight}
      />
    ) : (
      text
    );
  }

  switch (item.type) {
    case SearchItemType.Help:
      return <>{t('Header.FilterHelpMenuItem')}</>;
    case SearchItemType.ArmoryEntry:
      return (
        <>
          {item.armoryItem.name}
          <span className={styles.openInArmoryLabel}>{` - ${t('Armory.OpenInArmory')}`}</span>
          <span className={styles.namedQueryBody}>
            {`${item.armoryItem.seasonName} (${t('Armory.Season', {
              season: item.armoryItem.season,
              year: item.armoryItem.year ?? '?',
            })})`}
          </span>
        </>
      );
    default:
      return (
        <>
          {item.query.header && highlight(item.query.header, 'header')}
          <span
            className={clsx({
              [styles.namedQueryBody]: item.query.header !== undefined,
            })}
          >
            {highlight(item.query.body, 'body')}
          </span>
        </>
      );
  }
});

const Row = memo(
  ({
    highlighted,
    item,
    isPhonePortrait,
    isTabAutocompleteItem,
    onClick,
  }: {
    highlighted: boolean;
    item: SearchItem;
    isPhonePortrait: boolean;
    isTabAutocompleteItem: boolean;
    onClick: (e: React.MouseEvent, item: SearchItem) => void;
  }) => (
    <>
      {item.type === SearchItemType.ArmoryEntry ? (
        <BungieImage className={styles.armoryItemIcon} src={item.armoryItem.icon} />
      ) : (
        <AppIcon className={styles.menuItemIcon} icon={searchItemIcons[item.type]} />
      )}
      <p className={styles.menuItemQuery}>
        <RowContents item={item} />
      </p>
      {!isPhonePortrait && isTabAutocompleteItem && (
        <KeyHelp className={styles.keyHelp} combo="tab" />
      )}
      {!isPhonePortrait && highlighted && <KeyHelp className={styles.keyHelp} combo="enter" />}
      {(item.type === SearchItemType.Recent || item.type === SearchItemType.Saved) && (
        <button
          type="button"
          className={styles.deleteIcon}
          onClick={(e) => onClick(e, item)}
          title={t('Header.DeleteSearch')}
        >
          <AppIcon icon={closeIcon} />
        </button>
      )}
    </>
  ),
);

// TODO: break filter autocomplete into its own object/helpers... with tests

/**
 * Renders the in-line ghost text suffix that previews the top inline
 * autocomplete candidate. The component overlays the input element using a
 * shadow-span that mirrors the user's typed prefix, then paints the suggestion
 * tail in dimmed text aligned to the caret.
 */
const GhostOverlay = memo(function GhostOverlay({
  inputRef,
  query,
  caretIndex,
  ghostText,
  visible,
  onAccept,
  tabAffordance,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  caretIndex: number;
  ghostText: string;
  visible: boolean;
  onAccept?: () => void;
  /** Optional element rendered inline immediately after the ghost suffix
   *  (or after the typed text when there is no suffix). Used to anchor the
   *  Tab key-help marker right next to the rightmost character in the input. */
  tabAffordance?: React.ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);

  // Mirror the input's horizontal scroll so the dimmed suffix stays aligned
  // even when the typed query overflows the input width.
  useEffect(() => {
    const input = inputRef.current;
    const layer = layerRef.current;
    if (!input || !layer) {
      return;
    }
    const onScroll = () => {
      layer.style.transform = `translateX(${-input.scrollLeft}px)`;
    };
    onScroll();
    input.addEventListener('scroll', onScroll, { passive: true });
    return () => input.removeEventListener('scroll', onScroll);
  }, [inputRef, query, caretIndex, ghostText, visible, tabAffordance]);

  // Render the layer whenever there is anything to overlay - either a ghost
  // suffix or an inline Tab affordance. The shadow span of `before` paints the
  // typed text transparently to push subsequent siblings to the caret's exact
  // x-position.
  const showSuffix = visible && Boolean(ghostText);
  if (!showSuffix && !tabAffordance) {
    return null;
  }
  const before = query.slice(0, caretIndex);
  const after = query.slice(caretIndex);
  return (
    <div ref={layerRef} className={styles.ghostLayer} aria-hidden="true">
      <span>{before}</span>
      {showSuffix && (
        <span
          className={styles.ghostSuffix}
          onMouseDown={
            onAccept
              ? (e) => {
                  e.preventDefault();
                  onAccept();
                }
              : undefined
          }
        >
          {ghostText}
        </span>
      )}
      {tabAffordance ? <span className={styles.ghostKeyHelpInline}>{tabAffordance}</span> : null}
      {after && <span>{after}</span>}
    </div>
  );
});

/** An interface for interacting with the search filter through a ref */
export interface SearchFilterRef {
  /** Switch focus to the filter field */
  focusFilterInput: () => void;
  /** Clear the filter field */
  clearFilter: () => void;
}

const resultItemHeight = 32;

/**
 * A reusable, autocompleting item search input. This is an uncontrolled input that
 * announces its query has changed only after some delay. This is the new version of the component
 * that offers a browser-style autocompleting search bar with history.
 *
 * TODO: Should this be the main search bar only, or should it also work for item picker, etc?
 */
function SearchBar({
  searchQueryVersion,
  searchQuery,
  mainSearchBar,
  placeholder,
  children,
  onQueryChanged,
  instant,
  onClear,
  className,
  menu,
  searchType = SearchType.Item,
  ref,
}: {
  /** Placeholder text when nothing has been typed */
  placeholder: string;
  /** Is this the main search bar in the header? It behaves somewhat differently. */
  mainSearchBar?: boolean;
  /** A fake property that can be used to force the "live" query to be replaced with the one from props */
  searchQueryVersion?: number;
  /** The search query to fill in the input. This is used only initially, or when searchQueryVersion changes */
  searchQuery?: string;
  /** Children are used as optional extra action buttons only when there is a query. */
  children?: React.ReactNode;
  /** An optional menu of actions that can be executed on the search. Always shown. */
  menu?: React.ReactNode;
  /** Whether this search bar applies to loadouts rather than items. */
  searchType?: SearchType;
  instant?: boolean;
  className?: string;
  /** Fired whenever the query changes (already debounced) */
  onQueryChanged: (query: string) => void;
  /** Fired whenever the query has been cleared */
  onClear?: () => void;
  ref?: React.Ref<SearchFilterRef>;
}) {
  const dispatch = useThunkDispatch();
  const isPhonePortrait = useIsPhonePortrait();
  const recentSearches = useSelector(recentSearchesSelector(searchType));
  const autocompleter = useSelector(
    searchType === SearchType.Loadout ? loadoutAutoCompleterSelector : autoCompleterSelector,
  );
  const validateQuery = useSelector(
    searchType === SearchType.Loadout ? validateLoadoutQuerySelector : validateQuerySelector,
  );
  // Select both filterComplete fns unconditionally; the type-system requires
  // picking one selector per useSelector call, but this is cheap and Redux
  // memoises both.
  const itemFilterComplete = useSelector(filterCompleteSelector);
  const loadoutFilterCompleteFn = useSelector(loadoutFilterCompleteSelector);
  const filterComplete =
    searchType === SearchType.Loadout ? loadoutFilterCompleteFn : itemFilterComplete;
  const language = useSelector(languageSelector);

  // On iOS at least, focusing the keyboard pushes the content off the screen
  const autoFocus = !mainSearchBar && !isPhonePortrait && !isiOSBrowser();

  const [liveQueryLive, setLiveQuery] = useState(searchQuery ?? '');
  const [filterHelpOpen, setFilterHelpOpen] = useState(false);
  const [armoryItemHash, setArmoryItemHash] = useState<number | undefined>(undefined);
  const [menuMaxHeight, setMenuMaxHeight] = useState<undefined | number>();
  const inputElement = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdateQuery = useCallback(
    instant
      ? onQueryChanged
      : debounce((query: string) => {
          onQueryChanged(query);
        }, 500),
    [onQueryChanged],
  );

  const liveQuery = useDeferredValue(liveQueryLive);

  const { valid, saveable } = validateQuery(liveQuery);

  const lastBlurQuery = useRef<string>(undefined);
  const onBlur = () => {
    if (valid && liveQuery && liveQuery !== lastBlurQuery.current) {
      // save this to the recent searches only on blur
      // we use the ref to only fire if the query changed since the last blur
      dispatch(searchUsed({ query: liveQuery, type: searchType }));
      lastBlurQuery.current = liveQuery;
    }
  };

  // Is the current search saved?
  const canonical = liveQuery ? canonicalizeQuery(parseQuery(liveQuery)) : '';
  const saved = canonical ? recentSearches.find((s) => s.query === canonical)?.saved : false;

  const toggleSaved = () => {
    // TODO: keep track of the last search, if you search for something more narrow immediately after then replace?
    dispatch(saveSearch({ query: liveQuery, saved: !saved, type: searchType }));
  };

  // Try to fill up the screen with search results
  const maxResults = isPhonePortrait
    ? 7 // TODO: do this dynamically on mobile too, but the timing of when the virtual keyboard shows up is a nightmare
    : menuMaxHeight
      ? Math.floor((0.7 * menuMaxHeight) / resultItemHeight)
      : 10;

  const caretPosition = inputElement.current?.selectionStart || liveQuery.length;
  const items = useMemo(
    () =>
      autocompleter(
        liveQuery,
        caretPosition,
        recentSearches,
        /* includeArmory */ Boolean(mainSearchBar),
        maxResults,
      ),
    [autocompleter, caretPosition, liveQuery, mainSearchBar, recentSearches, maxResults],
  );

  // The strict prefix-only completion that powers the inline ghost text and Tab
  // cycling. Recomputed on every render but cheap (it reuses the same
  // filterComplete the dropdown uses).
  const inline = useMemo(
    () => inlineCompletion(liveQuery, caretPosition, filterComplete, language),
    [liveQuery, caretPosition, filterComplete, language],
  );

  // We don't keep cycle state across renders any more - Shift+Tab always
  // looks at the live segment value and advances to the next candidate from
  // the (memoised) cycleCandidates list. This avoids subtle staleness bugs
  // where the cycle state lagged behind input edits.
  // We still need a one-shot "this onInputValueChange came from us, don't
  // surprise the user" guard so other future side-effects don't fire.
  const tabAdvancingRef = useRef(false);

  // useCombobox from Downshift manages the state of the dropdown
  const {
    isOpen,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    getLabelProps,
    highlightedIndex,
    getItemProps,
    setInputValue,
    reset: clearFilter,
  } = useCombobox<SearchItem>({
    items,
    stateReducer,
    initialInputValue: liveQuery,
    initialIsOpen: isPhonePortrait && mainSearchBar,
    defaultHighlightedIndex: liveQuery ? 0 : -1,
    itemToString: (i) => i?.query.fullText || '',
    onInputValueChange: ({ inputValue, type }) => {
      setLiveQuery(inputValue || '');
      debouncedUpdateQuery(inputValue || '');
      if (type === useCombobox.stateChangeTypes.FunctionReset) {
        onClear?.();
      }
      tabAdvancingRef.current = false;
    },
  });

  // Compute the inline ghost suffix. Show only when:
  // - we have at least one prefix-matching candidate;
  // - the dropdown is open (we treat closed dropdown as "user dismissed
  //   suggestions" - mirrors browser/IDE convention);
  // - the input doesn't have an active selection.
  const ghostFullCandidate = inline?.candidates[0];
  const ghostText =
    inline && ghostFullCandidate ? ghostFullCandidate.slice(inline.typed.length) : '';
  const inputHasSelection = (() => {
    const el = inputElement.current;
    return Boolean(el && el.selectionStart !== null && el.selectionStart !== el.selectionEnd);
  })();
  const ghostVisible = Boolean(ghostText && isOpen && !inputHasSelection);

  // Tap-to-accept handler for the inline ghost suffix on phone-portrait.
  const acceptGhost = () => {
    if (inline && inline.candidates.length > 0) {
      const first = inline.candidates[0];
      const input = inputElement.current;
      if (input) {
        input.focus();
        tabAdvancingRef.current = true;
        input.setSelectionRange(inline.segmentStart, inline.segmentEnd);
        document.execCommand('insertText', false, first);
        const newCaret = inline.segmentStart + first.length;
        input.setSelectionRange(newCaret, newCaret);
      }
    }
  };

  // special click handling for filter helper
  function stateReducer(
    state: UseComboboxState<SearchItem>,
    actionAndChanges: UseComboboxStateChangeOptions<SearchItem>,
  ) {
    const { type, changes } = actionAndChanges;
    switch (type) {
      case useCombobox.stateChangeTypes.ItemClick:
      case useCombobox.stateChangeTypes.InputKeyDownEnter:
        if (!changes.selectedItem) {
          return changes;
        }

        switch (changes.selectedItem.type) {
          case SearchItemType.Help:
            setFilterHelpOpen(true);
            break;
          case SearchItemType.ArmoryEntry:
            setArmoryItemHash(changes.selectedItem.armoryItem.hash);
            break;
          default:
            // exit early if non FilterHelper item was selected
            return changes;
        }
        // helper click, open FilterHelper and modify state
        return {
          ...changes,
          selectedItem: state.selectedItem, // keep the last selected item (i.e. the edit field stays unchanged)
        };

      default:
        return changes; // no handling for other types
    }
  }

  // Reset live query when search version changes
  useEffect(() => {
    if (searchQuery !== undefined && (searchQueryVersion || 0) > 0) {
      setInputValue(searchQuery);
    }
    // This should only happen when the query version changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQueryVersion]);

  // Determine a maximum height for the results menu
  useEffect(() => {
    if (inputElement.current && window.visualViewport) {
      const { y, height } = inputElement.current.getBoundingClientRect();
      const { height: viewportHeight } = window.visualViewport;
      // pixels remaining in viewport minus offset minus 10px for padding
      const pxAvailable = viewportHeight - y - height - 10;
      // constrain to size that would allow only whole items to be seen
      setMenuMaxHeight(Math.floor(pxAvailable / resultItemHeight) * resultItemHeight);
    }
  }, [isOpen]);

  const deleteSearch = useCallback(
    (e: React.MouseEvent, item: SearchItem) => {
      e.stopPropagation();
      dispatch(searchDeleted({ query: item.query.fullText, type: searchType }));
    },
    [dispatch, searchType],
  );

  // Add some methods for refs to use
  useImperativeHandle(
    ref,
    () => ({
      focusFilterInput: () => {
        inputElement.current?.focus();
      },
      clearFilter,
    }),
    [clearFilter],
  );

  // What the dropdown should advertise as the current "Tab target" so the
  // little Tab key-help on the matching dropdown row tells the truth.
  const userHighlightedRow =
    highlightedIndex > 0 && items[highlightedIndex]?.type === SearchItemType.Autocomplete
      ? items[highlightedIndex]
      : undefined;
  const inlineActive = Boolean(inline && inline.candidates.length > 0);
  const dropdownFallback = items.find(
    (s) => s.type === SearchItemType.Autocomplete && s.query.fullText !== liveQuery,
  );
  // Mirrors onKeyDown's priority: user-highlighted row > inline ghost > fallback.
  const tabAutocompleteItem = userHighlightedRow ?? (inlineActive ? undefined : dropdownFallback);

  // The current segment value (used to find our position in cycleCandidates).
  const currentSegment = inline ? liveQuery.slice(inline.segmentStart, inline.segmentEnd) : '';
  const cycleCandidates = inline?.cycleCandidates;
  const cycleIndex =
    cycleCandidates && cycleCandidates.length > 0 ? cycleCandidates.indexOf(currentSegment) : -1;

  // Tab autofills the inline ghost (or dropdown row) - hidden if there's
  // nothing left to autofill on this segment.
  const tabAvailable = Boolean(
    userHighlightedRow ?? inlineActive ?? (tabAutocompleteItem && isOpen),
  );
  // Shift+Tab cycles values for the current `keyword:value` segment - shown
  // whenever there are 2+ candidate values, regardless of typed prefix.
  const shiftTabAvailable = Boolean(cycleCandidates && cycleCandidates.length > 1);

  /**
   * Replace the current segment in the input with `candidate`, leaving the caret
   * at the end of the inserted text. Uses `execCommand('insertText')` so the
   * user can undo with Ctrl/Cmd-Z, matching the previous Tab behaviour.
   */
  const replaceSegment = (segmentStart: number, segmentEnd: number, candidate: string) => {
    const input = inputElement.current;
    if (!input) {
      return;
    }
    tabAdvancingRef.current = true;
    input.setSelectionRange(segmentStart, segmentEnd);
    document.execCommand('insertText', false, candidate);
    const newCaret = segmentStart + candidate.length;
    input.setSelectionRange(newCaret, newCaret);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Tab' &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      // Don't interfere with IME composition.
      !e.nativeEvent.isComposing
    ) {
      const input = inputElement.current;

      // Shift+Tab = cycle through value candidates for the current segment.
      // Always rotates forward through inline.cycleCandidates; the user can
      // keep tapping Shift+Tab to walk the list.
      if (e.shiftKey) {
        if (cycleCandidates && cycleCandidates.length > 1 && inline) {
          e.preventDefault();
          // -1 (typed prefix doesn't match a candidate) becomes 0 on first cycle;
          // otherwise step forward and wrap.
          const nextIdx = cycleIndex < 0 ? 0 : (cycleIndex + 1) % cycleCandidates.length;
          replaceSegment(inline.segmentStart, inline.segmentEnd, cycleCandidates[nextIdx]);
          return;
        }
        // Nothing to cycle, fall through to default Shift+Tab (focus change).
        return;
      }

      // Tab (no shift) = autofill the inline ghost / dropdown selection.
      // Priority of acceptance:
      //   1. The user has explicitly arrowed onto an autocomplete row in the
      //      dropdown - respect that choice.
      //   2. Inline ghost - strict prefix completion of the current segment.
      //   3. Dropdown's first autocomplete row - loose "contains" fallback,
      //      preserving the original Tab UX for things like `jun -> tag:junk`.
      const userHighlightedDropdown =
        highlightedIndex > 0 && items[highlightedIndex]?.type === SearchItemType.Autocomplete
          ? items[highlightedIndex]
          : undefined;

      if (userHighlightedDropdown && isOpen) {
        e.preventDefault();
        if (input) {
          input.setSelectionRange(0, input.value.length);
          tabAdvancingRef.current = true;
          document.execCommand('insertText', false, userHighlightedDropdown.query.fullText);
          if (userHighlightedDropdown.highlightRange) {
            const cursorPos = userHighlightedDropdown.highlightRange.range[1];
            input.setSelectionRange(cursorPos, cursorPos);
          }
        }
        return;
      }

      if (inline && inline.candidates.length > 0) {
        e.preventDefault();
        replaceSegment(inline.segmentStart, inline.segmentEnd, inline.candidates[0]);
        return;
      }

      if (tabAutocompleteItem && isOpen) {
        e.preventDefault();
        if (input) {
          input.setSelectionRange(0, input.value.length);
          tabAdvancingRef.current = true;
          document.execCommand('insertText', false, tabAutocompleteItem.query.fullText);
          if (tabAutocompleteItem.highlightRange) {
            const cursorPos = tabAutocompleteItem.highlightRange.range[1];
            input.setSelectionRange(cursorPos, cursorPos);
          }
        }
        return;
      }
      // Fall through: nothing to autofill, default Tab behaviour (focus change).
    } else if (e.key === 'Home' || e.key === 'End') {
      // Disable the use of Home/End to select items in the menu
      // https://github.com/downshift-js/downshift/issues/1162
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (e.nativeEvent as any).preventDownshiftDefault = true;
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      e.shiftKey &&
      highlightedIndex >= 0 &&
      items[highlightedIndex]?.query &&
      items[highlightedIndex]?.type === SearchItemType.Recent
    ) {
      e.preventDefault();
      dispatch(searchDeleted({ query: items[highlightedIndex].query.fullText, type: searchType }));
    } else if (e.key === 'Enter' && !isOpen && liveQuery) {
      // Show search results on "Enter" with a closed menu
      dispatch(toggleSearchResults());
    }
  };

  const menuRef = useRef<HTMLUListElement>(null);
  useFixOverscrollBehavior(menuRef);

  const autocompleteMenu = useMemo(
    () => (
      <ul
        {...getMenuProps({ ref: menuRef })}
        className={styles.menu}
        style={{
          maxHeight: menuMaxHeight,
        }}
      >
        {isOpen &&
          items.map((item, index) => (
            <li
              className={clsx(styles.menuItem, {
                [styles.highlightedItem]: highlightedIndex === index,
              })}
              key={`${item.type}${item.query.fullText}${
                item.type === SearchItemType.ArmoryEntry && item.armoryItem.hash
              }`}
              {...getItemProps({ item, index })}
            >
              <Row
                highlighted={highlightedIndex === index}
                item={item}
                isPhonePortrait={isPhonePortrait}
                isTabAutocompleteItem={item === tabAutocompleteItem}
                onClick={deleteSearch}
              />
            </li>
          ))}
      </ul>
    ),
    [
      deleteSearch,
      getItemProps,
      getMenuProps,
      highlightedIndex,
      isOpen,
      isPhonePortrait,
      items,
      tabAutocompleteItem,
      menuMaxHeight,
    ],
  );

  return (
    <>
      <div
        className={clsx(className, 'search-filter', styles.searchBar, { [styles.open]: isOpen })}
        role="search"
      >
        <AppIcon {...getLabelProps({ icon: searchIcon, className: 'search-bar-icon' })} />
        <div className={styles.inputWrap}>
          <input
            {...getInputProps({
              onBlur,
              onKeyDown,
              ref: inputElement,
              className: clsx({ [styles.invalid]: !valid }),
              autoComplete: 'off',
              autoCorrect: 'off',
              autoCapitalize: 'off',
              spellCheck: false,
              autoFocus,
              placeholder,
              type: 'text',
              name: 'filter',
              'aria-label': placeholder,
              'aria-autocomplete': 'both',
            })}
            enterKeyHint="search"
          />
          <GhostOverlay
            inputRef={inputElement}
            query={liveQuery}
            caretIndex={caretPosition}
            ghostText={ghostText}
            visible={ghostVisible}
            onAccept={isPhonePortrait ? acceptGhost : undefined}
            tabAffordance={
              !isPhonePortrait && (tabAvailable || shiftTabAvailable) ? (
                <>
                  {tabAvailable && <KeyHelp combo="tab" />}
                  {shiftTabAvailable && (
                    <>
                      <KeyHelp combo="shift+tab" />
                      {cycleCandidates && cycleIndex >= 0 && (
                        <span className={styles.ghostCycleCount}>
                          {cycleIndex + 1}/{cycleCandidates.length}
                        </span>
                      )}
                    </>
                  )}
                </>
              ) : null
            }
          />
          <span aria-live="polite" className={styles.ariaLive}>
            {ghostVisible && ghostFullCandidate
              ? t('Header.GhostSuggestion', { suggestion: ghostFullCandidate })
              : ''}
          </span>
        </div>
        <LayoutGroup>
          <AnimatePresence>
            {children}

            {liveQuery.length > 0 && valid && (saveable || saved) && !isPhonePortrait && (
              <motion.button
                variants={searchButtonAnimateVariants}
                exit="hidden"
                initial="hidden"
                animate="shown"
                key="save"
                type="button"
                className={clsx(styles.filterBarButton, styles.saveSearchButton)}
                onClick={toggleSaved}
                title={t('Header.SaveSearch')}
              >
                <AppIcon icon={saved ? starIcon : starOutlineIcon} />
              </motion.button>
            )}

            {(liveQuery.length > 0 || (isPhonePortrait && mainSearchBar)) && (
              <motion.button
                variants={searchButtonAnimateVariants}
                exit="hidden"
                initial="hidden"
                animate="shown"
                key="clear"
                type="button"
                className={styles.filterBarButton}
                onClick={clearFilter}
                title={t('Header.Clear')}
              >
                <AppIcon icon={disabledIcon} />
              </motion.button>
            )}

            {menu}

            <motion.button
              layout
              key="menu"
              {...getToggleButtonProps({
                type: 'button',
                className: clsx(styles.filterBarButton, styles.openButton),
                'aria-label': 'toggle menu',
              })}
            >
              <AppIcon icon={isOpen ? expandUpIcon : expandDownIcon} />
            </motion.button>
          </AnimatePresence>
        </LayoutGroup>

        {filterHelpOpen && (
          <Suspense
            fallback={
              <Portal>
                <Loading message={t('Loading.FilterHelp')} />
              </Portal>
            }
          >
            {/* Because FilterHelp suspends, the entire sheet will suspend while it is loaded.
             * This stops us having issues with incorrect frozen initial heights as it will
             * get locked to the fallback height if we don't do this. */}
            <Sheet
              onClose={() => setFilterHelpOpen(false)}
              header={
                <>
                  <h1>{t('Header.Filters')}</h1>
                  <UserGuideLink topic="Item-Search" />
                </>
              }
              freezeInitialHeight
              sheetClassName={styles.filterHelp}
            >
              <LazyFilterHelp searchType={searchType} />
            </Sheet>
          </Suspense>
        )}

        {autocompleteMenu}
      </div>
      {armoryItemHash !== undefined && (
        <ArmorySheet itemHash={armoryItemHash} onClose={() => setArmoryItemHash(undefined)} />
      )}
    </>
  );
}

export default memo(SearchBar);
