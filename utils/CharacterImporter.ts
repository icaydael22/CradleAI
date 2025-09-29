import { PNGParser } from './PNGParser';
import { RoleCardJson, WorldBookJson, PresetJson,WorldBookEntry } from '@/shared/types';
import * as FileSystem from 'expo-file-system';

// Define interfaces for preset data types
interface PresetPrompt {
  name: string;
  content?: string;
  system_prompt?: boolean;
  enabled?: boolean;
  identifier: string;
  injection_position?: number;
  injection_depth?: number;
  role?: string;
  order?: number; // 添加 order 字段
  sortOrder?: number; 
  enable?: boolean; // 重命名 enabled 为 enable
}

export class CharacterImporter {
    /**
   * 新增：仅导入只包含世界书结构的JSON（如白霖.json）
   * @param filePath 本地json文件路径
   */
    static async importWorldBookOnlyFromJson(filePath: string): Promise<WorldBookJson> {
      try {
        let content = await FileSystem.readAsStringAsync(filePath);
        content = content.replace(/^\uFEFF/, '').trim();
        const data = JSON.parse(content);
        // 兼容两种结构：顶层就是entries，或顶层有entries字段
        let entries = data.entries || data;
        if (!entries || typeof entries !== 'object') {
          throw new Error('JSON文件缺少entries字段或结构不正确');
        }
        // 如果entries是对象（如白霖.json），直接用
        // 如果是数组，转为对象
        if (Array.isArray(entries)) {
          // 转为对象，key为entry_0, entry_1...
          const obj: Record<string, any> = {};
          entries.forEach((item, idx) => {
            obj[`entry_${idx}`] = item;
          });
          entries = obj;
        }
        return { entries };
      } catch (e) {
        throw new Error('导入世界书JSON失败: ' + (e instanceof Error ? e.message : '未知错误'));
      }
    }

