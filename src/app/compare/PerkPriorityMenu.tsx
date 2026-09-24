import ClickOutside from 'app/dim-ui/ClickOutside';
import { usePopper } from 'app/dim-ui/usePopper';
import { t } from 'app/i18next-t';
import { DefItemIcon } from 'app/inventory/ItemIcon';
import {
  AppIcon,
  dragHandleIcon,
  expandDownIcon,
  faCheckSquare,
  faSquare,
  moveDownIcon,
  moveUpIcon,
} from 'app/shell/icons';
import { reorder } from 'app/utils/collections';
import clsx from 'clsx';
import { Reorder, useDragControls } from 'motion/react';
import { useRef, useState } from 'react';
import * as styles from './PerkPriorityMenu.m.scss';
import {
  PerkFinderColumn,
  PerkPick,
  PerkPriority,
  defaultPriority,
  masterworkColumn,
  splitPicks,
} from './perk-finder';

/**
 * A button that opens a dropdown for ranking the picked perks. Ranking is off
 * until turned on with a checkbox; then the picks can be reordered by dragging
 * (or with the up/down buttons), most important first. Masterwork, barrel,
 * and magazine picks ranked below every left and right perk only sort.
 */
export default function PerkPriorityMenu({
  priority,
  rankingEnabled,
  onRankingEnabledChange,
  columns,
  onPriorityChange,
}: {
  priority: PerkPriority;
  /** Whether the user's own ranking is on. If not, the default ranking is used. */
  rankingEnabled: boolean;
  onRankingEnabledChange: (enabled: boolean) => void;
  columns: PerkFinderColumn[];
  onPriorityChange: (priority: PerkPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  // Anchors the menu, and clicks in here don't count as clicking outside the menu
  const controlRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The sheet clips overflowing content, so the menu is fixed-position to float above it
  usePopper(
    { contents: menuRef, reference: controlRef, placement: 'bottom-start', offset: 4, fixed: true },
    [open, priority.length, rankingEnabled],
  );

  const defaultOrder = defaultPriority(priority, columns);
  const isDefaultOrder = defaultOrder.every((pick, i) => pick === priority[i]);

  const toggleRanking = (enabled: boolean) => {
    onRankingEnabledChange(enabled);
    // Show the list right away so it can be ranked
    if (enabled) {
      setOpen(true);
    }
  };

  return (
    <>
      {/* A checkbox to turn ranking on and off, joined to a button that opens the menu */}
      <div ref={controlRef} className={styles.splitButton}>
        <RankingCheckbox
          className={clsx('dim-button', styles.toggle)}
          title={
            rankingEnabled ? t('Compare.PerkFinder.RankingOn') : t('Compare.PerkFinder.RankingOff')
          }
          ariaLabel={t('Compare.PerkFinder.EnableRanking')}
          checked={rankingEnabled}
          onChange={toggleRanking}
        />
        <button
          type="button"
          className={clsx('dim-button', { selected: open })}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t('Compare.PerkFinder.Prioritize')}
          <AppIcon
            icon={expandDownIcon}
            className={clsx(styles.caret, { [styles.caretOpen]: open })}
          />
        </button>
      </div>
      {open && (
        <ClickOutside
          ref={menuRef}
          extraRef={controlRef}
          onClickOutside={() => setOpen(false)}
          className={styles.menu}
          // Don't let dragging in here drag the sheet
          onPointerDown={(e) => e.stopPropagation()}
        >
          <RankingCheckbox
            className={styles.enable}
            checked={rankingEnabled}
            onChange={toggleRanking}
          >
            {t('Compare.PerkFinder.EnableRanking')}
          </RankingCheckbox>
          <div className={styles.help}>
            {rankingEnabled
              ? t('Compare.PerkFinder.PrioritizeHelp')
              : t('Compare.PerkFinder.DefaultRankingHelp')}
          </div>
          {rankingEnabled && (
            <>
              <RankedList picks={priority} columns={columns} onChange={onPriorityChange} />
              <div className={styles.footer}>
                <button
                  type="button"
                  className="dim-button"
                  disabled={isDefaultOrder}
                  onClick={() => onPriorityChange(defaultOrder)}
                >
                  {t('Compare.PerkFinder.ResetRanking')}
                </button>
              </div>
            </>
          )}
        </ClickOutside>
      )}
    </>
  );
}

/**
 * A checkbox drawn with an icon, so it looks the same everywhere. (Buttons hide
 * native inputs.) The real checkbox stays, invisible, for keyboards and screen
 * readers.
 */
function RankingCheckbox({
  checked,
  className,
  title,
  ariaLabel,
  onChange,
  children,
}: {
  checked: boolean;
  className?: string;
  title?: string;
  /** An accessible name, if there are no children to label the checkbox */
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label className={className} title={title}>
      <input
        type="checkbox"
        className={styles.checkboxInput}
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <AppIcon icon={checked ? faCheckSquare : faSquare} className={styles.checkboxIcon} />
      {children}
    </label>
  );
}

/** A drag-to-reorder list of picks, most important first. */
function RankedList({
  picks,
  columns,
  onChange,
}: {
  picks: PerkPick[];
  columns: PerkFinderColumn[];
  onChange: (picks: PerkPick[]) => void;
}) {
  // While dragging, the order lives here until the drag ends
  const [draggingOrder, setDraggingOrder] = useState<PerkPick[]>();

  if (!picks.length) {
    return null;
  }

  const move = (index: number, newIndex: number) => {
    if (newIndex >= 0 && newIndex < picks.length) {
      onChange(reorder(picks, index, newIndex));
    }
  };

  const handleDragEnd = () => {
    if (draggingOrder) {
      onChange(draggingOrder);
      setDraggingOrder(undefined);
    }
  };

  const currentOrder = draggingOrder ?? picks;
  const { orderPicks } = splitPicks(currentOrder, true);

  return (
    <Reorder.Group
      axis="y"
      values={currentOrder}
      onReorder={setDraggingOrder}
      className={styles.list}
      as="ol"
    >
      {currentOrder.map((pick, index) => (
        <PriorityItem
          key={`${pick.column}-${pick.hash}`}
          pick={pick}
          index={index}
          count={currentOrder.length}
          sortsOnly={orderPicks.includes(pick)}
          columns={columns}
          onMove={move}
          onDragEnd={handleDragEnd}
        />
      ))}
    </Reorder.Group>
  );
}

function PriorityItem({
  pick,
  index,
  count,
  sortsOnly,
  columns,
  onMove,
  onDragEnd,
}: {
  pick: PerkPick;
  index: number;
  count: number;
  /** This pick only sorts the kept copies, rather than deciding which are kept */
  sortsOnly: boolean;
  columns: PerkFinderColumn[];
  onMove: (index: number, newIndex: number) => void;
  onDragEnd: () => void;
}) {
  // Only drag from the handle and name, so the buttons stay clickable
  const controls = useDragControls();
  const startDrag = (e: React.PointerEvent) => controls.start(e);

  const column = columns.find((c) => c.index === pick.column);
  const option = column?.options.find((o) => o.hash === pick.hash);
  if (!column || !option) {
    return null;
  }

  return (
    <Reorder.Item
      value={pick}
      className={styles.item}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ outline: '1px solid var(--theme-accent-primary)' }}
      onDragEnd={onDragEnd}
      as="li"
    >
      <span className={styles.grip} onPointerDown={startDrag}>
        <AppIcon icon={dragHandleIcon} />
      </span>
      <span className={styles.rank}>{index + 1}</span>
      <span className={styles.name} onPointerDown={startDrag}>
        <DefItemIcon itemDef={option.plugDef} borderless />
        <span className={styles.perkName}>{option.name}</span>
        <span className={styles.columnName}>
          {columnLabel(column)}
          {sortsOnly && (
            <span className={styles.sortsOnly} title={t('Compare.PerkFinder.SortsOnlyHelp')}>
              {t('Compare.PerkFinder.SortsOnly')}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        className={styles.button}
        disabled={index === 0}
        title={t('Compare.PerkFinder.MoveUp')}
        onClick={() => onMove(index, index - 1)}
      >
        <AppIcon icon={moveUpIcon} />
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={index === count - 1}
        title={t('Compare.PerkFinder.MoveDown')}
        onClick={() => onMove(index, index + 1)}
      >
        <AppIcon icon={moveDownIcon} />
      </button>
    </Reorder.Item>
  );
}

/** The display name of a perk finder column. */
export function columnLabel(column: PerkFinderColumn) {
  return column.index === 2
    ? t('Compare.PerkFinder.LeftPerk')
    : column.index === 3
      ? t('Compare.PerkFinder.RightPerk')
      : column.index === masterworkColumn
        ? t('Compare.PerkFinder.Masterwork')
        : column.itemTypeName;
}
