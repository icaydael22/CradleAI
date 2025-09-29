import { Character } from '@/shared/types';
import { Relationship, RelationshipType } from '@/shared/types/relationship-types';
import { DEntry, RFrameworkEntry } from '@/NodeST/nodest/services/prompt-builder-service';

/**
 * 关系模板服务
 * 为不同关系类型提供特定的提示模板
 */
export class RelationshipTemplateService {
  /**
   * 为特定关系类型获取R框架模板
   * 针对不同关系类型定制角色扮演提示
   */
  static getRelationshipRFramework(
    sourceCharacter: Character,
    targetCharacter: Character,
    relationship: Relationship
  ): RFrameworkEntry[] {
    const commonFramework: RFrameworkEntry[] = [
      {
        name: "Character Identity",
        content: `你是${sourceCharacter.name}，${sourceCharacter.description || '一个虚拟角色'}。`,
        identifier: "character_identity"
      },
      {
        name: "Target Information",
        content: `你正在与${targetCharacter.name}交流，${targetCharacter.description || '另一个角色'}。`,
        identifier: "target_info"
      }
    ];
    
    // Add relationship-specific framework entry
    const relationshipTemplate = this.getRelationshipTypeTemplate(relationship.type, relationship.strength, targetCharacter);
    
    commonFramework.push({
      name: "Relationship Dynamic",
      content: relationshipTemplate,
      identifier: "relationship_dynamic"
    });
    
    return commonFramework;
  }
  
  /**
   * 为特定关系类型获取D类条目模板
   * 针对不同关系类型的深度上下文
   */
  static getRelationshipDEntries(
    sourceCharacter: Character,
    targetCharacter: Character,
    relationship: Relationship,
    context?: string
  ): DEntry[] {
    const dEntries: DEntry[] = [];
    
    // Add relationship history if exists
    if (relationship.interactions > 0) {
      dEntries.push({
        name: "Relationship History",
        content: `你和${targetCharacter.name}已经有${relationship.interactions}次互动。你们的关系是"${relationship.type}"，关系强度为${relationship.strength}（-100到100的范围）。`,
        depth: 1
      });
    }
    
    // Add relationship description
    if (relationship.description) {
      dEntries.push({
        name: "Relationship Description",
        content: `你对${targetCharacter.name}的印象：${relationship.description}`,
        depth: 1
      });
    }
    
    // Add relationship guidance based on type
    dEntries.push({
      name: "Interaction Guidance",
      content: this.getRelationshipGuidance(relationship.type, relationship.strength),
      depth: 0
    });
    
    // Add context if provided
    if (context) {
      dEntries.push({
        name: "Current Context",
        content: context,
        depth: 0
      });
    }
    
    return dEntries;
  }
  
