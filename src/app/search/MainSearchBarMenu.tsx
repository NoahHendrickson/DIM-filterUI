import useBulkNote from 'app/dim-ui/useBulkNote';
import ItemActionsDropdown from 'app/item-actions/ItemActionsDropdown';
import { querySelector } from 'app/shell/selectors';
import { motion } from 'motion/react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router';
import InventoryArmorFilterMenu from './InventoryArmorFilterMenu';
import * as styles from './MainSearchBarMenu.m.scss';
import { searchButtonAnimateVariants } from './SearchBar';
import { filteredItemsSelector, queryValidSelector } from './items/item-search-filter';

/**
 * Inventory search bar actions: armor filter picker (left) and three-dot item actions menu.
 */
export default function MainSearchBarMenu() {
  const location = useLocation();
  const searchQuery = useSelector(querySelector);
  const queryValid = useSelector(queryValidSelector);
  const showSearchCount = Boolean(searchQuery && queryValid);
  const filteredItems = useSelector(filteredItemsSelector);
  const onInventory = location.pathname.endsWith('inventory');

  const [promptDialog, bulkNote] = useBulkNote();

  const showSearchActions = onInventory;
  if (!showSearchActions) {
    return null;
  }

  return (
    <motion.div
      layout
      key="action"
      className={styles.cluster}
      variants={searchButtonAnimateVariants}
      exit="hidden"
      initial="hidden"
      animate="shown"
    >
      {promptDialog}
      <InventoryArmorFilterMenu />
      <ItemActionsDropdown
        filteredItems={filteredItems}
        searchActive={showSearchCount}
        searchQuery={searchQuery}
        fixed={true}
        bulkNote={bulkNote}
      />
    </motion.div>
  );
}
