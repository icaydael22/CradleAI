import { createPinia } from 'pinia';
import { PiniaLogger } from 'pinia-logger';
import { vi } from 'vitest';
import { computed, reactive, ref } from 'vue';

// Create a logged pinia instance for debugging
const pinia = createPinia().use(
  PiniaLogger({
    expanded: true,
    showDuration: true,
  }),
);

// --- 辅助函数：中文数字转阿拉伯数字 ---
const chineseToArabic = (text: string): number => {
    const charMap: { [key: string]: number } = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    };
    const unitMap: { [key: string]: number } = {
        '十': 10, '百': 100, '千': 1000, '万': 10000,
    };

    if (!isNaN(Number(text))) {
        return Number(text);
    }

    let total = 0;
    let currentNum = 0;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char in charMap) {
            currentNum = charMap[char];
        } else if (char in unitMap) {
            if (char === '十' && currentNum === 0) {
                currentNum = 1;
            }
            total += currentNum * unitMap[char];
            currentNum = 0;
        }
    }
    total += currentNum;
    return total;
};


// 0. 定义一个简单的类型
interface Item {
  名称: string;
  数量: number;
}

interface BarterOfferItem {
  name: string;
  quantity: number;
}

interface Quest {
  id: string;
  名称: string;
  描述: string;
  状态: '进行中' | '已完成' | '失败' | '未完成';
  [key: string]: any; // Allow other properties
}

interface QuestState {
  [questId: string]: Quest;
}

interface Region {
  id: string;
  名称: string;
  描述: string;
}

interface MapState {
  regions: { [regionId: string]: Region };
  connections: any[];
  currentPlayerLocation: string;
}

interface Rumor {
  content: string;
  status: string;
  [key: string]: any;
}

interface PokedexEntry {
    名称: string;
    [key: string]: any;
}

interface AdventureHook {
    [key: string]: any;
}

interface Worldview {
  rumors: Rumor[];
  pokedex_entries: PokedexEntry[];
  adventure_hooks: AdventureHook[];
}

// 1. 创建一个共享的、响应式的状态
const mockWorldState = reactive({
  time: { day: 1, timeOfDay: '清晨' },
  当前日期: { 年: 1, 月: 1, 日: 1 },
  地点: '初始地点',
  天气: { 当前天气: '晴朗' },
  世界观: { rumors: [], pokedex_entries: [], adventure_hooks: [] } as Worldview,
  成就: {
    成就点数: 0,
    completed: {},
    奖励列表: [] as any[],
    上次刷新天数: 0,
  },
  庇护所: {
    名称: "测试庇护所",
    组件: {},
  },
  角色: {
    '萧栖雪': {
      姓名: '萧栖雪',
      物品: [] as Item[],
      灵力: 100,
      体力: 100,
      技能: [] as any[],
    }
  },
  任务列表: [] as Quest[], // Quest state as an array
  签到: { // SignIn state
    今日已签到: false,
    连续签到天数: 0,
    签到记录: {} as Record<string, number[]>,
    月卡: {
      状态: '未激活',
      activatedDate: null,
    },
  },
  技能: [], // Skill state
  图鉴: {}, // Pokedex state
  地图: { regions: {}, connections: [], currentPlayerLocation: '' } as MapState, // Map state
  奇遇: { 冷却至天数: 0, 上次奇遇天数: 0 }, // Adventure state
  以物换物: { // Barter state
    名称: '默认商人',
    上次刷新天数: 0,
    可换取的物品: [],
  },
});

// 2. 创建一个共享的事件处理器注册表
const eventHandlers = new Map<string, (event: any, worldState: any) => void>();

