import { Character } from '@/shared/types';
import { Relationship, RelationshipType } from '@/shared/types/relationship-types';
import { ApiServiceProvider } from './api-service-provider';
import { ApiSettings } from '@/shared/types/api-types';
import { PromptBuilderService, DEntry, RFrameworkEntry } from '@/NodeST/nodest/services/prompt-builder-service';
import { OpenRouterAdapter } from '@/NodeST/nodest/utils/openrouter-adapter';

interface InteractionScenario {
  scenario: string;  // 'gift' | 'invitation' | 'challenge' | 'support' | 'confession' | 'meeting'
  detail?: string;   // Detailed description of the scenario
}

/**
 * 关系提示词服务
 * 专门为角色关系场景构建优化的提示词
 */
export class RelationshipPromptService {
  /**
   * 生成关系描述
   * 使用AI生成更自然的关系描述
   */
  static async generateRelationshipDescription(
    sourceCharacter: Character, 
    targetCharacter: Character,
    relationship: Relationship,
    apiKey?: string,
    apiSettings?: ApiSettings
  ): Promise<string> {
    if (!apiKey) {
      return this.getDefaultRelationshipDescription(relationship);
    }

    try {
      console.log(`【关系提示词服务】为 ${sourceCharacter.name} 和 ${targetCharacter.name} 生成关系描述`);
      
      // 构建R框架
      const rFramework: RFrameworkEntry[] = [
        PromptBuilderService.createRFrameworkEntry({
          name: "Source Character",
          content: `你是${sourceCharacter.name}，${sourceCharacter.description || '一个虚拟角色'}。`,
          identifier: "sourceChar"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "Target Character",
          content: `${targetCharacter.name}是${targetCharacter.description || '一个虚拟角色'}。`,
          identifier: "targetChar"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "Relationship Context",
          content: `你与${targetCharacter.name}的关系类型是"${relationship.type}"，关系强度为${relationship.strength}（范围从-100到100），你们已有${relationship.interactions}次互动。`,
          identifier: "relationContext"
        }),
        PromptBuilderService.createRFrameworkEntry({
          name: "Task",
          content: `请以${sourceCharacter.name}的第一人称，写一段简短的描述，表达你对${targetCharacter.name}的真实感受和印象。描述应该与你们的关系类型和强度一致。`,
          identifier: "task"
        })
      ];
      
      // 构建D类条目
      const dEntries: DEntry[] = [];
      
      // 如果有历史对话记录，添加为上下文
      if (sourceCharacter.messages?.some(m => m.metadata?.targetId === targetCharacter.id)) {
        const relevantMessages = sourceCharacter.messages
          .filter(m => m.metadata?.targetId === targetCharacter.id)
          .slice(-5);
          
        const messageText = relevantMessages.map(m => 
          `${m.sender === 'bot' ? sourceCharacter.name : targetCharacter.name}: ${m.text}`
        ).join('\n');
        
        dEntries.push(PromptBuilderService.createDEntry({
          name: "Recent Interactions",
          content: `你和${targetCharacter.name}最近的对话:\n${messageText}`,
          depth: 1
        }));
      }
      
      // 根据关系类型添加特定指导
      dEntries.push(PromptBuilderService.createDEntry({
        name: "Relationship Guidance",
        content: this.getRelationshipTypeGuidance(relationship.type, relationship.strength),
        depth: 0
      }));
      
      // 构建提示词
      const messages = PromptBuilderService.buildPrompt({
        rFramework,
        dEntries,
        userMessage: `请描述你(${sourceCharacter.name})对${targetCharacter.name}的感受和印象。保持简短，1-2句话，第一人称。`
      });
      
      const prompt = PromptBuilderService.messagesToText(messages);
      
      // 使用当前设置的API服务生成内容
      const response = await ApiServiceProvider.generateContent(
        [{role: 'user', parts: [{text: prompt}]}],
        apiKey,
        apiSettings
      );
      
      // 后处理响应
      let description = response.trim();
      
      // 如果响应太长，截断
      if (description.length > 120) {
        description = description.substring(0, 120) + '...';
      }
      
      // 确保描述是第一人称
      if (!description.includes('我') && !description.includes('你')) {
        description = `我觉得${description}`;
      }
      
      return description;
    } catch (error) {
      console.error('【关系提示词服务】生成关系描述失败:', error);
      return this.getDefaultRelationshipDescription(relationship);
    }
  }
  
