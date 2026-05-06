import { PressTip } from 'app/dim-ui/PressTip';
import { t } from 'app/i18next-t';
import { DimItem } from 'app/inventory/item-types';
import { DefItemIcon } from 'app/inventory/ItemIcon';
import { allItemsSelector, createItemContextSelector } from 'app/inventory/selectors';
import { makeFakeItem } from 'app/inventory/store/d2-item-factory';
import { getExoticClassItemPerkHashes } from 'app/inventory/store/exotic-class-item';
import { isPluggableItem } from 'app/inventory/store/sockets';
import { PlugDefTooltip } from 'app/item-popup/PlugTooltip';
import LoadoutEditSection from 'app/loadout/loadout-edit/LoadoutEditSection';
import { useD2Definitions } from 'app/manifest/selectors';
import { getExtraIntrinsicPerkSockets } from 'app/utils/socket-utils';
import { DestinyClass, DestinyItemSubType } from 'bungie-api-ts/destiny2';
import { BucketHashes } from 'data/d2/generated-enums';
import { sample } from 'es-toolkit';
import anyExoticIcon from 'images/anyExotic.svg';
import noExoticIcon from 'images/noExotic.svg';
import noExoticPreferenceIcon from 'images/noExoticPreference.svg';
import { Dispatch, memo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LoadoutBuilderAction } from '../loadout-builder-reducer';
import { LOCKED_EXOTIC_ANY_EXOTIC, LOCKED_EXOTIC_NO_EXOTIC } from '../types';
import ExoticPicker, {
  ExoticPerkPicker,
  findLockableExotics,
  resolveExoticInfo,
} from './ExoticPicker';
import { exoticTileInfo } from './ExoticTile';
import * as styles from './LoadoutOptimizerExotic.m.scss';

const LoadoutOptimizerExotic = memo(function LoadoutOptimizerExotic({
  classType,
  className,
  storeId,
  lockedExoticHash,
  perks,
  vendorItems,
  lbDispatch,
}: {
  classType: DestinyClass;
  storeId: string;
  className?: string;
  lockedExoticHash: number | undefined;
  perks?: number[];
  vendorItems: DimItem[];
  lbDispatch: Dispatch<LoadoutBuilderAction>;
}) {
  const [showExoticPicker, setShowExoticPicker] = useState(false);
  const [showExoticPerkPicker, setShowExoticPerkPicker] = useState(false);
  const defs = useD2Definitions()!;
  const allItems = useSelector(allItemsSelector);

  const handleClear = () => {
    lbDispatch({ type: 'removeLockedExotic' });
  };

  const handleSyncFromEquipped = () => {
    const equippedExotic = allItems.find(
      (i) => i.equipped && i.isExotic && i.bucket.inArmor && i.owner === storeId && i.energy,
    );
    lbDispatch({ type: 'lockExotic', lockedExoticHash: equippedExotic?.hash });
    if (equippedExotic?.bucket.hash === BucketHashes.ClassArmor) {
      const equippedPerks = getExtraIntrinsicPerkSockets(equippedExotic)
        .map((s) => s.plugged?.plugDef.hash)
        .filter((h): h is number => h !== undefined);
      if (equippedPerks.length > 0) {
        lbDispatch({
          type: 'updatePerks',
          removed: getExoticClassItemPerkHashes(equippedExotic.hash),
          added: equippedPerks,
        });
      }
    }
  };

  const handleRandomize = () => {
    const exotics = findLockableExotics(allItems, vendorItems, classType, defs);
    if (exotics.length === 0) {
      return;
    }
    const randomExotic = sample(exotics);
    lbDispatch({ type: 'lockExotic', lockedExoticHash: randomExotic.def.hash });
    if (randomExotic.def.itemSubType === DestinyItemSubType.ClassArmor) {
      const ownedRolls = allItems.filter(
        (i) => i.hash === randomExotic.def.hash && getExtraIntrinsicPerkSockets(i).length > 0,
      );
      if (ownedRolls.length > 0) {
        const randomPerks = getExtraIntrinsicPerkSockets(sample(ownedRolls))
          .map((s) => s.plugged?.plugDef.hash)
          .filter((h): h is number => h !== undefined);
        if (randomPerks.length > 0) {
          lbDispatch({
            type: 'updatePerks',
            removed: getExoticClassItemPerkHashes(randomExotic.def.hash),
            added: randomPerks,
          });
        }
      }
    }
  };

  const handleClickEdit = () => setShowExoticPicker(true);
  const handleClickEditPerk = () => setShowExoticPerkPicker(true);

  const isClassItem =
    lockedExoticHash !== undefined &&
    defs.InventoryItem.get(lockedExoticHash)?.itemSubType === DestinyItemSubType.ClassArmor;
  const hasOwnedClassItemRoll =
    isClassItem &&
    allItems.some((i) => i.hash === lockedExoticHash && getExtraIntrinsicPerkSockets(i).length > 0);

  return (
    <LoadoutEditSection
      title={t('LoadoutBuilder.Exotic')}
      className={className}
      onClear={handleClear}
      onSyncFromEquipped={handleSyncFromEquipped}
      onRandomize={handleRandomize}
    >
      <ChosenExoticOption lockedExoticHash={lockedExoticHash} onClick={handleClickEdit} />
      {hasOwnedClassItemRoll && (perks ?? []).some((p) => p !== 0) && (
        <div className={styles.selectedPerks} onClick={handleClickEditPerk}>
          {(perks ?? [])
            .filter((p) => p !== 0)
            .map((perkHash) => {
              const def = defs.InventoryItem.get(perkHash);
              return (
                def &&
                isPluggableItem(def) && (
                  <PressTip
                    key={perkHash}
                    tooltip={<PlugDefTooltip def={def} />}
                    placement="top"
                    className={styles.selectedPerk}
                  >
                    <DefItemIcon itemDef={def} />
                    {def.displayProperties.name}
                  </PressTip>
                )
              );
            })}
        </div>
      )}
      <div className={styles.buttons}>
        <button type="button" className="dim-button" onClick={handleClickEdit}>
          {t('LB.SelectExotic')}
        </button>
        {hasOwnedClassItemRoll && (
          <button type="button" className="dim-button" onClick={handleClickEditPerk}>
            {t('LB.SelectPerks')}
          </button>
        )}
      </div>
      {showExoticPicker && (
        <ExoticPicker
          lockedExoticHash={lockedExoticHash}
          vendorItems={vendorItems}
          classType={classType}
          onSelected={(exotic) => {
            lbDispatch({ type: 'lockExotic', lockedExoticHash: exotic });
            if (
              exotic &&
              defs.InventoryItem.get(exotic)?.itemSubType === DestinyItemSubType.ClassArmor &&
              allItems.some((i) => i.hash === exotic && getExtraIntrinsicPerkSockets(i).length > 0)
            ) {
              setShowExoticPerkPicker(true);
            }
          }}
          onClose={() => setShowExoticPicker(false)}
        />
      )}
      {showExoticPerkPicker && (
        <ExoticPerkPicker
          key={lockedExoticHash}
          lockedExoticHash={lockedExoticHash}
          initialPerks={perks}
          onSelected={({ removed, added }) => lbDispatch({ type: 'updatePerks', removed, added })}
          onClose={() => setShowExoticPerkPicker(false)}
        />
      )}
    </LoadoutEditSection>
  );
});