  /**
   * 获取关系类型模板
   * 根据关系类型和强度定制基础模板
   */
  private static getRelationshipTypeTemplate(type: RelationshipType, strength: number, targetCharacter: Character): string {
    const strengthAbs = Math.abs(strength);
    const intensityLevel = strengthAbs < 30 ? "轻微" : 
                           strengthAbs < 70 ? "中等" :
                           "强烈";
    
    switch (type) {
      // Negative relationships
      case 'enemy':
        return `你与${targetCharacter.name}是敌人关系，有${intensityLevel}的敌意。互动时表现出警惕、冷淡或敌视的态度，但保持基本的礼节。可以偶尔表现出尖锐的讽刺或含蓄的威胁，但不要过分激进。你不信任对方，对他们的言行持怀疑态度，但也承认他们可能有值得尊敬的品质。`;
        
      case 'rival':
        return `你与${targetCharacter.name}是竞争对手，有${intensityLevel}的竞争关系。互动时表现出竞争意识和挑战精神，但也有一定程度的尊重。你认为自己在某些方面比对方优秀，但也承认对方的才能。你的语气可以带有挑衅和自信，但不应该有恶意。你们的关系复杂，既有竞争也有潜在的相互欣赏。`;
        
      // Neutral relationships
      case 'stranger':
        return `你与${targetCharacter.name}是陌生人，几乎没有了解。互动时保持礼貌但谨慎的态度，不要分享太多个人信息。你对对方感到好奇但保持距离，语气应该中立、客观。尽量使用正式用语，避免过于亲密或随意的表达方式。`;
        
      case 'acquaintance':
        return `你与${targetCharacter.name}是泛泛之交，有基本的了解但不深入。互动时表现得友好但不亲密，愿意进行轻松的交谈但避免深入的个人话题。你对对方有初步印象，但仍在形成更完整的看法。语气应该友善但保持一定的社交距离。`;
        
      case 'colleague':
        return `你与${targetCharacter.name}是同事关系，有专业上的联系。互动时注重专业和工作相关话题，表现得合作和尊重。你们的关系主要基于共同目标或环境，而非个人情感连接。语气应该专业、有建设性，可以分享与工作相关的信息但较少涉及私人生活。`;
        
      // Positive relationships
      case 'friend':
        return `你与${targetCharacter.name}是朋友关系，有${intensityLevel}的友谊。互动时表现得温暖、支持和轻松自在。你们共享一些经历和喜好，愿意分享日常生活和一般性的想法。语气应该友好、亲切，偶尔带有幽默感。你关心对方的福祉，愿意提供帮助和建议。`;
        
      case 'close_friend':
        return `你与${targetCharacter.name}是好朋友关系，有${intensityLevel}的亲密友谊。互动时表现得非常熟悉和舒适，能够分享更深层次的想法和感受。你们有共同的历史和内部笑话，彼此了解对方的优点和缺点。语气应该亲近、坦诚、关心，可以直言不讳但总是善意的。你高度信任对方，愿意寻求和提供情感支持。`;
        
      case 'best_friend':
        return `你与${targetCharacter.name}是挚友关系，有非常深厚的情感联系。互动时表现得极度亲密和理解，几乎不需要伪装或保留。你们有大量共同经历，能够预测对方的反应和需求。语气应该非常亲近、有时甚至不需要完整表达就能理解对方，充满独特的默契。你对对方无条件支持，愿意为对方付出很多。`;
        
      // Special relationships
      case 'family':
        return `你与${targetCharacter.name}有家人般的亲密关系，即使有摩擦也存在深厚的基础联系。互动时表现出强烈的归属感和熟悉度，可以直接但总是出于关心。你们之间可能有意见分歧，但基础感情不变。语气可以包含善意的唠叨、直率的建议和无条件的支持。`;
        
      case 'crush':
        return `你对${targetCharacter.name}有${intensityLevel}的暗恋感情，尚未表白。互动时表现出一定的紧张和羞涩，特别关注对方的反应。你倾向于表现自己最好的一面，可能会过度解读对方的言行。语气可以包含含蓄的赞美、关心和试探性的亲近，但也保持一定的克制。`;
        
      case 'lover':
        return `你与${targetCharacter.name}有浪漫关系，互动中流露出${intensityLevel}的爱意。在交流中表现出亲密、温柔和理解，能够自然地表达感情和关心。你了解对方的情感需求和喜好，愿意为对方做特别的事情。语气应该充满感情、支持和亲近，包含爱称和私人玩笑。`;
        
      case 'partner':
        return `你与${targetCharacter.name}是长期伴侣关系，有稳固且深厚的感情基础。互动时表现出极高的舒适度和相互依赖，能够无缝配合和理解。你们有大量共同经历和未来规划，彼此生活深度交织。语气应该亲密、日常、有时略带唠叨，展现长期关系的熟悉感和安全感。`;
        
      case 'ex':
        return `你与${targetCharacter.name}曾经有过亲密关系，现在已经结束。互动时可能带有${intensityLevel}的复杂情绪，可能包括怀旧、遗憾、尴尬或成长后的平静。你对对方有深入了解，但现在保持一定距离。语气可能有微妙的紧张或伤感，但努力保持成熟和尊重。`;
        
      case 'mentor':
        return `你是${targetCharacter.name}的导师或指导者，处于引导和支持的位置。互动时表现出指导性、鼓励和对对方成长的关注。你乐于分享知识和经验，对对方的进步感到满足。语气应该支持性、有教育意义，偶尔带有温和的批评和高期望。`;
        
      case 'student':
        return `你是${targetCharacter.name}的学生或被指导者，向对方学习。互动时表现出尊重、好学和感激，重视对方的意见和建议。你期望从对方那里获取知识和指导，愿意接受反馈。语气应该谦逊、求知、感激，展现成长和进步的意愿。`;
        
      case 'admirer':
        return `你钦佩${targetCharacter.name}，对其才能或品质有${intensityLevel}的欣赏。互动时表现出尊敬和赞赏，可能会谈论你欣赏的具体方面。你愿意支持对方并从中获取灵感。语气应该热情、赞赏、略带崇敬，但不至于过分谄媚。`;
        
      case 'idol':
        return `你视${targetCharacter.name}为偶像或榜样，有强烈的仰慕之情。互动时表现出深度敬佩和对对方成就的崇敬。你可能会紧张或过于热情，非常看重对方的认可。语气应该充满敬意、兴奋和感激，表达对对方影响的重视。`;
        
      // Default case
      default:
        return `你与${targetCharacter.name}的关系强度为${strength}（-100到100范围）。根据这个强度，调整你的互动态度和语气，使其自然且符合情境。`;
    }
  }
  
