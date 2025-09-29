/// <reference types="vitest/globals" />

import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { vi } from 'vitest';
import type { ChatHistoryManager } from '../../core/history';
import { logger } from '@/core/logger';

vi.mock('@/core/logger', () => ({
  logger: vi.fn(),
  refreshLoggerStatus: vi.fn(),
  clearLogs: vi.fn(),
  getLogsAsText: vi.fn().mockReturnValue(''),
  getLogs: vi.fn().mockReturnValue([]),
  safeJsonStringify: vi.fn((obj) => JSON.stringify(obj)), // Use a simple stringify for tests
}));

// Hoist all stubs
vi.hoisted(() => {
  vi.stubGlobal('formatAsTavernRegexedString', (text: string) => text);
  vi.stubGlobal('_', {
    last: (arr: any[]) => arr?.[arr.length - 1],
    findLast: (arr: any[], predicate: (value: any, index: number, obj: any[]) => unknown) => {
      if (!Array.isArray(arr)) return undefined;
      return [...arr].reverse().find(predicate);
    },
    cloneDeep: (obj: any) => {
      if (obj === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch (e) {
        return obj; // Fallback for non-JSON-safe objects
      }
    },
  });
  vi.stubGlobal('getTavernAISettings', () => ({}));
  vi.stubGlobal('getCurrentMessageId', () => 0);
  vi.stubGlobal('eventOn', () => {});
  vi.stubGlobal('marked', { parse: (text: string) => text }); // Mock the marked library
  vi.stubGlobal('toastr', {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  });
  vi.stubGlobal('iframe_events', {
    GENERATION_STARTED: 'generation-started',
    STREAM_TOKEN_RECEIVED_FULLY: 'stream-token-received-fully',
    GENERATION_ENDED: 'generation-ended',
  });
  vi.stubGlobal('tavern_events', {
    GENERATION_STOPPED: 'generation-stopped',
  });
});

// Mock all modules at the top level
vi.mock('../__mocks__/stores.ts');
vi.mock('../../core/history');
vi.mock('../../core/variables', async (importOriginal) => {
  const actual = await importOriginal() as object;
  // This mock prevents syncVariables from trying to interact with a real TavernAI environment.
  return {
    ...actual,
    saveStateSnapshot: vi.fn().mockResolvedValue(undefined),
    overwriteAllChatVariables: vi.fn().mockResolvedValue(undefined),
    getVariables: vi.fn().mockResolvedValue({}), // Return empty object to avoid errors
    // Keep other functions as their actual implementations unless they cause issues
  };
});
vi.mock('../../modules/smartContext/contextLinker', () => ({
  processTurn: vi.fn(),
}));

// --- Core Imports ---
import { PiniaLogger } from 'pinia-logger';
import { mockHistoryManagerInstance } from '../../core/__mocks__/history';
import { createGenerationLifecycleHandlers } from '../../index';
import { resetAllStores, useGenerationStore as useMockGenerationStore, useWorldStore as useMockWorldStore, useEventLogStore as useMockEventLogStore } from '../__mocks__/stores';

/**
 * Helper to create a mock LLM response string.
 */
export const createMockResponse = (events: any[], narrative = '这是一个模拟的叙事。') => {
  const statusBar = {
    "事件列表": events,
    "行动选项": {
      "🧝‍♀️ 行动人": "萧栖雪",
      "📜 可选行动": ["1. ...", "2. ..."]
    }
  };
  return `${narrative}<statusbar>${JSON.stringify(statusBar, null, 2)}</statusbar>`;
};

/**
 * Sets up a clean testing environment for integration tests.
 * - Resets all mocks and stores.
 * - Creates and activates a new Pinia instance.
 * - Configures the history manager mock.
 * - Creates and returns lifecycle handlers.
 * @returns An object containing the configured `handlers` and `pinia` instance.
 */
export function setupIntegrationTest(options: { worldStore?: any } = {}) {
  // 1. Reset all shared states and mocks
  resetAllStores();
  vi.clearAllMocks();

  // 2. Create and activate a real Pinia instance
  const pinia: Pinia = createPinia().use(
    PiniaLogger({
      expanded: true,
      showDuration: true,
    }),
  );
  setActivePinia(pinia);

  // 3. Configure history mock
  let messageCounter = 0;
  mockHistoryManagerInstance.addAssistantMessagePage.mockImplementation((content: string) => {
    messageCounter++;
    const messageId = `mock-message-id-turn-${messageCounter}`;
    // You can also store the content if needed for later assertions
    // mockHistoryManagerInstance.history[messageId] = content;
    return Promise.resolve(messageId);
  });

  // 3.5. Force inject the mocked generation store into the real Pinia instance
  // This ensures that when onGenerationEnded calls `useGenerationStore(pinia)`, it gets our mock.
  const mockGenerationStore = useMockGenerationStore();
  const mockWorldStore = options.worldStore || useMockWorldStore(); // Use provided store if available
  const mockEventLogStore = useMockEventLogStore();
  pinia.state.value.generation = mockGenerationStore;
  
  // 4. Create the lifecycle handlers, injecting mock stores for the test environment
  const handlers = createGenerationLifecycleHandlers({
    pinia,
    historyManager: mockHistoryManagerInstance as unknown as ChatHistoryManager,
    worldStore: mockWorldStore, // Use the potentially injected store
    eventLogStore: mockEventLogStore,
  });

  // 5. Inject the mock store into the handlers for test consistency
  /*
  if (handlers.setTestGenerationStore) {
    handlers.setTestGenerationStore(mockGenerationStore);
  }*/

  return { handlers, pinia, mockHistoryManager: mockHistoryManagerInstance };
}