// 3. 创建各个 Store 的 Mock 实现
const mockWorldStore = {
  // --- State ---
  world: ref(mockWorldState), // Use ref to mimic real store's reactivity
  isInitialized: ref(false),

  // --- Getters ---
  weather: computed(() => mockWorldState.天气),
  shelter: computed(() => mockWorldState.庇护所),
  time: computed(() => mockWorldState.time),
  location: computed(() => mockWorldState.地点),
  allRumors: computed(() => mockWorldState.世界观?.rumors || []),
  character: computed(() => mockWorldState.角色 || {}),

  // --- Actions (mocked) ---
  initialize: vi.fn(async () => {
    // 在 mock 初始化时注册核心事件处理器
    mockWorldStore.registerEventHandler('上下文更新', (event: any, worldState: any) => {
      const oldDay = worldState.time.day;
      if (event.payload.时间) {
        worldState.time = { ...worldState.time, ...event.payload.时间 };
      }
      if (event.payload.地点) {
        worldState.地点 = event.payload.地点;
      }
      if (event.payload.当前日期) {
        worldState.当前日期 = { ...worldState.当前日期, ...event.payload.当前日期 };
      }

      // 模拟 signInStore 的日期变更监听逻辑
      const newDay = worldState.time.day;
      if (newDay > oldDay) {
        worldState.签到.今日已签到 = false;
        if (newDay > oldDay + 1) {
          worldState.签到.连续签到天数 = 0; // 中断
        }
      }
    });
    mockWorldStore.registerEventHandler('物品变化', (event: any, worldState: any) => {
      const char = worldState.角色['萧栖雪'];
      if (!char) return;
      if (!char.物品) char.物品 = [];

      if (event.payload.获得) {
        for (const itemToAdd of event.payload.获得) {
          const existingItem = char.物品.find((i: any) => i.名称 === itemToAdd.名称);
          if (existingItem) {
            existingItem.数量 = (existingItem.数量 || 1) + (itemToAdd.数量 || 1);
          } else {
            char.物品.push({ ...itemToAdd, 数量: itemToAdd.数量 || 1 });
          }
        }
      }
      if (event.payload.失去) {
        for (const itemToRemove of event.payload.失去) {
          const existingItem = char.物品.find((i: any) => i.名称 === itemToRemove.名称);
          if (existingItem) {
            existingItem.数量 = (existingItem.数量 || 1) - (itemToRemove.数量 || 1);
            if (existingItem.数量 <= 0) {
               // 使用 filter 替代 splice，这是更可靠的响应式数组更新方式
               char.物品 = char.物品.filter((i: any) => i.名称 !== itemToRemove.名称);
            }
          }
        }
      }
    });
    mockWorldStore.registerEventHandler('角色更新', (event: any, worldState: any) => {
     const char = worldState.角色['萧栖雪'];
     if (!char) return;
     const updates = event.payload;
     for (const key in updates) {
       if (Object.prototype.hasOwnProperty.call(char, key) && typeof char[key] === 'number') {
         char[key] += updates[key];
       } else {
         char[key] = updates[key];
       }
     }
    });
    mockWorldStore.registerEventHandler('交易完成', (event: any, worldState: any) => {
       const barterStore = useBarterStore();
       barterStore.resetSelections();
    });
    mockWorldStore.registerEventHandler('世界观条目状态更新', (event: any, worldState: any) => {
       const { 类型, 名称, 新状态 } = event.payload;
       if (!worldState.世界观) return;

       if (类型 === '传闻' && worldState.世界观.rumors) {
         const rumor = worldState.世界观.rumors.find((r: any) => r.content === 名称);
         if (rumor) rumor.status = 新状态;
       } else if (类型 === '图鉴条目' && worldState.世界观.pokedex_entries) {
         const entry = worldState.世界观.pokedex_entries.find((e: any) => e.名称 === 名称);
         if (entry) entry.status = 新状态;
       }
    });
    mockWorldStore.registerEventHandler('可换取物品更新', (event: any, worldState: any) => {
       if (!worldState.以物换物) worldState.以物换物 = { 可换取的物品: [] };
       worldState.以物换物.可换取的物品 = event.payload;
       if (worldState.time) {
        worldState.以物换物.上次刷新天数 = worldState.time.day;
       }
    });
    mockWorldStore.registerEventHandler('物品条目更新', (event: any, worldState: any) => {
       const char = worldState.角色['萧栖雪'];
       if (!char || !char.物品) return;
       const { originalName, updatedData } = event.payload;
       const item = char.物品.find((i: any) => i.名称 === originalName);
       if (item) {
         Object.assign(item, updatedData);
       }
    });
    mockWorldStore.registerEventHandler('路径更新', (event: any, worldState: any) => {
       if (!worldState.地图) return;
       const { connection, new_region } = event.payload;
       if (new_region && new_region.id) {
         worldState.地图.regions[new_region.id] = new_region;
       }
       if (connection && connection.from_region && connection.direction) {
         const existingIndex = worldState.地图.connections.findIndex(
           (c: any) => c.from_region === connection.from_region && c.direction === connection.direction
         );
         if (existingIndex > -1) {
           worldState.地图.connections[existingIndex] = { ...worldState.地图.connections[existingIndex], ...connection };
         } else {
           worldState.地图.connections.push(connection);
         }
       }
    });
    mockWorldStore.registerEventHandler('关系变化', (event: any, worldState: any) => {
       const { 角色, 目标, 变化值 } = event.payload;
       if (!worldState.角色[角色]) worldState.角色[角色] = { 关系: {} };
       if (!worldState.角色[角色].关系) worldState.角色[角色].关系 = {};
       worldState.角色[角色].关系[目标] = (worldState.角色[角色].关系[目标] || 0) + 变化值;
    });
  }),
  startEventProcessing: vi.fn(() => {
    mockWorldStore.isInitialized.value = true;
  }),
  persistWorldState: vi.fn().mockResolvedValue(undefined),
  updateWorldState: vi.fn().mockResolvedValue(undefined),
  updateWorldview: vi.fn(),
  updateWorldviewEntryStatus: vi.fn(),
  
  // --- Event Handling ---
  registerEventHandler: vi.fn((eventType: string, handler: (event: any, worldState: any) => void) => {
    eventHandlers.set(eventType, handler);
  }),
  processEvent: vi.fn((event: any) => {
    const handler = eventHandlers.get(event.type);
    if (handler) {
      handler(event, mockWorldState);
    }
  }),
  redispatchEvent: vi.fn((event: any) => {
    // Correct mock: Don't process directly. Let the main loop handle it.
    // This is a simplified mock; a more robust one might push to a queue.
    const handler = eventHandlers.get(event.type);
    if (handler) {
      // In the context of _dangerouslyProcessEvents, we need to mutate the SAME state object.
      // We rely on the fact that `processingState` is a deep copy and this redispatch
      // happens synchronously within the main event loop of `_dangerouslyProcessEvents`.
      // This is a key detail of the mock's design.
      //console.log(`[MOCK LOG] Redispatching event:`, event);
      // The handler will be called with the `processingState` from the main loop,
      // which is what we want. We just need to find and call it.
      handler(event, mockWorldState); // This will be incorrect if called outside the main loop.
                                      // The fix is in the main loop itself.
    }
  }),

  // --- Dangerous Methods ---
  _dangerouslySetState: vi.fn((newState: any) => {
    Object.assign(mockWorldState, newState);
  }),
  _dangerouslyProcessEvents: vi.fn((events: any[]) => {
    //console.log("[DEBUG] Mock _dangerouslyProcessEvents called with:", events);
    
    // CRITICAL FIX: Re-initialize all event handlers to populate the eventHandlers map.
    eventHandlers.clear();
    useWorldStore().initialize(); // This will register core handlers like '上下文更新' and '物品变化'
    useAchievementStore().initializeEventHandlers();
    useQuestStore().initializeEventHandlers();
    useBarterStore().initializeEventHandlers();
    useSignInStore().initializeEventHandlers();
    useSkillStore().initializeEventHandlers();
    usePokedexStore().initializeEventHandlers();
    useMapStore().initializeEventHandlers();
    useAdventureStore().initializeEventHandlers();
    useShelterStore().initializeEventHandlers();
    useWeatherStore().initializeEventHandlers();

     // Deep copy the state to avoid reactivity issues during processing.
     const processingState = JSON.parse(JSON.stringify(mockWorldState));

    const eventQueue = [...events];
    let currentEvent = eventQueue.shift();

    while (currentEvent) {
      const handler = eventHandlers.get(currentEvent.type);
      if (currentEvent.type === 'custom' && typeof currentEvent.payload === 'function') {
        // Handle custom event type for direct state manipulation in tests
        currentEvent.payload(processingState);
      } else if (handler) {
        // Special handling for redispatching within adventure events
        if (currentEvent.type === '奇遇' && currentEvent.payload?.事件) {
          const innerEvent = currentEvent.payload.事件;
          // Add the inner event to the front of the queue to be processed next
          eventQueue.unshift(innerEvent);
        }
        handler(currentEvent, processingState); // Mutate the copy
      } else {
        console.log(`[DEBUG] No mock handler found for event type: ${currentEvent.type}`);
      }
      currentEvent = eventQueue.shift();
    }

    // After processing, apply the changes back to the original reactive state.
    Object.assign(mockWorldState, processingState);

    //console.log("[DEBUG] Mock _dangerouslyProcessEvents finished. Final world state:", JSON.stringify(mockWorldState, null, 2));
    return processingState; // Explicitly return the final state for the test environment.
  }),
  
  // --- Child Store Passthrough (simplified) ---
  recentlyDamagedComponent: computed(() => null),
  clearRecentlyDamagedComponent: vi.fn(),
};

