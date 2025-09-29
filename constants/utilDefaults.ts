// Centralized defaults used when UtilSettings has never been saved

export type AdapterType = 'gemini' | 'openrouter' | 'openai-compatible' | 'cradlecloud';

// Default config for Auto Message prompt builder (UtilSettings)
export const defaultAutoMessagePromptConfig = {
  inputText:
    '以下是最近的聊天记录：\n[recentMessages]\n\n请基于角色设定，用第一人称延续对话，输出一条自然、简短、贴心的自动消息回复。避免客套和重复，控制在1-2句话。',
  presetJson: '',
  worldBookJson: '',
  adapterType: 'gemini' as AdapterType,
  autoMessageInterval: 1,
  messageArray: [
    {
      role: 'system',
      content:
        '你是对话中的角色，请用第一人称继续与用户自然交流。语气保持亲切，避免重复或空话。尽量具体，1-2句。',
    },
    {
      role: 'user',
      content: '<INPUT_TEXT>',
    },
  ],
};

// Default config for Image Generation scene description (UtilSettings)
export const defaultImageGenPromptConfig = {
  inputText:
    '请基于最近的对话[recentMessages]，生成一段简洁、具体、适合作为图像生成提示词的场景描述（不超过60字）。只描述画面本身，不要出现“描述/场景/提示词”等字样。',
  adapterType: 'gemini' as AdapterType,
  messageArray: [
    {
      role: 'system',
      content:
        '把用户输入作为上下文，只输出一段简洁的图像场景描述，适合作为绘图提示词。只返回描述本身，不要额外解释。',
    },
    {
      role: 'user',
      content: '<INPUT_TEXT>',
    },
  ],
};

// Default config for Memory Summary prompt builder (UtilSettings)
export const defaultMemorySummaryPromptConfig = {
  inputText:
    '请对以下对话进行中文摘要，保留：关键信息、事件、人物关系与意图、已达成事项与未解决问题。长度约1000字以内，条理清晰，便于继续对话使用。\n\n[conversation]',
  presetJson: '',
  worldBookJson: '',
  adapterType: 'gemini' as AdapterType,
  messageArray: [
    {
      role: 'system',
      content:
        '你是对话总结助手，请输出简洁、结构化的中文摘要，保留人物关系、意图、计划、已达成事项与未解决问题，不要点评。',
    },
    {
      role: 'user',
      content: '<INPUT_TEXT>',
    },
  ],
};

// Default config for Script Summary prompt builder (UtilSettings)
export const defaultScriptSummaryPromptConfig = {
  inputText:
    '请对以下剧本内容进行中文摘要，保留：关键剧情发展、人物行为和事件、角色互动和情感变化、重要设定信息。长度约1000字以内，条理清晰，便于后续剧情发展使用。\n\n[script_content]',
  presetJson: '',
  worldBookJson: '',
  adapterType: 'gemini' as AdapterType,
  messageArray: [
    {
      role: 'system',
      content:
        '你是剧本总结助手，请输出简洁、结构化的中文摘要，保留关键剧情发展、人物行为和事件、角色互动和情感变化、重要设定信息，不要点评。',
    },
    {
      role: 'user',
      content: '<INPUT_TEXT>',
    },
  ],
};

// Default config for Memory Service behavior (UtilSettings)
export const defaultMemoryServiceConfig = {
  summaryThreshold: 6000,
  summaryLength: 1000,
  // 默认启用“自定义总结区间”：使用 20% ~ 80% 的消息区间
  summaryRangePercent: { start: 40, end: 60 } as { start: number; end: number },
};
