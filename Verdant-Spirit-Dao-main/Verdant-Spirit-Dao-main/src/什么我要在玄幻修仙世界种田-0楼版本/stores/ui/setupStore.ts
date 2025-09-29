import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';
import { useGenerationStore } from '../app/generationStore';
import * as C from '../../modules/setup/data';
import { logger } from '../../core/logger';
import { IChoiceOption, IItem, IPointOption, ISeason, ITrait, ISystem } from '../../modules/setup/types';
import { getVariables, assignVariables } from '../../core/variables';
import { DEFAULT_WORLDVIEW, IWorldviewDefinition } from '../../data/worldview-data';
import { generateInitialWorld } from '../../core/world-initializer';
import _ from 'lodash';

// Define the shape of the state saved to localStorage
interface ISetupState {
    characterName: string;
    customCharacterData: {
        gender: string;
        age: number;
        appearance: string;
        backgroundEarth: string;
        backgroundWorld: string;
        personality: string;
        habits: string;
    };
    selections: {
        initialLocation: string;
        season: string;
        farmland: string;
        water: string;
        creature: string;
        seabed: string;
        storm: string;
        islands: string;
        mindset: string;
        trait: string;
        system: string;
        inventory: string[];
        bag: string[];
    };
    talents: {
        'talent-gen-gu': number;
        'talent-wu-xing': number;
        'talent-qi-yun': number;
    };
}

// Helper function to safely parse JSON from localStorage
function safeJsonParse<T>(jsonString: string | null, defaultValue: T): T {
    if (!jsonString) return defaultValue;
    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        logger('error', 'setupStore', 'Failed to parse JSON from localStorage', e);
        return defaultValue;
    }
}

