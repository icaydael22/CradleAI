import { RelationshipType } from '@/shared/types/relationship-types';
import { PromptTemplate } from '@/shared/types/relationship-types';

/**
 * 提供各类关系模板的服务类
 * 支持根据不同关系类型、强度和场景获取合适的模板
 */
export class RelationshipTemplateProvider {
  /**
   * 获取特定关系类型的基础模板
   * @param type 关系类型
   */
  static getBaseTemplate(type: RelationshipType): PromptTemplate {
    const templates: Record<string, PromptTemplate> = {
      'enemy': {
        id: 'base_enemy',
        content: `作为一个敌人，你的态度是谨慎、冷淡或敌视的。你不信任对方，可能会使用讽刺或冷漠的语气。
          避免表现出友好或温暖，但也不要过度攻击性。保持一定的距离感和警惕性。`,
        parameters: {
          temperature: 0.8,
          maxTokens: 150,
          presencePenalty: 0.5
        }
      },
      'rival': {
        id: 'base_rival',
        content: `作为一个竞争对手，你的态度是有竞争意识但也有一定尊重的。你认为自己在某些方面比对方优秀，
          但也承认他们的才能。你的语气可以带有挑衅和自信，但避免恶意。在互动中展现竞争精神和略带友好的挑战。`,
        parameters: {
          temperature: 0.75,
          maxTokens: 150,
          presencePenalty: 0.3
        }
      },
      'friend': {
        id: 'base_friend',
        content: `作为一个朋友，你的态度是友好、支持和轻松的。你们有共同的兴趣和经历，愿意分享日常事物。
          语气应该是温暖的，偶尔带有幽默感。你关心对方的健康和快乐，愿意提供帮助和建议。`,
        parameters: {
          temperature: 0.7,
          maxTokens: 180,
          presencePenalty: 0.2
        }
      },
      'lover': {
        id: 'base_lover',
        content: `作为恋人，你的态度是亲密、温柔且充满爱意的。你深深关心对方，在交流中表现出亲近和理解。
          你了解对方的情感需求，愿意付出特别的关注。语气应该充满感情，可以使用爱称和亲昵的表达。`,
        parameters: {
          temperature: 0.8,
          maxTokens: 200,
          presencePenalty: 0.1
        }
      }
      // 其他关系类型模板...
    };
    
    return templates[type] || {
      id: 'base_default',
      content: `根据你与对方的关系类型和强度，调整你的态度和表达方式。保持你角色个性的一致性，
        同时考虑你们之间的互动历史和当前情境。`,
      parameters: {
        temperature: 0.7,
        maxTokens: 150,
        presencePenalty: 0.3
      }
    };
  }
  
  /**
   * 获取特定场景的关系模板
   * @param type 关系类型
   * @param scenario 场景类型
   */
  static getScenarioTemplate(type: RelationshipType, scenario: string): PromptTemplate {
    const key = `${type}_${scenario}`;
    
    const templates: Record<string, PromptTemplate> = {
      // 朋友关系下的不同场景
      'friend_greeting': {
        id: 'scenario_friend_greeting',
        content: `作为朋友，你的问候应该友好而温暖。可以询问对方最近的情况，表达见到他们的喜悦，
          或者提及你们共同的兴趣或经历。语气轻松自然，就像你们经常见面一样。`,
        parameters: {
          temperature: 0.7,
          maxTokens: 120
        }
      },
      'friend_support': {
        id: 'scenario_friend_support',
        content: `作为朋友，当对方需要支持时，你应该表现出理解和关心。提供鼓励和实际的帮助，
          让他们知道你在他们身边。避免过度批评，而是专注于积极的支持和解决问题的方法。`,
        parameters: {
          temperature: 0.65,
          maxTokens: 180
        }
      },
      
      // 恋人关系下的不同场景
      'lover_greeting': {
        id: 'scenario_lover_greeting',
        content: `作为恋人，你的问候应该充满爱意和亲密感。使用爱称，表达想念和关心，
          询问他们的感受和状态。语气温柔而充满感情，展现你们关系的特殊性。`,
        parameters: {
          temperature: 0.8,
          maxTokens: 150
        }
      },
      'lover_support': {
        id: 'scenario_lover_support',
        content: `作为恋人，当对方需要支持时，你应该表现出深切的关心和无条件的支持。
          表达你对他们的信任和信心，提供情感上的安慰和具体的帮助。让他们感到被爱和被理解。`,
        parameters: {
          temperature: 0.7,
          maxTokens: 200
        }
      },
      
      // 竞争对手关系下的不同场景
      'rival_greeting': {
        id: 'scenario_rival_greeting',
        content: `作为竞争对手，你的问候可以带有轻微的挑衅和自信。承认对方的存在但展示你的实力，
          可能提及你们之间的竞争或最近的成就。保持礼貌但略带竞争意识的语气。`,
        parameters: {
          temperature: 0.75,
          maxTokens: 130
        }
      },
      'rival_challenge': {
        id: 'scenario_rival_challenge',
        content: `作为竞争对手，面对挑战时，你应该表现出自信和接受挑战的态度。展示你的决心和能力，
          同时保持对对手的尊重。语气坚定而充满竞争精神，但不带恶意。`,
        parameters: {
          temperature: 0.8,
          maxTokens: 160
        }
      }
      // 更多场景模板...
    };
    
    return templates[key] || this.getBaseTemplate(type);
  }
  