const mockAchievementStore = {
  points: computed(() => mockWorldState.成就.成就点数),
  completedAchievements: computed(() => Object.values(mockWorldState.成就.completed)),
  rewards: computed(() => mockWorldState.成就.奖励列表),
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('新成就', (event, worldState) => {
      //console.log('--- [MOCK LOG] Handling "新成就" event ---');
      //console.log('Event Payload:', JSON.stringify(event.payload, null, 2));
      //console.log('State BEFORE:', JSON.stringify(worldState.成就, null, 2));
      const { id, 点数 } = event.payload;
      if (id && !worldState.成就.completed[id]) {
          worldState.成就.completed[id] = { ...event.payload, 完成时间: 'test time' };
          worldState.成就.成就点数 += (点数 || 0);
      }
      //console.log('State AFTER:', JSON.stringify(worldState.成就, null, 2));
      //console.log('------------------------------------------');
    });
    mockWorldStore.registerEventHandler('成就奖励更新', (event, worldState) => {
      if (!worldState.成就) worldState.成就 = { 成就点数: 0, completed: {}, 奖励列表: [], 上次刷新天数: 0 };
      if (Array.isArray(event.payload)) {
        worldState.成就.奖励列表 = event.payload;
        worldState.成就.上次刷新天数 = worldState.time.day;
      }
    });
    mockWorldStore.registerEventHandler('成就奖励兑换', (event, worldState) => {
      if (!worldState.成就 || !worldState.成就.奖励列表) return;
      const { id, '消耗点数': cost = 0 } = event.payload;
      const reward = worldState.成就.奖励列表.find((r: any) => r.id === id);
      if (reward && reward.库存 > 0 && worldState.成就.成就点数 >= cost) {
        worldState.成就.成就点数 -= cost;
        reward.库存 -= 1;
      }
    });
  }),
};