  /**
   * 获取关系互动指导
   * 为不同关系类型提供交互风格指导
   */
  private static getRelationshipGuidance(type: RelationshipType, strength: number): string {
    const isNegative = strength < 0;
    const isStrong = Math.abs(strength) >= 70;
    
    switch (type) {
      // 敌对关系
      case 'enemy':
        return `互动指导：保持警惕和距离。${
          isStrong ? '语气冷淡或敌视，可能带有讽刺或轻蔑。尽量简短直接，不要分享个人信息或表现脆弱。' : 
          '保持礼貌但疏远，言语中带有不信任。避免过度敌意，保持基本尊重。'
        }`;
        
      case 'rival':
        return `互动指导：展现竞争意识和专业态度。${
          isStrong ? '使用略带挑衅的语气，强调自己的优势，但承认对方的才能。交流带有明显的竞争色彩。' : 
          '保持健康的竞争关系，语气自信但不刻意挑衅。承认对方的成就，同时展示自己的实力。'
        }`;
        
      // 中立关系
      case 'stranger':
        return `互动指导：保持礼貌和适当距离。使用正式语气，避免过于亲密或随意的表达。不要分享太多个人信息，保持基本的好奇和开放态度。`;
        
      case 'acquaintance':
        return `互动指导：友好但不亲密。交谈内容保持轻松和一般性，可以分享非私密的个人信息。语气友善但保持一定社交距离，避免过度熟悉或假设亲近关系。`;
        
      case 'colleague':
        return `互动指导：专业和合作为主。重点讨论共同兴趣或工作相关话题，语气尊重且有建设性。可以友好但避免过于个人化的评论，保持适当的职业边界。`;
        
      // 积极关系
      case 'friend':
        return `互动指导：温暖和支持的态度。${
          isStrong ? '分享日常生活和个人想法，语气轻松自然。使用幽默和友好的玩笑，表达关心和兴趣。' : 
          '保持友好和开放，但不假设过深的了解。可以分享一般性观点和经历，语气亲切但不过分亲密。'
        }`;
        
      case 'close_friend':
        return `互动指导：亲近和坦诚的交流。${
          isStrong ? '可以自由表达自己，包括深层次想法和情感。使用亲密的语气和内部笑话，无需过多解释背景。' : 
          '分享较私人的想法和感受，语气亲近且关心。可以温和批评或开玩笑，但保持尊重和体贴。'
        }`;
        
      case 'best_friend':
        return `互动指导：极度亲密和理解的交流。可以完全做自己，使用独特的交流方式和默契。语气亲密、直接、毫无保留，可能包含只有你们懂的参考和玩笑。表达无条件支持和深厚的信任。`;
        
      // 特殊关系
      case 'family':
        return `互动指导：家人般的亲密关系。${
          isNegative ? '尽管关系紧张，仍保持基本的关心和责任感。语气可能复杂，混合着义务、关心和挫折。' : 
          '表达无条件的支持和关心，语气可能包含善意的唠叨或直率的建议。展现深厚的理解和原谅。'
        }`;
        
      case 'crush':
        return `互动指导：含蓄表达好感和兴趣。${
          isStrong ? '语气带有明显的紧张和羞涩，特别关注对方的回应。可能过度分析对方言行，试图留下好印象。' : 
          '表现出温和的兴趣和关注，语气友好但略带羞涩。避免过于明显的暗示，保持适当的距离。'
        }`;
        
      case 'lover':
        return `互动指导：展现亲密和浪漫情感。${
          isStrong ? '语气充满爱意和特殊的亲密感，使用爱称和私人表达方式。表现出深刻的理解和情感连接。' : 
          '表达温暖的感情和关心，语气亲密但保持一定的自我界限。展现对对方的欣赏和爱护。'
        }`;
        
      case 'partner':
        return `互动指导：表现深度融合的生活关系。语气舒适、熟悉且日常，展现长期关系的安全感和相互依赖。可以直接表达需求和观点，同时展示深层次的理解和支持。`;
        
      case 'ex':
        return `互动指导：平衡过去联系和当前界限。${
          isNegative ? '保持礼貌但疏远，避免引起不必要的冲突或伤害。语气中可能带有轻微的紧张或防御。' : 
          '展现成熟和尊重，承认过去但专注于现在。语气可能带有一定的怀旧，但不沉浸其中。'
        }`;
        
      case 'mentor':
        return `互动指导：提供指导和支持。语气鼓励但有一定权威，分享知识和经验时保持耐心和开放。关注对方的成长和发展，提供建设性的反馈和指导。`;
        
      case 'student':
        return `互动指导：表现尊重和求知欲。语气谦逊且感激，积极寻求建议和学习。展示对指导的重视和应用，分享进步和疑问。`;
        
      case 'admirer':
        return `互动指导：展现真诚的赞赏和兴趣。语气热情但不过分，表达对特定才能或品质的欣赏。可能寻求建议或分享受到的影响。`;
        
      case 'idol':
        return `互动指导：表达深度敬仰和受影响。语气热情且尊敬，可能略带紧张或过度热忱。表达感谢和对对方工作或成就的重视。`;
        
      // 默认情况
      default:
        return `互动指导：根据关系强度${strength}调整互动态度。${
          strength > 50 ? '表现出明显的友好和关心，语气温暖且支持。' : 
          strength > 0 ? '保持友好和开放，但不假设过深的了解。' :
          strength > -50 ? '保持礼貌和基本尊重，但保持一定距离。' :
          '保持警惕和距离，语气冷淡但不失礼节。'
        }`;
    }
  }
  
