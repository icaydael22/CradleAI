// core/history.ts

import { logger } from './logger';
import { findNonCloneable } from './utils';

// Global declarations for external libraries and functions
declare const _: any;
declare const getVariables: (options: any) => any;
import { assignVariables } from './variables';
declare const replaceVariables: (variables: Record<string, any>, options?: any) => Promise<Record<string, any>>;
declare const toastr: any;

// --- v2.0 Data Structure Definitions ---

/**
 * Represents a single message unit, whether from the user or one of AI's swipes.
 */
export type PluginEvent =
  | { type: 'KeywordsLearned'; entryId: string; keywords: string[]; }
  | { type: 'SummaryCreated'; summaryText: string; summarizedMessageIds: string[]; }
  | { 
      type: 'ContextLinkerRan'; 
      updates: { id: string; newKeywords: string[] }[]; 
      analyzedIds: string[]; 
      turn: number; 
    };

/**
 * Represents a single message unit, whether from the user or one of AI's swipes.
 */
export interface MessagePage {
  id: string;
  role: 'user' | 'assistant' | 'summary';
  content: string;
  timestamp: number;
  isValid?: boolean;
  parentId?: string | null;
  pluginEvents?: PluginEvent[]; // New field for plugin-generated events
}

/**
 * Encapsulates a "turn" in the conversation, which can be either a user's
 * single message or an assistant's set of swipeable messages.
 */
export interface Turn {
  role: 'user' | 'assistant';
  pages: { [pageIndex: number]: MessagePage };
  activePageIndex: number;
}

/**
 * Represents the metadata for a single branch for UI display.
 */
export interface Branch {
  id: string;
  name: string;
  messageCount: number;
  lastModified: number;
  isActive: boolean;
}

/**
 * The top-level structure for the entire chat history.
 */
export interface ChatHistory {
  version: '2.0'; // Version identifier for future migrations
  branches: {
    [branchId: string]: { [turnIndex: number]: Turn };
  };
  activeBranch: string;
  metadata: {
    [messageId: string]: {
      branchId: string;
      turnIndex: number;
      pageIndex: number;
    };
  };
}

// --- Core Logic: ChatHistoryManager v2.0 ---
export class ChatHistoryManager {
  private history: ChatHistory = this.getdefaultHistory();
  private isInitialized: boolean = false;
  private lastActiveMessageId: string | null = null;

  private getdefaultHistory(): ChatHistory {
    return {
      version: '2.0',
      branches: { main: {} },
      activeBranch: 'main',
      metadata: {},
    };
  }

