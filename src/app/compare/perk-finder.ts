import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import { DimItem, PluggableInventoryItemDefinition } from 'app/inventory/item-types';
import { normalizeToUnenhanced } from 'app/utils/perk-utils';
import { getSocketsByType, isWeaponMasterworkSocket } from 'app/utils/socket-utils';

/**
 * The perk columns the perk finder lets you pick from, in display order:
 * barrel, magazine, left trait, right trait, masterwork. Different weapon types
 * have different components (e.g. blades and guards on swords), so columns are
 * identified by position rather than plug category.
 */
export const perkFinderColumnCount = 5;

/**
 * The masterwork column. Unlike perks, every masterwork is available on every
 * copy, so this matches each copy's current masterwork, by its stat hash.
 */
export const masterworkColumn = 4;

/**
 * For each perk finder column, the (unenhanced) perk hashes an item can roll
 * in that column, or its masterwork stat hash in the masterwork column. Empty
 * if the item doesn't have that column.
 */
export type ItemPerkColumns = Set<number>[];

/** A perk that appears in a column on at least one of the compared items. */
export interface PerkFinderOption {
  /** The unenhanced perk hash, or the stat hash for masterworks */
  hash: number;
  /** The name to show, e.g. "Outlaw" or "Range" for a masterwork */
  name: string;
  /** The plug to show an icon for */
  plugDef: PluggableInventoryItemDefinition;
  /** How many of the compared items can roll this perk in this column */
  count: number;
}

export interface PerkFinderColumn {
  /** Position of this column (0-4) */
  index: number;
  /** A name for the column from the plugs themselves (e.g. "Barrel", "Magazine", "Trait") */
  itemTypeName: string;
  options: PerkFinderOption[];
}

/** Get the barrel, magazine, and two trait sockets of a weapon, in order. */
function getPerkFinderSockets(item: DimItem) {
  const components = getSocketsByType(item, 'components');
  const traits = getSocketsByType(item, 'traits');
  return [components[0], components[1], traits[0], traits[1]];
}

/** The stat a weapon is currently masterworked in, and its masterwork plug. */
function getMasterwork(item: DimItem) {
  const stat = item.masterworkInfo?.stats?.find((s) => s.isPrimary);
  const plugDef = item.sockets?.allSockets.find(isWeaponMasterworkSocket)?.plugged?.plugDef;
  return stat && plugDef ? { stat, plugDef } : undefined;
}

export function getItemPerkColumns(item: DimItem): ItemPerkColumns {
  const masterwork = getMasterwork(item);
  return [
    ...getPerkFinderSockets(item).map(
      (socket) =>
        new Set(socket?.plugOptions.map((p) => normalizeToUnenhanced(p.plugDef.hash)) ?? []),
    ),
    new Set(masterwork ? [masterwork.stat.hash] : []),
  ];
}

/** Collect every perk available in each column across all the given items. */
export function buildPerkFinderColumns(
  items: DimItem[],
  defs: D2ManifestDefinitions,
): PerkFinderColumn[] {
  const columns: PerkFinderColumn[] = Array.from({ length: perkFinderColumnCount }, (_, index) => ({
    index,
    itemTypeName: '',
    options: [],
  }));
  const optionsByHash = columns.map(() => new Map<number, PerkFinderOption>());

  const addOption = (column: number, option: Omit<PerkFinderOption, 'count'>) => {
    const existing = optionsByHash[column].get(option.hash);
    if (existing) {
      existing.count++;
    } else {
      const newOption = { ...option, count: 1 };
      optionsByHash[column].set(option.hash, newOption);
      columns[column].options.push(newOption);
    }
  };

  for (const item of items) {
    const sockets = getPerkFinderSockets(item);
    for (let i = 0; i < sockets.length; i++) {
      const socket = sockets[i];
      if (!socket) {
        continue;
      }
      // Name the column after the regular version of a perk, since enhanced ones say
      // e.g. "Enhanced Magazine", and some weapons only roll enhanced barrels and mags
      const plugDef = socket.plugOptions[0]?.plugDef;
      if (plugDef) {
        columns[i].itemTypeName ||= (
          defs.InventoryItem.get(normalizeToUnenhanced(plugDef.hash)) ?? plugDef
        ).itemTypeDisplayName;
      }
      // An item may offer both the base and enhanced version of a perk; only count it once
      const seenOnItem = new Set<number>();
      for (const plug of socket.plugOptions) {
        const hash = normalizeToUnenhanced(plug.plugDef.hash);
        if (seenOnItem.has(hash)) {
          continue;
        }
        seenOnItem.add(hash);
        addOption(i, { hash, name: plug.plugDef.displayProperties.name, plugDef: plug.plugDef });
      }
    }

    const masterwork = getMasterwork(item);
    if (masterwork) {
      addOption(masterworkColumn, {
        hash: masterwork.stat.hash,
        name: masterwork.stat.name,
        plugDef: masterwork.plugDef,
      });
    }
  }

  return columns.filter((c) => c.options.length > 0);
}