  /**
   * 获取适合特定场景的问候语模板
   */
  static getGreetingTemplate(
    relationship: Relationship,
    scenario: 'morning' | 'afternoon' | 'evening' | 'casual' | 'formal' | 'reunion'
  ): string {
    const type = relationship.type;
    const strength = relationship.strength;
    
    // 根据关系类型和强度定制问候语
    const greetings: Record<string, Record<string, string>> = {
      enemy: {
        casual: strength < -70 ? '哼，是你。' : '看来我们又见面了。',
        formal: '真巧，没想到会在这里遇到你。',
        reunion: '好久不见。情况似乎没什么改变。'
      },
      friend: {
        casual: strength > 70 ? '嘿，我的好朋友！最近怎么样？' : '你好啊，朋友！',
        morning: '早上好！今天看起来不错，是吧？',
        evening: '晚上好！结束了一天的忙碌？'
      },
      lover: {
        casual: strength > 80 ? '亲爱的，我好想你！' : '嗨，最近过得好吗？',
        morning: '早安，亲爱的，昨晚睡得好吗？',
        evening: '晚上好，我的爱，今天过得如何？'
      }
      // 可以继续添加更多关系类型和场景
    };
    
        // 如果有特定的关系类型和场景
        if (greetings[type]?.[scenario]) {
          return greetings[type][scenario];
        }
    
        // 默认问候语
        return '你好。';
      }
    }