  /**
   * Loads history from variables, handles migration from v1, and builds metadata.
   */
  public async loadHistory(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const chatVars = getVariables({ type: 'chat' }) || {};
      const rawHistory = _.cloneDeep(_.get(chatVars, 'plugin_storage.llm_history'));

      // DEBUG: Log raw history from variables
      logger('log', 'History', 'loadHistory started. Raw history from variables:', rawHistory);

      if (!rawHistory) {
        this.history = this.getdefaultHistory();
      } else if (Array.isArray(rawHistory) || !rawHistory.version) {
        // This is v1.0 data (or very old format)
        logger('warn', 'History', 'v1.0 history format detected. Migrating to v2.0...');
        this.history = this.migrateV1ToV2(rawHistory);
        await this.saveHistory(); // Persist the migrated structure
      } else if (rawHistory.version === '2.0') {
        // This is v2.0 data
        this.history = rawHistory;
      } else {
        // Unsupported version
        throw new Error(`Unsupported history version: ${rawHistory.version}`);
      }

      this.buildMetadata();
      this.isInitialized = true;
      logger('info', 'History', `Chat history v${this.history.version} loaded. Active branch: "${this.history.activeBranch}".`);

      // DEBUG: Log final state after loading
      logger('log', 'History', 'loadHistory finished. Final in-memory history:', _.cloneDeep(this.history));
    } catch (error) {
      logger('error', 'History', 'Failed to load chat history.', error);
      toastr.error('加载聊天记录失败，将使用空记录。');
      this.history = this.getdefaultHistory();
    }
  }

  /**
   * Starts a new turn with the user's message.
   * @param userMessageContent The content of the user's message.
   */
  public async addUserTurn(userMessageContent: string): Promise<void> {
    const userPage: MessagePage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
      isValid: true,
    };

    const newTurn: Turn = {
      role: 'user',
      pages: { 0: userPage },
      activePageIndex: 0,
    };

    const activeBranch = this.history.branches[this.history.activeBranch];
    const newTurnIndex = Object.keys(activeBranch).length;
    activeBranch[newTurnIndex] = newTurn;

    // Update metadata
    this.history.metadata[userPage.id] = {
      branchId: this.history.activeBranch,
      turnIndex: newTurnIndex,
      pageIndex: 0,
    };

    await this.saveHistory();
  }

  /**
   * Starts the very first turn of a branch, which is an assistant message.
   */
  public async startGenesisTurn(): Promise<void> {
    const newTurn: Turn = {
      role: 'assistant',
      pages: {},
      activePageIndex: 0,
    };

    const activeBranch = this.history.branches[this.history.activeBranch];
    if (Object.keys(activeBranch).length > 0) {
      // Avoid creating a genesis turn if history is not empty
      logger('warn', 'History', 'Attempted to create a genesis turn in a non-empty branch.');
      return;
    }
    
    activeBranch[0] = newTurn;
    await this.saveHistory();
  }

  /**
   * Adds a new AI-generated message page (a swipe). It will either add it to the
   * last assistant turn or create a new assistant turn if the last one was by the user.
   * @param assistantMessageContent The content of the AI's message.
   * @returns The ID of the newly created message page.
   */
  public async addAssistantMessagePage(assistantMessageContent: string): Promise<string> {
    const activeBranch = this.history.branches[this.history.activeBranch];
    let turnIndex = Object.keys(activeBranch).length - 1;
    let currentTurn = activeBranch[turnIndex];

    // If the last turn was a user turn, or if there are no turns, create a new assistant turn.
    if (!currentTurn || currentTurn.role === 'user') {
      turnIndex++;
      const newTurn: Turn = {
        role: 'assistant',
        pages: {},
        activePageIndex: 0,
      };
      activeBranch[turnIndex] = newTurn;
      currentTurn = newTurn;
    }

    const newPageIndex = Object.keys(currentTurn.pages).length;
    const assistantPage: MessagePage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      role: 'assistant',
      content: assistantMessageContent,
      timestamp: Date.now(),
      isValid: true,
    };

    currentTurn.pages[newPageIndex] = assistantPage;

    // Core Fix: Set the newly added page as the active one for this turn.
    // This ensures that the history's internal state is always consistent,
    // making it the authoritative source of truth for the active swipe.
    currentTurn.activePageIndex = newPageIndex;
    logger('info', 'History', `[SWIPE_FIX] New assistant page added. Active page index for turn ${turnIndex} is now ${newPageIndex}.`);

    // Update metadata
    this.history.metadata[assistantPage.id] = {
      branchId: this.history.activeBranch,
      turnIndex: turnIndex,
      pageIndex: newPageIndex,
    };

    await this.saveHistory();
    return assistantPage.id;
  }

  /**
   * Attaches a plugin-generated event to a specific message page.
   * This is the primary mechanism for making plugin activities replayable.
   * @param messageId The ID of the message to attach the event to.
   * @param event The plugin event object to add.
   */
  public async addPluginEvent(messageId: string, event: PluginEvent): Promise<void> {
    const page = this.getMessageById(messageId);
    if (!page) {
      logger('error', 'History', `addPluginEvent failed: Message with ID ${messageId} not found.`);
      return;
    }

    if (!page.pluginEvents) {
      page.pluginEvents = [];
    }
    page.pluginEvents.push(event);
    logger('info', 'History', `Plugin event of type "${event.type}" added to message ${messageId}.`);
    await this.saveHistory();
  }

  /**
   * Resets the in-memory representation of the chat history to its default state.
   * This is crucial when starting a new game to prevent stale data from the previous session.
   */
  public reset(): void {
    this.history = this.getdefaultHistory();
    this.isInitialized = false; // Reset initialization flag to allow re-loading
    logger('warn', 'History', 'In-memory history has been reset.');
  }

  /**
   * Clears the chat history from the persistent storage (chat variables).
   */
  public async clearStoredHistory(): Promise<void> {
    this.history = this.getdefaultHistory();
    this.isInitialized = false;
    await this.saveHistory();
    logger('warn', 'History', 'Stored chat history has been cleared.');
  }

  /**
   * Sets the active assistant message page (swipe) for a given turn.
   * @param turnIndex The index of the turn to modify.
   * @param pageIndex The new active page index.
   */
  public async setActivePage(turnIndex: number, pageIndex: number): Promise<void> {
    logger('log', 'History', `[SWIPE_DEBUG] setActivePage called with turnIndex: ${turnIndex}, pageIndex: ${pageIndex}`);
    const turn = this.history.branches[this.history.activeBranch]?.[turnIndex];
    if (!turn || !turn.pages[pageIndex]) {
      logger('error', 'History', `[SWIPE_DEBUG] setActivePage failed: Invalid turn or page index. Turn: ${turnIndex}, Page: ${pageIndex}`);
      throw new Error(`Invalid turn or page index: Turn ${turnIndex}, Page ${pageIndex}`);
    }

    if (turn.role === 'user') {
      logger('warn', 'History', `[SWIPE_DEBUG] Attempted to set active page on a user turn (${turnIndex}), which is not allowed.`);
      return;
    }

    const previousPageId = turn.pages[turn.activePageIndex]?.id || null;
    const newPageId = turn.pages[pageIndex].id;

    // 仅在页面实际发生变化时才触发状态更新
    if (previousPageId === newPageId) {
      logger('log', 'History', `[SWIPE_DEBUG] Page index ${pageIndex} is already active. No state change needed.`);
      return;
    }

    logger('info', 'History', `[SWIPE_DEBUG] Active page changing for turn ${turnIndex}, from ${turn.activePageIndex} to ${pageIndex}.`);
    turn.activePageIndex = pageIndex;
    await this.saveHistory();
    
    // Dispatch event for state recalculation
    logger('info', 'History', `[SWIPE_DEBUG] Dispatching 'stateActivationRequested' event for new messageId: ${newPageId} (previous: ${previousPageId})`);
    window.dispatchEvent(new CustomEvent('stateActivationRequested', {
      detail: {
        newMessageId: newPageId,
        previousMessageId: this.lastActiveMessageId,
      }
    }));
    this.lastActiveMessageId = newPageId;
  }

  /**
   * Updates the content of a specific message page.
   * @param messageId The ID of the message to update.
   * @param newContent The new content.
   */
  public async updateMessagePageContent(messageId: string, newContent: string): Promise<void> {
    const coords = this.history.metadata[messageId];
    if (!coords) throw new Error(`Message with ID ${messageId} not found in metadata.`);

    const { branchId, turnIndex, pageIndex } = coords;
    const turn = this.history.branches[branchId]?.[turnIndex];
    if (!turn) throw new Error('Turn not found for message.');

    const pageToUpdate = turn.pages[pageIndex];

    if (pageToUpdate) {
      pageToUpdate.content = newContent;
      await this.saveHistory();
    } else {
      throw new Error('Message page not found at specified coordinates.');
    }
  }

  /**
   * Creates a new branch from a specific turn in the current active branch.
   * @param fromTurnIndex The index of the turn to branch from.
   * @returns The ID of the new branch.
   */
  public async createBranch(fromTurnIndex: number): Promise<string> {
    const activeBranchTurns = this.history.branches[this.history.activeBranch];
    if (activeBranchTurns[fromTurnIndex] === undefined) {
      throw new Error('Branch creation index is out of bounds.');
    }

    const newBranchId = `branch-${Date.now()}`;
    const newBranch: { [turnIndex: number]: Turn } = {};

    // Deep copy turns up to the specified index
    for (let i = 0; i <= fromTurnIndex; i++) {
      newBranch[i] = _.cloneDeep(activeBranchTurns[i]);
    }

    this.history.branches[newBranchId] = newBranch;
    this.history.activeBranch = newBranchId;
    
    // Metadata for the new branch is implicitly copied. Rebuild to be safe.
    this.buildMetadata();
    await this.saveHistory();
    logger('info', 'History', `Created new branch "${newBranchId}" from turn ${fromTurnIndex}.`);
    return newBranchId;
  }

  // --- Branch Management ---

  public getBranches() {
    return Object.keys(this.history.branches).map(branchId => {
      const turns = this.history.branches[branchId];
      const turnIndices = Object.keys(turns).map(Number);
      const lastTurn = turns[Math.max(...turnIndices)];
      const lastMessage = lastTurn?.pages[lastTurn.activePageIndex];
      
      return {
        id: branchId,
        name: branchId, // Name is ID for now
        messageCount: turnIndices.length * 2, // Approximation
        lastModified: lastMessage?.timestamp || 0,
        isActive: branchId === this.history.activeBranch,
      };
    }).sort((a, b) => b.lastModified - a.lastModified);
  }

  public getActiveBranchId(): string {
    return this.history.activeBranch;
  }

  public async switchBranch(branchId: string): Promise<void> {
    if (!this.history.branches[branchId]) {
      throw new Error(`Branch "${branchId}" not found.`);
    }
    this.history.activeBranch = branchId;
    await this.saveHistory();
  }

  public getRawHistory(): ChatHistory {
    return this.history;
  }

  /**
   * Retrieves a single message page by its unique ID.
   * @param messageId The ID of the message to retrieve.
   * @returns The MessagePage object or null if not found.
   */
  public getMessageById(messageId: string): MessagePage | null {
    const coords = this.history.metadata[messageId];
    if (!coords) return null;
    const { branchId, turnIndex, pageIndex } = coords;
    return this.history.branches[branchId]?.[turnIndex]?.pages[pageIndex] || null;
  }

  /**
   * (v2.6) Gets the absolute turn index for a given message ID.
   * @param messageId The ID of the message.
   * @returns The turn index, or -1 if not found.
   */
  public getMessageIndex(messageId: string): number {
    const coords = this.history.metadata[messageId];
    return coords ? coords.turnIndex : -1;
  }

  public async renameBranch(oldBranchId: string, newBranchId: string): Promise<void> {
    if (!this.history.branches[oldBranchId]) throw new Error(`Branch "${oldBranchId}" not found.`);
    if (this.history.branches[newBranchId]) throw new Error(`Branch "${newBranchId}" already exists.`);
    
    this.history.branches[newBranchId] = this.history.branches[oldBranchId];
    delete this.history.branches[oldBranchId];

    if (this.history.activeBranch === oldBranchId) {
      this.history.activeBranch = newBranchId;
    }
    this.buildMetadata(); // Rebuild metadata with new branch ID
    await this.saveHistory();
  }

  public async deleteBranch(branchId: string): Promise<void> {
    if (Object.keys(this.history.branches).length <= 1) {
      throw new Error("Cannot delete the last branch.");
    }
    if (!this.history.branches[branchId]) {
      throw new Error(`Branch "${branchId}" not found.`);
    }

    delete this.history.branches[branchId];
    if (this.history.activeBranch === branchId) {
      this.history.activeBranch = Object.keys(this.history.branches)[0];
    }
    this.buildMetadata();
    await this.saveHistory();
  }

  public async deleteTurn(turnIndex: number): Promise<void> {
    const activeBranchId = this.history.activeBranch;
    const activeBranch = this.history.branches[activeBranchId];
    if (!activeBranch || !activeBranch[turnIndex]) {
      throw new Error(`Turn ${turnIndex} not found in active branch.`);
    }

    // --- New Logic: Clean up associated state snapshots ---
    try {
      const chatVars = getVariables({ type: 'chat' }) || {};
      const snapshotPath = `世界.${activeBranchId}.状态快照`;
      const snapshots = _.get(chatVars, snapshotPath);

      if (snapshots && typeof snapshots === 'object') {
        const validSnapshots: { [key: number]: any } = {};
        let snapshotsCleaned = false;
        for (const key in snapshots) {
          const snapshotTurnIndex = parseInt(key, 10);
          if (snapshotTurnIndex < turnIndex) {
            validSnapshots[snapshotTurnIndex] = snapshots[key];
          } else {
            snapshotsCleaned = true;
          }
        }

        if (snapshotsCleaned) {
          logger('warn', 'History', `Deleting snapshots from turn ${turnIndex} onwards for branch "${activeBranchId}".`);
          const newVars = _.cloneDeep(chatVars);
          _.set(newVars, snapshotPath, validSnapshots);
          await replaceVariables(newVars, { type: 'chat' });
        }
      }
    } catch (error) {
      logger('error', 'History', 'Failed to clean up state snapshots during deleteTurn. State might be inconsistent.', error);
      toastr.error('清理状态快照失败，请检查控制台。');
    }
    // --- End of New Logic ---

    // To delete a turn, we shift all subsequent turns down.
    const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => a - b);
    for (let i = turnIndex; i < turnIndices.length - 1; i++) {
      activeBranch[i] = activeBranch[i + 1];
    }
    // Delete the last turn, which is now a duplicate.
    delete activeBranch[turnIndices.length - 1];

    this.buildMetadata();
    await this.saveHistory();
  }

  /**
   * Returns a linear, ordered list of active messages for prompt construction.
   */
  public getMessagesForPrompt(): MessagePage[] {
    const messages: MessagePage[] = [];
    const activeBranchTurns = this.history.branches[this.history.activeBranch];
    const turnIndices = Object.keys(activeBranchTurns).map(Number).sort((a, b) => a - b);

    for (const index of turnIndices) {
      const turn = activeBranchTurns[index];
      const activePage = turn.pages[turn.activePageIndex];
      if (activePage) {
        messages.push(activePage);
      }
    }
    return messages;
  }

  /**
   * (v2.7) Gets the final message page of the turn prior to the one containing the given message ID.
   * This is essential for L1 cache implementation (state rollback for retries).
   * @param messageId The ID of a message in the current turn.
   * @returns The MessagePage of the last active message of the previous turn, or null if it's the first turn.
   */
  public getPreviousTurnMessage(messageId: string): MessagePage | null {
    const coords = this.history.metadata[messageId];
    if (!coords) return null;

    const { branchId, turnIndex } = coords;
    if (turnIndex === 0) return null; // It's the first turn, no previous turn exists.

    const previousTurnIndex = turnIndex - 1;
    const previousTurn = this.history.branches[branchId]?.[previousTurnIndex];
    if (!previousTurn) return null;

    return previousTurn.pages[previousTurn.activePageIndex] || null;
  }

  /**
   * (v2.6) Gets all active message pages in the current branch between two points.
   * This is crucial for state recalculation with snapshots.
   * @param targetMessageId The ID of the end message.
   * @param startMessageId (Optional) The ID of the start message. Events from this message's turn will be excluded.
   * @returns An array of MessagePage objects in chronological order, or null if the target is not found.
   */
  public getActiveMessagesUntil(targetMessageId: string, startMessageId?: string | null): MessagePage[] | null {
    const coords = this.history.metadata[targetMessageId];
    if (!coords) return null;

    const { branchId, turnIndex: targetTurnIndex } = coords;
    const startTurnIndex = startMessageId ? this.getMessageIndex(startMessageId) : -1;
    
    const messages: MessagePage[] = [];
    const targetBranchTurns = this.history.branches[branchId];
    const turnIndices = Object.keys(targetBranchTurns).map(Number).sort((a, b) => a - b);

    for (const index of turnIndices) {
      if (index <= startTurnIndex) continue; // Skip turns before or at the snapshot
      if (index > targetTurnIndex) break;
      
      const turn = targetBranchTurns[index];
      // For the target turn, use its own page index. For all previous turns, use their active page index.
      const pageIndex = (index === targetTurnIndex) ? coords.pageIndex : turn.activePageIndex;
      const activePage = turn.pages[pageIndex];
      
      if (activePage) {
        messages.push(activePage);
      }
    }
    return messages;
  }

  /**
   * Gets the total number of turns in the currently active branch.
   * @returns The number of turns.
   */
  public getTurnCount(): number {
    const activeBranch = this.history.branches[this.history.activeBranch];
    if (!activeBranch) {
      return 0;
    }
    return Object.keys(activeBranch).length;
  }

  /**
   * (New) Finds and returns the last turn made by the user in the active branch.
   * This is the robust way to get the context for a re-generation.
   * @returns The last user Turn object, or null if none is found.
   */
  public getLastUserTurn(): Turn | null {
    const activeBranchTurns = this.history.branches[this.history.activeBranch];
    if (!activeBranchTurns) {
      return null;
    }

    const turnIndices = Object.keys(activeBranchTurns).map(Number).sort((a, b) => b - a); // Sort descending

    for (const index of turnIndices) {
      const turn = activeBranchTurns[index];
      if (turn && turn.role === 'user') {
        return turn;
      }
    }

    return null;
  }

  /**
   * (New) Finds and returns the last message page from the assistant in the active branch.
   * @returns The last assistant MessagePage object, or null if none is found.
   */
  public getLastAssistantMessage(): MessagePage | null {
    const messages = this.getMessagesForPrompt();
    return _.findLast(messages, (m: MessagePage) => m.role === 'assistant') || null;
  }

  /**
   * Saves the entire history object back to the variable system.
   * (v4.2.2) Switched to a robust read-modify-write pattern using `replaceVariables`
   * to avoid issues with the breaking changes in `insertOrAssignVariables` from Tavern Helper v3.5.1.
   */
  private async saveHistory(): Promise<void> {
    try {
      logger('info', 'History', 'Attempting to save history. Current in-memory state:', _.cloneDeep(this.history));
      
      // 1. Read the full, current state of chat variables.
      const currentVars = getVariables({ type: 'chat' }) || {};
      
      // 2. Modify the state in memory.
      const newVars = _.cloneDeep(currentVars);
      _.set(newVars, 'plugin_storage.llm_history', this.history);

      // 3. Write the entire modified object back, ensuring atomicity.
      const problems = findNonCloneable(newVars);
      if (problems.length > 0) {
        logger('error', 'History', 'CRITICAL: Non-cloneable properties found in variables before saving history!', problems);
      }
      await replaceVariables(newVars, { type: 'chat' });

      logger('info', 'History', 'History saved successfully using replaceVariables.');
    } catch (error) {
      logger('error', 'History', 'Failed to save history.', error);
      throw new Error('Failed to persist history changes.');
    }
  }

  /**
   * Builds the metadata lookup table from the current history state.
   */
  private buildMetadata(): void {
    this.history.metadata = {};
    for (const branchId in this.history.branches) {
      const turns = this.history.branches[branchId];
      for (const turnIndexStr in turns) {
        const turnIndex = parseInt(turnIndexStr, 10);
        const turn = turns[turnIndex];
        for (const pageIndexStr in turn.pages) {
          const pageIndex = parseInt(pageIndexStr, 10);
          const page = turn.pages[pageIndex];
          if (page) {
            this.history.metadata[page.id] = { branchId, turnIndex, pageIndex };
          }
        }
      }
    }
  }

  /**
   * Converts the old v1 flat array structure to the new v2 nested object structure.
   * @param v1History The old history array.
   * @returns A new ChatHistory object in v2 format.
   */
  private migrateV1ToV2(v1History: any[]): ChatHistory {
    const newHistory = this.getdefaultHistory();
    const mainBranch = newHistory.branches.main;
    let turnIndex = 0;

    v1History.forEach(msg => {
      if (msg.role === 'user') {
        const userPage: MessagePage = {
          id: msg.id || `msg_${msg.timestamp}_${Math.random().toString(36).substring(2, 9)}`,
          role: 'user',
          content: Array.isArray(msg.content) ? msg.content.join('\n') : msg.content,
          timestamp: msg.timestamp,
          isValid: msg.isValid !== false,
        };
        const userTurn: Turn = {
          role: 'user',
          pages: { 0: userPage },
          activePageIndex: 0,
        };
        mainBranch[turnIndex++] = userTurn;
      } else if (msg.role === 'assistant') {
        const assistantTurn: Turn = {
          role: 'assistant',
          pages: {},
          activePageIndex: msg.activeSwipeIndex || 0,
        };
        const swipes: string[] = Array.isArray(msg.content) ? msg.content : [msg.content];
        swipes.forEach((swipeContent: string, pageIndex: number) => {
          const assistantPage: MessagePage = {
            id: pageIndex === (msg.activeSwipeIndex || 0) ? msg.id : `msg_${msg.timestamp}_${pageIndex}`,
            role: 'assistant',
            content: swipeContent,
            timestamp: msg.timestamp,
            isValid: msg.isValid !== false,
          };
          assistantTurn.pages[pageIndex] = assistantPage;
        });
        mainBranch[turnIndex++] = assistantTurn;
      }
    });

    return newHistory;
  }
}