const mockCharacterStore = {
  mainCharacter: computed(() => mockWorldState.角色['萧栖雪']),
  mainCharacterId: '萧栖雪',
  characters: computed(() => mockWorldState.角色),
  $patch: vi.fn((patchObject) => {
    Object.assign(mockWorldState.角色, patchObject.characters);
  }),
};

type MockGenerationStore = {
  isNewTurn: boolean;
  isAiGenerating: boolean;
  currentTurnSwipes: string[];
  isSecondaryLlmRequestActive: boolean;
  updateLastSwipe: (swipeContent: string) => void;
  addSwipe: (swipeContent: string) => void; // Add the new method to the type
  _setTestState: (state: Partial<MockGenerationStore>) => void;
};

const mockGenerationStore: MockGenerationStore = reactive({
  isNewTurn: false,
  isAiGenerating: false,
  currentTurnSwipes: [],
  isSecondaryLlmRequestActive: false,
  updateLastSwipe: vi.fn(function(this: MockGenerationStore, swipeContent: string) {
    if (this.currentTurnSwipes.length > 0) {
      this.currentTurnSwipes[this.currentTurnSwipes.length - 1] = swipeContent;
    }
  }),
  addSwipe: vi.fn(function(this: MockGenerationStore, swipeContent: string) {
    this.currentTurnSwipes.push(swipeContent);
  }),
  // New test-only method to set state reliably
  _setTestState: vi.fn(function(this: MockGenerationStore, state: Partial<MockGenerationStore>) {
    //console.log(`[DEBUG] Setting mockGenerationStore state:`, state);
    if (state.isNewTurn !== undefined) this.isNewTurn = state.isNewTurn;
    if (state.isAiGenerating !== undefined) this.isAiGenerating = state.isAiGenerating;
    if (state.currentTurnSwipes !== undefined) this.currentTurnSwipes = state.currentTurnSwipes;
  })
});

const mockBarterStore = reactive({
  // --- State ---
  mySelectedItems: {},
  traderSelectedItems: {},
  
  // --- Getters (computed properties that mimic the real store) ---
  systemName: computed(() => (mockWorldState as any).以物换物?.名称 || '以物换物'),
  myItems: computed(() => mockWorldState.角色?.['萧栖雪']?.物品 ?? []),
  availableItems: computed(() => (mockWorldState as any).以物换物?.可换取的物品 || []),
  canRefresh: computed(() => {
      const currentDay = mockWorldState.time?.day || 0;
      const lastRefreshDay = (mockWorldState as any).以物换物?.上次刷新天数 || 0;
      return currentDay > lastRefreshDay;
  }),
  // Note: Value calculations are simplified for the mock. The component test covers the real logic.
  myOfferValue: computed(() => 0),
  traderRequestValue: computed(() => 0),
  isTradeBalanced: computed(() => false),

  // --- Actions ---
  playerOfferedItems: [] as BarterOfferItem[], // Kept for legacy tests if any
  npcOfferedItems: [] as BarterOfferItem[], // Kept for legacy tests if any
  resetSelections: vi.fn(function(this: any) {
    this.mySelectedItems = {};
    this.traderSelectedItems = {};
    this.playerOfferedItems = [];
    this.npcOfferedItems = [];
  }),
  initializeEventHandlers: vi.fn(() => {
    // Event handlers are now managed by the central worldStore mock
  }),
  // Mock other actions used by the component
  toggleMyItemSelection: vi.fn(),
  toggleTraderItemSelection: vi.fn(),
  executeTrade: vi.fn(),
  refreshItems: vi.fn(),
  getItemValue: vi.fn((item: any) => item?.价值?.基础价值 || item?.价值 || 0),
});