/** A picked perk: a perk hash in a particular column. */
export interface PerkPick {
  column: number;
  hash: number;
}

/**
 * Every picked perk, most important first. The ranking decides which copy is
 * closest to a combo when no copy has all of it.
 */
export type PerkPriority = PerkPick[];

/**
 * Every combo: every combination of picked perks across columns should be
 * buildable on one of the kept guns. Every perk: every picked perk should be on
 * at least one kept gun.
 */
export type PerkMatchMode = 'strict' | 'loose';

/**
 * Left and right perks define the pool of copies to keep. The other columns
 * only order that pool, favoring copies with more of those picks.
 */
export const poolColumns = [2, 3];
/** The columns that order the pool, in display order. */
export const orderColumns = [masterworkColumn, 0, 1];

export const isPoolPick = (pick: PerkPick) => poolColumns.includes(pick.column);

/** Order new picks: left and right perks, then masterworks, barrels, and magazines. */
const pickGroup = (column: number) =>
  poolColumns.includes(column) ? 0 : 1 + orderColumns.indexOf(column);

/**
 * The default order for picks: left perks, right perks, then masterworks,
 * barrels, and magazines, each in the order they're listed in their column.
 */
export function defaultPriority(priority: PerkPriority, columns: PerkFinderColumn[]) {
  const optionIndex = (pick: PerkPick) =>
    columns.find((c) => c.index === pick.column)?.options.findIndex((o) => o.hash === pick.hash) ??
    -1;
  return priority.toSorted(
    (a, b) =>
      pickGroup(a.column) - pickGroup(b.column) ||
      a.column - b.column ||
      optionIndex(a) - optionIndex(b),
  );
}

/**
 * Add or remove a pick from the priority list. New picks go after the last
 * pick in the same or an earlier group, so the list stays in section order
 * without disturbing any manual ordering.
 */
export function togglePick(priority: PerkPriority, pick: PerkPick): PerkPriority {
  if (priority.some((p) => p.column === pick.column && p.hash === pick.hash)) {
    return priority.filter((p) => p.column !== pick.column || p.hash !== pick.hash);
  }
  const group = pickGroup(pick.column);
  const insertAt = priority.findLastIndex((p) => pickGroup(p.column) <= group) + 1;
  return priority.toSpliced(insertAt, 0, pick);
}

/**
 * The rank of each pick, starting at 0. Until the user turns on their own
 * ranking, every pick is tied (within its section). With it on, picks are
 * ranked in the order they appear.
 */
export function pickRanks(priority: PerkPriority, customOrder: boolean): number[] {
  return priority.map((_pick, i) => (customOrder ? i : 0));
}

/**
 * Split picks into the ones that define the pool of copies to keep, and the
 * ones that only order it. Left and right perks always define the pool. With
 * the user's own ranking on, so does any other pick ranked above a left or
 * right perk.
 */
export function splitPicks(priority: PerkPriority, customOrder: boolean) {
  const lastPoolIndex = customOrder ? priority.findLastIndex(isPoolPick) : -1;
  const definesPool = (pick: PerkPick, i: number) => isPoolPick(pick) || i < lastPoolIndex;
  return {
    poolPicks: priority.filter(definesPool),
    orderPicks: priority.filter((pick, i) => !definesPool(pick, i)),
  };
}

/** A single thing the user wants to be able to build: one or more picks, all on the same gun. */
type Requirement = PerkPick[];

function buildRequirements(picks: PerkPick[], mode: PerkMatchMode): Requirement[] {
  if (mode === 'loose') {
    return picks.map((pick) => [pick]);
  }

  // Every combo: the cartesian product of picks across every column with picks
  const pickedColumns = Map.groupBy(picks, (pick) => pick.column);
  let combos: Requirement[] = [[]];
  for (const columnPicks of pickedColumns.values()) {
    combos = combos.flatMap((combo) => columnPicks.map((pick) => [...combo, pick]));
  }
  return pickedColumns.size ? combos : [];
}