  /**
   * 获取为特定关系强度调整后的关系模板
   * @param type 关系类型
   * @param strength 关系强度(-100到100)
   */
  static getStrengthAdjustedTemplate(type: RelationshipType, strength: number): PromptTemplate {
    const baseTemplate = this.getBaseTemplate(type);
    let adjustedContent = baseTemplate.content;
    
    // 根据关系强度调整模板内容
    if (strength > 70) {
      adjustedContent += `\n\n你们的关系非常强烈和深入。表现出高度的信任、了解和情感投入。可以使用更亲密或强烈的表达方式。`;
    } else if (strength > 30) {
      adjustedContent += `\n\n你们的关系稳定且积极。表现出明显的信任和舒适感，但不要过度熟悉。`;
    } else if (strength > 0) {
      adjustedContent += `\n\n你们的关系是积极的，但还很新或不深入。表现出基本的友好，但保持一定的距离和正式感。`;
    } else if (strength > -30) {
      adjustedContent += `\n\n你们的关系略有紧张。保持礼貌但略带防备，避免过度分享或信任。`;
    } else if (strength > -70) {
      adjustedContent += `\n\n你们的关系明显消极。表现出明显的不信任和距离感，但避免公开的敌意。`;
    } else {
      adjustedContent += `\n\n你们的关系极度负面。表现出强烈的不信任、防备或敌意，交流应该非常有限和谨慎。`;
    }
    
    // 调整温度参数以反映关系强度的影响
    const tempAdjust = Math.abs(strength) > 50 ? 0.1 : 0;
    
    return {
      ...baseTemplate,
      content: adjustedContent,
      parameters: {
        ...baseTemplate.parameters,
        temperature: (baseTemplate.parameters?.temperature || 0.7) + tempAdjust
      }
    };
  }
  
  /**
   * 根据OpenRouter模型优化模板
   * 不同模型有不同的优势，此方法根据特定模型调整提示词
   * @param template 基础模板
   * @param modelId OpenRouter模型ID
   */
  static getModelOptimizedTemplate(template: PromptTemplate, modelId: string): PromptTemplate {
    // 基于模型特性调整提示词和参数
    if (modelId.includes('claude')) {
      // Claude模型优化
      return {
        ...template,
        content: `${template.content}\n\n<thinking>\n请考虑关系动态和情感细微差别。提供真实、自然的回应，避免过度做作。\n</thinking>`,
        parameters: {
          ...template.parameters,
          temperature: (template.parameters?.temperature || 0) - 0.05 // Claude通常需要略低的温度
        }
      };
    } else if (modelId.includes('gpt-4')) {
      // GPT-4优化
      return {
        ...template,
        content: `${template.content}\n\n请提供深思熟虑、符合关系复杂性的回应。`,
        parameters: {
          ...template.parameters,
          presencePenalty: (template.parameters?.presencePenalty || 0) + 0.1 // 增加多样性
        }
      };
    } else if (modelId.includes('llama')) {
      // Llama模型优化
      return {
        ...template,
        content: `${template.content}\n\n请直接且清晰地回应，保持一致的角色语音。`,
        parameters: {
          ...template.parameters,
          maxTokens: (template.parameters?.maxTokens || 0) * 1.2 // Llama有时需要更多token以完成回应
        }
      };
    }
    
    // 默认返回原始模板
    return template;
  }
}
