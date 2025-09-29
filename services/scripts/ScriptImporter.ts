import { Character, CradleCharacter } from '@/shared/types';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { NodeSTManager} from '@/utils/NodeSTManager';
import { ScriptService } from '@/services/script-service';
import { Script} from '@/shared/types/script-types';
import JSZip from 'jszip';
import { EventRegister } from 'react-native-event-listeners';
// ===== 剧本导入，剧本角色创建功能 =====
// 功能说明：导入剧本时，自动创建剧本中的所有角色
// 实现流程：
// 1. 从parsed-types.json中提取角色名称列表
// 2. 从assets/avatar和assets/background读取角色头像和背景
// 3. 从assets/preset和assets/worldbook读取角色配置
// 4. 为每个角色创建NodeST角色数据结构（使用preset和worldbook）
// 5. 自动创建对话窗口
// 6. 标记为剧本角色，在TopBar中只显示设置按钮
// 7. 在角色列表中隐藏，但在剧本卡片中显示头像
// ==========================================

const scriptService = ScriptService.getInstance();

// 新增：从ZIP文件中读取角色的preset和worldbook配置
export const loadCharacterConfigFromZip = async (characterName: string, zipFileUri: string): Promise<{
  preset?: any;
  worldbook?: any;
}> => {
    try {
      console.log(`📋 正在加载角色 ${characterName} 的配置文件...`);
      
      // 读取ZIP文件
      const zipData = await FileSystem.readAsStringAsync(zipFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipData, { base64: true });
      
      let preset = undefined;
      let worldbook = undefined;
      
      // 尝试读取preset配置
      const presetPath = `assets/preset/${characterName}.json`;
      const presetFile = zipContent.file(presetPath);
      if (presetFile) {
        try {
          const presetContent = await presetFile.async('string');
          const rawPresetData = JSON.parse(presetContent);
          console.log(`✅ 成功读取角色 ${characterName} 的preset配置`);
          
          // ===== 重要修复：使用CharacterImporter的逻辑处理preset启用状态 =====
          if (rawPresetData.prompts && Array.isArray(rawPresetData.prompts)) {
            // 构建启用状态映射表
            const enabledMap = new Map<string, boolean>();
            
            // 从prompt_order中获取启用状态
            if (Array.isArray(rawPresetData.prompt_order)) {
              // 选取order条目最多的对象
              let bestPromptOrderObj = rawPresetData.prompt_order.reduce(
                (prev: any, curr: any) => {
                  if (!curr || !Array.isArray(curr.order)) return prev;
                  if (!prev || (curr.order.length > prev.order.length)) return curr;
                  return prev;
                },
                null
              );
              
              if (bestPromptOrderObj && Array.isArray(bestPromptOrderObj.order)) {
                console.log(`📋 从prompt_order读取启用状态，共 ${bestPromptOrderObj.order.length} 个条目`);
                bestPromptOrderObj.order.forEach((item: any) => {
                  if (item.identifier) {
                    enabledMap.set(item.identifier, item.enabled ?? true);
                    console.log(`📋 启用状态映射: ${item.identifier} -> ${item.enabled ?? true}`);
                  }
                });
              }
            }
            
            // 处理prompts，应用启用状态
            const processedPrompts = rawPresetData.prompts.map((prompt: any) => {
              const enable = enabledMap.has(prompt.identifier)
                ? enabledMap.get(prompt.identifier)
                : (prompt.system_prompt ?? prompt.enabled ?? true);
              
              return {
                ...prompt,
                enable: enable // 设置正确的启用状态
              };
            });
            
            // 重构最终的preset数据
            preset = {
              ...rawPresetData,
              prompts: processedPrompts,
              prompt_order: rawPresetData.prompt_order || []
            };
            
            console.log(`📋 preset处理完成，共 ${preset.prompts.length} 个prompts`);
            console.log(`📋 启用状态示例:`, preset.prompts.slice(0, 3).map((p: any) => 
              `${p.name}: enable=${p.enable}`
            ));
          }
        } catch (error) {
          console.warn(`⚠️ 解析角色 ${characterName} 的preset配置失败:`, error);
        }
      } else {
        console.log(`ℹ️ 未找到角色 ${characterName} 的preset配置 (${presetPath})`);
      }
      
      // 尝试读取worldbook配置
      const worldbookPath = `assets/worldbook/${characterName}.json`;
      const worldbookFile = zipContent.file(worldbookPath);
      if (worldbookFile) {
        try {
          const worldbookContent = await worldbookFile.async('string');
          worldbook = JSON.parse(worldbookContent);
          console.log(`✅ 成功读取角色 ${characterName} 的worldbook配置`);
        } catch (error) {
          console.warn(`⚠️ 解析角色 ${characterName} 的worldbook配置失败:`, error);
        }
      } else {
        console.log(`ℹ️ 未找到角色 ${characterName} 的worldbook配置 (${worldbookPath})`);
      }
      
      return { preset, worldbook };
      
    } catch (error) {
      console.error(`❌ 加载角色 ${characterName} 配置时发生错误:`, error);
      return { preset: undefined, worldbook: undefined };
    }
  };
  
  // 新增：创建剧本角色的函数
  export const createScriptCharacters = async (
    scriptId: string, 
    importResult: any, 
    fileName: string, 
    zipFileUri: string,
    addCharacter: (character: Character) => Promise<void>,
    addConversation: (conversation: { id: string; title: string }) => Promise<void>
  ): Promise<{
    characterNames: string[];
    createdCount: number;
  }> => {
    try {
      console.log('🎭 开始创建剧本角色...');
      
      // 从parsedTypes中提取角色列表
      const parsedTypes = importResult.parsedTypes || {};
      const charactersData = parsedTypes.characters || {};
      const characterNames = Object.keys(charactersData);
      
      if (characterNames.length === 0) {
        console.log('⚠️ 未在parsed-types.json中找到角色数据');
        return { characterNames: [], createdCount: 0 };
      }
      
      console.log(`🎭 找到角色列表: ${characterNames.join(', ')}`);
      
      // 获取角色头像和背景数据
      const characterAvatars = (importResult.config as any)?.characterAvatars || {};
      const characterBackgrounds = (importResult.config as any)?.characterBackgrounds || {};
      
      let createdCount = 0;
      
      // 为每个角色创建Character对象
      for (const characterName of characterNames) {
        try {
          console.log(`🎭 正在创建角色: ${characterName}`);
          
          const characterId = `script_${scriptId}_${characterName}_${Date.now()}`;
          
          // ===== 新增：读取角色的preset和worldbook配置 =====
          const { preset, worldbook } = await loadCharacterConfigFromZip(characterName, zipFileUri);
          
          // 构建角色RoleCard数据
          const roleCard = {
            name: characterName,
            first_mes: '',
            description: '',
            personality: '',
            scenario: '',
            mes_example: '',
            data: {
              extensions: {
                regex_scripts: []
              }
            }
          };
          
          // 构建默认WorldBook数据
          let finalWorldBook = {
            entries: {}
          };
          
          // 如果有worldbook配置，使用它
          if (worldbook) {
            console.log(`📚 为角色 ${characterName} 使用worldbook配置`);
            finalWorldBook = worldbook;
          }
          
          // 构建默认Preset数据
          let finalPreset = {
            prompts: [
              {
                name: "Main",
                content: "",
                enable: true,
                identifier: "main",
                role: "user" as const
              },
              {
                name: "Enhance Definitions",
                content: "",
                enable: true,
                identifier: "enhanceDefinitions",
                injection_position: 1,
                injection_depth: 3,
                role: "user" as const
              }
            ],
            prompt_order: [{
              order: [
                { identifier: "main", enabled: true },
                { identifier: "enhanceDefinitions", enabled: true },
                { identifier: "worldInfoBefore", enabled: true },
                { identifier: "charDescription", enabled: true },
                { identifier: "charPersonality", enabled: true },
                { identifier: "scenario", enabled: true },
                { identifier: "worldInfoAfter", enabled: true }
              ]
            }]
          };
          
          // 如果有preset配置，使用它
          if (preset) {
            console.log(`📋 为角色 ${characterName} 使用preset配置`);
            console.log(`📋 preset包含 ${preset.prompts.length} 个prompts`);
            
            // 检查每个prompt的启用状态
            preset.prompts.forEach((prompt: any, index: number) => {
              console.log(`📋 Prompt ${index} "${prompt.name}": enable=${prompt.enable}, identifier=${prompt.identifier}`);
            });
            
            // 检查prompt_order中的启用状态
            if (preset.prompt_order && preset.prompt_order[0] && preset.prompt_order[0].order) {
              console.log(`📋 prompt_order包含 ${preset.prompt_order[0].order.length} 个order条目`);
              preset.prompt_order[0].order.forEach((orderItem: any, index: number) => {
                console.log(`📋 Order ${index} identifier="${orderItem.identifier}": enabled=${orderItem.enabled}`);
              });
            }
            
            finalPreset = preset;
          }
          
          // 构建完整的NodeST jsonData结构
          const jsonData = {
            roleCard: roleCard,
            worldBook: finalWorldBook,
            preset: finalPreset,
            // 标记为剧本角色
            isScriptCharacter: true,
            scriptId: scriptId
          };
          
          // 创建角色对象
          const newCharacter: Character & Partial<CradleCharacter> = {
            id: characterId,
            name: characterName,
            avatar: characterAvatars[characterName] || null,
            backgroundImage: characterBackgrounds[characterName] || null,
            conversationId: characterId,
            description: jsonData.roleCard.description,
            personality: jsonData.roleCard.personality,
            interests: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            jsonData: JSON.stringify(jsonData),
            // 绑定剧本ID - 关键修改
            scriptId: scriptId,
            // 添加剧本角色标记
            inCradleSystem: true,
            cradleStatus: 'growing',
            feedHistory: [],
            cradleCreatedAt: Date.now(),
            cradleUpdatedAt: Date.now(),
          };
          
          // ===== 新增：处理worldbook数据 =====
          if (worldbook) {
            console.log(`📚 为角色 ${characterName} 添加worldbook数据`);
            
            // 将worldbook数据保存到角色的jsonData中
            const updatedJsonData = {
              ...jsonData,
              worldBook: worldbook
            };
            newCharacter.jsonData = JSON.stringify(updatedJsonData);
          }
          
          // ===== 新增：再次处理preset数据以更新角色对象字段 =====
          if (preset) {
            console.log(`🎨 为角色 ${characterName} 更新preset数据到角色字段`);
            
            // 将preset数据更新到角色对象的直接字段中
            if (jsonData.roleCard.description && jsonData.roleCard.description.trim() !== '') {
              newCharacter.description = jsonData.roleCard.description;
            }
            if (jsonData.roleCard.personality && jsonData.roleCard.personality.trim() !== '') {
              newCharacter.personality = jsonData.roleCard.personality;
            }
          }
          
          console.log(`🎭 保存角色到NodeST: ${characterName}`);
          
          // 保存角色和创建对话
          await Promise.all([
            addCharacter(newCharacter),
            addConversation({
              id: characterId,
              title: characterName
            })
          ]);
          
          // ===== 新增：初始化NodeST数据 =====
          try {
            console.log(`🎭 初始化NodeST数据: ${characterName}`);
            await NodeSTManager.processChatMessage({
              userMessage: "初始化角色",
              conversationId: characterId,
              status: "新建角色",
              character: newCharacter
            });
            console.log(`✅ NodeST初始化成功: ${characterName}`);
          } catch (nodeError) {
            console.warn(`⚠️ NodeST初始化失败: ${characterName}`, nodeError);
            // 继续处理，不因为NodeST初始化失败而中断
          }
          
          createdCount++;
          console.log(`✅ 角色创建成功: ${characterName} (ID: ${characterId})`);
          
        } catch (error) {
          console.error(`❌ 创建角色 ${characterName} 失败:`, error);
        }
      }
      
      console.log(`🎭 剧本角色创建完成，成功创建 ${createdCount}/${characterNames.length} 个角色`);
      
      return { characterNames, createdCount };
      
    } catch (error) {
      console.error('❌ 创建剧本角色过程中发生错误:', error);
      return { characterNames: [], createdCount: 0 };
    }
  };