export const useSetupStore = defineStore('setup', () => {
    const isVisible = ref(false);

    function showSetup() {
        isVisible.value = true;
    }

    function hideSetup() {
        isVisible.value = false;
    }

    // --- STATIC DATA ---
    const staticData = {
        farmlands: C.farmlands,
        waterSources: C.waterSources,
        creatures: C.creatures,
        seabeds: C.seabeds,
        storms: C.storms,
        islands: C.islands,
        mindsets: C.mindsets,
        defaultTrait: C.defaultTrait,
        optionalTraits: C.optionalTraits,
        inventoryItems: C.inventoryItems,
        bagItems: C.bagItems,
        defaultBagItems: C.defaultBagItems,
        seasons: C.seasons,
        systems: C.systems,
        initialLocations: C.initialLocations,
    };

    // --- STATE ---
    const characterName = ref('萧栖雪');
    const customCharacterData = reactive({
        gender: '女',
        age: 22,
        appearance: '清秀耐看型。五官柔和，不具攻击性，带有一种天然的、专注于某事时的书卷气。在现代社会属于会被称赞“干净”、“有气质”的类型。',
        backgroundEarth: '一名普通的农业大学应届毕业生。',
        backgroundWorld: '意外的穿越者，散修。',
        personality: '谨慎务实',
        habits: '对未知事物抱有强烈的好奇心和探索欲',
    });

    const selections = reactive({
        initialLocation: C.initialLocations[0].id,
        season: C.seasons[0].id,
        farmland: C.farmlands[0].id,
        water: C.waterSources[0].id,
        creature: C.creatures[0].id,
        seabed: C.seabeds[0].id,
        storm: C.storms[0].id,
        islands: C.islands[0].id,
        mindset: C.mindsets[0].id,
        trait: C.optionalTraits.find(t => t.id === 'trait-none')?.id ?? C.optionalTraits[C.optionalTraits.length - 1].id,
        system: C.systems[0].id,
        inventory: [] as string[],
        bag: [] as string[],
    });

    const talents = reactive({
        'talent-gen-gu': 0,
        'talent-wu-xing': 0,
        'talent-qi-yun': 0,
    });

    // --- COMPUTED ---
    const basePoints = { talent: 10, inventory: 5, bag: 5 };

    const talentSpent = computed(() => Object.values(talents).reduce((sum, val) => sum + val, 0));
    const inventorySpent = computed(() => selections.inventory.reduce((sum, id) => {
        const item = C.inventoryItems.find(i => i.id === id);
        return sum + (item?.points || 0);
    }, 0));
    const bagSpent = computed(() => selections.bag.reduce((sum, id) => {
        const item = C.bagItems.find(i => i.id === id);
        return sum + (item?.points || 0);
    }, 0));

    const talentRemaining = computed(() => basePoints.talent - talentSpent.value);
    const inventoryRemaining = computed(() => basePoints.inventory - inventorySpent.value);
    const bagRemaining = computed(() => basePoints.bag - bagSpent.value);

    const extraPoints = computed(() => {
        const farmland = C.farmlands.find(o => o.id === selections.farmland)?.extraPoints ?? 0;
        const water = C.waterSources.find(o => o.id === selections.water)?.extraPoints ?? 0;
        const creature = C.creatures.find(o => o.id === selections.creature)?.extraPoints ?? 0;
        const seabed = C.seabeds.find(o => o.id === selections.seabed)?.extraPoints ?? 0;
        const storm = C.storms.find(o => o.id === selections.storm)?.extraPoints ?? 0;
        const islands = C.islands.find(o => o.id === selections.islands)?.extraPoints ?? 0;
        return farmland + water + creature + seabed + storm + islands;
    });

    const systemPointsCost = computed(() => {
        const system = C.systems.find(s => s.id === selections.system);
        return system?.points ?? 0;
    });

    const totalOverdraft = computed(() => {
        return Math.max(0, -talentRemaining.value) +
               Math.max(0, -inventoryRemaining.value) +
               Math.max(0, -bagRemaining.value);
    });

    const finalExtraRemaining = computed(() => extraPoints.value - totalOverdraft.value - systemPointsCost.value);

    const isConfirmDisabled = computed(() => finalExtraRemaining.value < 0);

    // --- ACTIONS ---
    function saveCurrentSelection() {
        const selectionState = {
            characterName: characterName.value,
            customCharacterData: customCharacterData,
            selections: selections,
            talents: talents,
        };
        localStorage.setItem('xuanhuan_setup_selection_vue', JSON.stringify(selectionState));
        logger('log', 'setupStore', 'Current selection saved to localStorage.', selectionState);
    }

    async function initializeWorldview(): Promise<IWorldviewDefinition> {
        logger('info', 'setupStore', 'Initializing worldview...');
        let vars;
        try {
            vars = getVariables({ type: 'chat' });
        } catch (error: any) {
            if (error.name === 'DataCloneError') {
                logger('warn', 'setupStore', 'Failed to get variables due to a DataCloneError. This might happen during branch switching. Using default worldview.', error);
                vars = {}; // Proceed with empty vars
            } else {
                throw error;
            }
        }
        let worldview = _.get(vars, '世界.世界观.固定世界信息');

        if (!worldview || _.isEmpty(worldview)) {
            logger('info', 'setupStore', 'No worldview found in variables, assigning default.');
            worldview = _.cloneDeep(DEFAULT_WORLDVIEW);
            await assignVariables({ '世界.世界观.固定世界信息': worldview });
            toastr.info('未发现自定义世界观，已自动应用默认设定。');
        } else {
            logger('info', 'setupStore', 'Found existing worldview in variables.', worldview);
        }
        return worldview;
    }

    async function generateInitialState() {
        if (isConfirmDisabled.value) {
            logger('warn', 'setupStore', 'Attempted to generate initial state while confirm is disabled.');
            return null;
        }

        // 1. 确保世界观已初始化并获取
        const worldview = await initializeWorldview();

        // 2. 基于玩家选择和世界观生成世界细节
        const playerSetup = generatePlayerSetupForPrompt();
        const worldData = await generateInitialWorld(playerSetup, worldview);

        const selectedMindset = staticData.mindsets.find(i => i.id === selections.mindset);
        const selectedTrait = staticData.optionalTraits.find(i => i.id === selections.trait);
        const selectedInventory = staticData.inventoryItems.filter(i => selections.inventory.includes(i.id));
        const selectedBag = staticData.bagItems.filter(i => selections.bag.includes(i.id));
        const selectedSeason = staticData.seasons.find(i => i.id === selections.season);
        const selectedSystem = staticData.systems.find(i => i.id === selections.system);
        const selectedLocation = staticData.initialLocations.find(i => i.id === selections.initialLocation);

        const environmentIds = [
            selections.farmland,
            selections.water,
            selections.creature,
            selections.seabed,
            selections.storm,
            selections.islands,
        ].filter(Boolean);

        const finalTalents = {
            '根骨': talents['talent-gen-gu'],
            '悟性': talents['talent-wu-xing'],
            '气运': talents['talent-qi-yun'],
        };

        let startMonth = 1;
        if (selectedSeason?.id === 'season-summer') startMonth = 4;
        if (selectedSeason?.id === 'season-autumn') startMonth = 7;
        if (selectedSeason?.id === 'season-winter') startMonth = 10;
        
        const randomMonthOffset = Math.floor(Math.random() * 3);
        const startMonthFinal = startMonth + randomMonthOffset;
        const startDay = Math.floor(Math.random() * 30) + 1;
        const startDate = { "年": 1, "月": startMonthFinal, "日": startDay };

        const seasonName = selectedSeason?.name || '春';
        const timeOfDay = '清晨';

        let initialSolarTerm = '立春';
        if (selectedSeason?.id === 'season-summer') initialSolarTerm = '立夏';
        if (selectedSeason?.id === 'season-autumn') initialSolarTerm = '立秋';
        if (selectedSeason?.id === 'season-winter') initialSolarTerm = '立冬';

        const worldState: any = {
            "天气": {
                "当前天气": "晴朗",
                "天气描述": "万里无云，是个好天气。",
                "季节": seasonName,
                "节气": initialSolarTerm,
                "特殊天象": null,
                "效果": [],
                "天气影响": []
            },
            "时间": {
                day: 1,
                timeOfDay: timeOfDay,
                season: seasonName,
                solarTerm: initialSolarTerm,
                weather: '晴朗',
            },
            "开局日期": startDate,
            "当前日期": startDate,
            "地点": `洄潮屿 · ${selectedLocation?.name || '海滩'}`,
            "庇护所": { "名称": "未命名", "规模": "无", "状态": "尚未建立", "舒适度": "无", "防御力": "无", "功能": [], "组件": { "围墙": { "规模": "未布置", "材料": "无", "耐久度": "0%", "防御加成": "无", "状态": "未建造" }, "屋顶": { "规模": "未布置", "材料": "无", "耐久度": "0%", "防雨加成": "无", "状态": "未建造" }, "农田": { "id": "farm_001", "规模": "未开垦", "状态": "未建造", "作物": null, "产出效率": "无" }, "药园": { "id": "herb_001", "规模": "未开垦", "状态": "未建造", "药材": null, "产出效率": "无" }, "防御阵法": { "规模": "未布置", "状态": "未激活", "灵力消耗": "无", "防御加成": "无" } }, "事件日志": [] },
            "图鉴": { "妖兽": [], "植物": [], "物品": [] },
            "事件列表": [],
            "当前激活系统": { "名称": selectedSystem?.name || '无系统' },
            "初始设定": { "岛屿环境": environmentIds, "凡人特长": selectedTrait ? [selectedTrait.id] : [], "修仙遗物": selectedInventory.map(item => item.id), "现代背包": selectedBag.map(item => item.id), "初始季节": selectedSeason?.id, "心之所向": selectedMindset?.id, "系统": selectedSystem?.id, "初始地点": selectedLocation?.id },
            "奇遇": { "冷却至天数": 15, "上次奇遇天数": 0, "历史奇遇记录": [] },
            "地图": worldData?.initial_map || {},
            "世界观": {
                "固定世界信息": worldview,
                "动态生成细节": worldData?.worldview_details || {},
            },
        };

        switch (selectedSystem?.id) {
            case 'system-achievement': worldState['成就'] = { "成就点数": 0, "已完成": {} }; break;
            case 'system-skill-panel': worldState['技能'] = { "列表": [] }; break;
            case 'system-sign-in': worldState['签到'] = { "签到记录": {}, "连续签到": 0 }; break;
        }

        const characterState = {
            "主控角色名": characterName.value,
            [characterName.value]: {
                "姓名": characterName.value,
                "性别": customCharacterData.gender,
                "年龄": customCharacterData.age,
                "种族": "人族",
                "籍贯": "地球（华夏）",
                "外貌特征": customCharacterData.appearance,
                "身份背景": { "前世": customCharacterData.backgroundEarth, "现世": customCharacterData.backgroundWorld },
                "性格特点": { "核心": customCharacterData.personality, "习惯": customCharacterData.habits },
                "特质": [ selectedMindset?.name, C.defaultTrait.name, selectedTrait?.name ].filter(Boolean),
                "状态": { 
                    "口渴度": { "value": 80, "max": 100 }, 
                    "饱腹度": { "value": 90, "max": 100 }, 
                    "体力": { "value": 100, "max": 100 }, 
                    [worldview.powerSystem.name]: { "value": 0, "max": 0 } 
                },
                "天赋": finalTalents,
                "物品": [
                    ...C.defaultBagItems.map(item => ({ '名称': item.name, '描述': item.description, '价值': item.价值 })),
                    ...selectedInventory.map(item => ({ '名称': item.name, '描述': item.description, '价值': item.价值 })),
                    ...selectedBag.map(item => ({ '名称': item.name, '描述': item.description, '价值': item.价值 })),
                ],
                "关系": []
            }
        };

        const coreState = { "角色": characterState, "世界": worldState };
        const snapshot = JSON.parse(JSON.stringify(coreState)); // Deep clone
        worldState['初始状态'] = snapshot;

        const finalState = {
            "角色": characterState,
            "世界": worldState,
            "备份": { "初始状态备份": snapshot }
        };

        // (v4.2.4) 修复：在初始化完成后重置生成状态
        const generationStore = useGenerationStore();
        generationStore.reset();

        logger('info', 'setupStore', 'Generated final state and reset generation store:', finalState);
        return finalState;
    }

    function generatePlayerSetupForPrompt() {
        const findDetails = (collection: (IChoiceOption | IPointOption | ISeason | ITrait | ISystem)[], id: string) => {
            const item = collection.find(item => item.id === id);
            return item ? `${item.name} (${item.description})` : '未知';
        };

        return {
            "环境": {
                "灵田": findDetails(staticData.farmlands, selections.farmland),
                "水源": findDetails(staticData.waterSources, selections.water),
                "生物": findDetails(staticData.creatures, selections.creature),
                "海底": findDetails(staticData.seabeds, selections.seabed),
                "风暴": findDetails(staticData.storms, selections.storm),
                "岛屿": findDetails(staticData.islands, selections.islands),
            },
            "心态": findDetails(staticData.mindsets, selections.mindset),
            "凡人特长": findDetails(staticData.optionalTraits, selections.trait),
            "初始位置": findDetails(staticData.initialLocations, selections.initialLocation),
        };
    }

    function loadPreviousSelection() {
        const saved = localStorage.getItem('xuanhuan_setup_selection_vue');
        if (!saved) {
            logger('info', 'setupStore', 'No previous Vue selection found.');
            // Try to load from old jQuery key for seamless migration
            const oldSaved = localStorage.getItem('xuanhuan_setup_selection');
            if(oldSaved) {
                logger('info', 'setupStore', 'Found old jQuery selection, attempting to migrate.');
                const oldSelection = safeJsonParse(oldSaved, {} as any);
                
                characterName.value = oldSelection.characterName || '萧栖雪';
                
                // Map old selection IDs to new state structure
                selections.initialLocation = oldSelection.initialLocation || C.initialLocations[0].id;
                selections.season = oldSelection.season || C.seasons[0].id;
                selections.farmland = oldSelection.farmland || C.farmlands[0].id;
                selections.water = oldSelection.water || C.waterSources[0].id;
                selections.creature = oldSelection.creature || C.creatures[0].id;
                selections.seabed = oldSelection.seabed || C.seabeds[0].id;
                selections.storm = oldSelection.storm || C.storms[0].id;
                selections.islands = oldSelection.islands || C.islands[0].id;
                selections.mindset = oldSelection.mindset || C.mindsets[0].id;
                selections.trait = oldSelection.trait || C.optionalTraits.find(t => t.id === 'trait-none')?.id;
                selections.system = oldSelection.system || C.systems[0].id;
                
                selections.inventory = Array.isArray(oldSelection['inventory-item-checkbox']) ? oldSelection['inventory-item-checkbox'] : [];
                selections.bag = Array.isArray(oldSelection['bag-item-checkbox']) ? oldSelection['bag-item-checkbox'] : [];

                if (oldSelection.talents) {
                    talents['talent-gen-gu'] = oldSelection.talents['talent-gen-gu'] || 0;
                    talents['talent-wu-xing'] = oldSelection.talents['talent-wu-xing'] || 0;
                    talents['talent-qi-yun'] = oldSelection.talents['talent-qi-yun'] || 0;
                }
                logger('info', 'setupStore', 'Successfully migrated old selection.');
            }
            return;
        }

        const state = safeJsonParse<Partial<ISetupState>>(saved, {});
        if (state.characterName) characterName.value = state.characterName;
        if (state.customCharacterData) Object.assign(customCharacterData, state.customCharacterData);
        if (state.selections) Object.assign(selections, state.selections);
        if (state.talents) Object.assign(talents, state.talents);

        logger('info', 'setupStore', 'Successfully loaded previous selection.', state);
    }

    return {
        // State
        isVisible,
        // Static Data
        staticData,
        // State
        characterName,
        customCharacterData,
        selections,
        talents,
        // Computed
        talentRemaining,
        inventoryRemaining,
        bagRemaining,
        finalExtraRemaining,
        isConfirmDisabled,
        // Actions
        showSetup,
        hideSetup,
        saveCurrentSelection,
        loadPreviousSelection,
        generateInitialState,
        generatePlayerSetupForPrompt,
        initializeWorldview,
    };
});