  /**
   * 获取默认关系描述
   * 当API调用失败时使用
   */
  private static getDefaultRelationshipDescription(relationship: Relationship): string {
    const strengthAbs = Math.abs(relationship.strength);
    const isPositive = relationship.strength >= 0;
    
    switch (relationship.type) {
      case 'enemy':
        return '我对这个人有强烈的敌意，我们之间的冲突很难调和。';
      case 'rival':
        return '我们之间存在竞争关系，但这种竞争有时也推动我们进步。';
      case 'stranger':
        return '我们几乎不了解对方，只是偶尔见过面。';
      case 'acquaintance':
        return '我们认识，但并不十分熟悉。';
      case 'colleague':
        return '我们是合作伙伴，有着共同的工作目标。';
      case 'friend':
        return '我们是朋友，偶尔一起聊天和分享经历。';
      case 'close_friend':
        return '我们是很好的朋友，彼此了解和支持。';
      case 'best_friend':
        return '这是我最好的朋友之一，我们之间有着深厚的信任和理解。';
      case 'family':
        return '我们有着家人般的亲密关系，无论发生什么都会互相支持。';
      case 'crush':
        return '我对他/她有些特别的感觉，但还没有表达出来。';
      case 'lover':
        return '我们之间有着浪漫的感情，彼此珍视这段关系。';
      case 'partner':
        return '我们是伴侣，共同面对生活中的挑战和喜悦。';
      case 'ex':
        return '我们曾经很亲密，但现在已经分开了。';
      case 'mentor':
        return '我把自己的知识和经验传授给对方，看到他/她的成长让我感到欣慰。';
      case 'student':
        return '我从他/她那里学到了很多，很感谢有这样一位指导者。';
      case 'admirer':
        return '我很欣赏他/她的才能和特质。';
      case 'idol':
        return '他/她是我仰望的对象，我希望有朝一日能达到他/她的水平。';
      default:
        return isPositive ? 
          '我们的关系还不错。' : 
          '我们的关系有些紧张。';
    }
  }
  
  /**
   * 获取关系类型指导
   * 为不同类型的关系提供特定的提示指导
   */
  private static getRelationshipTypeGuidance(type: RelationshipType, strength: number): string {
    const strengthAbs = Math.abs(strength);
    const intensity = strengthAbs < 30 ? '轻微的' : 
                      strengthAbs < 70 ? '中等的' : 
                      '强烈的';
    
    switch (type) {
      case 'enemy':
        return `表达${intensity}敌意，但避免过度仇恨或暴力倾向。语气可以冷淡、警惕或充满怨恨。`;
      case 'rival':
        return `表达竞争感和较劲心态，但也可以暗示一定程度的尊重。语气应该充满挑战性和竞争意识。`;
      case 'stranger':
        return `表达陌生感和距离感，缺乏了解但可能有初步印象。语气应该中立、客观、略带好奇或谨慎。`;
      case 'acquaintance':
        return `表达初步了解但不深入，有基本印象但缺乏情感连接。语气应该友好但保持距离。`;
      case 'colleague':
        return `表达专业关系和工作上的互动，重点在合作而非个人情感。语气应该专业、尊重但不过分亲密。`;
      case 'friend':
        return `表达友谊和互相欣赏，有共同经历但仍在发展中。语气应该友好、温暖、支持性的。`;
      case 'close_friend':
        return `表达深厚友谊、信任和理解，愿意分享私人想法。语气应该亲近、坦诚、关心。`;
      case 'best_friend':
        return `表达极度信任和亲密，无条件支持和深刻理解。语气应该非常亲近、幽默、有内部笑话的感觉。`;
      case 'family':
        return `表达家人般的亲密和无条件支持，即使有摩擦也不改变基础关系。语气应该亲密、直接、有时带有善意的唠叨。`;
      case 'crush':
        return `表达暗恋、好感但尚未表白的感觉，可能有些害羞或紧张。语气应该含蓄、略带羞涩或憧憬。`;
      case 'lover':
        return `表达浪漫爱情和亲密感，情感丰富且深刻。语气应该温柔、浪漫、充满感情。`;
      case 'partner':
        return `表达稳定且深厚的伴侣关系，包含共同成长和面对挑战。语气应该亲密、支持、有默契。`;
      case 'ex':
        return `表达过去的亲密和现在的距离，可能有未解决的感情或已经和平分手。语气应该复杂、略带怀旧或遗憾。`;
      case 'mentor':
        return `表达指导和引领的角色，对学生成长的自豪感。语气应该支持、鼓励、有教育意味。`;
      case 'student':
        return `表达学习和成长，对导师的尊重和感激。语气应该尊敬、好学、有时带有崇拜。`;
      case 'admirer':
        return `表达欣赏和敬佩，但不一定有个人关系。语气应该赞赏、肯定、略带崇拜。`;
      case 'idol':
        return `表达对方是自己的榜样，有强烈的仰慕和追随意愿。语气应该崇拜、向往、有抬高对方的倾向。`;
      default:
        return `表达与关系强度(${strength})相符的情感，保持语气的自然和符合角色性格。`;
    }
  }
  
