import fs from 'fs';
import path from 'path';

// 添加更详细的接口定义
interface RawPrompt {
  name?: string;
  content?: string;
  system_prompt?: boolean;
  enabled?: boolean;
  identifier?: string;
  injection_position?: number;
  injection_depth?: number;
  role?: string;
}

interface OrderItem {
  identifier: string;
  enabled?: boolean;
}

interface RawPresetData {
  prompts?: RawPrompt[];
  prompt_order?: Array<{
    order?: OrderItem[];
  }>;
}

interface PresetPrompt {
  name: string;
  content?: string;
  system_prompt?: boolean;
  enabled?: boolean;
  identifier: string;
  injection_position?: number;
  injection_depth?: number;
  role?: string;
}

interface PresetJson {
  prompts: PresetPrompt[];
  prompt_order: Array<{
    order: Array<{
      identifier: string;
      enabled: boolean;
    }>;
  }>;
}

function validatePreset(filePath: string) {
  try {
    console.log('[预设验证] 开始验证文件:', filePath);
    
    // 读取文件
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('[预设验证] 文件内容长度:', content.length);
    
    // 解析 JSON
    const data = JSON.parse(content) as RawPresetData;
    console.log('[预设验证] JSON 解析成功');
    
    // 验证基本结构
    if (!data || typeof data !== 'object') {
      throw new Error('无效的JSON格式：不是对象');
    }

    console.log('[预设验证] 数据结构:', {
      hasPrompts: !!data.prompts,
      promptsCount: data.prompts?.length,
      hasPromptOrder: !!data.prompt_order,
    });

    // 验证 prompts 数组
    if (!Array.isArray(data.prompts)) {
      throw new Error('prompts 必须是数组');
    }

    // 验证每个 prompt
    data.prompts.forEach((prompt: RawPrompt, index: number) => {
      if (!prompt.identifier || !prompt.name) {
        console.warn(`[警告] 第 ${index + 1} 个 prompt 缺少必需字段:`, prompt);
      }
    });

    // 验证 prompt_order
    if (!data.prompt_order?.[0]?.order) {
      console.warn('[警告] 缺少 prompt_order 或格式不正确');
    }

    // 尝试转换为预期格式
    const presetJson: PresetJson = {
      prompts: data.prompts?.map((prompt: RawPrompt): PresetPrompt => ({
        name: String(prompt.name || ''),
        content: String(prompt.content || ''),
        enabled: Boolean(prompt.system_prompt ?? prompt.enabled ?? true),
        identifier: String(prompt.identifier || ''),
        role: String(prompt.role || 'user'),
        ...(prompt.injection_position !== undefined && {
          injection_position: Number(prompt.injection_position)
        }),
        ...(prompt.injection_depth !== undefined && {
          injection_depth: Number(prompt.injection_depth)
        })
      })) || [],
      prompt_order: [{
        order: Array.isArray(data.prompt_order?.[0]?.order) 
          ? data.prompt_order[0].order.map((item: OrderItem) => ({
              identifier: String(item.identifier || ''),
              enabled: Boolean(item.enabled ?? true)
            }))
          : (data.prompts || []).map((p: RawPrompt) => ({
              identifier: String(p.identifier || ''),
              enabled: true
            }))
      }]
    };

    console.log('[预设验证] 验证成功');
    console.log('转换后的数据:', JSON.stringify(presetJson, null, 2));
    
    // 保存验证后的结果
    const outputPath = path.join(
      path.dirname(filePath),
      `validated_${path.basename(filePath)}`
    );
    fs.writeFileSync(outputPath, JSON.stringify(presetJson, null, 2));
    console.log('[预设验证] 已保存验证后的文件到:', outputPath);

    return true;
  } catch (error) {
    console.error('[预设验证] 失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      console.error('堆栈信息:', error.stack);
    }
    return false;
  }
}

// 使用示例
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('请提供预设文件路径');
    process.exit(1);
  }

  const filePath = args[0];
  const isValid = validatePreset(filePath);
  process.exit(isValid ? 0 : 1);
}

export { validatePreset };