const mockQuestStore = {
  quests: computed(() => mockWorldState.任务列表),
  ongoingQuests: computed(() => mockWorldState.任务列表.filter(q => q.状态 === '进行中')),
  completedQuests: computed(() => mockWorldState.任务列表.filter(q => q.状态 === '已完成')),
  notCompletedQuests: computed(() => mockWorldState.任务列表.filter(q => q.状态 === '未完成')),
  failedQuests: computed(() => mockWorldState.任务列表.filter(q => q.状态 === '失败')),

  // Mock actions as needed
  initializeEventHandlers: vi.fn(() => {
    const ensureQuestListExists = (worldState: any) => {
        if (!worldState.任务列表) {
            worldState.任务列表 = [];
        }
    };

    const newQuestHandler = (event: any, worldState: any) => {
      ensureQuestListExists(worldState);
      const quest = event.payload;
      if (quest.id && !worldState.任务列表.some((q: Quest) => q.id === quest.id)) {
        worldState.任务列表.push({ ...quest, 状态: '进行中' });
      }
    };
    mockWorldStore.registerEventHandler('新任务接收', newQuestHandler);
    mockWorldStore.registerEventHandler('任务接收', newQuestHandler); // Alias

    mockWorldStore.registerEventHandler('任务进度更新', (event, worldState) => {
      ensureQuestListExists(worldState);
      const { id, ...progress } = event.payload;
      const quest = worldState.任务列表.find((q: Quest) => q.id === id);
      if (quest) {
        Object.assign(quest, progress);
      }
    });

    mockWorldStore.registerEventHandler('任务完成', (event, worldState) => {
      ensureQuestListExists(worldState);
      const { id } = event.payload;
      const quest = worldState.任务列表.find((q: Quest) => q.id === id);
      if (quest) {
        quest.状态 = '已完成';
      }
    });

    mockWorldStore.registerEventHandler('任务失败', (event, worldState) => {
      ensureQuestListExists(worldState);
      const { id } = event.payload;
      const quest = worldState.任务列表.find((q: Quest) => q.id === id);
      if (quest) {
        quest.状态 = '失败';
      }
    });
  }),
};

const mockAdventureStore = {
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('奇遇', (event, worldState) => {
      const adventureState = worldState.奇遇;
      if (!adventureState) return;

      // 1. Cooldown Check (simplified for mock)
      if (worldState.time.day <= (adventureState.冷却至天数 ?? 0)) {
        //console.log('[MOCK LOG] Adventure on cooldown. Ignoring.');
        return;
      }

      // The main loop now handles redispatching, so we just process the cooldown.
      // 3. Update cooldown (simplified for mock)
      adventureState.上次奇遇天数 = worldState.time.day;
      adventureState.冷却至天数 = worldState.time.day + 30; // Fixed cooldown for predictability
    });
  }),
};