  /**
   * 生成关系互动回应
   * 根据两个角色的关系生成特定场景下的互动回应
   */
  static async generateInteractionResponse(
    respondingCharacter: Character,
    initiatingCharacter: Character,
    scenario: InteractionScenario,
    apiKey: string,
    apiSettings?: ApiSettings
  ): Promise<string> {
    console.log(`【关系提示服务】生成互动响应: ${respondingCharacter.name} 回应 ${initiatingCharacter.name} 的 ${scenario.scenario}`);
    console.log(`【关系提示服务】API提供商: ${apiSettings?.apiProvider || 'default'}`);
    
    try {
      // Get relationship data if exists
      const relationship = respondingCharacter.relationshipMap?.relationships[initiatingCharacter.id];
      
      // Construct a prompt based on relationship status
      const prompt = this.constructInteractionPrompt(
        respondingCharacter,
        initiatingCharacter,
        scenario,
        relationship?.type,
        relationship?.strength
      );
      
      // Skip API call if no key provided (for testing)
      if (!apiKey) {
        console.log(`【关系提示服务】无API密钥，返回默认响应`);
        return `${respondingCharacter.name}默认回应了${initiatingCharacter.name}的${scenario.scenario}。`;
      }
      
      // Choose API provider
      const isOpenRouter = apiSettings?.apiProvider === 'openrouter' && 
                          apiSettings.openrouter?.enabled;
      
      console.log(`【关系提示服务】使用 ${isOpenRouter ? 'OpenRouter' : 'Gemini'} API生成响应`);
      
      if (isOpenRouter) {
        // Use OpenRouter for generation
        const adapter = new OpenRouterAdapter(
          apiKey,
          apiSettings?.openrouter?.model || 'openai/gpt-3.5-turbo'
        );
        
        console.log(`【关系提示服务】OpenRouter模型: ${apiSettings?.openrouter?.model || 'openai/gpt-3.5-turbo'}`);
        
        const content = await adapter.generateContent([
          { role: 'user', content: prompt }
        ]);
        
        console.log(`【关系提示服务】成功生成响应，长度: ${content.length}`);
        return this.processApiResponse(content);
      } else {
        // For Gemini API
        console.log(`【关系提示服务】使用Gemini API生成响应`);
        
        const response = await ApiServiceProvider.generateContent(
          [{ role: 'user', parts: [{ text: prompt }] }],
          apiKey
        );
        
        return this.processApiResponse(response);
      }
    } catch (error) {
      console.error(`【关系提示服务】生成互动响应失败:`, error);
      return `${respondingCharacter.name}回应了${initiatingCharacter.name}。`;
    }
  }
  
  /**
   * Construct a prompt for generating personalized interaction response
   */
  private static constructInteractionPrompt(
    respondingCharacter: Character,
    initiatingCharacter: Character,
    scenario: InteractionScenario,
    relationshipType?: RelationshipType,
    relationshipStrength?: number
  ): string {
    // Default values if relationship not defined
    const type = relationshipType || 'stranger';
    const strength = relationshipStrength || 0;
    
    // Build the detailed context
    let relationshipContext = '';
    if (type === 'stranger' || !relationshipStrength) {
      relationshipContext = `你们互相不太了解，是陌生人关系。`;
    } else if (strength < -50) {
      relationshipContext = `你们关系非常紧张，有很强的敌对情绪。`;
    } else if (strength < 0) {
      relationshipContext = `你们关系不太好，有些互相排斥。`;
    } else if (strength < 30) {
      relationshipContext = `你们彼此认识，但关系一般。`;
    } else if (strength < 60) {
      relationshipContext = `你们关系还不错，有一定友谊基础。`;
    } else if (strength < 80) {
      relationshipContext = `你们关系很好，是不错的朋友。`;
    } else {
      relationshipContext = `你们关系非常亲密，互相信任和支持。`;
    }
    
    // Get scenario description
    let scenarioDescription = '';
    switch (scenario.scenario) {
      case 'gift':
        scenarioDescription = `${initiatingCharacter.name}送给你一件礼物`;
        break;
      case 'invitation':
        scenarioDescription = `${initiatingCharacter.name}邀请你参加活动`;
        break;
      case 'challenge':
        scenarioDescription = `${initiatingCharacter.name}向你发起挑战`;
        break;
      case 'support':
        scenarioDescription = `${initiatingCharacter.name}向你表达支持`;
        break;
      case 'confession':
        scenarioDescription = `${initiatingCharacter.name}向你表白心意`;
        break;
      case 'meeting':
        scenarioDescription = `${initiatingCharacter.name}与你偶遇`;
        break;
      default:
        scenarioDescription = `${initiatingCharacter.name}与你互动`;
    }
    
    // Add custom detail if provided
    if (scenario.detail) {
      scenarioDescription += `，具体情况是：${scenario.detail}`;
    }
    
    // Construct the full prompt
    return `
你现在扮演角色"${respondingCharacter.name}"，请根据以下信息生成一段对话响应：

角色设定：
${respondingCharacter.description || ''}
${respondingCharacter.personality || ''}

互动对象：
${initiatingCharacter.name}
${initiatingCharacter.description || ''}

关系状态：
${relationshipContext}
关系类型: ${type}
关系强度: ${strength} (-100到100之间)

互动场景：
${scenarioDescription}

请以第一人称的方式，生成"${respondingCharacter.name}"对这个场景的自然、符合角色个性的回应。回应应当体现出角色间的关系状态。
只需要生成对话内容，不要加任何旁白或说明，不要使用引号。回应长度应在30-100字之间，语气自然。
`;
  }
  