function hasPick(columns: ItemPerkColumns, { column, hash }: PerkPick) {
  return columns[column]?.has(hash) ?? false;
}

/**
 * Score an item on some picks. Tied picks count equally; otherwise each rank
 * outweighs all the ranks below it put together. Higher is better.
 */
function scorePicks(
  columns: ItemPerkColumns,
  picks: PerkPick[],
  rankOf: (pick: PerkPick) => number,
) {
  const rankCount = Math.max(-1, ...picks.map(rankOf)) + 1;
  return picks.reduce(
    // Scale by picks.length + 1 so that e.g. 3 tied picks can't outweigh one higher-ranked pick
    (sum, pick) =>
      sum + (hasPick(columns, pick) ? (picks.length + 1) ** (rankCount - 1 - rankOf(pick)) : 0),
    0,
  );
}

export interface PerkFinderResult {
  /** Items to keep: the smallest set that covers every pool pick (or combo) */
  keep: Set<string>;
  /** How many picked perks each item has, by item id */
  matchedCount: Map<string, number>;
  /** How well each item matches the pool picks, by item id. Higher is better. */
  poolScore: Map<string, number>;
  /** How well each item matches the picks that only order the pool, by item id. Higher is better. */
  orderScore: Map<string, number>;
  /** Total number of picked perks */
  pickedCount: number;
  /** How many picks define the pool */
  poolPickCount: number;
  /** How many of the requirements (perks or combos) at least one item has part of */
  coveredRequirements: number;
  /** How many requirements no single item has all of, so the closest item is kept instead */
  partialRequirements: number;
  totalRequirements: number;
}

/** Beyond this many candidate subsets, fall back to a greedy search. */
const maxExactSearchSize = 200_000;

/**
 * Find the smallest set of items that, together, can fulfill every pool pick
 * (loose) or every combination of them (strict). Pool picks are the left and
 * right perks, plus anything the user ranked above them (see splitPicks). The
 * other picks never change how many items are kept; they only decide between
 * equally good sets, and order the results.
 *
 * When no item has all of a combo, the closest items fulfill it instead: an
 * item with more of the highest-ranked picks wins. Until the user turns on
 * their own ranking (customOrder), picks count equally.
 */
export function findPerkFinderResult(
  items: { id: string; columns: ItemPerkColumns }[],
  priority: PerkPriority,
  mode: PerkMatchMode,
  customOrder = false,
): PerkFinderResult {
  const ranks = pickRanks(priority, customOrder);
  const rankOf = (pick: PerkPick) =>
    ranks[priority.findIndex((p) => p.column === pick.column && p.hash === pick.hash)];
  const { poolPicks, orderPicks } = splitPicks(priority, customOrder);

  const matchedCount = new Map(
    items.map((item) => [item.id, priority.filter((pick) => hasPick(item.columns, pick)).length]),
  );
  const poolScore = new Map(
    items.map((item) => [item.id, scorePicks(item.columns, poolPicks, rankOf)]),
  );
  const orderScore = new Map(
    items.map((item) => [item.id, scorePicks(item.columns, orderPicks, rankOf)]),
  );

  const requirements = buildRequirements(poolPicks, mode);
  const fulfillment = requirements.map((req) => whoFulfills(items, req, rankOf));
  // For each item, the indexes of the requirements it fulfills
  const coverage = items.map(
    (_item, itemIndex) =>
      new Set(fulfillment.flatMap(({ fulfilledBy }, i) => (fulfilledBy.has(itemIndex) ? [i] : []))),
  );
  const coverable = new Set(coverage.flatMap((c) => [...c]));

  const result: PerkFinderResult = {
    keep: new Set(),
    matchedCount,
    poolScore,
    orderScore,
    pickedCount: priority.length,
    poolPickCount: poolPicks.length,
    coveredRequirements: coverable.size,
    partialRequirements: fulfillment.filter((f) => f.partial).length,
    totalRequirements: requirements.length,
  };
  if (coverable.size === 0) {
    return result;
  }

  // Only items that cover something are worth keeping
  const candidates = items
    .map((item, i) => ({
      id: item.id,
      covers: coverage[i],
      orderScore: orderScore.get(item.id)!,
      poolScore: poolScore.get(item.id)!,
    }))
    .filter((c) => c.covers.size > 0);

  const keep =
    findSmallestCover(candidates, coverable.size) ?? greedyCover(candidates, coverable.size);
  result.keep = new Set(keep.map((c) => c.id));
  return result;
}