  static async importFromPNG(filePath: string): Promise<{
    roleCard: RoleCardJson;
    worldBook: WorldBookJson;
    extractedName: string;
    backgroundImage?: string; // Add backgroundImage field to return PNG data
    alternateGreetings?: string[]; // 新增
    regexScripts?: any[]; // 新增：返回regexScripts
    originalJson?: string; // 新增：原始json内容
  }> {
    const data = await PNGParser.readPNGChunks(filePath);
    
    // 检查 chara 数据
    if (!data.chara) {
      throw new Error('Invalid character data: missing chara data');
    }

    // 从多个可能的位置提取名字
    const extractedName = data.chara.name || data.chara.chara?.name || '';
    if (!extractedName) {
      throw new Error('Invalid character data: missing name in chara data');
    }

    console.log('Extracted name:', extractedName); // 添加调试日志

    const roleCard: RoleCardJson = {
      name: extractedName,
      first_mes: data.chara.first_mes || '',
      description: data.chara.description || '',
      personality: data.chara.personality || '',
      scenario: data.chara.scenario || '',
      mes_example: data.chara.mes_example || '',
      data: {
        extensions: {
          regex_scripts: []
        }
      }
    };

    const worldBook: WorldBookJson = {
      entries: {}
    };

    if (data.chara.data?.character_book?.entries) {
      console.log('[WorldBook 导入] PNG解析原始数据:');
      data.chara.data.character_book.entries.forEach((entry: any, index: number) => {
        const normalizedEntry = this.normalizeWorldBookEntry(entry, index);
        worldBook.entries[`entry_${index}`] = normalizedEntry;
        console.log(`条目 ${index}:`, {
          name: entry.name || `entry_${index}`,
          originalPosition: entry.position,
          normalizedPosition: normalizedEntry.position,
          constant: normalizedEntry.constant
        });
      });
    }

    // Convert the original PNG file to base64 for use as background image
    let backgroundImage: string | undefined;
    try {
      // Read the file as base64
      const base64Image = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Create a data URI for the image
      backgroundImage = `data:image/png;base64,${base64Image}`;
      console.log('[Character Import] Successfully extracted PNG as background image');
    } catch (error) {
      console.error('[Character Import] Failed to extract PNG as background image:', error);
      // Continue without background image if extraction fails
    }

    // 修复：处理alternate_greetings - 检查多个可能的路径
    let alternateGreetings: string[] | undefined;
    
    // 首先检查data.chara.data.alternate_greetings
    if (Array.isArray(data.chara.data?.alternate_greetings)) {
      alternateGreetings = data.chara.data.alternate_greetings;
    } 
    // 也检查data.data.alternate_greetings
    else if (Array.isArray(data.data?.alternate_greetings)) {
      alternateGreetings = data.data.alternate_greetings;
    }
    // 直接检查最顶层
    else if (Array.isArray(data.alternate_greetings)) {
      alternateGreetings = data.alternate_greetings;
    }
    
    // 如果找到了alternateGreetings，确保包含first_mes
    if (alternateGreetings && alternateGreetings.length > 0 && roleCard.first_mes) {
      if (!alternateGreetings.includes(roleCard.first_mes)) {
        alternateGreetings = [roleCard.first_mes, ...alternateGreetings];
      }
    } 
    // 如果没有找到alternateGreetings但有first_mes，创建只包含first_mes的数组
    else if (roleCard.first_mes) {
      alternateGreetings = [roleCard.first_mes];
    }

    console.log('[Character Import] Final alternateGreetings:', 
      alternateGreetings ? `(${alternateGreetings.length} items)` : 'undefined');

    // 新增：读取regex_scripts
    let regexScripts: any[] | undefined = undefined;
    try {
      if (
        Array.isArray(data.chara?.data?.extensions?.regex_scripts)
      ) {
        regexScripts = data.chara.data.extensions.regex_scripts;
        console.log(`[CharacterImporter] 已读取regex_scripts，数量: ${regexScripts?.length ?? 0}，字段路径: data.chara.data.extensions.regex_scripts`);
      } else {
        console.log('[CharacterImporter] 未找到regex_scripts字段，字段路径: data.chara.data.extensions.regex_scripts');
      }
    } catch (e) {
      console.warn('[CharacterImporter] 读取regex_scripts时出错:', e);
    }

    // 读取原始PNG中的json内容
    let originalJson: string | undefined;
    try {
      // PNGParser.readPNGChunks 已经解析了chara数据，但我们需要原始json字符串
      // 这里假设PNGParser.readPNGChunks返回的data.charaRaw为原始json字符串（如无则序列化data.chara）
      if (typeof data.charaRaw === 'string') {
        originalJson = data.charaRaw;
      } else if (data.chara) {
        originalJson = JSON.stringify(data.chara, null, 2);
      }
    } catch (e) {
      // ignore
    }

    return { 
      roleCard, 
      worldBook, 
      extractedName,
      backgroundImage,  // Return the background image data
      alternateGreetings, // 新增
      regexScripts, // 新增
      originalJson // 新增
    };
  }

