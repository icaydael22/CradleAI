// core/actions.ts
import { useGenerationStore } from '../stores/app/generationStore';
import { sendGenerationRequest } from './generation';
import type { StoryRenderer } from './renderer';
import { ChatHistoryManager } from './history';
import { Summarizer } from './summarizer';
import { logger } from './logger';
import { PromptManager } from './promptManager';
import { extractJsonFromStatusBar } from './utils';

// Declare global variables from script tags
declare const toastr: any;
declare const _: any;

/**
 * Triggers a re-generation of the last user input to get a new swipe.
 * @param storyRenderer The instance of the story renderer to control the UI.
 * @param storyRenderer The instance of the story renderer to control the UI.
 * @param historyManager The instance of the history manager to check message validity.
 * @param promptManager The instance of the prompt manager to generate prompts.
 */
export const generateAnotherSwipe = async (storyRenderer: StoryRenderer, historyManager: ChatHistoryManager, promptManager: PromptManager) => {
  const generationStore = useGenerationStore();
  logger('log', 'Actions', '`generateAnotherSwipe` triggered.');
  if (generationStore.isAiGenerating) {
    logger('warn', 'Actions', 'Generation blocked: AI is already generating.');
    toastr.info('正在生成新的回应，请稍候...');
    return;
  }

  try {
    logger('info', 'Actions', 'Triggering re-generation (new swipe).');
    toastr.info('正在请求新的回应...');
    
    generationStore.isNewTurn = false;
    logger('log', 'State', 'Flag `isNewTurn` set to `false`.');

    // Robustly find the last user input from the history manager, not from a volatile store.
    const lastUserTurn = historyManager.getLastUserTurn();
    if (!lastUserTurn || !lastUserTurn.pages[0]?.content) {
      logger('error', 'Actions', 'Could not find the last user input in the chat history.');
      toastr.error('错误：无法在历史记录中找到对应的玩家输入。');
      return;
    }
    const userInput = lastUserTurn.pages[0].content;
    logger('info', 'Actions', `Found last user input from history: "${userInput}"`);

    const { chatHistory, injects } = await promptManager.preparePromptComponents(historyManager, userInput, true);

    logger('info', 'Generation', 'Final components for re-generation:', { userInput, chatHistory, injects });
    
    const generationId = `main-swipe-${crypto.randomUUID()}`;
    await sendGenerationRequest(userInput, chatHistory, injects, generationId);

  } catch (error) {
    logger('error', 'Actions', '`generateAnotherSwipe` failed.', error);
    console.error('重新生成回应失败:', error);
    toastr.error('重新生成回应失败，请查看控制台日志。');
  }
};

/**
 * Triggers a new turn based on the user's selected action.
 * @param text The descriptive text of the action.
 * @param index The numerical index of the action.
 * @param storyRenderer The instance of the story renderer to control the UI.
 * @param historyManager The instance of the history manager to save messages.
 * @param summarizer The instance of the summarizer to trigger background summaries.
 * @param promptManager The instance of the prompt manager to generate prompts.
 */