  /**
   * Process API response to extract just the character's reply
   */
  private static processApiResponse(response: string): string {
    // Remove any quotes that might be in the response
    response = response.replace(/^["']|["']$/g, '');
    
    // Remove any narrative elements like "Character: " prefixes
    response = response.replace(/^[^:]*:\s*/i, '');
    
    // Limit length
    if (response.length > 200) {
      response = response.substring(0, 197) + '...';
    }
    
    return response;
  }
  
  /**
   * Generate a relationship review prompt for a character
   * to assess their relationships based on recent interactions
   */
  static generateRelationshipReviewPrompt(
    character: Character,
    unreadMessages: number = 5
  ): string {
    if (!character.messageBox || character.messageBox.length === 0) {
      return '';
    }
    
    // Get unread messages
    const messages = character.messageBox
      .filter(msg => !msg.read)
      .slice(0, unreadMessages);
    
    if (messages.length === 0) return '';
    
    const messageList = messages.map((msg, index) => {
      return `${index + 1}. ${msg.senderName || '某人'}${this.getInteractionVerb(msg.type)}：${msg.content}`;
    }).join('\n');
    
    return `
【关系状态检查】
我是${character.name}，以下是我最近收到的一些互动消息，请我分析这些消息，并针对每个互动者更新我对他们的印象和关系强度。

消息列表:
${messageList}

请根据这些消息，分析我应该如何调整与这些角色的关系。
按照以下格式给出回应:

关系更新:
角色ID-强度变化[-100到100之间]-新关系类型(可选)
`;
  }
  
  /**
   * Get verb for interaction type
   */
  private static getInteractionVerb(type: string): string {
    switch (type) {
      case 'like': return '点赞了我的内容';
      case 'comment': return '评论了我的内容';
      case 'reply': return '回复了我的评论';
      case 'relationship_request': return '发来了关系请求';
      case 'invitation': return '向我发出邀请';
      case 'alert': return '向我发出提醒';
      case 'message': return '向我发送消息';
      default: return '与我互动';
    }
  }
  
  /**
   * Parse relationship review response
   */
  static parseRelationshipReviewResponse(response: string): Array<{
    targetId: string;
    strengthDelta: number;
    newType?: string;
  }> {
    const results: Array<{
      targetId: string;
      strengthDelta: number;
      newType?: string;
    }> = [];
    
    // Extract the lines that contain relationship updates
    const updateSection = response.split('关系更新:').pop();
    if (!updateSection) return results;
    
    // Extract update lines with regex
    const updateLines = updateSection.match(/[a-zA-Z0-9]+-[+-]?\d+(-\w+)?/g);
    if (!updateLines) return results;
    
    // Parse each line
    updateLines.forEach(line => {
      const parts = line.split('-');
      if (parts.length < 2) return;
      
      const targetId = parts[0];
      const strengthDelta = parseInt(parts[1]);
      const newType = parts.length > 2 ? parts[2] : undefined;
      
      if (isNaN(strengthDelta)) return;
      
      results.push({
        targetId,
        strengthDelta,
        newType
      });
    });
    
    return results;
  }
}