  /**
   * 支持导入Json格式的角色卡（格式需包含roleCard/worldBook/preset，或为扁平结构）
   * @param filePath 本地json文件路径
   */
  static async importFromJson(filePath: string): Promise<{
    roleCard: RoleCardJson;
    worldBook: WorldBookJson;
    preset?: PresetJson;
    extractedName: string;
    backgroundImage?: string;
    alternateGreetings?: string[]; // 新增
    regexScripts?: any[]; // 新增
    originalJson?: string; // 新增
  }> {
    try {
      let content = await FileSystem.readAsStringAsync(filePath);
      content = content.replace(/^\uFEFF/, '').trim();
      const data = JSON.parse(content);

      // 1. 兼容原有格式（含roleCard/worldBook字段）
      if (data.roleCard && data.worldBook) {
        const roleCard: RoleCardJson = data.roleCard;
        const worldBook: WorldBookJson = data.worldBook;
        const preset: PresetJson | undefined = data.preset;
        const extractedName = roleCard.name || '';
        let backgroundImage: string | undefined = data.backgroundImage;
        // 如果backgroundImage为本地文件路径，尝试转为base64
        if (backgroundImage && backgroundImage.startsWith('file://')) {
          try {
            const base64Image = await FileSystem.readAsStringAsync(backgroundImage, {
              encoding: FileSystem.EncodingType.Base64,
            });
            backgroundImage = `data:image/png;base64,${base64Image}`;
          } catch {}
        }
        let alternateGreetings: string[] | undefined;
        if (Array.isArray(data.data?.alternate_greetings)) {
          alternateGreetings = data.data.alternate_greetings;
        }
        return { roleCard, worldBook, preset, extractedName, backgroundImage, alternateGreetings, originalJson: content };
      }

      // 2. 新增：兼容扁平结构（无chara/roleCard/worldBook字段）
      // 复用importFromPNG的逻辑
      // 构造chara对象
      const chara = {
        name: data.name || '',
        description: data.description || '',
        personality: data.personality || '',
        scenario: data.scenario || '',
        first_mes: data.first_mes || '',
        mes_example: data.mes_example || '',
        data: data.data || {},
      };

      // 构造PNGParser.readPNGChunks的返回结构
      const fakePngData = {
        chara,
        charaRaw: content,
        data,
      };

      // 复用importFromPNG的核心逻辑
      // 只调用部分逻辑，不读图片
      // 提取名字
      const extractedName = chara.name || '';
      if (!extractedName) {
        throw new Error('JSON文件缺少name字段');
      }

      const roleCard: RoleCardJson = {
        name: extractedName,
        first_mes: chara.first_mes || '',
        description: chara.description || '',
        personality: chara.personality || '',
        scenario: chara.scenario || '',
        mes_example: chara.mes_example || '',
        data: {
          extensions: {
            regex_scripts: []
          }
        }
      };

      // 兼容世界书结构
      let worldBook: WorldBookJson = { entries: {} };
      if (chara.data?.character_book?.entries) {
        chara.data.character_book.entries.forEach((entry: any, index: number) => {
          const normalizedEntry = this.normalizeWorldBookEntry(entry, index);
          worldBook.entries[`entry_${index}`] = normalizedEntry;
        });
      }

      // alternateGreetings
      let alternateGreetings: string[] | undefined;
      if (Array.isArray(chara.data?.alternate_greetings)) {
        alternateGreetings = chara.data.alternate_greetings;
      } else if (Array.isArray(data.alternate_greetings)) {
        alternateGreetings = data.alternate_greetings;
      }
      if (alternateGreetings && alternateGreetings.length > 0 && roleCard.first_mes) {
        if (!alternateGreetings.includes(roleCard.first_mes)) {
          alternateGreetings = [roleCard.first_mes, ...alternateGreetings];
        }
      } else if (roleCard.first_mes) {
        alternateGreetings = [roleCard.first_mes];
      }

      // regexScripts
      let regexScripts: any[] | undefined = undefined;
      if (Array.isArray(chara.data?.extensions?.regex_scripts)) {
        regexScripts = chara.data.extensions.regex_scripts;
      }

      // backgroundImage: 不处理
      let backgroundImage: string | undefined = undefined;

      return {
        roleCard,
        worldBook,
        extractedName,
        backgroundImage,
        alternateGreetings,
        regexScripts,
        originalJson: content
      };
    } catch (e) {
      throw new Error('导入JSON角色卡失败: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  }

  static async importPresetForCharacter(filePath: string, characterId: string): Promise<PresetJson> {
    try {
      console.log('[预设导入] 开始导入:', filePath);
      
      // 1. 检查并标准化文件路径
      if (!filePath.startsWith('file://')) {
        filePath = `file://${filePath}`;
      }

      // 2. 检查文件是否存在
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error('文件不存在');
      }
      console.log('[预设导入] 文件信息:', fileInfo);

      // 3. 尝试多种方式读取文件内容，并记录每种方式的失败原因
      let content: string | null = null;
      const readFailures: { method: string; error?: any; reason?: string }[] = [];

      // 方法1: 直接读取
      try {
        const direct = await FileSystem.readAsStringAsync(filePath);
        if (direct && !direct.includes('�')) {
          content = direct;
          console.log('[预设导入] 方法1成功: 直接读取');
        } else {
          readFailures.push({ method: '直接读取', reason: '内容为空或包含乱码字符（�）' });
        }
      } catch (e) {
        readFailures.push({ method: '直接读取', error: e });
        console.log('[预设导入] 方法1失败:', e);
      }

      // 方法2: Base64读取
      if (!content) {
        try {
          const base64Content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64
          });
          const decoded = Buffer.from(base64Content, 'base64').toString('utf8');
          if (decoded && !decoded.includes('�')) {
            content = decoded;
            console.log('[预设导入] 方法2成功: Base64读取');
          } else {
            readFailures.push({ method: 'Base64读取', reason: '内容为空或包含乱码字符（�）' });
          }
        } catch (e) {
          readFailures.push({ method: 'Base64读取', error: e });
          console.log('[预设导入] 方法2失败:', e);
        }
      }

      // 方法3: UTF8读取
      if (!content) {
        try {
          const binary = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8
          });
          if (binary && !binary.includes('�')) {
            content = binary;
            console.log('[预设导入] 方法3成功: UTF8读取');
          } else {
            readFailures.push({ method: 'UTF8读取', reason: '内容为空或包含乱码字符（�）' });
          }
        } catch (e) {
          readFailures.push({ method: 'UTF8读取', error: e });
          console.log('[预设导入] 方法3失败:', e);
        }
      }