export const triggerAction = async (text: string, index: number, storyRenderer: StoryRenderer, historyManager: ChatHistoryManager, summarizer: Summarizer, promptManager: PromptManager) => {
  const generationStore = useGenerationStore();
  if (!text || text.trim().length === 0) return;
  logger('log', 'Actions', `\`triggerAction\` triggered with action #${index}: "${text}"`);

  try {
    // 如果是自定义行动 (index === -1)，则将其反写到上一条AI消息的行动选项中
    if (index === -1) {
      try {
        logger('info', 'Actions', 'Custom action detected. Attempting to write it back to the previous message.');
        const history = historyManager.getRawHistory();
        const activeBranch = history.branches[history.activeBranch];
        const turnIndices = Object.keys(activeBranch).map(Number).sort((a, b) => a - b);
        const lastTurnIndex = _.last(turnIndices);

        if (lastTurnIndex === undefined) {
          logger('warn', 'Actions', 'Could not find the last turn to write back custom action.');
        } else {
          const lastTurn = activeBranch[lastTurnIndex];
          logger('log', 'Actions', 'Last turn found:', { turnIndex: lastTurnIndex, role: lastTurn.role });

          if (lastTurn.role === 'assistant') {
            const activePage = lastTurn.pages[lastTurn.activePageIndex];
            if (activePage) {
              logger('log', 'Actions', 'Active page found:', { pageId: activePage.id });
              const statusBarJsonString = extractJsonFromStatusBar(activePage.content);
              
              if (statusBarJsonString) {
                try {
                  logger('log', 'Actions', 'Extracted status bar JSON string:', statusBarJsonString);
                  const statusBarObject = JSON.parse(statusBarJsonString);
                  
                  const actionOptionsContainer = statusBarObject['行动选项'];
                  if (actionOptionsContainer && typeof actionOptionsContainer === 'object') {
                    const optionsKey = Object.keys(actionOptionsContainer).find(key => key.includes('可选行动'));
                    
                    if (optionsKey && Array.isArray(actionOptionsContainer[optionsKey])) {
                      if (!actionOptionsContainer[optionsKey].includes(text)) {
                        actionOptionsContainer[optionsKey].push(text);
                        logger('log', 'Actions', 'Updated action options:', actionOptionsContainer[optionsKey]);

                        const newJsonBlock = JSON.stringify(statusBarObject, null, 2);
                        
                        // 检查原始statusbar是否包含```json标记，以保持格式一致
                        const originalStatusBarContent = /<statusbar>([\s\S]*?)<\/statusbar>/.exec(activePage.content)?.[1] || '';
                        const newStatusBarContent = originalStatusBarContent.includes('```json')
                          ? `\`\`\`json\n${newJsonBlock}\n\`\`\``
                          : newJsonBlock;

                        const newContent = activePage.content.replace(originalStatusBarContent, newStatusBarContent);
                        
                        await historyManager.updateMessagePageContent(activePage.id, newContent);
                        logger('info', 'Actions', 'Successfully wrote custom action back to history.');
                      } else {
                        logger('info', 'Actions', 'Custom action already exists in the options. No changes made.');
                      }
                    } else {
                      logger('warn', 'Actions', 'Could not find a valid "可选行动" array in the action options object.', actionOptionsContainer);
                    }
                  } else {
                    logger('warn', 'Actions', 'The "行动选项" key does not exist or is not an object in the status bar JSON.', statusBarObject);
                  }
                } catch (parseError) {
                  logger('error', 'Actions', 'Failed to parse or process status bar JSON.', parseError);
                  console.error('解析或处理状态栏JSON时出错:', parseError);
                }
              } else {
                logger('warn', 'Actions', 'No status bar JSON found in the last message content.');
              }
            } else {
              logger('warn', 'Actions', 'No active page found in the last assistant turn.');
            }
          } else {
            logger('warn', 'Actions', 'The last turn was not an assistant turn, cannot write back action.');
          }
        }
      } catch (error) {
        logger('error', 'Actions', 'Failed to write back custom action.', error);
        console.error('回写自定义行动时发生严重错误:', error);
        toastr.error('将自定义行动写回历史记录时出错，请查看控制台。');
      }
    }
    // In v2.0, pruning invalid messages is no longer the responsibility of this function.
    // The renderer and state manager handle parsing failures.

    // This is a new turn, so set the flag.
    generationStore.isNewTurn = true;
    logger('log', 'State', 'Flag `isNewTurn` set to `true`.');

    // Force the UI to reset to 1/1 immediately.
    generationStore.forceSwipeReset = true;
    // updateSwipeUI(); // Deprecated: This is now handled reactively by the storyStore.

    // Step 1: Start a new turn with the user's action.
    await historyManager.addUserTurn(text);
    logger('info', 'History', 'User action started a new turn.');
    toastr.info('玩家行动已记录。');

    // Step 2: Prepare and send the generation request for the new action.
    const { userInput, chatHistory, injects } = await promptManager.preparePromptComponents(historyManager, text, false);

    logger('info', 'Generation', 'Final components to be sent to LLM:', { userInput, chatHistory, injects });
    
    generationStore.lastUserInput = userInput; // Cache the input for potential re-generation

    const generationId = `main-action-${crypto.randomUUID()}`;
    await sendGenerationRequest(userInput, chatHistory, injects, generationId);
    
    toastr.success(`已选择行动: ${text}`);

    // Step 4: Trigger a summary check in the background.
    // This runs asynchronously and does not block the user.
    logger('log', 'Summarizer', 'Triggering summary check.');
    summarizer.triggerSummaryIfNeeded();
    
  } catch (error) {
    logger('error', 'Actions', '`triggerAction` failed.', error);
    console.error('行动失败:', error);
    toastr.error('行动失败，请查看控制台日志。');
  }
};