const mockSignInStore = {
  currentDate: computed(() => mockWorldState.当前日期),
  hasSignedInToday: computed(() => mockWorldState.签到.今日已签到),
  consecutiveDays: computed(() => mockWorldState.签到.连续签到天数),
  monthlyCard: computed(() => mockWorldState.签到.月卡),
  isMonthlyCardActive: computed(() => {
    const card = mockWorldState.签到.月卡;
    if (card.状态 !== '已激活' || !card.activatedDate) return false;
    const daysPassed = mockWorldState.time.day - card.activatedDate;
    return daysPassed >= 0 && daysPassed < 30;
  }),
  calendarData: computed(() => {
    const date = mockWorldState.当前日期 || { 年: 1, 月: 1, 日: 1 };
    const year = date.年;
    const month = date.月;
    const daysInMonth = 30; // 假设每月固定30天
    const recordKey = `Y${year}M${month}`;
    const signedInDays = mockWorldState.签到.签到记录[recordKey] || [];

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        day,
        isToday: day === date.日,
        isSignedIn: signedInDays.includes(day),
      };
    });

    return { year, month, days };
  }),
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('签到', (event, worldState) => {
      const date = worldState.当前日期;
      if (!date) return;

      // 区分是今日签到还是补签
      if (event.payload.date) { // 补签逻辑
        const match = event.payload.date.match(/第一年([一二三四五六七八九十百千万\d]+)月([一二三四五六七八九十百千万\d]+)日/);
        if (match) {
          const month = chineseToArabic(match[1]);
          const day = chineseToArabic(match[2]);
          const recordKey = `Y${date.年}M${month}`;

          if (!worldState.签到.签到记录[recordKey]) {
            worldState.签到.签到记录[recordKey] = [];
          }
          if (!worldState.签到.签到记录[recordKey].includes(day)) {
            worldState.签到.签到记录[recordKey].push(day);
          }

          // 重新计算连续天数
          const allSignedDays = (worldState.签到.签到记录[recordKey] || []).slice();
          allSignedDays.sort((a: number, b: number) => a - b);

          let consecutiveCount = 0;
          if (allSignedDays.length > 0) {
            consecutiveCount = 1;
            for (let i = allSignedDays.length - 1; i > 0; i--) {
              if (allSignedDays[i] - 1 === allSignedDays[i - 1]) {
                consecutiveCount++;
              } else {
                break;
              }
            }
          }
          worldState.签到.连续签到天数 = consecutiveCount;
        }
      } else { // 今日签到逻辑
        if (worldState.签到.今日已签到) return;

        worldState.签到.今日已签到 = true;
        worldState.签到.连续签到天数 += 1;
        const recordKey = `Y${date.年}M${date.月}`;
        if (!worldState.签到.签到记录[recordKey]) {
          worldState.签到.签到记录[recordKey] = [];
        }
        if (!worldState.签到.签到记录[recordKey].includes(date.日)) {
          worldState.签到.签到记录[recordKey].push(date.日);
        }
      }
    });
    mockWorldStore.registerEventHandler('月卡激活', (event, worldState) => {
      worldState.签到.月卡 = {
        状态: '已激活',
        activatedDate: worldState.time.day,
      };
    });
  }),
};

const skillsComputed = computed(() => {
  const raw = mockWorldState.角色?.['萧栖雪']?.技能;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
});

const mockSkillStore = {
  // --- Getters ---
  skills: skillsComputed,
  hasSkills: computed(() => (skillsComputed.value?.length ?? 0) > 0),
  gongfaSkills: computed(() => skillsComputed.value.filter((s: any) => s.类别 === '功法')),
  shengHuoSkills: computed(() => skillsComputed.value.filter((s: any) => s.类别 === '生活')),

  // --- Actions ---
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('技能更新', (event, worldState) => {
      const { id, ...updatePayload } = event.payload;
      const mainCharName = '萧栖雪'; // Mocked main character name

      if (!id) return;
      
      if (!Array.isArray(worldState.角色[mainCharName].技能)) {
        worldState.角色[mainCharName].技能 = [];
      }
      const characterSkills = worldState.角色[mainCharName].技能 as any[];

      const existingSkill = characterSkills.find(s => s.id === id);
      //console.log("existingSkill:",existingSkill)
      if (existingSkill) {
        // Update existing skill
        if (updatePayload.熟练度) {
          existingSkill.熟练度 += updatePayload.熟练度;
        }
        const { 熟练度, ...restOfPayload } = updatePayload;
        Object.assign(existingSkill, restOfPayload);

        // Handle level up
        while (existingSkill.熟练度 >= 100) {
          existingSkill.等级 = (existingSkill.等级 || 1) + 1;
          existingSkill.熟练度 -= 100;
        }
      } else {
        // Add new skill
        const newSkill = {
          id,
          名称: '未知技能',
          类别: '生活',
          熟练度: 0,
          等级: 1,
          ...updatePayload,
        };
        
        // Handle potential level up on creation
        while (newSkill.熟练度 >= 100) {
          newSkill.等级 += 1;
          newSkill.熟练度 -= 100;
        }
        characterSkills.push(newSkill);
      }
      // Sync back to the root skill state
      worldState.技能 = [...characterSkills];
    });
  }),
};

const mockPokedexStore = reactive({
  entries: computed(() => mockWorldState.图鉴),
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('新图鉴发现', (event, worldState) => {
      const { 类型, 数据 } = event.payload;
      if (!worldState.图鉴[类型]) {
        worldState.图鉴[类型] = [];
      }
      const entries = Array.isArray(数据) ? 数据 : [数据];
      for (const entry of entries) {
        if (!worldState.图鉴[类型].find((e: any) => e.名称 === entry.名称)) {
          worldState.图鉴[类型].push(entry);
        }
      }
    });
  }),
});

import type { GameEvent } from '../../core/variables';

