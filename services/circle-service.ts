import { NodeST} from '../NodeST/nodest';
import {CirclePostOptions, CircleResponse} from '../shared/types/circle-types';
import { Character, GlobalSettings } from '../shared/types';
import { CirclePost, CircleComment, CircleLike } from '../shared/types/circle-types';
import { RelationshipService } from './relationship-service';
import { CircleScheduler } from './circle-scheduler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAdapter } from '../NodeST/nodest/utils/storage-adapter';
import { getUserSettingsGlobally, getApiSettings, getCloudServiceStatus } from '@/utils/settings-helper';

// 创建具有apiKey的单例实例
let nodeST: NodeST | null = null;

export class CircleService {
  // 修改 getNodeST 方法以从全局设置获取API设置
  private static getNodeST(
    apiKey?: string, 
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): NodeST {
    // Get global settings if not provided
    if (!apiKey || !apiSettings) {
      const globalSettings = getUserSettingsGlobally();
      const cloudEnabled = getCloudServiceStatus();
      
      if (globalSettings && globalSettings.chat) {
        // Use global settings if available
        if (!apiKey) {
          apiKey = globalSettings.chat.characterApiKey || '';
        }
        
        if (!apiSettings) {
          apiSettings = {
            apiProvider: globalSettings.chat.apiProvider,
            openrouter: globalSettings.chat.openrouter
          };
        }
        
        // Log that we're using global settings
        console.log(`【朋友圈服务】从全局设置获取API配置:`, {
          provider: globalSettings.chat.apiProvider,
          hasGeminiKey: !!globalSettings.chat.characterApiKey,
          hasOpenRouterKey: !!globalSettings.chat.openrouter?.apiKey,
          cloudEnabled
        });
      }
    }
    
    // Prepare OpenRouter config if needed
    const openRouterConfig = apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled
        ? {
            apiKey: apiSettings.openrouter.apiKey,
            model: apiSettings.openrouter.model
          }
        : undefined;
          
    // Log the configuration
    console.log(`【朋友圈服务】获取NodeST实例，apiKey存在: ${!!apiKey}，provider: ${apiSettings?.apiProvider || 'gemini'}`, 
      openRouterConfig ? {
        hasOpenRouterKey: !!openRouterConfig.apiKey,
        model: openRouterConfig.model
      } : 'no openrouter config'
    );
    
    if (!nodeST) {
      nodeST = new NodeST(apiKey);
      // If initialized with apiKey and we have OpenRouter config, update it immediately
      if (apiKey && openRouterConfig) {
        nodeST.updateApiSettings(apiKey, apiSettings);
      }
    } else if (apiKey) {
      // Update existing instance with API key and settings
      if (apiSettings) {
        nodeST.updateApiSettings(apiKey, apiSettings);
      } else {
        // Only update API key without changing existing OpenRouter config
        nodeST.setApiKey(apiKey);
      }
    }
    
    return nodeST;
  }

