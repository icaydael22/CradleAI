import { Character } from '@/shared/types';
import { Relationship, RelationshipType } from '@/shared/types/relationship-types';
import { ApiServiceProvider } from '@/services/api-service-provider';
import { ApiSettings } from '@/shared/types/api-types';

import { RelationshipTemplateService } from './relationship-template-service';
import { ErrorRecoveryManager, ErrorType } from '@/utils/error-recovery';
import { generateId } from '@/utils/id-utils';

/**
 * 关系互动服务
 * 负责生成角色间的自然互动内容和对话
 */
export class RelationshipInteractionService {
  /**
   * 生成角色之间的对话或互动内容
   */
  static async generateInteraction(
    sourceCharacter: Character,
    targetCharacter: Character,
    scenarioType: 'greeting' | 'chat' | 'event' | 'reaction',
    context: {
      location?: string;
      activity?: string;
      mood?: string;
      time?: string;
      custom?: string;
    },
    apiKey?: string,
    apiSettings?: ApiSettings
  ): Promise<string> {
    try {
      if (!apiKey) {
        return this.getDefaultInteraction(sourceCharacter, targetCharacter, scenarioType);
      }
      
      console.log(`【关系互动】生成${sourceCharacter.name}对${targetCharacter.name}的${scenarioType}互动`);
      
      // 获取关系信息
      const relationship = sourceCharacter.relationshipMap?.relationships?.[targetCharacter.id];
      
      if (!relationship) {
        return this.getDefaultInteraction(sourceCharacter, targetCharacter, scenarioType);
      }
      
      // 构建提示词
      const prompt = this.buildInteractionPrompt(
        sourceCharacter,
        targetCharacter,
        relationship,
        scenarioType,
        context
      );
      
      // 使用ApiServiceProvider生成内容
      const response = await ApiServiceProvider.generateContent(
        [{role: 'user', parts: [{text: prompt}]}],
        apiKey,
        apiSettings
      );
      
      // 返回生成的互动内容
      return response.trim();
    } catch (error) {
      console.error('【关系互动】生成互动内容失败:', error);
      
      // 记录错误并获取恢复建议
      const errorType = ErrorRecoveryManager.inferErrorType(error);
      await ErrorRecoveryManager.logError(
        errorType,
        '生成关系互动内容失败',
        {
          apiProvider: apiSettings?.apiProvider || 'gemini',
          timestamp: Date.now(),
          statusCode: (error as { statusCode?: number })?.statusCode
        }
      );
      
      // 返回默认互动内容
      return this.getDefaultInteraction(sourceCharacter, targetCharacter, scenarioType);
    }
  }
  
  /**
   * 构建互动场景的提示词
   */
  private static buildInteractionPrompt(
    sourceCharacter: Character,
    targetCharacter: Character,
    relationship: Relationship,
    scenarioType: 'greeting' | 'chat' | 'event' | 'reaction',
    context: {
      location?: string;
      activity?: string;
      mood?: string;
      time?: string;
      custom?: string;
    }
  ): string {
    // 获取关系类型相关的模板
    const templates = RelationshipTemplateService.getRelationshipRFramework(
      sourceCharacter,
      targetCharacter,
      relationship
    );
    
    // 将模板转换为提示词文本
    const templateText = templates.map(t => `【${t.name}】\n${t.content}`).join('\n\n');
    
    // 构建场景描述
    let scenarioDescription = '';
    switch (scenarioType) {
      case 'greeting':
        scenarioDescription = `${sourceCharacter.name}遇到${targetCharacter.name}的场景。现在是${context.time || '日常时间'}，地点在${context.location || '普通场所'}。${sourceCharacter.name}的心情是${context.mood || '普通的'}。`;
        break;
      case 'chat':
        scenarioDescription = `${sourceCharacter.name}正在与${targetCharacter.name}进行对话。他们在讨论${context.activity || '一般话题'}。场景发生在${context.location || '普通场所'}。`;
        break;
      case 'event':
        scenarioDescription = `${sourceCharacter.name}和${targetCharacter.name}一起参加了${context.activity || '某个活动'}。地点在${context.location || '某个地方'}。${context.custom || ''}`;
        break;
      case 'reaction':
        scenarioDescription = `${targetCharacter.name}刚刚${context.custom || '做了某事'}。${sourceCharacter.name}需要对此作出反应。`;
        break;
    }
    
    // 构建完整提示词
    return `你需要扮演${sourceCharacter.name}，根据下面的角色关系信息和场景描述，生成一段自然的对话或反应。
    
${templateText}

【场景描述】
${scenarioDescription}

【要求】
1. 必须站在${sourceCharacter.name}的视角，作为第一人称
2. 必须考虑你与${targetCharacter.name}的关系类型(${relationship.type})和关系强度(${relationship.strength})
3. 保持对话或反应的自然、有个性且符合你的角色
4. 内容简洁，不要超过3句话
5. 不要添加旁白或者非对话内容
6. 不要重复场景描述，直接进入对话
7. 不要用引号

请直接给出${sourceCharacter.name}的话语或反应:`;
  }
  
