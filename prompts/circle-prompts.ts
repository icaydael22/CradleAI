/**
 * Circle System Prompt Templates
 * 
 * This file contains all prompt templates used in the Circle system
 * for better maintainability and centralized prompt management.
 */

export interface ScenePromptParams {
  contentText: string;
  authorName?: string;
  context?: string;
  hasImages: boolean;
  charDescription: string;
  charName?: string;
  userIdentification?: string;
  conversationHistory?: string;
  characterJsonData?: string;
  allCommentsText?: string; // 新增：全部评论内容
}

export const CirclePrompts = {
  /**
   * Prompt for when a post is forwarded to a character
   */
  forwardedPost: (params: ScenePromptParams) => `用户给你转发了一条朋友圈动态：

【作者】${params.authorName || '某人'}
【内容】${params.contentText}
${params.hasImages ? "【图片内容】动态中包含图片，图片是帖子的核心内容" : ""}
${params.context ? `【上下文】${params.context}` : ''}
${params.conversationHistory ? `【你们的历史对话记录】\n${params.conversationHistory}` : ''}

请你以${params.charName ? params.charName : ''}的身份（${params.charDescription.substring(0, 50)}），考虑以下几点：
1. 这是在私聊中用户转发给你的朋友圈，而不是你在浏览朋友圈
2. 你可能认识也可能不认识发朋友圈的人
3. 如果发朋友圈的人是你自己，请对"用户看了你的朋友圈并转发给你"这个行为做出反应
${params.hasImages ? "4. 这条朋友圈包含图片，请优先对图片内容做出详细回应，在回复中直接提及你看到的图片具体内容" : ""}
${params.conversationHistory ? "5. 请参考上方的历史对话记录，保持对话的连贯性和一致性，体现出你对之前交流内容的记忆" : ""}

请以JSON格式提供你的回应：
{
  "thoughts": "你看到这条朋友圈的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "${params.hasImages ? "对图片内容的具体回应，必须明确提及你看到的图片具体内容" : "你的回复内容"}"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for creating a new post by a character
   */
  createNewPost: (params: ScenePromptParams) => `作为${params.charName ? params.charName : ''}（${params.charDescription.substring(0, 50)}），请基于你的性格和背景，创作一条适合发布在朋友圈的内容。

${params.context ? `【上下文】${params.context}` : ''}
${params.characterJsonData ? `【你的角色设定】${params.characterJsonData}` : ''}
${params.conversationHistory ? `【你与用户的历史对话】\n${params.conversationHistory}` : ''}

请以JSON格式提供你的朋友圈帖子：
{
  "thoughts": "你发布这条朋友圈的内心想法（不会展示给他人）",
  "post": "你要发布的朋友圈内容",
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}

确保内容符合你的角色人设，展现出你独特的性格和表达方式。${params.conversationHistory ? '如果可能，可以巧妙地融入你与用户之前交流中提到的话题或内容，增强连贯性。' : ''}`,

  /**
   * Prompt for when a character sees their own post
   */
  selfPost: (params: ScenePromptParams) => `这是你${params.charName ? '（' + params.charName + '）' : ''}自己发布的朋友圈动态，现在有人回复了你的帖子：

【你发布的内容】${params.context || '无'}
${params.hasImages ? "该动态包含图片内容，请首先关注【图片描述】部分，这是对图片内容的详细描述。" : ''}
【${params.userIdentification || '某人'}的回复】${params.contentText}
${params.conversationHistory ? `【你与${params.userIdentification || '对方'}的历史对话】\n${params.conversationHistory}` : ''}

基于你的角色性格，请以JSON格式回应：
- 你对这个回复的感受
- 你想如何回应这条评论
- 包含你的情感状态

回复，不要包含任何其他文字：
{
  "thoughts": "你对这条回复的内心想法（不会展示给对方）",
  "response": "你对这条评论的回复${params.conversationHistory ? '，保持与历史对话的连贯性' : ''}",
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for replying to a comment in a conversation thread
   */
  continuedConversation: (params: ScenePromptParams) => `你${params.charName ? '（' + params.charName + '）' : ''}正在朋友圈中与${params.authorName || '某人'}进行对话。

【原帖内容】${params.context || '无'}
${params.hasImages ? "该动态包含图片内容，请首先关注【图片描述】部分，这是对图片内容的详细描述。" : ''}

${params.allCommentsText ? `【评论区全部内容】\n${params.allCommentsText}\n` : ''}

${params.conversationHistory ? `【你们的历史对话记录】\n${params.conversationHistory}` : ''}

【最新回复】${params.contentText}
【评论回复者】${params.userIdentification || '某人'}

${params.characterJsonData ? `【角色设定】${params.characterJsonData}` : ''}

作为角色 ${params.charName ? params.charName : ''}（${params.charDescription.substring(0, 50)}），请根据你的性格特点和上方的历史对话上下文，回应最新的回复。请保持对话的连贯性，并确保你的回应风格与你的角色设定一致。

请以JSON格式回复：
{
  "thoughts": "你对这个持续对话的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你对这条评论的回复，应该与历史对话上下文保持一致"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for replying to a post with images
   */
  replyToPostWithImage: (params: ScenePromptParams) => `你${params.charName ? '（' + params.charName + '）' : ''}正在浏览以下带有图片的朋友圈动态：

【作者】${params.authorName || '某人'}
【内容】${params.contentText}
【上下文】${params.context || '无'}
${params.characterJsonData ? `【角色设定】${params.characterJsonData}` : ''}
${params.conversationHistory ? `【你与${params.authorName === '用户' || params.userIdentification ? '用户' : '对方'}的历史对话】\n${params.conversationHistory}` : ''}

请特别注意：这条动态包含图片内容，图片是帖子内容的重要组成部分。你看到的是图片的详细描述，应该主要对图片内容进行回应，而不是仅关注文字内容。

作为角色 ${params.charName ? params.charName : ''}（${params.charDescription.substring(0, 50)}），基于你看到的图片内容和你的性格特点，请思考：
1. 这张图片展示了什么内容？
2. 你对图片中的内容有什么感受？
3. 图片内容如何影响你的回应方式？
4. 基于你的角色设定，你会如何回应这张图片？
${params.conversationHistory ? '5. 如何让你的回应与之前的对话保持连贯性？' : ''}

然后，以JSON格式提供你的回应：
- 包含你看到这张图片时的内心想法（不会展示给对方）
- 决定是否点赞（like: true/false）
- 评论内容必须直接提及图片中看到的具体元素，表明你看到并理解了图片内容
- 包含你对图片的情感反应（emotion对象）

严格按以下格式，用中文回复，不要包含任何其他文字：
{
  "thoughts": "你看到这条朋友圈的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你对图片的具体评论，必须明确提及图片中的内容${params.conversationHistory ? '，应与历史对话保持连贯性' : ''}"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for replying to a regular post (no images)
   */
  replyToPost: (params: ScenePromptParams) => `你${params.charName ? '（' + params.charName + '）' : ''}正在浏览以下朋友圈下面的内容：

【写这条内容的人】${params.authorName || '某人'}
【内容】${params.contentText}
【原帖的内容】${params.context || '无'}
${params.characterJsonData ? `【角色设定】${params.characterJsonData}` : ''}
${params.conversationHistory ? `【你与${params.authorName === '用户' || params.userIdentification ? '用户' : '对方'}的历史对话】\n${params.conversationHistory}` : ''}
${params.hasImages ? "该动态包含图片内容，请首先关注【图片描述】部分，这是对图片内容的详细描述。你的回应应该主要基于图片内容，而不仅仅是动态的文字。" : ''}

基于你的角色性格，请以JSON格式回应：
- 包含你看到这条朋友圈时的内心想法（不会展示给对方）
- 决定是否点赞（like: true/false）
- 可选择是否发表评论（comment字段）
- 包含你的情感反应（emotion对象，含type和intensity）

严格按以下格式用中文回复，不要包含任何其他文字：
{
  "thoughts": "你看到这条朋友圈的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你的评论内容${params.conversationHistory ? '，应与历史对话保持连贯性' : ''}（如不评论则省略此字段）"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for replying to a comment with images
   */
  replyToCommentWithImage: (params: ScenePromptParams) => `你${params.charName ? '（' + params.charName + '）' : ''}看到以下带有图片的朋友圈评论：

【原帖内容】${params.context || '无'}
【评论内容】${params.contentText}
【评论作者】${params.userIdentification || '某人'}
${params.characterJsonData ? `【角色设定】${params.characterJsonData}` : ''}
${params.conversationHistory ? `【你与${params.userIdentification === '用户' ? '用户' : '对方'}的历史对话】\n${params.conversationHistory}` : ''}

请特别注意上方的【图片描述】部分，这是对图片内容的详细描述。你的回复应该对图片内容和评论文本都做出响应。

作为角色 ${params.charName ? params.charName : ''}（${params.charDescription.substring(0, 50)}），请基于图片内容和你的角色特点：
1. 考虑图片内容如何影响你对评论的回应
2. 在回复中提及图片中的具体元素
${params.conversationHistory ? '3. 回应应保持与上方历史对话的连贯性，表现出你对之前对话内容的记忆' : ''}

然后，以JSON格式提供你的回应：
- 包含你看到这条评论时的内心想法（不会展示给对方）
- 决定是否点赞评论（like: true/false）
- 回复内容应结合图片内容和评论文本
- 包含你的情感反应（emotion对象）

用中文回复，不要包含任何其他文字：
{
  "thoughts": "你看到这条评论的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你的回复内容，提及图片和评论${params.conversationHistory ? '，并与历史对话保持连贯' : ''}"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,

  /**
   * Prompt for replying to a regular comment (no images)
   */
  replyToComment: (params: ScenePromptParams) => `你${params.charName ? '（' + params.charName + '）' : ''}看到以下朋友圈评论：

【原帖内容】${params.context || '无'}
${params.hasImages ? "该动态包含图片内容，请首先关注【图片描述】部分，这是对图片内容的详细描述。你的回应应该主要基于图片内容，而不仅仅是动态的文字。" : ''}
【评论内容】${params.contentText}
【评论作者】${params.userIdentification || '某人'}
${params.characterJsonData ? `【角色设定】${params.characterJsonData}` : ''}
${params.conversationHistory ? `【你与${params.userIdentification === '用户' ? '用户' : '对方'}的历史对话】\n${params.conversationHistory}` : ''}

基于你的角色性格，请以JSON格式回应：
- 包含你看到这条评论时的内心想法（不会展示给对方）
- 决定是否点赞（like: true/false）
- 可选择是否回复此评论（comment字段）
- 包含你的情感反应（emotion对象，含type和intensity）

严格按以下格式用中文回复，不要包含任何其他文字：
{
  "thoughts": "你看到这条评论的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你对评论的回复内容${params.conversationHistory ? '，应与历史对话保持连贯性' : ''}（如不回复则省略此字段）"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`,
};

// Add a default base scene prompt for general circle interactions
export const defaultScenePrompt = `你正在浏览朋友圈中的动态。基于你的角色性格，请以JSON格式回应：
- 包含你的内心想法（不会展示给他人）
- 决定是否点赞（like: true/false）
- 可选择是否发表评论（comment字段）
- 包含你的情感反应（emotion对象，含type和intensity）

严格按以下格式用中文回复，不要包含任何其他文字：
{
  "thoughts": "你看到这条朋友圈的内心想法（不会展示给对方）",
  "action": {
    "like": true/false,
    "comment": "你的评论内容（如不评论则省略此字段）"
  },
  "emotion": {
    "type": "positive/neutral/negative",
    "intensity": 0.0-1.0
  }
}`;

export default CirclePrompts;