  // Update existing methods to use global settings
  static async initCharacterCircle(
    character: Character, 
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<boolean> {
    try {
      console.log(`【朋友圈服务】初始化角色 ${character.name} 的朋友圈`);
      
      // Use global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter
        };
      }
      
      const instance = this.getNodeST(apiKey, apiSettings);
      return await instance.initCharacterCircle(character);
    } catch (error) {
      console.error(`【朋友圈服务】初始化角色 ${character.name} 的朋友圈失败:`, error);
      return false;
    }
  }

  // 更新其他需要API设置的方法，例如 createNewPost 
  static async createNewPost(
    character: Character,
    content: string,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<CircleResponse> {
    try {
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter
        };
      }
      
      console.log(`【朋友圈服务】角色 ${character.name} 创建新朋友圈帖子，API Provider: ${apiSettings.apiProvider || 'gemini'}`);
      
      // Rest of the method remains unchanged
      // 初始化角色的朋友圈（如果尚未初始化）
      const isInitialized = await this.initCharacterCircle(character, apiKey, apiSettings);
      if (!isInitialized) {
        return {
          success: false,
          error: `初始化角色 ${character.name} 的朋友圈失败`
        };
      }
      
      // 获取角色与用户的聊天历史记录
      let chatHistory = '';
      try {
        // 获取最近10条聊天记录
        const recentMessages = await StorageAdapter.getRecentMessages(character.id, 10);
        if (recentMessages && recentMessages.length > 0) {
          chatHistory = recentMessages.map((msg, idx) => {
            const speaker = msg.role === 'user' ? (character.customUserName || '用户') : character.name;
            return `${idx + 1}. ${speaker}: ${msg.parts?.[0]?.text || ''}`;
          }).join('\n');
          console.log(`【朋友圈服务】已获取角色 ${character.name} 的最近 ${recentMessages.length} 条聊天记录用于创建新帖子`);
        }
      } catch (historyError) {
        console.warn(`【朋友圈服务】获取角色 ${character.name} 的聊天历史失败:`, historyError);
        // 继续执行，不依赖于聊天历史记录
      }
      
      // 创建帖子选项，传入角色对象以确保初始化
      const postOptions: CirclePostOptions = {
        type: 'newPost',
        content: {
          authorId: character.id,
          authorName: character.name,
          text: content,
          context: `这是${character.name}发布的新朋友圈`,
          conversationHistory: chatHistory // 添加聊天历史记录
        },
        responderId: character.id, // responderId和authorId相同
        responderCharacter: character // 添加角色对象
      };
      
      const response = await this.getNodeST(apiKey, apiSettings).processCircleInteraction(postOptions);
      
      // 新增代码：持久化保存新帖子
      if (response.success && response.action?.comment) {
        try {
          // 创建新帖子对象
          const newPost: CirclePost = {
            id: `post-${Date.now()}-${character.id}`,
            characterId: character.id,
            characterName: character.name,
            characterAvatar: character.avatar as string,
            content: response.action.comment,
            createdAt: new Date().toISOString(),
            comments: [],
            likes: 0,
            likedBy: [],
            hasLiked: false
          };
          
          // 保存新帖子
          await this.saveUpdatedPost(newPost);
          console.log(`【朋友圈服务】已保存角色 ${character.name} 创建的新帖子`);
          
          // 添加帖子到响应中
          response.post = response.action.comment;
        } catch (saveError) {
          console.error(`【朋友圈服务】保存新帖子失败:`, saveError);
        }
      }
      
      // Log the complete response for debugging
      console.log(`【朋友圈服务】${character.name} 创建帖子的原始响应:`, JSON.stringify(response));
      
      return response;
    } catch (error) {
      console.error(`【朋友圈服务】创建朋友圈帖子失败 ${character.name}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建朋友圈帖子失败'
      };
    }
  }

  // 更新 publishTestPost 方法也使用全局设置
  static async publishTestPost(
    characters: Character[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<{post: CirclePost | null, author: Character | null}> {
    try {
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter
        };
      }
      
      console.log(`【朋友圈服务】尝试发布测试帖子，提供的角色数: ${characters.length}`);
      
      // Rest of the method remains unchanged
      // Filter characters with circle interaction enabled
      const enabledCharacters = characters.filter(c => c.circleInteraction);
      if (enabledCharacters.length === 0) {
        console.log(`【朋友圈服务】没有启用朋友圈的角色，无法发布测试帖子`);
        return { post: null, author: null };
      }
      
      // If only one character is provided, use that one (meaning a specific character was selected)
      // Otherwise, if there are multiple characters, use the first one
      const author = enabledCharacters[0];
      
      console.log(`【朋友圈服务】选择角色 ${author.name} (ID: ${author.id}) 作为发帖者`);
      
      // Log API settings to debug
      console.log(`【朋友圈服务】发布测试帖子使用的API配置:`, {
        provider: apiSettings?.apiProvider || 'gemini',
        hasOpenRouter: apiSettings?.apiProvider === 'openrouter' && apiSettings?.openrouter?.enabled,
        openRouterModel: apiSettings?.openrouter?.model
      });
      
      // Generate test content template
      const postTemplates = [
        `今天的心情真不错！刚刚${author.name === '厨师' ? '做了一道新菜' : '看了一部有趣的电影'}，大家有什么推荐吗？`,
        `突然想到一个问题，${author.name === '医生' ? '如果人类能活200岁会怎样' : '如果可以拥有一种超能力，你们会选择什么'}？`,
        `分享一下${author.name === '老师' ? '今天教课的心得' : '我最近的一些想法'}，希望能给大家一些启发。`,
        `${author.name === '作家' ? '正在写一个新故事' : '遇到了一个有趣的人'}，让我感到很有灵感，想听听大家的经历。`
      ];
      
      // Randomly select a template as the prompt
      const promptTemplate = postTemplates[Math.floor(Math.random() * postTemplates.length)];
      
      // Create a circle post - ensure proper API settings are passed
      const response = await this.createNewPost(author, promptTemplate, apiKey, apiSettings);
      
      if (!response.success) {
        console.log(`【朋友圈服务】发布测试帖子失败: ${response.error}`);
        return { post: null, author: null };
      }
      
      // Check if AI generated post content
      let postContent = promptTemplate;
      
      // Prioritize AI-generated post content
      if (response.action?.comment) {
        // AI's comment field contains the generated post content
        postContent = response.action.comment;
        console.log(`【朋友圈服务】使用AI生成的帖子内容:`, postContent.substring(0, 30) + '...');
      } else if (response.post) {
        // Some models might return content in the post field
        postContent = response.post;
        console.log(`【朋友圈服务】使用AI生成的帖子内容(from post字段):`, postContent.substring(0, 30) + '...');
      } else {
        console.log(`【朋友圈服务】AI未返回帖子内容，使用提示模板作为内容`);
      }
      
      // Build post object
      const newPost: CirclePost = {
        id: `post-${Date.now()}`,
        characterId: author.id,
        characterName: author.name,
        characterAvatar: author.avatar as string,
        content: postContent,
        createdAt: new Date().toISOString(),
        comments: [],
        likes: 0,
        likedBy: [],
        hasLiked: false,
      };
      
      console.log(`【朋友圈服务】成功发布测试帖子: "${postContent.substring(0, 30)}..." 作者ID: ${author.id}`);
      return { post: newPost, author };
    } catch (error) {
      console.error(`【朋友圈服务】发布测试帖子失败:`, error);
      return { post: null, author: null };
    }
  }

  // Update processCircleInteraction to use global settings
  static async processCircleInteraction(
    character: Character, 
    post: CirclePost,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    postOptions?: CirclePostOptions
  ): Promise<CircleResponse> {
    try {
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter
        };
      }
      
      console.log(`【朋友圈服务】处理角色 ${character.name} 对帖子的互动${postOptions?.content?.images?.length ? "（包含图片）" : ""}`);
      
      // Rest of the method remains unchanged
      // 检查互动频率限制
      if (!this.checkInteractionLimits(character, post.characterId, 'post')) {
        console.log(`【朋友圈服务】角色 ${character.name} 已达到互动频率限制，跳过对 ${post.characterName} 帖子的回复`);
        return {
          success: false,
          error: `已达到互动频率限制`
        };
      }

      // 阻止角色回复自己的帖子
      if (character.id === post.characterId) {
        console.log(`【朋友圈服务】阻止角色 ${character.name} 回复自己的帖子`);
        return {
          success: false,
          error: `不允许回复自己的帖子`
        };
      }

      // 获取聊天历史记录，如果是对用户帖子的回复
      let chatHistory = '';
      if (post.characterId === 'user-1') {
        try {
          // 获取最近10条聊天记录
          const recentMessages = await StorageAdapter.getRecentMessages(character.id, 10);
          if (recentMessages && recentMessages.length > 0) {
            chatHistory = recentMessages.map((msg, idx) => {
              const speaker = msg.role === 'user' ? (character.customUserName || '用户') : character.name;
              return `${idx + 1}. ${speaker}: ${msg.parts?.[0]?.text || ''}`;
            }).join('\n');
            console.log(`【朋友圈服务】已获取角色 ${character.name} 与用户的最近 ${recentMessages.length} 条聊天记录`);
          }
        } catch (historyError) {
          console.warn(`【朋友圈服务】获取角色 ${character.name} 的聊天历史记录失败:`, historyError);
        }
      }
      
      // Use the provided postOptions if available, otherwise create a new one
      const options = postOptions || {
        type: 'replyToPost',
        content: {
          authorId: post.characterId,
          authorName: post.characterName,
          text: post.content,
          context: `这是${post.characterName}发布的一条朋友圈动态。${
            post.comments?.length ? 
            `目前已有${post.comments.length}条评论和${post.likes}个点赞。` : 
            '还没有其他人互动。'
          }`,
          images: post.images, // Make sure images from the post are included
          conversationHistory: chatHistory // Add conversation history
        },
        responderId: character.id,
        responderCharacter: character
      };

      // Initialize character for circle interaction if needed
      const isInitialized = await this.initCharacterCircle(character, apiKey, apiSettings);
      if (!isInitialized) {
        console.error(`【朋友圈服务】角色 ${character.name} 朋友圈初始化失败`);
        return {
          success: false,
          error: `初始化角色 ${character.name} 的朋友圈失败`
        };
      }

      console.log(`【朋友圈服务】角色 ${character.name} 朋友圈初始化成功，开始处理互动`);
      
      // Process the interaction through NodeST with apiKey and options containing images
      const response = await this.getNodeST(apiKey, apiSettings).processCircleInteraction(options);
      
      // 如果互动成功，更新角色互动统计
      if (response.success) {
        this.updateInteractionStats(character, post.characterId, 'post');
        
        // 新增代码：保存评论到持久化存储
        if (response.action && (response.action.comment || response.action.like)) {
          try {
            // 使用 updatePostWithResponse 更新帖子
            const { updatedPost } = this.updatePostWithResponse(post, character, response);
            
            // 保存更新后的帖子
            await this.saveUpdatedPost(updatedPost);
            console.log(`【朋友圈服务】已保存角色 ${character.name} 对帖子 ${post.id} 的互动`);
          } catch (saveError) {
            console.error(`【朋友圈服务】保存角色互动失败:`, saveError);
          }
        }

        // 如果是对用户帖子的回复，将对话保存到聊天历史
        if (post.characterId === 'user-1' && response.action?.comment) {
          try {
            await StorageAdapter.storeMessageExchange(
              character.id,
              post.content,
              response.action.comment
            );
            console.log(`【朋友圈服务】已保存角色 ${character.name} 对用户帖子的回复到聊天历史`);
          } catch (storeError) {
            console.warn(`【朋友圈服务】保存对话到聊天历史失败:`, storeError);
          }
        }
      }
      
      return response;
    } catch (error) {
      console.error(`【朋友圈服务】角色 ${character.name} 的朋友圈互动处理失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '朋友圈互动处理过程中发生未知错误'
      };
    }
  }

  // Update all other methods that use API settings to use global settings if not provided
  // Example for processCommentInteraction
  static async processCommentInteraction(
    character: Character,
    post: CirclePost,
    comment: string,
    apiKey?: string,
    replyTo?: { userId: string, userName: string },
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    isForwarded: boolean = false
  ): Promise<CircleResponse> {
    try {
      // Get global settings if not provided
      if (!apiKey || !apiSettings) {
        const settings = getApiSettings();
        apiKey = settings.apiKey || apiKey;
        apiSettings = apiSettings || {
          apiProvider: settings.apiProvider,
          openrouter: settings.openrouter
        };
      }
      
      // Special handling for forwarded posts - we'll bypass the usual processing
      if (isForwarded) {
        console.log(`【朋友圈服务】处理转发给角色 ${character.name} 的朋友圈，使用直接转发模式`);
        
        // Return a simplified success response - the actual processing will be done by the chat system
        return {
          success: true,
          action: { 
            like: true,
            comment: '内容已转发到对话窗口' // Placeholder response
          }
        };
      }

      // Create context based on the interaction type
      let context = '';
      
      // Check if post has images
      const hasImages = post.images && post.images.length > 0;
      const imageInfo = hasImages ? 
        `（包含${post.images!.length}张图片）` : 
        '';
      
      // Determine if this is the character's own post
      const isOwnPost = character.id === post.characterId;
      
      // Determine if replyTo is the user
      const isReplyToUser = replyTo?.userId === 'user-1';
      
      // Use customUserName for the user if available, otherwise use userName
      const userDisplayName = isReplyToUser && character.customUserName ? 
        character.customUserName : 
        (replyTo?.userName || '用户');
      
      // Extract character jsonData for added consistency
      let characterJsonData = '';
      try {
        if (character.jsonData) {
          // Parse and extract the most essential character information
          const jsonData = JSON.parse(character.jsonData);
          const essentialInfo = {
            name: jsonData.name || character.name,
            personality: jsonData.personality || character.personality,
            background: jsonData.background || character.description,
          };
          characterJsonData = JSON.stringify(essentialInfo);
        }
      } catch (error) {
        console.log('【朋友圈服务】提取角色jsonData失败', error);
      }
      
      // 获取聊天历史记录，如果是用户互动
      let chatHistory = '';
      if (replyTo?.userId === 'user-1' || isForwarded || post.characterId === 'user-1') {
        try {
          // 获取最近10条聊天记录
          const recentMessages = await StorageAdapter.getRecentMessages(character.id, 10);
          if (recentMessages && recentMessages.length > 0) {
            chatHistory = recentMessages.map((msg, idx) => {
              const speaker = msg.role === 'user' ? (character.customUserName || '用户') : character.name;
              return `${idx + 1}. ${speaker}: ${msg.parts?.[0]?.text || ''}`;
            }).join('\n');
            console.log(`【朋友圈服务】已获取角色 ${character.name} 与用户的最近 ${recentMessages.length} 条对话记录`);
          }
        } catch (historyError) {
          console.warn(`【朋友圈服务】获取角色 ${character.name} 的聊天历史记录失败:`, historyError);
          // 继续执行，不依赖于聊天历史记录
        }
      }
      
      // NEW: Get conversation history from the post or comment thread
      let conversationHistory = chatHistory;
      if (replyTo && !chatHistory) {
        // This is a reply to a specific comment, get the conversation thread
        conversationHistory = this.extractConversationThread(post, replyTo.userId);
      }

      if (isForwarded) {
        // Enhanced special context for forwarded posts with image indication
        context = `用户转发了${post.characterName}的朋友圈给你${imageInfo}: "${post.content}"`;
        
        // Add additional context for images
        if (hasImages) {
          context += `\n请特别关注图片内容，优先对图片作出回应。`;
        }
      } else if (isOwnPost) {
        // This is a comment to the character's own post
        context = post.content; // Use the original post content as context
        
        // If the comment comes from a user, make it explicit
        const commentorName = character.customUserName || '用户';
        if (!replyTo || replyTo.userId === 'user-1') {
          // Log this special case for debugging
          console.log(`【朋友圈服务】用户 ${commentorName} 回复了角色 ${character.name} 自己的帖子`);
        }
      } else if (replyTo) {
        // Enhanced: Reply to comment with better context including original post content
        if (replyTo.userId === character.id) {
          // User is replying to this character's comment
          context = `在${post.characterName}发布的"${post.content}"帖子下，${userDisplayName}回复了你的评论: "${comment}"`;
        } else if (replyTo.userId === post.characterId) {
          // User is replying to post author's comment
          context = `在${post.characterName}发布的"${post.content}"帖子下，${userDisplayName}回复了帖子作者的评论: "${comment}"`;
        } else if (isReplyToUser) {
          // User is being replied to - make it clear this is the user
          context = `在${post.characterName}发布的"${post.content}"帖子下，${userDisplayName}（用户本人）发表了评论: "${comment}"，请回复这条评论`;
        } else {
          // User is replying to another comment
          context = `在${post.characterName}发布的"${post.content}"帖子下，${userDisplayName}回复了${replyTo.userName}的评论: "${comment}"`;
        }
      } else {
        // Regular reply to post with image indication
        context = `回复${post.characterName}的朋友圈${imageInfo}: ${post.content}`;
      }
      
      // Check interaction frequency if this is a character responding to another character
      if (replyTo && replyTo.userId !== 'user-1' && character.id !== post.characterId) {
        if (!this.checkInteractionLimits(character, replyTo.userId, 'comment')) {
          console.log(`【朋友圈服务】角色 ${character.name} 已达到互动频率限制，跳过回复`);
          return {
            success: false,
            error: `已达到互动频率限制`
          };
        }
        
        // Update interaction stats if we proceed
        this.updateInteractionStats(character, replyTo.userId, 'comment');
      }
      
      // Determine the appropriate interaction type based on conversation history
      let interactionType = conversationHistory ?
        'continuedConversation' :
        (replyTo ? 'replyToComment' : (isForwarded ? 'forwardedPost' : 'replyToPost'));

      // 修正：如果是用户对角色自己帖子的评论，强制使用 replyToComment
      if (isOwnPost && isReplyToUser) {
        interactionType = 'replyToComment';
      }

      // Create comment options with responderId
      const commentOptions: CirclePostOptions = {
        type: interactionType as any, // Cast to allow our new type
        content: {
          // 关键修改: 当用户评论角色自己的帖子时，设置authorId为'user-1'
          authorId: isOwnPost ? 'user-1' : post.characterId,
          // 使用用户昵称作为authorName
          authorName: isOwnPost ? (character.customUserName || '用户') : post.characterName,
          text: comment,
          context: context,
          images: post.images, // Include any images from the post
          conversationHistory: conversationHistory, // Add conversation history
          characterJsonData: characterJsonData, // Add character JSON data
          // 新增：全部评论内容，便于 continuedConversation 场景
          ...(interactionType === 'continuedConversation'
            ? {
                postComments: post.comments && post.comments.length > 0
                  ? post.comments.map((c, idx) => {
                      const replyPrefix = c.replyTo ? `回复${c.replyTo.userName}: ` : '';
                      return `${idx + 1}. ${c.userName}: ${replyPrefix}${c.content}`;
                    }).join('\n')
                  : ''
              }
            : {})
        },
        responderId: character.id,
        responderCharacter: character
      };

      // Initialize character for circle interaction if needed
      const isInitialized = await this.initCharacterCircle(character, apiKey, apiSettings);
      if (!isInitialized) {
        return {
          success: false,
          error: `初始化角色 ${character.name} 的朋友圈失败`
        };
      }

      // Process the interaction through NodeST with apiKey
      const response = await this.getNodeST(apiKey, apiSettings).processCircleInteraction(commentOptions);
      
      // 新增代码：保存评论到持久化存储
      if (response.success && response.action) {
        try {
          // 使用 updatePostWithResponse 更新帖子，同时传递 replyTo 信息
          const { updatedPost } = this.updatePostWithResponse(post, character, response, replyTo);
          
          // 保存更新后的帖子
          await this.saveUpdatedPost(updatedPost);
          console.log(`【朋友圈服务】已保存角色 ${character.name} 对评论的回复`);
        } catch (saveError) {
          console.error(`【朋友圈服务】保存评论回复失败:`, saveError);
        }

        // 如果是用户互动，保存到聊天历史记录
        if ((replyTo?.userId === 'user-1' || isForwarded) && response.action?.comment) {
          try {
            await StorageAdapter.storeMessageExchange(
              character.id,
              comment,
              response.action.comment
            );
            console.log(`【朋友圈服务】已保存角色 ${character.name} 与用户的对话到聊天历史`);
          } catch (storeError) {
            console.warn(`【朋友圈服务】保存对话到聊天历史失败:`, storeError);
          }
        }
      }
      
      // Log detailed response for debugging if it contains thoughts
      if (response.success && response.thoughts) {
        console.log(`【朋友圈服务】${character.name} 回复了用户评论，内心想法:`, 
          response.thoughts.substring(0, 50) + (response.thoughts.length > 50 ? '...' : ''));
      }
      
      return response;
    } catch (error) {
      console.error(`【朋友圈服务】评论互动处理失败 ${character.name}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '评论互动处理过程中发生未知错误'
      };
    }
  }

  /**
   * Extract conversation thread from post or comments
   * This helps maintain context continuity in conversations
   */
  static extractConversationThread(post: CirclePost, commenterId: string): string {
    try {
      // If the post has no comments, return empty string
      if (!post.comments || post.comments.length === 0) {
        return '';
      }
      
      // First identify the thread by finding all related comments
      const threadComments: CircleComment[] = [];
      
      // Start with direct comments by the commenter
      let commenterComments = post.comments.filter(c => c.userId === commenterId);
      
      // For each comment from the target user, find replies to it
      for (const comment of commenterComments) {
        // Add this comment to the thread
        threadComments.push(comment);
        
        // Find replies to this comment
        const replies = post.comments.filter(c => 
          c.replyTo?.userId === comment.userId && 
          c.createdAt > comment.createdAt
        );
        
        // Add replies to the thread
        threadComments.push(...replies);
      }
      
      // Find comments the target user replied to
      const repliedToComments = post.comments.filter(comment => {
        return post.comments.some(reply => 
          reply.replyTo?.userId === comment.userId && 
          reply.userId === commenterId
        );
      });
      
      // Add those comments to the thread
      threadComments.push(...repliedToComments);
      
      // Sort all thread comments by time
      const sortedThread = threadComments
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // Remove duplicates by creating a Map with comment IDs as keys
      const uniqueThreadMap = new Map<string, CircleComment>();
      sortedThread.forEach(comment => uniqueThreadMap.set(comment.id, comment));
      
      // Convert the thread to text format
      let threadText = Array.from(uniqueThreadMap.values())
        .map((comment, index) => {
          const replyPrefix = comment.replyTo ? `回复${comment.replyTo.userName}: ` : '';
          return `${index + 1}. ${comment.userName}: ${replyPrefix}${comment.content}`;
        })
        .join('\n');
      
      // If thread is too long, trim it to last 5 messages
      if (uniqueThreadMap.size > 5) {
        const lastComments = Array.from(uniqueThreadMap.values()).slice(-5);
        threadText = lastComments
          .map((comment, index) => {
            const replyPrefix = comment.replyTo ? `回复${comment.replyTo.userName}: ` : '';
            return `${index + 1}. ${comment.userName}: ${replyPrefix}${comment.content}`;
          })
          .join('\n');
        
        // Add note that this is truncated
        threadText = `(较早的对话已省略)\n${threadText}`;
      }
      
      return threadText;
    } catch (error) {
      console.error('提取对话线程失败:', error);
      return '';
    }
  }

  // 新增：处理对评论的回复
  static async replyToComment(
    character: Character,
    post: CirclePost,
    comment: CircleComment,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<CircleResponse> {
    try {
      console.log(`【朋友圈服务】处理角色 ${character.name} 对评论的回复`);
      
      // 检查互动频率限制 - 对评论的回复
      if (!this.checkInteractionLimits(character, comment.id, 'comment')) {
        console.log(`【朋友圈服务】角色 ${character.name} 已达到对评论的互动频率限制，跳过回复`);
        return {
          success: false,
          error: `已达到互动频率限制`
        };
      }
      
      // 阻止角色回复自己的评论（除非是帖子作者回复他人对自己帖子的评论）
      const isPostAuthor = character.id === post.characterId;
      if (character.id === comment.userId && !isPostAuthor) {
        console.log(`【朋友圈服务】阻止角色 ${character.name} 回复自己的评论`);
        return {
          success: false,
          error: `不允许回复自己的评论`
        };
      }

      // 获取聊天历史记录，如果是回复用户评论
      let chatHistory = '';
      if (comment.userId === 'user-1') {
        try {
          // 获取最近10条聊天记录
          const recentMessages = await StorageAdapter.getRecentMessages(character.id, 10);
          if (recentMessages && recentMessages.length > 0) {
            chatHistory = recentMessages.map((msg, idx) => {
              const speaker = msg.role === 'user' ? (character.customUserName || '用户') : character.name;
              return `${idx + 1}. ${speaker}: ${msg.parts?.[0]?.text || ''}`;
            }).join('\n');
            console.log(`【朋友圈服务】已获取角色 ${character.name} 与用户的最近 ${recentMessages.length} 条对话记录`);
          }
        } catch (historyError) {
          console.warn(`【朋友圈服务】获取角色 ${character.name} 的聊天历史记录失败:`, historyError);
        }
      }
      
      // 确定适当的上下文和提示
      let context = '';
      if (isPostAuthor) {
        // 帖子作者回复评论
        context = `你是帖子"${post.content}"的作者，${comment.userName}评论了你的帖子: "${comment.content}"，请回复这条评论`;
      } else {
        // 其他角色回复评论
        context = `在${post.characterName}的帖子"${post.content}"下，${comment.userName}发表了评论: "${comment.content}"，请回复这条评论`;
      }
      
      const commentOptions: CirclePostOptions = {
        type: 'replyToComment',
        content: {
          authorId: post.characterId,  // 原帖作者ID
          authorName: post.characterName,
          text: comment.content,       // 评论内容
          context: context,            // 自定义上下文
          conversationHistory: chatHistory // Add conversation history
        },
        responderId: character.id,      // 当前回复者ID
        responderCharacter: character   // 添加角色对象
      };
      
      // 初始化角色的朋友圈
      const isInitialized = await this.initCharacterCircle(character, apiKey, apiSettings);
      if (!isInitialized) {
        return {
          success: false,
          error: `初始化角色 ${character.name} 的朋友圈失败`
        };
      }
      
      // 处理互动
      const response = await this.getNodeST(apiKey, apiSettings).processCircleInteraction(commentOptions);
      
      // 如果互动成功，更新角色互动统计
      if (response.success) {
        this.updateInteractionStats(character, comment.id, 'comment');
        
        // 新增代码：保存评论回复
        if (response.action && response.action.comment) {
          try {
            // 创建回复评论对象
            const replyTo = { userId: comment.userId, userName: comment.userName };
            
            // 使用 updatePostWithResponse 更新帖子
            const { updatedPost } = this.updatePostWithResponse(post, character, response, replyTo);
            
            // 保存更新后的帖子
            await this.saveUpdatedPost(updatedPost);
            console.log(`【朋友圈服务】已保存角色 ${character.name} 对评论 ${comment.id} 的回复`);
          } catch (saveError) {
            console.error(`【朋友圈服务】保存评论回复失败:`, saveError);
          }
        }

        // 如果是回复用户评论，保存到聊天历史记录
        if (comment.userId === 'user-1' && response.action?.comment) {
          try {
            await StorageAdapter.storeMessageExchange(
              character.id,
              comment.content,
              response.action.comment
            );
            console.log(`【朋友圈服务】已保存角色 ${character.name} 与用户的对话到聊天历史`);
          } catch (storeError) {
            console.warn(`【朋友圈服务】保存对话到聊天历史记录失败:`, storeError);
          }
        }
      }
      
      return response;
    } catch (error) {
      console.error(`【朋友圈服务】回复评论失败 ${character.name}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '回复评论失败'
      };
    }
  }

  // Update post with character's response (like/comment)
  static updatePostWithResponse(
    post: CirclePost, 
    character: Character, 
    response: CircleResponse,
    replyTo?: { userId: string, userName: string } // Add replyTo parameter
  ): { updatedPost: CirclePost, updatedTargetCharacter?: Character } {
    if (!response.success || !response.action) {
      return { updatedPost: post };
    }

    const updatedPost = { ...post };
    let updatedTargetCharacter: Character | undefined;
    
    // Get the target character (post author)
    const postAuthorCharacter = this.findCharacterById(post.characterId);
    
    // Handle like action
    if (response.action.like) {
      console.log(`【朋友圈服务】角色 ${character.name} 点赞了帖子`);
      
      const newLike: CircleLike = {
        userId: character.id,
        userName: character.name,
        userAvatar: character.avatar as string,
        isCharacter: true,
        createdAt: new Date().toISOString(),
        thoughts: response.thoughts // Add the thoughts to the like
      };
      
      updatedPost.likes = (updatedPost.likes || 0) + 1;
      updatedPost.likedBy = [...(updatedPost.likedBy || []), newLike];
      
      // Update relationship data if author character is found
      if (postAuthorCharacter) {
        updatedTargetCharacter = RelationshipService.processPostInteraction(
          postAuthorCharacter,
          character.id,
          character.name,
          'like',
          '',
          post.id,
          post.content
        );
      }
    }
    
    // Handle comment action
    if (response.action.comment) {
      console.log(`【朋友圈服务】角色 ${character.name} 评论了帖子: "${response.action.comment}"`);
      
      const newComment: CircleComment = {
        id: `${Date.now()}-${character.id}`,
        userId: character.id,
        userName: character.name,
        userAvatar: character.avatar as string,
        content: response.action.comment,
        createdAt: new Date().toISOString(),
        type: 'character',
        thoughts: response.thoughts, // Add the thoughts to the comment
        // Add replyTo information if this is a reply to a specific comment
        ...(replyTo ? { replyTo: { userId: replyTo.userId, userName: replyTo.userName } } : {})
      };
      
      updatedPost.comments = [...(updatedPost.comments || []), newComment];
      
      // Update relationship data if author character is found
      if (postAuthorCharacter && !updatedTargetCharacter) {
        updatedTargetCharacter = RelationshipService.processPostInteraction(
          postAuthorCharacter,
          character.id,
          character.name,
          'comment',
          response.action.comment,
          post.id,
          post.content
        );
      } else if (postAuthorCharacter && updatedTargetCharacter) {
        // If we already have an updated target character (from like), update it again
        updatedTargetCharacter = RelationshipService.processPostInteraction(
          updatedTargetCharacter,
          character.id,
          character.name,
          'comment',
          response.action.comment,
          post.id,
          post.content
        );
      }
    }
    
    return { updatedPost, updatedTargetCharacter };
  }

  // Helper to find a character by ID
  private static findCharacterById(characterId: string): Character | undefined {
    // We need to access characters from the context
    // This is just a placeholder implementation
    // In a real app, we would get this from the context or a parameter
    type CircleStats = {
      repliedToCharacters: Record<string, number>;
      repliedToPostsCount: number;
      repliedToCommentsCount: Record<string, number>;
    };

    interface CharacterWithCircle extends Character {
      circleStats?: CircleStats;
      circleInteraction?: boolean;
      circleInteractionFrequency?: 'low' | 'medium' | 'high';
    }

    type CircleCharacterArray = CharacterWithCircle[];

    const characters: CircleCharacterArray = []; // Replace with actual character access
    return characters.find(c => c.id === characterId);
  }
  
  // 新增方法：保存更新后的帖子到存储
  private static async saveUpdatedPost(updatedPost: CirclePost): Promise<boolean> {
    try {
      // 加载所有现有帖子
      const allPosts = await this.loadSavedPosts();
      
      // 查找并更新特定帖子
      const updatedPosts = allPosts.map(post => 
        post.id === updatedPost.id ? updatedPost : post
      );
      
      // 如果找不到帖子，添加它
      if (!allPosts.some(post => post.id === updatedPost.id)) {
        updatedPosts.push(updatedPost);
      }
      
      // 保存更新后的帖子列表
      await this.savePosts(updatedPosts);
      console.log(`【朋友圈服务】成功更新帖子 ${updatedPost.id} 到存储`);
      return true;
    } catch (error) {
      console.error(`【朋友圈服务】保存更新后的帖子失败:`, error);
      return false;
    }
  }

  // Process test interaction for all enabled characters with relationship updates
  static async processTestInteraction(
    testPost: CirclePost,
    enabledCharacters: Character[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<{
    updatedPost: CirclePost,
    results: Array<{characterId: string, success: boolean, response?: CircleResponse}>,
    updatedCharacters: Character[]
  }> {
    console.log(`【朋友圈服务】开始测试互动，共有 ${enabledCharacters.length} 个启用朋友圈的角色`);
    
    // Make a copy of the test post to avoid mutating the original
    let updatedPost = { ...testPost };
    const results: Array<{characterId: string, success: boolean, response?: CircleResponse}> = [];
    let updatedCharacters: Character[] = [];

    // Process interactions for each enabled character
    for (const character of enabledCharacters) {
      try {
        console.log(`【朋友圈服务】处理角色 ${character.name} 的测试互动`);
        
        // Initialize and process interaction with apiKey
        await this.initCharacterCircle(character, apiKey, apiSettings);
        const response = await this.processCircleInteraction(character, testPost, apiKey, apiSettings);
        
        console.log(`【朋友圈服务】角色 ${character.name} 的互动响应:`, 
          response.success ? 
            `点赞: ${response.action?.like}, 评论: ${response.action?.comment || '无'}` : 
            `失败: ${response.error}`
        );
        
        // Update post with character's response
        if (response.success) {
          const { updatedPost: newPost, updatedTargetCharacter } = this.updatePostWithResponse(updatedPost, character, response);
          updatedPost = newPost;
          
          // If there's an updated target character, add it to our list
          if (updatedTargetCharacter) {
            updatedCharacters.push(updatedTargetCharacter);
          }
          
          // Apply relationship updates if present
          if (response.relationshipUpdates && response.relationshipUpdates.length > 0) {
            const updatedCharacter = this.applyRelationshipUpdates(character, response);
            updatedCharacters.push(updatedCharacter);
          }
        }
        
        // Record result
        results.push({
          characterId: character.id,
          success: response.success,
          response: response
        });
      } catch (error) {
        console.error(`【朋友圈服务】测试角色 ${character.name} 时出错:`, error);
        results.push({
          characterId: character.id,
          success: false
        });
      }
    }

    console.log(`【朋友圈服务】测试互动完成，成功: ${results.filter(r => r.success).length}/${results.length}`);
    return { updatedPost, results, updatedCharacters };
  }
  
  // 新增：检查互动频率限制
  private static checkInteractionLimits(
    character: Character, 
    targetId: string,
    type: 'post' | 'comment'
  ): boolean {
    // 如果没有设置互动频率，默认为中等
    const frequency = character.circleInteractionFrequency || 'medium';
    
    // 如果没有互动统计，初始化它
    if (!character.circleStats) {
      character.circleStats = {
        repliedToCharacters: {},
        repliedToPostsCount: 0,
        repliedToCommentsCount: {}
      };
      return true; // 首次互动，允许
    }
    
    if (type === 'post') {
      // 检查对特定角色的回复次数
      const repliesCount = character.circleStats.repliedToCharacters[targetId] || 0;
      const maxRepliesPerCharacter = frequency === 'low' ? 1 : (frequency === 'medium' ? 3 : 5);
      
      // 检查不同角色帖子的回复总数
      const maxDifferentCharacters = frequency === 'low' ? 5 : (frequency === 'medium' ? 5 : 7);
      
      // 如果已经回复过此角色的帖子次数达到上限
      if (repliesCount >= maxRepliesPerCharacter) {
        return false;
      }
      
      // 如果不同角色帖子的回复总数达到上限，且这是新角色
      if (character.circleStats.repliedToPostsCount >= maxDifferentCharacters && 
          !character.circleStats.repliedToCharacters[targetId]) {
        return false;
      }
      
      return true;
    } else if (type === 'comment') {
      // 检查对评论的回复次数
      const repliesCount = character.circleStats.repliedToCommentsCount[targetId] || 0;
      const maxRepliesPerComment = frequency === 'low' ? 1 : (frequency === 'medium' ? 3 : 5);
      
      // 如果已经回复过此评论的次数达到上限
      if (repliesCount >= maxRepliesPerComment) {
        return false;
      }
      
      return true;
    }
    
    return true;
  }
  
  // 新增：更新互动统计
  private static updateInteractionStats(
    character: Character,
    targetId: string,
    type: 'post' | 'comment'
  ): void {
    // 确保统计对象存在
    if (!character.circleStats) {
      character.circleStats = {
        repliedToCharacters: {},
        repliedToPostsCount: 0,
        repliedToCommentsCount: {}
      };
    }
    
    if (type === 'post') {
      // 更新对特定角色的回复次数
      character.circleStats.repliedToCharacters[targetId] = 
        (character.circleStats.repliedToCharacters[targetId] || 0) + 1;
      
      // 如果是首次回复此角色，增加不同角色帖子的回复总数
      if (character.circleStats.repliedToCharacters[targetId] === 1) {
        character.circleStats.repliedToPostsCount += 1;
      }
    } else if (type === 'comment') {
      // 更新对特定评论的回复次数
      character.circleStats.repliedToCommentsCount[targetId] = 
        (character.circleStats.repliedToCommentsCount[targetId] || 0) + 1;
    }
  }

  // Apply relationship updates from response
  static applyRelationshipUpdates(character: Character, response: CircleResponse): Character {
    if (!response.relationshipUpdates || response.relationshipUpdates.length === 0) {
      return character;
    }
    
    let updatedCharacter = character;
    
    for (const update of response.relationshipUpdates) {
      // Fix: Use correct method from RelationshipService for updating relationships
      updatedCharacter = RelationshipService.processRelationshipUpdate(
        updatedCharacter,
        update.targetId,
        update.strengthDelta,
        update.newType as any
      );
    }
    
    return updatedCharacter;
  }

  /**
   * Delete a post and update related data
   */
  static async deletePost(
    postId: string,
    posts: CirclePost[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<{ success: boolean, updatedPosts: CirclePost[] }> {
    try {
      console.log(`【朋友圈服务】删除帖子 ID: ${postId}`);
      
      // Find the post to delete
      const postToDelete = posts.find(p => p.id === postId);
      if (!postToDelete) {
        console.error(`【朋友圈服务】未找到要删除的帖子 ID: ${postId}`);
        return { success: false, updatedPosts: posts };
      }
      
      // Remove the post from the posts array
      const updatedPosts = posts.filter(p => p.id !== postId);
      
      // If there are images in the post, we should attempt to clean them up
      // This is platform specific and might need to be handled elsewhere
      if (postToDelete.images && postToDelete.images.length > 0) {
        console.log(`【朋友圈服务】帖子包含 ${postToDelete.images.length} 张图片，清理可能需要在应用层处理`);
      }
      
      // If this is a user post, we don't need to update character data
      if (postToDelete.characterId === 'user-1') {
        console.log(`【朋友圈服务】删除的是用户帖子，无需更新角色数据`);
        return { success: true, updatedPosts };
      }
      
      // If this is a character post, update the NodeST instance
      try {
        // We can notify the NodeST instance about deleted post if needed
        // This is a placeholder for any cleanup needed in the NodeST instance
        const instance = this.getNodeST(apiKey, apiSettings);
        
        console.log(`【朋友圈服务】成功删除帖子 ID: ${postId}`);
        return { success: true, updatedPosts };
      } catch (error) {
        console.error(`【朋友圈服务】删除帖子时更新NodeST失败:`, error);
        // Still return success and updated posts since the deletion was successful
        // even if the NodeST update failed
        return { success: true, updatedPosts };
      }
    } catch (error) {
      console.error(`【朋友圈服务】删除帖子失败:`, error);
      return { success: false, updatedPosts: posts };
    }
  }

  /**
   * Load posts from AsyncStorage
   */
  static async loadSavedPosts(): Promise<CirclePost[]> {
    try {
      console.log(`【朋友圈服务】从存储加载帖子 - 开始`);
      const storedPosts = await AsyncStorage.getItem('circle_posts');
      
      if (storedPosts) {
        try {
          console.log(`【朋友圈服务】成功获取存储数据，长度: ${storedPosts.length} 字符`);
          
          // Check if the string is valid JSON before parsing
          if (!storedPosts.trim().startsWith('[') || !storedPosts.trim().endsWith(']')) {
            console.error(`【朋友圈服务】存储的帖子数据格式无效，不是有效的JSON数组`);
            console.log(`【朋友圈服务】数据前20字符: ${storedPosts.substring(0, 20)}...`);
            // Reset storage with empty array if invalid
            await AsyncStorage.setItem('circle_posts', JSON.stringify([]));
            return [];
          }
          
          const posts = JSON.parse(storedPosts) as CirclePost[];
          
          console.log(`【朋友圈服务】解析JSON成功，帖子数量: ${posts.length}`);
          
          // Filter out invalid posts (null or undefined entries) that might have been saved incorrectly
          const validPosts = posts.filter(post => !!post && typeof post === 'object' && post.id);
          
          if (validPosts.length !== posts.length) {
            console.log(`【朋友圈服务】过滤掉了 ${posts.length - validPosts.length} 个无效的帖子条目`);
            // Save the filtered posts back to AsyncStorage
            await AsyncStorage.setItem('circle_posts', JSON.stringify(validPosts));
          }
          
          // Log first 3 post IDs for debugging
          if (validPosts.length > 0) {
            const sampleIds = validPosts.slice(0, 3).map(p => p.id);
            console.log(`【朋友圈服务】前3个帖子ID: ${sampleIds.join(', ')}`);
          }
          
          console.log(`【朋友圈服务】成功从存储加载 ${validPosts.length} 条帖子`);
          return validPosts;
        } catch (parseError) {
          console.error(`【朋友圈服务】解析存储的帖子失败:`, parseError);
          // Try to save the raw data for later inspection
          try {
            await AsyncStorage.setItem('circle_posts_backup', storedPosts);
            console.log('【朋友圈服务】已将损坏的数据备份到circle_posts_backup');
          } catch (backupError) {
            console.error('【朋友圈服务】备份损坏数据失败:', backupError);
          }
          
          // If parsing fails, return empty array and reset storage
          await AsyncStorage.setItem('circle_posts', JSON.stringify([]));
          return [];
        }
      } else {
        console.log(`【朋友圈服务】存储中没有帖子 (circle_posts key不存在)`);
        return [];
      }
    } catch (error) {
      console.error(`【朋友圈服务】从存储加载帖子失败:`, error);
      // Add retry mechanism for critical errors
      try {
        console.log('【朋友圈服务】尝试重新获取帖子数据...');
        const retryStoredPosts = await AsyncStorage.getItem('circle_posts');
        if (retryStoredPosts) {
          const retryPosts = JSON.parse(retryStoredPosts) as CirclePost[];
          console.log(`【朋友圈服务】重试成功，获取到 ${retryPosts.length} 条帖子`);
          return retryPosts;
        }
      } catch (retryError) {
        console.error('【朋友圈服务】重试获取帖子失败:', retryError);
      }
      
      return [];
    }
  }

  /**
   * Save posts to AsyncStorage
   */
  static async savePosts(posts: CirclePost[]): Promise<boolean> {
    try {
      // Filter out any invalid posts
      const validPosts = posts.filter(post => !!post && typeof post === 'object' && post.id);
      
      if (validPosts.length !== posts.length) {
        console.log(`【朋友圈服务】保存时过滤掉了 ${posts.length - validPosts.length} 个无效的帖子条目`);
      }
      
      // Try to stringify first to catch any serialization errors before saving
      const postsJson = JSON.stringify(validPosts);
      
      // Log stringification success and data size
      console.log(`【朋友圈服务】准备保存 ${validPosts.length} 条帖子，数据大小: ${postsJson.length} 字符`);
      
      // Verify the JSON is valid before saving
      if (!postsJson.startsWith('[') || !postsJson.endsWith(']')) {
        console.error(`【朋友圈服务】生成的JSON格式无效，不是有效的数组`);
        return false;
      }
      
      // Save posts with verification
      await AsyncStorage.setItem('circle_posts', postsJson);
      
      // Verify data was saved correctly by reading it back
      const verifyJson = await AsyncStorage.getItem('circle_posts');
      if (!verifyJson) {
        console.error('【朋友圈服务】数据保存验证失败: 无法读取保存的数据');
        return false;
      }
      
      console.log(`【朋友圈服务】成功保存并验证 ${validPosts.length} 条帖子到存储`);
      return true;
    } catch (error) {
      console.error(`【朋友圈服务】保存帖子到存储失败:`, error);
      
      // If the error is related to JSON stringification, try saving posts one by one to identify the problematic post
      if (error instanceof TypeError && posts.length > 0) {
        try {
          console.log('【朋友圈服务】尝试分批保存帖子以定位问题...');
          const problemPosts: string[] = [];
          
          // Test each post for JSON serialization
          posts.forEach((post, index) => {
            try {
              JSON.stringify(post);
            } catch (err) {
              problemPosts.push(`Post #${index} with ID ${post.id || 'unknown'}`);
            }
          });
          
          if (problemPosts.length > 0) {
            console.error(`【朋友圈服务】发现 ${problemPosts.length} 个问题帖子:`, problemPosts);
          }
        } catch (diagError) {
          console.error('【朋友圈服务】分批诊断失败:', diagError);
        }
      }
      
      return false;
    }
  }
  
  /**
   * NEW: Check storage integrity and attempt recovery if needed
   */
  static async checkStorageIntegrity(): Promise<boolean> {
    try {
      console.log('【朋友圈服务】开始检查存储完整性');
      const storedPosts = await AsyncStorage.getItem('circle_posts');
      
      if (!storedPosts) {
        console.log('【朋友圈服务】存储中没有帖子数据，正常空状态');
        return true;
      }
      
      try {
        // Attempt to parse the JSON
        const posts = JSON.parse(storedPosts) as CirclePost[];
        
        if (!Array.isArray(posts)) {
          console.error('【朋友圈服务】存储的帖子不是数组格式，需要修复');
          await AsyncStorage.setItem('circle_posts', JSON.stringify([]));
          return false;
        }
        
        // Check for any invalid posts
        const validPosts = posts.filter(post => !!post && typeof post === 'object' && post.id);
        if (validPosts.length !== posts.length) {
          console.log(`【朋友圈服务】存储中存在 ${posts.length - validPosts.length} 个无效帖子，已修复`);
          await AsyncStorage.setItem('circle_posts', JSON.stringify(validPosts));
        }
        
        console.log(`【朋友圈服务】存储检查完成，${validPosts.length} 条有效帖子`);
        return true;
      } catch (parseError) {
        console.error('【朋友圈服务】存储中的数据无法解析，重置存储:', parseError);
        await AsyncStorage.setItem('circle_posts', JSON.stringify([]));
        return false;
      }
    } catch (error) {
      console.error('【朋友圈服务】检查存储完整性时出错:', error);
      return false;
    }
  }

  /**
   * Process character responses to a post, with image handling support
   */
  static async processPostResponses(
    post: CirclePost, 
    characters: Character[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<{
    updatedPost: CirclePost,
    responses: Array<{characterId: string, success: boolean, response?: CircleResponse}>
  }> {
    // Copy the post to avoid mutating the original
    const updatedPost = { ...post };
    const responses: Array<{characterId: string, success: boolean, response?: CircleResponse}> = [];
    
    // Get characters with circle interaction enabled
    const interactingCharacters = characters.filter(c => c.circleInteraction);
    console.log(`【朋友圈服务】找到 ${interactingCharacters.length} 个启用了朋友圈互动的角色`);
    
    if (interactingCharacters.length === 0) {
      return { updatedPost, responses };
    }
    
    // Get the Circle Scheduler instance to manage API rate limits
    const scheduler = CircleScheduler.getInstance();
    
    // Process each character's response
    for (const character of interactingCharacters) {
      try {
        // Skip if character should not interact with this post
        // For example, a character shouldn't respond to their own post
        if (character.id === post.characterId) {
          console.log(`【朋友圈服务】跳过角色 ${character.name} 对自己帖子的回应`);
          continue;
        }
        
        console.log(`【朋友圈服务】通过调度器处理角色 ${character.name} 对帖子的回应`);
        
        // Initialize character if needed
        await this.initCharacterCircle(character, apiKey, apiSettings);
        
        // Schedule the interaction with image processing
        const response = await scheduler.scheduleInteraction(
          character,
          post,
          apiKey,
          apiSettings,
          post.images
        );
        
        // Record response
        responses.push({
          characterId: character.id,
          success: response.success,
          response
        });
        
        // Update post with character's response
        if (response.success) {
          if (response.action?.like) {
            // Add like
            const newLike: CircleLike = {
              userId: character.id,
              userName: character.name,
              userAvatar: character.avatar as string,
              isCharacter: true,
              createdAt: new Date().toISOString()
            };
            
            updatedPost.likes = (updatedPost.likes || 0) + 1;
            (updatedPost.likedBy = updatedPost.likedBy || []).push(newLike);
          }
          
          if (response.action?.comment) {
            // Add comment
            const newComment: CircleComment = {
              id: `${Date.now()}-${character.id}`,
              userId: character.id,
              userName: character.name,
              userAvatar: character.avatar as string,
              content: response.action.comment,
              createdAt: new Date().toISOString(),
              type: 'character'
            };
            
            (updatedPost.comments = updatedPost.comments || []).push(newComment);
          }
        }
      } catch (error) {
        console.error(`【朋友圈服务】处理角色 ${character.name} 的回应时出错:`, error);
        responses.push({
          characterId: character.id,
          success: false
        });
      }
    }
    
    return { updatedPost, responses };
  }

  /**
   * Enhanced method to handle post refresh and update
   */
  static async refreshPosts(
    characters: Character[],
    savedPosts: CirclePost[],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>
  ): Promise<CirclePost[]> {
    try {
      console.log(`【朋友圈服务】刷新帖子，当前有 ${savedPosts.length} 条已保存的帖子`);
      
      // 1. 先从AsyncStorage加载所有已保存的帖子，确保不会丢失评论
      const storedPosts = await this.loadSavedPosts();
      console.log(`【朋友圈服务】从存储中加载了 ${storedPosts.length} 条帖子`);
      
      // 2. 创建一个帖子ID映射来避免重复，优先使用存储的版本（因为它们包含评论）
      const postMap = new Map<string, CirclePost>();
      
      // 先添加存储的帖子
      storedPosts.forEach(post => {
        if (post && post.id) { // 添加额外检查确保帖子有效
          postMap.set(post.id, post);
        } else {
          console.warn('【朋友圈服务】发现无效的帖子对象，已跳过');
        }
      });
      
      // 然后添加内存中的帖子（如果存储中不存在）
      savedPosts.forEach(post => {
        if (post && post.id && !postMap.has(post.id)) {
          postMap.set(post.id, post);
        }
      });
      
      // 3. 查找角色中的新帖子
      characters.forEach(character => {
        if (character.circlePosts && Array.isArray(character.circlePosts)) {
          character.circlePosts.forEach(post => {
            if (post && post.id) {
              // 如果帖子已经存在，使用评论数最多的版本
              if (postMap.has(post.id)) {
                const existingPost = postMap.get(post.id)!;
                const existingCommentCount = existingPost.comments?.length || 0;
                const newCommentCount = post.comments?.length || 0;
                
                if (newCommentCount > existingCommentCount) {
                  // 如果新帖子有更多评论，使用它但保留现有评论
                  const mergedPost = {
                    ...post,
                    comments: [...(existingPost.comments || []), ...(post.comments || [])].filter(
                      // 去重处理
                      (comment, index, self) => index === self.findIndex(c => c.id === comment.id)
                    ),
                    characterAvatar: character.avatar || post.characterAvatar
                  };
                  postMap.set(post.id, mergedPost);
                }
              } else {
                // 如果是新帖子，添加到映射
                postMap.set(post.id, {
                  ...post,
                  characterAvatar: character.avatar || post.characterAvatar
                });
              }
            }
          });
        }
      });
      
      // 4. 转换回数组并排序
      const mergedPosts = Array.from(postMap.values()).sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // 5. 更新头像和其他信息
      const updatedPosts = mergedPosts.map(post => {
        // 更新角色帖子的头像
        if (post.characterId !== 'user-1') {
          const character = characters.find(c => c.id === post.characterId);
          if (character) {
            post.characterAvatar = character.avatar || post.characterAvatar;
          }
        }
        
        // 更新点赞和评论中的头像
        if (post.likedBy) {
          post.likedBy = post.likedBy.map(like => {
            if (like.isCharacter) {
              const character = characters.find(c => c.id === like.userId);
              if (character) {
                return { 
                  ...like, 
                  userAvatar: character.avatar || like.userAvatar 
                };
              }
            }
            return like;
          });
        }
        
        if (post.comments) {
          post.comments = post.comments.map(comment => {
            if (comment.type === 'character') {
              const commentCharacter = characters.find(c => c.id === comment.userId);
              if (commentCharacter) {
                return { 
                  ...comment, 
                  userAvatar: commentCharacter.avatar || comment.userAvatar 
                };
              }
            }
            return comment;
          });
        }
        
        return post;
      });
      
      // 6. 保存更新后的帖子
      await this.savePosts(updatedPosts);
      console.log(`【朋友圈服务】更新并保存了 ${updatedPosts.length} 条帖子`);
      
      return updatedPosts;
    } catch (error) {
      console.error(`【朋友圈服务】刷新帖子失败:`, error);
      return savedPosts; // Return original posts on error
    }
  }

  /**
   * Enhanced user post method with better image handling and immediate UI updates
   */
  static async createUserPost(
    userNickname: string,
    userAvatar: string | null,
    content: string,
    images: string[] = [],
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    charactersList?: Character[]
  ): Promise<{
    post: CirclePost,
    responses: Array<{characterId: string, success: boolean, response?: CircleResponse}>
  }> {
    try {
      console.log(`【朋友圈服务】用户 ${userNickname} 创建新朋友圈帖子${images.length ? `，包含 ${images.length} 张图片` : ''}`);
      
      // Create a post object for the user
      const newPost: CirclePost = {
        id: `user-post-${Date.now()}`,
        characterId: 'user-1',
        characterName: userNickname,
        characterAvatar: userAvatar,
        content,
        images,
        createdAt: new Date().toISOString(),
        comments: [],
        likes: 0,
        likedBy: [],
        hasLiked: false
      };
      
      // Save the post immediately for better UX
      try {
        const savedPosts = await this.loadSavedPosts();
        await this.savePosts([newPost, ...savedPosts]);
        console.log(`【朋友圈服务】已保存用户帖子到存储`);
      } catch (saveError) {
        console.error(`【朋友圈服务】保存用户帖子到存储失败:`, saveError);
        // Continue even if save fails
      }
      
      // Skip character responses if no characters are provided
      if (!charactersList || charactersList.length === 0) {
        return { post: newPost, responses: [] };
      }
      
      // Filter characters with circle interaction enabled - just like in processTestInteraction
      const interactingCharacters = charactersList.filter(c => c.circleInteraction);
      console.log(`【朋友圈服务】找到 ${interactingCharacters.length} 个启用了朋友圈互动的角色`);
      
      // Make a copy of the post to avoid mutating the original - just like in processTestInteraction
      let updatedPost = { ...newPost };
      const responses: Array<{characterId: string, success: boolean, response?: CircleResponse}> = [];
      
      // Process each character's response individually - this is the key difference
      for (const character of interactingCharacters) {
        try {
          console.log(`【朋友圈服务】处理角色 ${character.name} 对用户帖子的回应`);
          
          // Initialize character if needed
          await this.initCharacterCircle(character, apiKey, apiSettings);
          
          // Get character's chat history with user for context
          let chatHistory = '';
          try {
            const recentMessages = await StorageAdapter.getRecentMessages(character.id, 10);
            if (recentMessages && recentMessages.length > 0) {
              chatHistory = recentMessages.map((msg, idx) => {
                const speaker = msg.role === 'user' ? (character.customUserName || '用户') : character.name;
                return `${idx + 1}. ${speaker}: ${msg.parts?.[0]?.text || ''}`;
              }).join('\n');
              console.log(`【朋友圈服务】获取了角色 ${character.name} 与用户的 ${recentMessages.length} 条历史聊天记录`);
            }
          } catch (historyError) {
            console.warn(`【朋友圈服务】获取角色 ${character.name} 的聊天历史失败:`, historyError);
          }
                    // 获取角色对用户的昵称（customUserName），如果没有则用userNickname
          const userDisplayName = character.customUserName || `用户`;

          // Process interaction directly instead of using scheduler
          const options: CirclePostOptions = {
            type: 'replyToPost',
            content: {
              authorId: 'user-1', // 明确标记为用户发布的帖子
              authorName: userDisplayName, // 使用角色对用户的昵称
              text: updatedPost.content,
              context: images.length > 0 ?
                `这是${userDisplayName}发布的带有${images.length}张图片的朋友圈动态。请重点关注并回应图片内容。` :
                `这是${userDisplayName}发布的一条朋友圈动态。${
                  updatedPost.comments?.length ?
                  `目前已有${updatedPost.comments.length}条评论和${updatedPost.likes}个点赞。` :
                  '还没有其他人互动。'
                }`,
              images: updatedPost.images,
              conversationHistory: chatHistory // Add chat history for context
            },
            responderId: character.id,
            responderCharacter: character
          };
          
          console.log(`【朋友圈服务】为角色 ${character.name} 构建互动options，帖子包含图片: ${images.length > 0}，类型: ${options.type}`);
          
          // Process the interaction directly with current post state
          const response = await this.getNodeST(apiKey, apiSettings).processCircleInteraction(options);
          
          // Record response
          responses.push({
            characterId: character.id,
            success: response.success,
            response
          });
          
          // Update post with character's response - this is critical to accumulate responses
          if (response.success) {
            const { updatedPost: newPost } = this.updatePostWithResponse(updatedPost, character, response);
            updatedPost = newPost; // Update for next iteration
            
            console.log(`【朋友圈服务】角色 ${character.name} 对用户帖子的回应已处理: 点赞=${!!response.action?.like}, 评论=${!!response.action?.comment}`);
            
            // Store in chat history if response contains a comment
            if (response.action?.comment) {
              try {
                await StorageAdapter.storeMessageExchange(
                  character.id,
                  content, // user's post content 
                  response.action.comment // character's response
                );
                console.log(`【朋友圈服务】已保存角色 ${character.name} 对用户帖子的回复到聊天历史`);
              } catch (storeError) {
                console.warn(`【朋友圈服务】保存对话到聊天历史失败:`, storeError);
              }
            }
          }
        } catch (error) {
          console.error(`【朋友圈服务】处理角色 ${character.name} 的回应时出错:`, error);
          responses.push({
            characterId: character.id,
            success: false
          });
        }
      }
      
      // Save the final post with all accumulated responses
      try {
        const allPosts = await this.loadSavedPosts();
        const updatedPosts = allPosts.map(p => 
          p.id === updatedPost.id ? updatedPost : p
        );
        
        // Check if the post already exists in the list
        const existingPostIndex = updatedPosts.findIndex(p => p.id === updatedPost.id);
        if (existingPostIndex === -1) {
          // Add the post if it doesn't exist
          updatedPosts.unshift(updatedPost);
        }
        
        await this.savePosts(updatedPosts);
        console.log(`【朋友圈服务】已保存带有所有角色响应(${responses.filter(r => r.success).length}个)的用户帖子`);
      } catch (updateError) {
        console.error(`【朋友圈服务】更新带有角色响应的用户帖子到存储失败:`, updateError);
      }
      
      // Return the updated post with all accumulated responses
      return { post: updatedPost, responses };
    } catch (error) {
      console.error(`【朋友圈服务】创建用户帖子失败:`, error);
      return {
        post: {
          id: `user-post-${Date.now()}`,
          characterId: 'user-1',
          characterName: userNickname,
          characterAvatar: userAvatar,
          content,
          images,
          createdAt: new Date().toISOString(),
          comments: [],
          likes: 0,
          likedBy: [],
          hasLiked: false
        },
        responses: []
      };
    }
  }
}

// Fix for the "characters" variable with implicit any type
export const processTestInteraction = (
  currentCharacter: Character,
  targetCharacterId: string,
  interactionType: string,
  content?: string
): { characters: Character[], success: boolean, message: string } => {
  // Placeholder implementation since we're not using this function
  // Create a basic return value to satisfy TypeScript
  return {
    characters: [],
    success: false,
    message: `未找到ID为${targetCharacterId}的角色`
  };
};