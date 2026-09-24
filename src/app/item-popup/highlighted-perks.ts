import { emptySet } from 'app/utils/empty';
import { createContext } from 'react';

/**
 * Perk hashes (unenhanced) that should be visually highlighted wherever they
 * appear in item sockets below this context, e.g. perks picked in Compare's
 * perk finder.
 */
export const HighlightedPerksContext = createContext<ReadonlySet<number>>(emptySet());