const mockEventLogStore = {
  events: ref<GameEvent[]>([]),
  addEvents: vi.fn(async (newEvents: GameEvent[]) => {
    // In the mock, we can just accept the events without complex logic.
    //console.log("[DEBUG]adding events:",newEvents)
    mockEventLogStore.events.value.push(...newEvents);
  }),
  // Add mock implementations for other methods used by the real store if needed
  fetchEvents: vi.fn().mockResolvedValue(undefined),
  setEvents: vi.fn().mockResolvedValue(undefined),
  markEventAsProcessed: vi.fn().mockResolvedValue(undefined),
};

const mockMapStore = {
  get regions() { return mockWorldState.地图.regions },
  get connections() { return mockWorldState.地图.connections },
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('新区域发现', (event, worldState) => {
      if (!worldState.地图) worldState.地图 = { regions: {}, connections: [], currentPlayerLocation: '' };
      const region = event.payload;
      if (region.id && !worldState.地图.regions[region.id]) {
        worldState.地图.regions[region.id] = region;
      }
    });
    mockWorldStore.registerEventHandler('地图已更新', (event, worldState) => {
       if (!worldState.地图) return;
       worldState.地图.currentPlayerLocation = event.payload.当前位置;
    });
  }),
};

const mockShelterStore = {
  get components() { return mockWorldState.庇护所.组件 },
  initializeEventHandlers: vi.fn(() => {
    const mapDurabilityToStatus = (durability: number): string => {
      if (durability >= 100) return '完好无损';
      if (durability >= 80) return '基本完好';
      if (durability >= 60) return '轻微受损';
      if (durability >= 30) return '严重受损';
      return '毁坏';
    };

    const shelterBuildOrUpgradeHandler = (event: any, worldState: any) => {
      if (!worldState.庇护所) return;
      const { 组件ID, 等级 } = event.payload;
      if (worldState.庇护所.组件[组件ID]) {
        worldState.庇护所.组件[组件ID].规模 = 等级;
        worldState.庇护所.组件[组件ID].状态 = '完好无损';
        worldState.庇护所.组件[组件ID].耐久度 = '100.00%';
      }
    };
    const shelterRepairHandler = (event: any, worldState: any) => {
      if (!worldState.庇护所 || !worldState.庇护所.组件) return;
      const { 组件ID, 数量 } = event.payload;
      if (worldState.庇护所.组件[组件ID]) {
        const oldDurability = parseFloat(worldState.庇护所.组件[组件ID].耐久度.replace('%','')) || 0;
        const newDurability = Math.min(100, oldDurability + 数量);
        worldState.庇护所.组件[组件ID].耐久度 = `${newDurability.toFixed(2)}%`;
        worldState.庇护所.组件[组件ID].状态 = mapDurabilityToStatus(newDurability);
      }
    };
    const shelterDamageHandler = (event: any, worldState: any) => {
        if (!worldState.庇护所 || !worldState.庇护所.组件) return;
        const { 组件ID, 数量 } = event.payload;
        if (worldState.庇护所.组件[组件ID]) {
            const oldDurability = parseFloat(worldState.庇护所.组件[组件ID].耐久度.replace('%','')) || 100;
            const newDurability = Math.max(0, oldDurability - 数量);
            worldState.庇护所.组件[组件ID].耐久度 = `${newDurability.toFixed(2)}%`;
            worldState.庇护所.组件[组件ID].状态 = mapDurabilityToStatus(newDurability);
        }
    };
    mockWorldStore.registerEventHandler('庇护所建造', shelterBuildOrUpgradeHandler);
    mockWorldStore.registerEventHandler('庇护所升级', shelterBuildOrUpgradeHandler);
    mockWorldStore.registerEventHandler('庇护所修复', shelterRepairHandler);
    mockWorldStore.registerEventHandler('庇护所受损', shelterDamageHandler);
  }),
};

const mockWeatherStore = {
  initializeEventHandlers: vi.fn(() => {
    mockWorldStore.registerEventHandler('施加天气影响', (event: any, worldState: any) => {
      if (!worldState.天气) worldState.天气 = { 当前天气: '晴朗' };
      // For mock purposes, let's just log it. A real implementation might be more complex.
      //console.log(`[MOCK LOG] Applying weather effect: ${JSON.stringify(event.payload)}`);
    });
    mockWorldStore.registerEventHandler('设置特殊天象', (event: any, worldState: any) => {
        if (!worldState.天气) worldState.天气 = { 当前天气: '晴朗' };
        const { 天象, 持续时间 } = event.payload;
        worldState.天气.当前天气 = 天象;
        // you could also store the duration if needed
    });
  }),
};

