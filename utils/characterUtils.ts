import { RoleCardJson, WorldBookJson } from '@/shared/types';

/**
 * 解析角色JSON数据字符串为对象
 */
export const parseCharacterJson = (jsonString: string): {
  roleCard: RoleCardJson;
  worldBook: WorldBookJson;
  preset: any;
  authorNote?: any;
  chatHistory?: any;
} => {
  try {
    // 清理JSON字符串
    const cleanedJsonString = cleanJsonString(jsonString);
    
    // 解析JSON
    const data = JSON.parse(cleanedJsonString);
    
    // 验证必要字段
    if (!data.roleCard || !data.worldBook) {
      throw new Error('角色数据不完整，缺少roleCard或worldBook');
    }
    
    // 验证角色卡的必要字段
    if (!data.roleCard.name || !data.roleCard.description) {
      throw new Error('角色卡数据不完整，缺少name或description');
    }
    
    // 确保world_book.entries存在
    if (!data.worldBook.entries || typeof data.worldBook.entries !== 'object') {
      data.worldBook.entries = {};
    }
    
    // 确保preset存在
    if (!data.preset) {
      data.preset = createDefaultPreset();
    }
    
    return data;
  } catch (error) {
    console.error('解析角色JSON失败:', error);
    throw new Error(`解析角色数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

/**
 * 清理JSON字符串，修复常见问题
 */
const cleanJsonString = (jsonStr: string): string => {
  // 步骤1：处理引号问题
  jsonStr = jsonStr.replace(/"([^"]+)":\s*"([^"]*)\\?"/g, (match, key, value) => {
    return `"${key}": "${value.replace(/\\/g, '').replace(/"/g, '\\"')}"`;
  });
  
  // 步骤2：修复数组中的问题
  jsonStr = jsonStr.replace(/\[(.*?)\]/gs, (match, content) => {
    return `[${content.replace(/([^\\])"/g, '$1\\"').replace(/^"/, '\\"').replace(/"(?=\s*,|\s*$)/, '\\""').replace(/\\\\"/g, '\\"')}]`;
  });
  
  // 步骤3: 处理控制字符
  jsonStr = jsonStr.replace(/[\u0000-\u001F]/g, '');
  
  // 步骤4: 处理特殊情况下的反斜杠
  jsonStr = jsonStr.replace(/\\{3,}/g, '\\\\');
  
  // 步骤5: 处理键名对象中可能缺失的引号
  jsonStr = jsonStr.replace(/({|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // 步骤6: 处理引号转义不正确的情况
  jsonStr = jsonStr.replace(/":\\"/g, '":"');
  jsonStr = jsonStr.replace(/",\\"/g, '","');
  
  // 最后的清理
  return jsonStr
    .replace(/\\n/g, '\\n')
    .replace(/\\t/g, '\\t')
    .replace(/\\\s+"/g, '\\"')
    .replace(/"\s*\\"/g, '"\\"')
    .replace(/"\\/g, '"\\\\')
    .replace(/\\"/g, '"');
};

/**
 * 创建默认的角色preset
 */
const createDefaultPreset = (): any => {
  return {
    prompts: [
      {
        name: "Character System",
        content: "You are a Roleplayer who is good at playing various types of roles. Regardless of the genre, you will ensure the consistency and authenticity of the role based on the role settings I provide, so as to better fulfill the role.",
        enable: true,
        identifier: "characterSystem",
        role: "user"
      },
      {
        name: "Character Confirmation",
        content: "[Understood]",
        enable: true,
        identifier: "characterConfirmation",
        role: "model"
      },
      {
        name: "Character Introduction",
        content: "The following are some information about the character you will be playing. Additional information will be given in subsequent interactions.",
        enable: true,
        identifier: "characterIntro",
        role: "user"
      },
      {
        name: "Enhance Definitions",
        content: "",
        enable: true,
        identifier: "enhanceDefinitions",
        injection_position: 1,
        injection_depth: 3,
        role: "user"
      },
      {
        name: "Context Instruction",
        content: "推荐以下面的指令&剧情继续：\n{{lastMessage}}",
        enable: true,
        identifier: "contextInstruction",
        role: "user"
      },
      {
        name: "Continue",
        content: "继续",
        enable: true,
        identifier: "continuePrompt",
        role: "user"
      }
    ],
    prompt_order: [{
      order: [
        { identifier: "characterSystem", enabled: true },
        { identifier: "characterConfirmation", enabled: true },
        { identifier: "characterIntro", enabled: true },
        { identifier: "enhanceDefinitions", enabled: true },
        { identifier: "worldInfoBefore", enabled: true },
        { identifier: "charDescription", enabled: true },
        { identifier: "charPersonality", enabled: true },
        { identifier: "scenario", enabled: true },
        { identifier: "worldInfoAfter", enabled: true },
        { identifier: "dialogueExamples", enabled: true },
        { identifier: "chatHistory", enabled: true },
        { identifier: "contextInstruction", enabled: true },
        { identifier: "continuePrompt", enabled: true }
      ]
    }]
  };
};