      // 如果所有方法都失败了，尝试自动转码为UTF-8无BOM后再读一次
      if (!content) {
        try {
          // 读取原始二进制内容
          const binaryBuffer = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64
          });
          // 解码为Buffer
          const buf = Buffer.from(binaryBuffer, 'base64');
          // 以utf8无BOM编码写入临时文件
          const tempPath = filePath.replace(/\.json$/i, `.utf8.json`);
          // expo-file-system不支持直接写Buffer，只能写字符串
          const utf8String = buf.toString('utf8').replace(/^\uFEFF/, '');
          await FileSystem.writeAsStringAsync(tempPath, utf8String, { encoding: FileSystem.EncodingType.UTF8 });
          // 再尝试读取
          const utf8Content = await FileSystem.readAsStringAsync(tempPath, { encoding: FileSystem.EncodingType.UTF8 });
          if (utf8Content && !utf8Content.includes('�')) {
            content = utf8Content;
            console.log('[预设导入] 自动转码为UTF-8无BOM后读取成功:', tempPath);
          } else {
            readFailures.push({ method: '自动转码UTF-8无BOM', reason: '内容为空或包含乱码字符（�）' });
          }
          // 删除临时文件
          await FileSystem.deleteAsync(tempPath, { idempotent: true });
        } catch (e) {
          readFailures.push({ method: '自动转码UTF-8无BOM', error: e });
          console.log('[预设导入] 自动转码UTF-8无BOM失败:', e);
        }
      }

      // 如果所有方法都失败了
      if (!content) {
        // 细化失败原因
        let details = readFailures.map(f => {
          let msg = `【${f.method}】`;
          if (f.error) {
            msg += `异常: ${f.error instanceof Error ? f.error.message : String(f.error)}`;
          }
          if (f.reason) {
            msg += `原因: ${f.reason}`;
          }
          return msg;
        }).join('\n');
        // 文件损坏的判断（所有方式都读取到乱码或异常）
        if (
          readFailures.length > 0 &&
          readFailures.every(f => (f.reason && f.reason.includes('乱码')) || f.error)
        ) {
          details += '\n可能原因：文件内容损坏或编码不正确。';
        }
        throw new Error('无法读取文件内容: 所有读取方法都失败了。\n详细原因如下：\n' + details);
      }

      // 检查并清洗特殊字符，避免因特殊字符导致乱码或解析失败
      // 移除BOM、零宽空格、不可见控制字符等
      const cleanContent = content
        .replace(/^\uFEFF/, '') // BOM
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // 零宽空格等
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // 其它不可见控制字符

      // 检查清洗前后是否有差异，若有则提示
      if (cleanContent.length !== content.length) {
        console.warn('[预设导入] 检测到特殊字符，已自动清洗。');
      }

      let data;
      try {
        // 使用清洗后的内容
        const finalContent = cleanContent.trim();
        data = JSON.parse(finalContent);
        console.log('[预设导入] JSON解析成功, 数据结构:', {
          hasPrompts: !!data.prompts,
          promptCount: data.prompts?.length,
          firstPrompt: data.prompts?.[0] ? {
            name: data.prompts[0].name,
            identifier: data.prompts[0].identifier
          } : null
        });
      } catch (parseError) {
        // 增加详细报错和修复建议
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
        let suggestion = '';
        if (errorMessage.includes('Unexpected token')) {
          suggestion = '请检查JSON文件格式是否正确，是否有多余逗号、缺失括号或引号等语法错误。';
        } else if (errorMessage.includes('Unexpected end of JSON input')) {
          suggestion = '文件内容可能不完整或被截断，请确认文件完整性。';
        } else {
          suggestion = '请检查文件编码（建议UTF-8无BOM），并确保内容为标准JSON格式。';
        }
        console.error('[预设导入] JSON解析失败:', parseError, '\n修复建议:', suggestion);
        console.log('[预设导入] 内容预览:', content.substring(0, 200));
        throw new Error(`预设文件格式无效: ${errorMessage}\n修复建议: ${suggestion}`);
      }

      // 基本数据结构验证
      if (!data || typeof data !== 'object') {
        console.error('[预设导入] 无效的数据结构:', data);
        throw new Error('预设数据格式错误。\n修复建议: 请确保JSON顶层为对象结构。');
      }

      // 在处理prompts数组前记录原始数据
      console.log('[预设导入] 原始prompt数据:', data.prompts);

      // 转换和过滤prompts
      let prompts = [];
      if (Array.isArray(data.prompts)) {
        interface PromptDebugInfo {
          name: string | undefined;
          injection_position: number | undefined;
          injection_depth: number | undefined;
        }

        // 添加更详细的数据追踪
        console.log('[预设导入] 开始处理prompts, 数量:', data.prompts.length);
        data.prompts.forEach((p: PresetPrompt, idx: number) => {
          console.log(`[预设导入] Prompt ${idx}:`, {
            name: p.name,
            injection_position: p.injection_position,
            injection_depth: p.injection_depth,
            role: p.role
          });
        });

        // 先根据 prompt_order 中的顺序创建一个映射表
        const orderMap = new Map<string, number>();
        const enabledMap = new Map<string, boolean>();

        // 优化：选取prompt_order数组中order条目最多的对象
        let bestPromptOrderObj = null;
        if (Array.isArray(data.prompt_order)) {
          bestPromptOrderObj = data.prompt_order.reduce(
            (prev: any, curr: any) => {
              if (!curr || !Array.isArray(curr.order)) return prev;
              if (!prev || (curr.order.length > prev.order.length)) return curr;
              return prev;
            },
            null
          );
        }
        // 新增日志：打印选中的prompt_order对象的character_id
        if (bestPromptOrderObj) {
          console.log('[预设导入] 选中order条目最多的prompt_order对象:', {
            character_id: bestPromptOrderObj.character_id,
            orderLength: Array.isArray(bestPromptOrderObj.order) ? bestPromptOrderObj.order.length : 0
          });
        }
        if (!bestPromptOrderObj || !Array.isArray(bestPromptOrderObj.order)) {
          const msg = '预设文件缺少有效的 prompt_order 字段或 order 数组。';
          const fix = '请确保 prompt_order 字段为数组，且包含 order 数组，每个元素有 identifier 和 enabled 字段。';
          console.error('[预设导入] prompt_order结构错误:', data.prompt_order, '\n修复建议:', fix);
          throw new Error(msg + '\n修复建议: ' + fix);
        }

        bestPromptOrderObj.order.forEach((item: any, index: number) => {
          if (!item.identifier) {
            const msg = `prompt_order[*].order[${index}] 缺少 identifier 字段。`;
            const fix = '请为每个 order 项补全 identifier 字段。';
            console.error('[预设导入] prompt_order项缺失identifier:', item, '\n修复建议:', fix);
            throw new Error(msg + '\n修复建议: ' + fix);
          }
          orderMap.set(item.identifier, index);
          enabledMap.set(item.identifier, item.enabled ?? true);
        });

        // 处理 prompts，使用 prompt_order 中的顺序
        prompts = data.prompts
          .filter((prompt: PresetPrompt): boolean => {
            const isValid = !!(prompt && prompt.identifier && prompt.name);
            if (!isValid) {
              console.log('[预设导入] 过滤无效prompt:', prompt);
            }
            return isValid;
          })
          .map((prompt: PresetPrompt): PresetPrompt & { sortOrder: number } => {
            const normalizedRole = this.normalizeRole(prompt.role);
            const injection_position = prompt.injection_position ?? 
              (normalizedRole === 'model' ? 1 : 0);

            // 检查 identifier 是否在 prompt_order 中
            if (!orderMap.has(prompt.identifier)) {
              console.warn(`[预设导入] prompt.identifier "${prompt.identifier}" 未在 prompt_order 中找到。`);
            }

            // 获取排序顺序，如果在 order 中找不到，则放到最后
            const sortOrder = orderMap.has(prompt.identifier) 
              ? orderMap.get(prompt.identifier)! 
              : Number.MAX_SAFE_INTEGER;

            // 获取启用状态 - use the correct field name enable instead of enabled
            const enable = enabledMap.has(prompt.identifier)
              ? enabledMap.get(prompt.identifier)
              : (prompt.system_prompt ?? prompt.enabled ?? true);

            return {
              name: String(prompt.name || ''),
              content: String(prompt.content || ''),
              enable: enable, // Use 'enable' instead of 'enabled' to match our interface
              identifier: String(prompt.identifier),
              role: normalizedRole,
              injection_position,
              injection_depth: prompt.injection_depth,
              sortOrder // 临时字段，用于排序
            };
          })
          .sort((a: PresetPrompt & { sortOrder: number }, b: PresetPrompt & { sortOrder: number }) => 
            a.sortOrder - b.sortOrder
          )
          .map(({ sortOrder, ...prompt }: PresetPrompt & { sortOrder: number }): PresetPrompt => prompt);

        console.log('[预设导入] 最终排序结果:', prompts.map((p: PresetPrompt, idx: number) => ({
          name: p.name,
          identifier: p.identifier,
          finalOrder: idx,
          injection_position: p.injection_position,
          injection_depth: p.injection_depth,
          enable: p.enable // Updated to use the correct field name
        })));

      } else {
        const msg = '预设文件中prompts格式错误，prompts不是数组。';
        const fix = '请确保prompts字段为数组，每个元素包含identifier和name字段。';
        console.error('[预设导入] prompts不是数组:', data.prompts, '\n修复建议:', fix);
        throw new Error(msg + '\n修复建议: ' + fix);
      }

      // 确保至少有一个有效的prompt
      if (prompts.length === 0) {
        const msg = '预设文件中没有有效的提示词（prompts）。';
        const fix = '请检查prompts数组，确保每个元素都有identifier和name字段，且不为空。';
        console.error('[预设导入] 没有有效的prompts', '\n修复建议:', fix);
        throw new Error(msg + '\n修复建议: ' + fix);
      }

      // 在处理 prompt_order 前，记录原始顺序
      console.log('[预设导入] 原始顺序:', data.prompts.map((p: PresetPrompt) => ({
        name: p.name,
        identifier: p.identifier,
        position: p.injection_position
      })));

      // 构建最终的order数组
      const order = prompts.map((p: PresetPrompt): { identifier: string; enabled: boolean } => ({
        identifier: p.identifier,
        enabled: p.enable ?? false // Updated to use the correct field name
      }));

      // 检查order数组是否为空
      if (!order.length) {
        const msg = '生成的order数组为空。';
        const fix = '请检查prompts和prompt_order字段，确保二者匹配且不为空。';
        console.error('[预设导入] order数组为空', '\n修复建议:', fix);
        throw new Error(msg + '\n修复建议: ' + fix);
      }

      const presetJson: PresetJson = {
        prompts,
        prompt_order: [{
          order
        }]
      };

      // 在返回前记录最终数据
      console.log('[预设导入] 最终数据:', {
        promptCount: presetJson.prompts.length,
        samplePrompts: presetJson.prompts.slice(0, 2).map(p => ({
          name: p.name,
          injection_position: p.injection_position,
          injection_depth: p.injection_depth
        }))
      });

      console.log('[预设导入] 生成的预设:', {
        promptsCount: presetJson.prompts.length,
        orderCount: presetJson.prompt_order[0].order.length,
        samplePrompt: presetJson.prompts[0]
      });

      return presetJson;

    } catch (error) {
      // 增强最终catch的报错信息
      let extra = '';
      if (error instanceof Error && error.message) {
        if (error.message.includes('Unexpected token')) {
          extra = '\n常见原因：JSON格式错误（如多余逗号、缺失括号/引号），或文件编码问题。建议用文本编辑器（如VSCode）检查格式和编码。';
        } else if (error.message.includes('prompts格式错误')) {
          extra = '\n请确保prompts字段为数组，且每个元素有identifier和name字段。';
        } else if (error.message.includes('prompt_order')) {
          extra = '\n请确保prompt_order字段结构正确，order为数组且每项有identifier和enabled。';
        }
      }
      console.error('[预设导入] 失败:', {
        error,
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      }, extra);
      // 在报错信息中附加修复建议
      throw new Error((error instanceof Error ? error.message : String(error)) + extra);
    }
  }

  private static normalizeWorldBookEntry(entry: any, index: number): WorldBookEntry {
    // 从 extensions.position 直接获取位置值，如果不存在则默认为 4 (按深度插入)
    const rawPosition = entry.extensions.position;
    let position: 0 | 1 | 2 | 3 | 4 = 4;
    
    // 确保 position 是有效的枚举值
    if (typeof rawPosition === 'number' && rawPosition >= 0 && rawPosition <= 4) {
      position = rawPosition as 0 | 1 | 2 | 3 | 4;
    }

    console.log('[WorldBook 导入] 规范化条目:', {
      name: entry.name || `entry_${index}`,
      rawPosition,
      normalizedPosition: position
    });

    return {
      comment: entry.comment || '',
      content: entry.content || '',
      disable: !entry.enabled, // 将 enabled 转换为 disable，注意是取反
      position,
      constant: !!entry.constant,
      order: entry.insertion_order || index,
      vectorized: !!entry.extensions?.vectorized,
      key: Array.isArray(entry.keys) ? entry.keys : [],
      // 只在 position === 4 时设置 depth
      depth: position === 4 ? (entry.extensions?.depth || 0) : 0
    };
  }

  private static normalizeRole(role?: string): 'user' | 'model' {
    switch (role?.toLowerCase()) {
      case 'assistant':
      case 'model':
      case 'ai':
        return 'model';
      default:
        return 'user';
    }
  }
}