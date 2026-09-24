import { PressTip } from 'app/dim-ui/PressTip';
import RadioButtons from 'app/dim-ui/RadioButtons';
import { t } from 'app/i18next-t';
import { DefItemIcon } from 'app/inventory/ItemIcon';
import { tagConfig } from 'app/inventory/dim-item-info';
import { AppIcon, infoIcon } from 'app/shell/icons';
import clsx from 'clsx';
import * as styles from './PerkFinder.m.scss';
import PerkPriorityMenu, { columnLabel } from './PerkPriorityMenu';
import {
  PerkFinderColumn,
  PerkFinderResult,
  PerkMatchMode,
  PerkPriority,
  masterworkColumn,
  orderColumns as orderColumnIndexes,
  poolColumns as poolColumnIndexes,
} from './perk-finder';

/**
 * Lets you pick the perks you want from every perk your compared weapons can
 * roll, then summarizes the fewest guns you need to keep to get them.
 */
export default function PerkFinder({
  columns,
  priority,
  rankingEnabled,
  onRankingEnabledChange,
  mode,
  result,
  onTogglePerk,
  onPriorityChange,
  onModeChange,
  onClear,
  junkCount,
  onTagJunk,
}: {
  columns: PerkFinderColumn[];
  /** The picked perks, most important first */
  priority: PerkPriority;
  /** Whether the user has turned on their own ranking of their picks */
  rankingEnabled: boolean;
  onRankingEnabledChange: (enabled: boolean) => void;
  mode: PerkMatchMode;
  result: PerkFinderResult;
  onTogglePerk: (column: number, hash: number) => void;
  onPriorityChange: (priority: PerkPriority) => void;
  onModeChange: (mode: PerkMatchMode) => void;
  onClear: () => void;
  /** How many of the guns not being kept can be tagged as junk */
  junkCount: number;
  onTagJunk: () => void;
}) {
  const poolColumns = columns.filter((c) => poolColumnIndexes.includes(c.index));
  const orderColumns = orderColumnIndexes
    .map((index) => columns.find((c) => c.index === index))
    .filter((c) => c !== undefined);

  const renderColumn = (column: PerkFinderColumn) => (
    <div key={column.index} className={styles.column}>
      <div className={styles.columnHeader}>{columnLabel(column)}</div>
      {column.options.map((option) => {
        const selected = priority.some(
          (pick) => pick.column === column.index && pick.hash === option.hash,
        );
        return (
          <button
            key={option.hash}
            type="button"
            className={clsx(styles.perk, { [styles.selected]: selected })}
            aria-pressed={selected}
            onClick={() => onTogglePerk(column.index, option.hash)}
          >
            <DefItemIcon itemDef={option.plugDef} borderless />
            <span className={styles.perkName}>{option.name}</span>
            <span
              className={styles.count}
              title={
                column.index === masterworkColumn
                  ? t('Compare.PerkFinder.CopiesWithMasterwork', { count: option.count })
                  : t('Compare.PerkFinder.CopiesWithPerk', { count: option.count })
              }
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.perkFinder}>
      <div className={styles.header}>
        <div className={styles.title}>{t('Compare.PerkFinder.Instructions')}</div>
        <div className={styles.toolbar}>
          <RadioButtons
            value={mode}
            onChange={onModeChange}
            options={[
              {
                value: 'strict',
                label: (
                  <ModeLabel
                    label={t('Compare.PerkFinder.Strict')}
                    help={t('Compare.PerkFinder.StrictHelp')}
                  />
                ),
              },
              {
                value: 'loose',
                label: (
                  <ModeLabel
                    label={t('Compare.PerkFinder.Loose')}
                    help={t('Compare.PerkFinder.LooseHelp')}
                  />
                ),
              },
            ]}
          />
          {result.pickedCount > 0 && (
            <>
              <div className={styles.divider} />
              <PerkPriorityMenu
                priority={priority}
                rankingEnabled={rankingEnabled}
                onRankingEnabledChange={onRankingEnabledChange}
                columns={columns}
                onPriorityChange={onPriorityChange}
              />
              {junkCount > 0 && (
                <button
                  type="button"
                  className="dim-button"
                  onClick={onTagJunk}
                  title={t('Compare.PerkFinder.TagJunkHelp')}
                >
                  <AppIcon icon={tagConfig.junk.icon} />{' '}
                  {t('Compare.PerkFinder.TagJunk', { count: junkCount })}
                </button>
              )}
              <button type="button" className="dim-button" onClick={onClear}>
                {t('Compare.PerkFinder.Clear')}
              </button>
            </>
          )}
        </div>
      </div>
      <div className={styles.sections}>
        {/* Masterwork, barrel & magazine first, then perks, like a weapon's perks in game */}
        {orderColumns.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHelp}>{t('Compare.PerkFinder.OrderHelp')}</div>
            <div className={styles.columns}>{orderColumns.map(renderColumn)}</div>
          </section>
        )}
        <section className={styles.section}>
          <div className={styles.sectionHelp}>{t('Compare.PerkFinder.PoolHelp')}</div>
          <div className={styles.columns}>{poolColumns.map(renderColumn)}</div>
        </section>
      </div>
      {result.pickedCount > 0 && (
        <div className={styles.result} role="status">
          <span className={styles.resultIcon}>
            <AppIcon icon={infoIcon} />
          </span>
          <div className={styles.resultText}>
            {result.poolPickCount === 0 && (
              <span className={styles.resultMessage}>{t('Compare.PerkFinder.NoPoolPicks')}</span>
            )}
            {result.keep.size > 0 && (
              <span className={styles.resultMessage}>
                {mode === 'strict'
                  ? t('Compare.PerkFinder.KeepStrict', { count: result.keep.size })
                  : t('Compare.PerkFinder.KeepLoose', { count: result.keep.size })}
              </span>
            )}
            {result.partialRequirements > 0 && (
              <span className={styles.resultNote}>
                {t('Compare.PerkFinder.Partial', { count: result.partialRequirements })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeLabel({ label, help }: { label: string; help: string }) {
  return (
    <>
      {label}{' '}
      <PressTip elementType="span" className={styles.modeHelp} tooltip={help} minimal>
        <AppIcon icon={infoIcon} />
      </PressTip>
    </>
  );
}