const mockStoryStore = reactive({
  currentNarrative: '',
  currentChoices: [],
  fetchData: vi.fn(),
});

const mockActionStore = reactive({
  owner: '',
  options: [] as string[],
});

// Manually register the reactive state with the pinia instance
pinia.state.value = {
  world: mockWorldState,
  achievement: mockWorldState.成就,
  character: mockWorldState.角色,
  generation: mockGenerationStore,
  barter: mockBarterStore,
  quest: mockQuestStore,
  signIn: mockSignInStore,
  skill: mockSkillStore,
  pokedex: mockPokedexStore,
  eventLog: mockEventLogStore,
  map: mockMapStore,
  shelter: mockWorldState.庇护所,
  weather: mockWorldState.天气,
  story: mockStoryStore,
  action: mockActionStore,
};

// 4. 导出 Mock 的 useStore 函数
export const useWorldStore = vi.fn(() => mockWorldStore);
export const useAchievementStore = vi.fn(() => mockAchievementStore);
export const useCharacterStore = vi.fn(() => mockCharacterStore);
export const useGenerationStore = vi.fn(() => mockGenerationStore);
export const useBarterStore = vi.fn(() => mockBarterStore);
export const useQuestStore = vi.fn(() => mockQuestStore);
export const useSignInStore = vi.fn(() => mockSignInStore);
export const useSkillStore = vi.fn(() => mockSkillStore);
export const usePokedexStore = vi.fn(() => mockPokedexStore);
export const useEventLogStore = vi.fn(() => mockEventLogStore);
export const useMapStore = vi.fn(() => mockMapStore);
export const useAdventureStore = vi.fn(() => mockAdventureStore);
export const useShelterStore = vi.fn(() => mockShelterStore);
export const useWeatherStore = vi.fn(() => mockWeatherStore);
export const useStoryStore = vi.fn(() => mockStoryStore);
export const useActionStore = vi.fn(() => mockActionStore);


// 5. 导出一个重置函数，在每个测试开始前调用
export const resetAllStores = () => {
  Object.assign(mockWorldState, {
    time: { day: 1, timeOfDay: '清晨' },
    当前日期: { 年: 1, 月: 1, 日: 1 },
    地点: '初始地点',
    weather: { 当前天气: '晴朗' },
    世界观: { rumors: [], pokedex_entries: [], adventure_hooks: [] },
    成就: {
      成就点数: 0,
      completed: {},
      奖励列表: [],
      上次刷新天数: 0,
    },
    庇护所: {
      名称: "测试庇护所",
      组件: {},
    },
    角色: {
      '萧栖雪': {
        姓名: '萧栖雪',
        物品: [] as Item[],
        灵力: 100,
        体力: 100,
      },
      技能: [],
    },
    任务列表: [],
    签到: {
      今日已签到: false,
      连续签到天数: 0,
      签到记录: {},
      月卡: {
        状态: '未激活',
        activatedDate: null,
      },
    },
    技能: [],
    图鉴: {},
    地图: { regions: {}, connections: [], currentPlayerLocation: '' },
    以物换物: {
      名称: '默认商人',
      上次刷新天数: 0,
      可换取的物品: [],
    },
  });
  eventHandlers.clear();
  mockWorldStore.initialize.mockClear();
  mockWorldStore.registerEventHandler.mockClear();
  mockWorldStore._dangerouslyProcessEvents.mockClear();
  mockAchievementStore.initializeEventHandlers.mockClear();
  mockBarterStore.initializeEventHandlers.mockClear();
  mockQuestStore.initializeEventHandlers.mockClear();
  mockSignInStore.initializeEventHandlers.mockClear();
  mockSkillStore.initializeEventHandlers.mockClear();
  // Clear new stores
  mockPokedexStore.initializeEventHandlers.mockClear();
  mockAdventureStore.initializeEventHandlers.mockClear();
  mockMapStore.initializeEventHandlers.mockClear();
  mockShelterStore.initializeEventHandlers.mockClear();
  mockWeatherStore.initializeEventHandlers.mockClear();
  mockGenerationStore.isNewTurn = false;
  mockGenerationStore.isAiGenerating = false;
  mockGenerationStore.currentTurnSwipes = [];
  mockBarterStore.playerOfferedItems = [];
  mockBarterStore.npcOfferedItems = [];
  if (mockBarterStore.resetSelections) {
   mockBarterStore.resetSelections.mockClear();
  }
  mockEventLogStore.events.value = [];
  mockEventLogStore.addEvents.mockClear();
  mockStoryStore.currentNarrative = '';
  mockStoryStore.currentChoices = [];
  mockActionStore.owner = '';
  mockActionStore.options = [];
};