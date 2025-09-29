import { Pinia } from 'pinia';
import { useStoryStore } from './stores/ui/storyStore';
import { ChatHistoryManager } from './core/history';
import { StoryRenderer } from './core/renderer';
import { PromptManager } from './core/promptManager';
import { EventManager } from './core/eventManager';

declare global {
  interface Window {
    stores?: {
      story?: () => Promise<ReturnType<typeof useStoryStore>>;
      [key: string]: (() => Promise<any>) | undefined;
    };
    chatHistoryManager: ChatHistoryManager;
    storyRenderer: StoryRenderer;
    promptManager: PromptManager;
    eventManager: EventManager;
  }
}

// This is necessary to make the file a module.
export {};