  /**
   * 获取默认的互动内容（当API调用失败时使用）
   */
  private static getDefaultInteraction(
    sourceCharacter: Character,
    targetCharacter: Character,
    scenarioType: 'greeting' | 'chat' | 'event' | 'reaction'
  ): string {
    // 获取关系信息
    const relationship = sourceCharacter.relationshipMap?.relationships?.[targetCharacter.id];
    const relType = relationship?.type || 'stranger';
    const relStrength = relationship?.strength || 0;
    const isPositive = relStrength >= 0;
    
    // 根据关系类型和互动类型选择默认回应
    switch (scenarioType) {
      case 'greeting':
        if (isPositive) {
          return relType === 'close_friend' || relType === 'best_friend' ? 
            `嘿，${targetCharacter.name}！好久不见，你最近过得怎么样？` :
            `你好，${targetCharacter.name}。`;
        } else {
          return `${targetCharacter.name}...`;
        }
      case 'chat':
        if (isPositive) {
          return relType === 'close_friend' || relType === 'best_friend' ? 
            `我完全同意你的观点，这确实很有趣！你总是有这么好的见解。` :
            `嗯，你说得很有道理。`;
        } else {
          return `呃...好吧。`;
        }
      case 'event':
        if (isPositive) {
          return relType === 'close_friend' || relType === 'best_friend' ? 
            `和你一起参加这样的活动真是太棒了！我们应该多做这样的事情。` :
            `这个活动还不错，对吧？`;
        } else {
          return `希望这快点结束...`;
        }
      case 'reaction':
        if (isPositive) {
          return relType === 'close_friend' || relType === 'best_friend' ? 
            `哇！我真为你感到高兴！` :
            `嗯，不错。`;
        } else {
          return `随便吧。`;
        }
      default:
        return `嗨，${targetCharacter.name}。`;
    }
  }
  
  /**
   * 生成增强的关系描述
   * 使用AI生成更有深度和个性化的关系描述
   */
  static async generateEnhancedDescription(
    sourceCharacter: Character,
    targetCharacter: Character,
    relationship: Relationship,
    apiKey?: string,
    apiSettings?: ApiSettings
  ): Promise<string> {
    try {
      if (!apiKey) {
        return relationship.description || this.getDefaultDescription(relationship);
      }
      
      console.log(`【关系互动】生成增强的关系描述: ${sourceCharacter.name} -> ${targetCharacter.name}`);
      
      // 优先使用OpenRouter获取更好的描述质量
      const isUsingOpenRouter = apiSettings?.apiProvider === 'openrouter' && apiSettings.openrouter?.enabled;
      
      // 构建提示词
      const prompt = `你是${sourceCharacter.name}，${sourceCharacter.description || '一个角色'}。
      
你与${targetCharacter.name} (${targetCharacter.description || '另一个角色'}) 的关系是"${relationship.type}"，关系强度为${relationship.strength}（范围从-100到100）。你们已有${relationship.interactions}次互动。

请以第一人称的视角，写一段简短但有深度的描述，表达你对${targetCharacter.name}的真实感受和印象。这段描述应该：
1. 包含具体的细节或互动记忆
2. 展现你们关系的情感色彩和复杂性
3. 符合你的性格和说话风格
4. 简洁但有深度（30-60字左右）
5. 始终使用第一人称

只需给出描述文本，不要添加任何其他内容。`;

      // 使用API生成描述
      const response = await ApiServiceProvider.generateContent(
        [{role: 'user', parts: [{text: prompt}]}],
        apiKey,
        apiSettings
      );
      
      // 后处理生成的描述
      let enhancedDescription = response.trim();
      
      // 确保描述使用第一人称
      if (!enhancedDescription.includes('我') && !enhancedDescription.includes('我的')) {
        enhancedDescription = `我觉得${enhancedDescription}`;
      }
      
      // 限制描述长度
      if (enhancedDescription.length > 100) {
        enhancedDescription = enhancedDescription.substring(0, 100) + '...';
      }
      
      return enhancedDescription;
    } catch (error) {
      console.error('【关系互动】生成增强描述失败:', error);
      return relationship.description || this.getDefaultDescription(relationship);
    }
  }
  
