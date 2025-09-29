import { vi } from 'vitest';

// Create a singleton mock instance that can be imported and configured in tests
export const mockHistoryManagerInstance = {
  addAssistantMessagePage: vi.fn(),
  getMessagesForPrompt: vi.fn().mockReturnValue([]),
  loadHistory: vi.fn(),
  getEventsForMessage: vi.fn(),
  getRawHistory: vi.fn().mockReturnValue({
    branches: {
      main: {
        '0': { swipes: [''], activeSwipe: 0 },
      },
    },
    activeBranch: 'main',
  }),
  // Add any other methods that need to be mocked
};

export const ChatHistoryManager = vi.fn(() => mockHistoryManagerInstance);