// 新增：主导入函数 - 供Character.tsx调用
export const handleFileImportConfirm = async (
  addCharacter: (character: Character) => Promise<void>,
  addConversation: (conversation: { id: string; title: string }) => Promise<void>,
  loadScripts: () => Promise<void>,
  onSuccess?: (scriptId: string, scriptName: string, createdCount: number, characterNames: string[]) => void,
  onError?: (error: string) => void
): Promise<{ success: boolean; scriptId?: string; error?: string }> => {
  try {
    // 选择ZIP文件
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/zip',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, error: '用户取消选择文件' };
    }

    const file = result.assets[0];
    console.log('[ScriptImporter] 开始从文件导入剧本:', file.name);
    
    // 导入ZIP配置
    const importResult = await scriptService.importUnifiedConfigFromArchive(file.uri);
    
    if (!importResult.success || !importResult.config) {
      throw new Error(importResult.error || '导入失败');
    }

    console.log('[ScriptImporter] ✅ ZIP文件解析成功');

    // 创建新的剧本，使用固定的空白视觉小说引擎域名
    const scriptId = `script_${Date.now()}`;
    const webViewUrl = 'https://world.cradleintro.top';
    
    const scriptData: Script = {
      id: scriptId,
      name: file.name.replace(/\.[^/.]+$/, ''), // 使用文件名作为剧本名
      selectedCharacters: [], 
      contextMessageCount: {},
      baseprompt: '',
      userName: 'Player',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      webViewUrl: webViewUrl, // 使用固定的空白引擎域名
      description: `从文件导入: ${file.name}`,
      isFileSystemImport: true, // 标记为文件系统导入
    };

    // 保存剧本
    await scriptService.saveScript(scriptData);
    console.log('[ScriptImporter] ✅ 剧本创建成功:', scriptData.id);

    // 保存配置，标记为文件系统导入
    await scriptService.saveUnifiedScriptConfig(scriptId, {
      ...importResult.config,
      isFileSystemImport: true,
      customCSS: importResult.customCSS || '',
      parsedTypes: importResult.parsedTypes || {},
      initialScene: importResult.initialScene || ''
    }, importResult.variables || {});

    console.log('[ScriptImporter] ✅ 配置文件保存成功');

    // ===== 新增：创建剧本角色 =====
    const { characterNames, createdCount } = await createScriptCharacters(
      scriptId, 
      importResult, 
      file.name, 
      file.uri,
      addCharacter,
      addConversation
    );

    // 刷新剧本列表
    await loadScripts();

    // 触发事件通知其他组件刷新
    EventRegister.emit('scriptCreated', { scriptId });

    // 调用成功回调
    if (onSuccess) {
      onSuccess(scriptId, scriptData.name, createdCount, characterNames);
    }
    
    console.log('🎉 ===== 剧本导入完成总结 =====');
    console.log(`✅ 剧本名称: ${scriptData.name}`);
    console.log(`✅ 剧本ID: ${scriptId}`);
    console.log(`✅ 创建角色数量: ${createdCount}/${characterNames.length}`);
    console.log(`✅ 角色列表: ${characterNames.join(', ')}`);
    console.log(`✅ 变量系统: 已初始化`);
    console.log(`✅ 文件系统导入: 成功`);
    console.log('🎉 ===========================');
    
    return { 
      success: true, 
      scriptId,
    };
    
  } catch (error) {
    console.error('[ScriptImporter] 文件导入失败:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    if (onError) {
      onError(errorMessage);
    }
    return { 
      success: false, 
      error: errorMessage 
    };
  }
};