  /**
   * 获取默认关系描述
   */
  private static getDefaultDescription(relationship: Relationship): string {
    const typeDescriptions: Record<RelationshipType, string> = {
      'enemy': '我们之间有很强的敌意，我不太愿意和他有太多接触。',
      'rival': '我们之间存在竞争关系，但这种竞争有时也推动我们进步。',
      'stranger': '我们几乎不了解对方，只是偶尔见过面。',
      'acquaintance': '我们认识，但并不十分熟悉。',
      'colleague': '我们是合作伙伴，有着共同的工作目标。',
      'friend': '我们是朋友，偶尔一起聊天和分享经历。',
      'close_friend': '我们是很好的朋友，彼此了解和支持。',
      'best_friend': '这是我最好的朋友之一，我们之间有着深厚的信任和理解。',
      'family': '我们有着家人般的亲密关系，无论发生什么都会互相支持。',
      'crush': '我对他/她有些特别的感觉，但还没有表达出来。',
      'lover': '我们之间有着浪漫的感情，彼此珍视这段关系。',
      'partner': '我们是伴侣，共同面对生活中的挑战和喜悦。',
      'ex': '我们曾经很亲密，但现在已经分开了。',
      'mentor': '我把自己的知识和经验传授给对方，看到他/她的成长让我感到欣慰。',
      'student': '我从他/她那里学到了很多，很感谢有这样一位指导者。',
      'admirer': '我很欣赏他/她的才能和特质。',
      'idol': '他/她是我仰望的对象，我希望有朝一日能达到他/她的水平。'
    };
    
    return typeDescriptions[relationship.type] || '这是我们之间的关系。';
  }
  
  /**
   * 生成关系测试场景
   * 创建适合测试关系系统的场景内容
   */
  static generateTestScenario(characters: Character[]): {
    authorId: string;
    content: string;
    type: 'social' | 'challenge' | 'emotional' | 'cooperative';
  } {
    if (characters.length === 0) {
      return {
        authorId: 'system',
        content: '没有足够的角色参与测试',
        type: 'social'
      };
    }
    
    // 随机选择一个角色作为作者
    const author = characters[Math.floor(Math.random() * characters.length)];
    
    // 定义测试场景类型
    const scenarioTypes = ['social', 'challenge', 'emotional', 'cooperative'] as const;
    const selectedType = scenarioTypes[Math.floor(Math.random() * scenarioTypes.length)];
    
    // 根据测试类型生成内容
    let content = '';
    switch (selectedType) {
      case 'social':
        content = this.getSocialScenarioContent(author);
        break;
      case 'challenge':
        content = this.getChallengeScenarioContent(author);
        break;
      case 'emotional':
        content = this.getEmotionalScenarioContent(author);
        break;
      case 'cooperative':
        content = this.getCooperativeScenarioContent(author);
        break;
    }
    
    return {
      authorId: author.id,
      content,
      type: selectedType
    };
  }
  
  /**
   * 生成社交场景内容
   */
  private static getSocialScenarioContent(author: Character): string {
    const socialTemplates = [
      `今天举办了一个小型聚会，欢迎大家来我家做客！会准备一些好吃的和好玩的，期待见到大家！`,
      `刚买了一些新桌游，有人想一起来玩吗？保证会很有趣！`,
      `周末打算去郊游，风景很美，有人想一起吗？`,
      `最近发现了一家很棒的餐厅，食物非常美味，推荐给大家！`,
      `有人最近看了什么好电影或好书吗？想找点新东西消遣一下。`
    ];
    
    return socialTemplates[Math.floor(Math.random() * socialTemplates.length)];
  }
  
  /**
   * 生成挑战场景内容
   */
  private static getChallengeScenarioContent(author: Character): string {
    const challengeTemplates = [
      `我发起一个挑战赛！看看谁能在一周内完成最多的目标，赢的人请客！`,
      `谁想来一场智力游戏或辩论呢？最近有些想挑战一下脑力。`,
      `有人敢接受这个体力挑战吗？`,
      `一起来参加这个创意比赛吧，看看谁能想出最独特的点子！`,
      `谁认为自己的厨艺最好？来比比看吧！`
    ];
    
    return challengeTemplates[Math.floor(Math.random() * challengeTemplates.length)];
  }
  
  /**
   * 生成情感场景内容
   */
  private static getEmotionalScenarioContent(author: Character): string {
    const emotionalTemplates = [
      `今天经历了一些不太顺利的事情，心情有点低落，需要一些鼓励...`,
      `刚收到一个非常好的消息！太高兴了，想和大家分享这份喜悦！`,
      `最近在思考人生的方向，感觉有些迷茫，有谁愿意聊聊吗？`,
      `有些事情让我很困扰，不知道该怎么决定，希望能听听大家的建议。`,
      `今天是我的特别日子，感谢一路上支持我的所有人！`
    ];
    
    return emotionalTemplates[Math.floor(Math.random() * emotionalTemplates.length)];
  }
  
  /**
   * 生成合作场景内容
   */
  private static getCooperativeScenarioContent(author: Character): string {
    const cooperativeTemplates = [
      `正在筹划一个项目，需要各种不同的技能和想法，有兴趣合作的请联系我！`,
      `想组织一次志愿活动，一起帮助需要帮助的人，谁愿意参与？`
    ];

        return cooperativeTemplates[Math.floor(Math.random() * cooperativeTemplates.length)];
      }
    }