/**
 * Sort items by the perk finder result: items to keep first, best matches for
 * the picks that only order the pool first among them. The rest follow,
 * closest to the pool picks first.
 */
export function comparePerkFinderItems(result: PerkFinderResult) {
  return (a: string, b: string) => {
    const keepA = result.keep.has(a);
    const keepB = result.keep.has(b);
    if (keepA !== keepB) {
      return keepA ? -1 : 1;
    }
    const [first, second] = keepA
      ? [result.orderScore, result.poolScore]
      : [result.poolScore, result.orderScore];
    return first.get(b)! - first.get(a)! || second.get(b)! - second.get(a)!;
  };
}

/**
 * Which items come closest to a requirement. Each item gets a key counting how
 * many of the requirement's picks it has at each rank, most important rank
 * first, so comparing keys compares items by their most important difference.
 */
function whoFulfills(
  items: { columns: ItemPerkColumns }[],
  requirement: Requirement,
  rankOf: (pick: PerkPick) => number,
) {
  const ranks = [...new Set(requirement.map(rankOf))].sort((a, b) => a - b);
  // A requirement has at most one pick per column, so each count is a single digit
  const keys = items.map((item) =>
    ranks
      .map(
        (rank) =>
          requirement.filter((pick) => rankOf(pick) === rank && hasPick(item.columns, pick)).length,
      )
      .join(''),
  );
  const best = keys.reduce((a, b) => (b > a ? b : a), '');
  const bestCount = [...best].reduce((sum, digit) => sum + Number(digit), 0);
  if (bestCount === 0) {
    return { fulfilledBy: new Set<number>(), partial: false };
  }
  return {
    fulfilledBy: new Set(keys.flatMap((key, i) => (key === best ? [i] : []))),
    partial: bestCount < requirement.length,
  };
}

interface Candidate {
  id: string;
  covers: Set<number>;
  orderScore: number;
  poolScore: number;
}

function coverSize(set: Candidate[]) {
  const covered = new Set<number>();
  for (const c of set) {
    for (const r of c.covers) {
      covered.add(r);
    }
  }
  return covered.size;
}

/** Between equally small sets, prefer more of the picks that order the pool, then pool picks. */
function isBetterSet(a: Candidate[], b: Candidate[]) {
  const sum = (set: Candidate[], key: 'orderScore' | 'poolScore') =>
    set.reduce((total, c) => total + c[key], 0);
  return (
    (sum(a, 'orderScore') - sum(b, 'orderScore') || sum(a, 'poolScore') - sum(b, 'poolScore')) > 0
  );
}

/**
 * Try every set of 1, 2, 3... candidates until some cover everything, and
 * return the highest-scoring of those. Returns undefined if that would take too long.
 */
function findSmallestCover(candidates: Candidate[], target: number): Candidate[] | undefined {
  let checked = 0;
  for (let size = 1; size <= candidates.length; size++) {
    let best: Candidate[] | undefined;
    const search = (start: number, chosen: Candidate[]) => {
      if (checked > maxExactSearchSize) {
        return;
      }
      if (chosen.length === size) {
        checked++;
        if (coverSize(chosen) === target && (!best || isBetterSet(chosen, best))) {
          best = [...chosen];
        }
        return;
      }
      for (let i = start; i < candidates.length; i++) {
        chosen.push(candidates[i]);
        search(i + 1, chosen);
        chosen.pop();
      }
    };
    search(0, []);
    // Even if we ran out of time, any cover found at this size is a smallest one
    if (best) {
      return best;
    }
    if (checked > maxExactSearchSize) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Repeatedly keep whichever candidate covers the most remaining requirements,
 * breaking ties with isBetterSet.
 */
function greedyCover(candidates: Candidate[], target: number): Candidate[] {
  const chosen: Candidate[] = [];
  const covered = new Set<number>();
  while (covered.size < target) {
    let best: Candidate | undefined;
    let bestGain = 0;
    for (const c of candidates) {
      let gain = 0;
      for (const r of c.covers) {
        if (!covered.has(r)) {
          gain++;
        }
      }
      if (gain > bestGain || (gain > 0 && gain === bestGain && isBetterSet([c], [best!]))) {
        best = c;
        bestGain = gain;
      }
    }
    if (!best) {
      break;
    }
    chosen.push(best);
    for (const r of best.covers) {
      covered.add(r);
    }
  }
  return chosen;
}