export default LoadoutOptimizerExotic;

function ChosenExoticOption({
  lockedExoticHash,
  onClick,
}: {
  lockedExoticHash: number | undefined;
  onClick: () => void;
}) {
  const defs = useD2Definitions()!;
  const itemCreationContext = useSelector(createItemContextSelector);

  let info: {
    icon: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    descriptionClassName?: string;
  };

  switch (lockedExoticHash) {
    case LOCKED_EXOTIC_NO_EXOTIC:
      info = {
        title: t('LoadoutBuilder.NoExotic'),
        description: t('LoadoutBuilder.NoExoticDescription'),
        icon: (
          <div className="item">
            <img src={noExoticIcon} className="item-img" />
          </div>
        ),
      };
      break;
    case LOCKED_EXOTIC_ANY_EXOTIC:
      info = {
        title: t('LoadoutBuilder.AnyExotic'),
        description: t('LoadoutBuilder.AnyExoticDescription'),
        icon: (
          <div className="item">
            <img src={anyExoticIcon} className="item-img" />
          </div>
        ),
      };
      break;
    case undefined: {
      info = {
        title: t('LoadoutBuilder.NoExoticPreference'),
        description: t('LoadoutBuilder.NoExoticPreferenceDescription'),
        icon: (
          <div className="item">
            <img src={noExoticPreferenceIcon} className="item-img" />
          </div>
        ),
      };
      break;
    }
    default: {
      const exoticArmor = defs.InventoryItem.get(lockedExoticHash);
      const fakeItem = makeFakeItem(itemCreationContext, exoticArmor.hash);
      if (fakeItem) {
        const { exoticPerk, exoticMods } = resolveExoticInfo(fakeItem);
        info = exoticTileInfo(defs, {
          def: exoticArmor,
          exoticPerk,
          exoticMods,
          isArmor1: Boolean(fakeItem?.energy),
        });
        if (fakeItem.bucket.hash === BucketHashes.ClassArmor) {
          info.description = undefined;
        }
        break;
      }
      break;
    }
  }

  const { icon, title, description, descriptionClassName } = info!;

  return (
    <div className={styles.infoCard} onClick={onClick}>
      {icon}
      <div className={styles.details}>
        <div className={styles.title}>{title}</div>
        <div className={descriptionClassName}>{description}</div>
      </div>
    </div>
  );
}
