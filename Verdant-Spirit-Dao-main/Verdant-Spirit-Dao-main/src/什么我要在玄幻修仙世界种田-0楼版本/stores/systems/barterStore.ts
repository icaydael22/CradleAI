import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { PokedexManager } from '../../core/pokedex';
import { IBarterItem } from '../../types';
import { useWorldStore } from '../core/worldStore';
import { useCharacterStore } from '../facades/characterStore';
import { useActionStore } from '../ui/actionStore';

declare const toastr: any;

export const useBarterStore = defineStore('barter', () => {
    // --- STORES ---
    const worldStore = useWorldStore();
    const characterStore = useCharacterStore();
    const actionStore = useActionStore();
    const getPokedexManager = (): PokedexManager | undefined => (window as any).pokedexManager;

    // --- STATE (UI-only) ---
    const mySelectedItems = ref<Record<string, boolean>>({}); // { itemName: selected }
    const traderSelectedItems = ref<Record<string, boolean>>({}); // { itemName: selected }

    // --- GETTERS (Computed from other stores) ---
    const barterData = computed(() => worldStore.world?.以物换物);
    const systemName = computed(() => barterData.value?.名称 || '以物换物');
    const availableItems = computed(() => barterData.value?.可换取的物品 || []);
    const lastRefreshDay = computed(() => barterData.value?.上次刷新天数 || 0);

    const myItems = computed(() => {
        return characterStore.mainCharacter?.物品 ?? [];
    });

    const canRefresh = computed(() => {
        const currentDay = worldStore.world?.时间?.day || 0;
        return currentDay > lastRefreshDay.value;
    });

    const getItemValue = (item: IBarterItem): number => {
        const pokedexManager = getPokedexManager();
        if (!pokedexManager) return 0;

        const discoveredPokedex = worldStore.world?.图鉴;
        const pokedexEntry = discoveredPokedex?.物品?.find(e => e.名称 === item.名称);
        
        const baseValue = _.get(item, '价值.基础价值', item.价值);
        const fallbackValue = _.isNumber(baseValue) ? baseValue : 0;

        if (pokedexEntry) {
            const calculatedValue = pokedexManager.calculateItemValue(pokedexEntry);
            return calculatedValue;
        }
        
        return fallbackValue;
    };

    const myOfferValue = computed(() => {
        return Object.entries(mySelectedItems.value).reduce((total, [name, isSelected]) => {
            if (isSelected) {
                const item = myItems.value.find((i: IBarterItem) => i.名称 === name);
                if (item) {
                    const singleValue = getItemValue(item);
                    const quantity = item.数量 ?? 1;
                    return total + (singleValue * quantity);
                }
            }
            return total;
        }, 0);
    });

    const traderRequestValue = computed(() => {
        return Object.entries(traderSelectedItems.value).reduce((total, [name, isSelected]) => {
            if (isSelected) {
                const item = availableItems.value.find((i: IBarterItem) => i.名称 === name);
                if (item) {
                    const quantity = item.数量 ?? 1;
                    return total + (getItemValue(item) * quantity);
                }
            }
            return total;
        }, 0);
    });

    const isTradeBalanced = computed(() => {
        return myOfferValue.value >= traderRequestValue.value && traderRequestValue.value > 0;
    });

    // --- ACTIONS ---
    function toggleMyItemSelection(itemName: string) {
        mySelectedItems.value[itemName] = !mySelectedItems.value[itemName];
    }

    function toggleTraderItemSelection(itemName: string) {
        traderSelectedItems.value[itemName] = !traderSelectedItems.value[itemName];
    }

    async function executeTrade() {
        if (!isTradeBalanced.value) {
            toastr.error('交易不平衡，请重新选择物品。');
            return;
        }

        const myOfferItems = Object.keys(mySelectedItems.value)
            .filter(name => mySelectedItems.value[name])
            .map(name => {
                const item = myItems.value.find((i: IBarterItem) => i.名称 === name);
                const quantity = item?.数量 ?? 1;
                return `${name}x${quantity}`;
            })
            .join(', ');

        const traderRequestItems = Object.keys(traderSelectedItems.value)
            .filter(name => traderSelectedItems.value[name])
            .join(', ');
        
        const actionString = `我提出了一笔交易，用【${myOfferItems}】交换【${traderRequestItems}】。`;
        await actionStore.triggerSystemAction(actionString);
    }

    function resetSelections() {
        mySelectedItems.value = {};
        traderSelectedItems.value = {};
    }

    async function refreshItems() {
        if (!canRefresh.value) {
            toastr.warning('刷新交易物品的冷却时间未到。');
            return;
        }
        const actionString = `我决定看看【${systemName.value}】今天有什么新货色。`;
        await actionStore.triggerSystemAction(actionString);
    }

    return {
        systemName,
        myItems,
        availableItems,
        mySelectedItems,
        traderSelectedItems,
        canRefresh,
        myOfferValue,
        traderRequestValue,
        isTradeBalanced,
        toggleMyItemSelection,
        toggleTraderItemSelection,
        executeTrade,
        refreshItems,
        getItemValue,
        resetSelections,
    };
});
