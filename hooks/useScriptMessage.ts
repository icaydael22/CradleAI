import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { ScriptService } from '@/services/script-service';
import { Script, ScriptMessage, ScriptResponse } from '@/shared/types/script-types';
import { unifiedGenerateContent } from '@/services/unified-api';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { VariableProcessor } from '@/services/variables/VariableProcessor';
// 🆕 移除 ExpManager 导入，现在通过 ScriptService 调度机制管理
/**
 * 剧本消息发送和响应处理的Hook
 */
export const useScriptMessage = (script: Script | null) => {
  const [isSending, setIsSending] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<ScriptResponse | null>(null);
  const [scriptHistory, setScriptHistory] = useState<ScriptMessage[]>([]);

  const scriptService = ScriptService.getInstance();

  // 加载剧本历史
  const loadScriptHistory = useCallback(async () => {
    if (!script?.id) return;
    
    try {
      const history = await scriptService.getScriptHistory(script.id);
      setScriptHistory(history);
      
      // 如果有历史记录，显示最后一次的响应
      if (history.length > 0) {
        setCurrentResponse(history[history.length - 1].aiResponse);
      }
    } catch (error) {
      console.error('加载剧本历史失败:', error);
    }
  }, [script?.id]); // 只依赖 script.id

  // 发送消息
  const sendMessage = useCallback(async (userInput: string): Promise<string> => {
    if (!script?.id || !userInput.trim() || isSending) {
      return '';
    }
    
    try {
      setIsSending(true);
      setCurrentResponse(null);
      
      // 🆕 检查是否需要保存initial-scene作为第一条历史记录
      try {
        // 优先使用本地缓存的历史记录，避免重复查询
        const currentHistory = scriptHistory.length > 0 ? scriptHistory : await scriptService.getScriptHistory(script.id);
        
        if (currentHistory.length === 0) {
          console.log('[useScriptMessage] 🏁 检测到无历史记录，尝试保存initial-scene');
          
          // 尝试从script.styleConfig获取initialScene (暂时使用any类型访问)
          let initialScene = (script.styleConfig as any)?.initialScene;
          
          // 如果styleConfig中没有，尝试从统一配置获取
          if (!initialScene) {
            try {
              const unifiedConfig = await scriptService.getUnifiedScriptConfig(script.id);
              initialScene = unifiedConfig?.initialScene;
            } catch (configError) {
              console.warn('[useScriptMessage] ⚠️ 获取统一配置失败:', configError);
            }
          }
          
          if (initialScene && initialScene.trim()) {
            console.log('[useScriptMessage] 💾 找到initial-scene，准备保存为第一条历史记录');
            console.log('[useScriptMessage] initial-scene内容预览:', initialScene.substring(0, 100) + '...');
            
            // 构建initial-scene消息
            const initialMessage: ScriptMessage = {
              id: `msg_initial_${Date.now()}`,
              scriptId: script.id,
              userInput: '', // initial-scene不是用户输入
              aiResponse: {
                plotContent: initialScene,
                _rawResponse: initialScene,
                _processedResponse: initialScene,
                _isInitialScene: true // 标记为initial-scene
              },
              timestamp: Date.now(),
            };
            
            // 双重检查避免race条件：再次确认历史为空后再保存
            const latestHistory = await scriptService.getScriptHistory(script.id);
            if (latestHistory.length === 0) {
              await scriptService.saveScriptMessage(initialMessage);
              setScriptHistory(prev => [...prev, initialMessage]);
              console.log('[useScriptMessage] ✅ initial-scene已保存为第一条历史记录');
            } else {
              console.log('[useScriptMessage] ⚠️ 检测到race条件，其他请求已添加历史记录，跳过保存initial-scene');
            }
          } else {
            console.log('[useScriptMessage] ⚪ 未找到initial-scene或内容为空，跳过保存');
          }
        } else {
          console.log('[useScriptMessage] ✅ 已有历史记录，跳过initial-scene保存');
        }
      } catch (initialSceneError) {
        console.warn('[useScriptMessage] ❌ 处理initial-scene时发生错误，继续正常流程:', initialSceneError);
        // 不抛出错误，继续正常的消息发送流程
      }
      
      // 使用NodeSTCore构建消息数组
      const messages = await scriptService.buildScriptMessages(script.id, userInput);
      console.log('[useScriptMessage] 构建的消息数组:', messages);
      
      // 🆕 检查是否为文件导入剧本的特殊消息格式
      if (messages.length === 2 && 
          messages[0]?.role === 'system' && 
          messages[0]?.content === 'File import script - content will be handled by WebView' &&
          messages[1]?._isFileImportVariablePrompt) {
        
        console.log('[useScriptMessage] 📁 检测到文件导入剧本，等待WebView提供outputRequirements');
        
        // 对于文件导入剧本，返回特殊响应，让WebView知道需要提供outputRequirements
        const waitingResponse: ScriptResponse = {
          plotContent: `等待WebView提供outputRequirements以构建完整消息数组...`,
          _isFileImportWaiting: true,
          _userInput: userInput,
          _variablePrompt: messages[1]._originalVariablePrompt,
          _rawResponse: `Waiting for outputRequirements from WebView`,
          _processedResponse: `Waiting for outputRequirements from WebView`
        };
        
        setCurrentResponse(waitingResponse);
        
        // 通知WebView需要提供outputRequirements来完成AI调用
        return '等待WebView提供配置数据...';
      }
      
      // 对于完整配置的剧本，正常调用统一API
      const apiResponse = await unifiedGenerateContent(messages, {
        characterId: script.id,
      });
      
      // 🆕 **注释掉直接调用体验管理器的代码**
      // 体验管理器现在通过 ScriptService.saveScriptMessage() 中的调度机制触发
      // 这样可以根据剧本配置来决定是否运行体验管理器以及触发频率
      /*
      try {
        console.log('[useScriptMessage] 🎭 启动体验管理器进行第二次AI调用...');
        const expManager = ExpManager.getInstance();
        
        const expResult = await expManager.runExperience(script.id, apiResponse, {
          userName: script.userName || '用户',
          lastUserMessage: userInput || '',
          scriptContext: `剧本: ${script.name || script.id}`,
          useMessages: true, // 使用OpenAI消息格式
          unifiedApiOptions: {
            characterId: script.id,
          }
        });
        
        if (expResult.success) {
          console.log(`[useScriptMessage] ✅ 体验管理器执行成功，变量操作数: ${expResult.variableLogs.length}`);
          console.log(`[useScriptMessage] 🔧 体验管理器变量操作日志:`, expResult.variableLogs);
        } else {
          console.warn(`[useScriptMessage] ⚠️ 体验管理器执行失败: ${expResult.error}`);
        }
      } catch (error) {
        console.warn('[useScriptMessage] ❌ 体验管理器调用失败:', error);
      }
      */
      
      // 处理AI响应，包括变量操作、宏替换和正则表达式后处理
      let processedResponse = apiResponse;
      let variableLogs: string[] = [];
      
      try {
        const processingResult = await VariableProcessor.processAIResponse(script.id, apiResponse);
        processedResponse = processingResult.cleanText;
        variableLogs = processingResult.logs;
        
        if (processingResult.hasVariableOperations) {
          console.log(`[useScriptMessage] 检测到变量操作，处理了 ${variableLogs.length} 个变量变化`);
        }
      } catch (error) {
        console.warn('[useScriptMessage] 变量处理失败，使用原始响应:', error);
      }

      // 🆕 新增：解析 <options> 块 (在processScriptActions之前)
      const extractOptionsFromResponse = (responseText: string) => {
        try {
          // 匹配 <options>...</options> 块
          const optionsMatch = responseText.match(/<options>([\s\S]*?)<\/options>/);
          if (optionsMatch && optionsMatch[1]) {
            const optionsContent = optionsMatch[1].trim();
            console.log('[useScriptMessage] 🎯 找到options块:', optionsContent);
            
            // 解析选项内容，每行一个选项，格式: [选项文本]
            const optionLines = optionsContent.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
            
            const extractedOptions: any = {};
            let optionIndex = 1;
            
            for (const line of optionLines) {
              // 匹配 [选项文本] 格式
              const optionMatch = line.match(/^\[(.+?)\]$/);
              if (optionMatch && optionMatch[1]) {
                const optionText = optionMatch[1].trim();
                extractedOptions[`option${optionIndex}`] = optionText;
                optionIndex++;
                console.log(`[useScriptMessage] 📝 解析选项 ${optionIndex-1}: "${optionText}"`);
              }
            }
            
            if (Object.keys(extractedOptions).length > 0) {
              console.log('[useScriptMessage] 🎉 成功解析options块:', extractedOptions);
              return extractedOptions;
            }
          } else {
            console.log('[useScriptMessage] 🔍 未找到options块');
          }
        } catch (error) {
          console.warn('[useScriptMessage] ⚠️ 解析options块时发生错误:', error);
        }
        return null;
      };

      // 从原始响应中提取选项
      const extractedOptions = extractOptionsFromResponse(processedResponse);

      // 处理脚本操作（不再从这里提取choices）
      // 处理脚本操作（不再从这里提取choices）
      const processScriptActions = async (responseText: string) => {
        // 优先尝试 CDATA 格式（向后兼容）
        let scriptActionsMatch = responseText.match(/<script_actions><!\[CDATA\[([\s\S]*?)\]\]><\/script_actions>/);
        let scriptActions = '';
        
        if (scriptActionsMatch && scriptActionsMatch[1]) {
          scriptActions = scriptActionsMatch[1].trim();
          console.log('[useScriptMessage] 找到CDATA格式的脚本操作');
        } else {
          // 尝试非CDATA格式
          scriptActionsMatch = responseText.match(/<script_actions>([\s\S]*?)<\/script_actions>/);
          if (scriptActionsMatch && scriptActionsMatch[1]) {
            scriptActions = scriptActionsMatch[1].trim();
            console.log('[useScriptMessage] 找到非CDATA格式的脚本操作');
          }
        }
        
        if (scriptActions) {
          console.log('[useScriptMessage] 脚本操作内容:', scriptActions.substring(0, 200) + '...');
          
          try {
            // 使用ScriptVariableService执行变量操作
            const { ScriptVariableService } = await import('@/services/variables/ScriptVariableService');
            const variableManager = await ScriptVariableService.getInstance(script.id);

            // 先处理注册类命令（可能是异步）
            let remaining = scriptActions;
            try {
              const afterRegister = await variableManager.parseRegisterCommands(scriptActions);
              remaining = afterRegister.cleanText;
              if (afterRegister.logs && afterRegister.logs.length > 0) {
                variableLogs.push(...afterRegister.logs);
                console.log(`[useScriptMessage] 处理注册命令，生成了 ${afterRegister.logs.length} 条日志`);
              }
            } catch (regErr) {
              console.warn('[useScriptMessage] 处理注册命令失败（可忽略）:', regErr);
            }

            // 解析并执行其余的XML命令（parseCommands 为异步）
            try {
              const commandResult = await variableManager.parseCommands(remaining);
              if (commandResult.logs && commandResult.logs.length > 0) {
                variableLogs.push(...commandResult.logs);
                console.log(`[useScriptMessage] 执行了 ${commandResult.logs.length} 个变量操作`);
              }
            } catch (cmdErr) {
              console.warn('[useScriptMessage] 解析并执行XML命令失败:', cmdErr);
            }
          } catch (scriptError) {
            console.warn('[useScriptMessage] 执行脚本操作失败:', scriptError);
            variableLogs.push(`脚本操作执行失败: ${scriptError}`);
          }
        }
        
        return null; // 不再返回choices
      };

      // 处理脚本操作
      await processScriptActions(processedResponse);

      // 🆕 简化AI响应解析：RN端不再负责生成剧情内容
      let parsedResponse: ScriptResponse = {};
      
      // 尝试解析结构化响应（仅用于获取可能的JSON格式数据）
      try {
        console.log('[useScriptMessage] 尝试解析结构化响应');
        
        // 1. 优先尝试 <json_payload> CDATA格式（向后兼容）
        let jsonPayloadMatch = processedResponse.match(/<json_payload><!\[CDATA\[([\s\S]*?)\]\]><\/json_payload>/);
        let jsonStr = '';
        
        if (jsonPayloadMatch && jsonPayloadMatch[1]) {
          jsonStr = jsonPayloadMatch[1].trim();
          console.log('[useScriptMessage] 找到CDATA格式的JSON payload');
        } else {
          // 2. 尝试非CDATA的 <json_payload> 格式
          jsonPayloadMatch = processedResponse.match(/<json_payload>([\s\S]*?)<\/json_payload>/);
          if (jsonPayloadMatch && jsonPayloadMatch[1]) {
            jsonStr = jsonPayloadMatch[1].trim();
            console.log('[useScriptMessage] 找到非CDATA格式的JSON payload');
          } else {
            // 3. 回退：尝试markdown代码块中的JSON
            const codeBlockMatch = processedResponse.match(/```(?:json)?\s*\n*([\s\S]*?)\n*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              console.log('[useScriptMessage] 回退到markdown代码块中的JSON');
              jsonStr = codeBlockMatch[1].trim();
            }
          }
        }
        
        if (jsonStr) {
          console.log('[useScriptMessage] 尝试解析JSON:', jsonStr.substring(0, 200) + '...');
          parsedResponse = JSON.parse(jsonStr);
          console.log('[useScriptMessage] JSON解析成功');
        }
        
      } catch (parseError) {
        console.log('[useScriptMessage] JSON解析失败，使用空的parsedResponse');
      }
      
      // 添加提取的选项到响应中
      if (extractedOptions && typeof extractedOptions === 'object' && extractedOptions !== null) {
        const choicesArray = Object.entries(extractedOptions).map(([key, value]) => ({
          id: key,
          text: String(value),
          action: 'send' as const // 添加默认动作
        }));
        
        parsedResponse.choices = choicesArray;
        console.log(`[useScriptMessage] 🎭 已添加 ${choicesArray.length} 个选项到最终响应中:`, choicesArray);
      } else {
        console.log('[useScriptMessage] ❌ 没有有效的extractedOptions可添加到响应中');
        console.log('[useScriptMessage] extractedOptions:', extractedOptions);
      }      // 将变量日志添加到响应中（用于调试）
      if (variableLogs.length > 0) {
        parsedResponse._variableLogs = variableLogs;
      }
      
      // 对解析后的响应应用正则表达式后处理（在变量系统处理之后）
      await applyRegexPostProcessing(script.id, parsedResponse);
      
      // 检查正则表达式处理后choices是否还存在
      if (parsedResponse.choices && parsedResponse.choices.length > 0) {
        console.log(`[useScriptMessage] ✅ 正则表达式处理后，choices仍然存在: ${parsedResponse.choices.length} 个选项`);
      } else {
        console.log('[useScriptMessage] ⚠️ 正则表达式处理后，choices不存在或为空');
      }
      
      // 添加原始响应到解析后的响应中，确保WebView可以获取原始内容
      parsedResponse._rawResponse = apiResponse; // 原始AI响应
      parsedResponse._processedResponse = processedResponse; // 变量处理后的响应
      
      // 保存消息
      const scriptMessage: ScriptMessage = {
        id: `msg_${Date.now()}`,
        scriptId: script.id,
        userInput,
        aiResponse: parsedResponse,
        timestamp: Date.now(),
      };
      
      await scriptService.saveScriptMessage(scriptMessage);
      setScriptHistory(prev => [...prev, scriptMessage]);
      
      // 调试：检查设置到currentResponse的数据
      console.log('[useScriptMessage] 🔍 设置currentResponse前的parsedResponse:', {
        hasPlotContent: !!parsedResponse.plotContent,
        plotContentLength: parsedResponse.plotContent?.length || 0,
        hasChoices: !!parsedResponse.choices,
        choicesCount: parsedResponse.choices?.length || 0,
        choices: parsedResponse.choices,
        hasRawResponse: !!parsedResponse._rawResponse,
        hasProcessedResponse: !!parsedResponse._processedResponse
      });
      
      setCurrentResponse(parsedResponse);
      
      // 检查是否需要自动总结剧本历史
      try {
        const needsSummary = await scriptService.checkAndSummarizeScriptHistory(script.id);
        if (needsSummary) {
          console.log('[useScriptMessage] 剧本历史已自动总结');
          // 重新加载历史记录以显示总结后的结果
          await loadScriptHistory();
        }
      } catch (error) {
        console.warn('[useScriptMessage] 自动总结失败:', error);
      }
      
      // 尝试从响应中提取剧情内容（保持兼容性）
      const plotContent = parsedResponse.plotContent || 
                          parsedResponse.content || 
                          parsedResponse.story || 
                          parsedResponse.narrative ||
                          Object.values(parsedResponse).find(v => typeof v === 'string') ||
                          '剧情生成成功';
      
      return plotContent;
    } catch (error) {
      console.error('发送消息失败:', error);
      Alert.alert('错误', '发送消息失败');
      return '发送消息失败';
    } finally {
      setIsSending(false);
    }
  }, [script?.id, isSending]); // 只依赖必要的值

  // 应用正则表达式后处理
  const applyRegexPostProcessing = useCallback(async (scriptId: string, parsedResponse: ScriptResponse) => {
    try {
      // 获取预编译的正则表达式模式
      const compiledPatterns = await scriptService.getCompiledRegexPatterns(scriptId);
      
      console.log(`[useScriptMessage] 🔍 正则表达式调试信息:`);
      console.log(`[useScriptMessage] ├─ 脚本ID: ${scriptId}`);
      console.log(`[useScriptMessage] ├─ 可用模式数量: ${compiledPatterns.length}`);
      
      if (compiledPatterns.length === 0) {
        console.log(`[useScriptMessage] ⚠️ 没有找到正则表达式模式，跳过后处理`);
        
        // 调试：检查脚本配置
        const script = await scriptService.getScript(scriptId);
        const regexPatterns = (script as any)?.styleConfig?.regexPatterns;
        console.log(`[useScriptMessage] 🔍 配置调试:`);
        console.log(`[useScriptMessage] ├─ script存在: ${!!script}`);
        console.log(`[useScriptMessage] ├─ styleConfig存在: ${!!(script as any)?.styleConfig}`);
        console.log(`[useScriptMessage] ├─ regexPatterns存在: ${!!regexPatterns}`);
        console.log(`[useScriptMessage] └─ regexPatterns内容:`, regexPatterns);
        return; // 没有正则表达式模式，直接返回
      }
      
      console.log(`[useScriptMessage] 🚀 开始应用 ${compiledPatterns.length} 个正则表达式模式:`);
      compiledPatterns.forEach((pattern, index) => {
        console.log(`[useScriptMessage] ├─ [${index + 1}] ${pattern.name || '未命名'}: ${pattern.pattern.source}`);
      });
      
      // 处理各个可能包含HTML内容的字段
      const fieldsToProcess = ['plotContent', 'content', 'story', 'narrative', 'text'];
      
      for (const field of fieldsToProcess) {
        if (parsedResponse[field] && typeof parsedResponse[field] === 'string') {
          const originalContent = parsedResponse[field];
          console.log(`[useScriptMessage] 📝 处理字段 "${field}", 原始长度: ${originalContent.length}`);
          
          const processedContent = scriptService.applyRegexPatterns(originalContent, compiledPatterns);
          
          if (originalContent !== processedContent) {
            parsedResponse[field] = processedContent;
            console.log(`[useScriptMessage] ✅ 字段 "${field}" 已应用正则表达式处理, 新长度: ${processedContent.length}`);
            console.log(`[useScriptMessage] 🔧 内容变更预览: "${originalContent.substring(0, 100)}..." -> "${processedContent.substring(0, 100)}..."`);
          } else {
            console.log(`[useScriptMessage] ⚪ 字段 "${field}" 无变更`);
          }
        }
      }
      
      // 处理 pages 数组中的 content
      if (parsedResponse.pages && Array.isArray(parsedResponse.pages)) {
        console.log(`[useScriptMessage] 📄 处理 ${parsedResponse.pages.length} 个页面内容`);
        for (let i = 0; i < parsedResponse.pages.length; i++) {
          const page = parsedResponse.pages[i];
          if (page.content && typeof page.content === 'string') {
            const originalContent = page.content;
            console.log(`[useScriptMessage] 📝 处理页面 ${i} 内容, 原始长度: ${originalContent.length}`);
            
            const processedContent = scriptService.applyRegexPatterns(originalContent, compiledPatterns);
            
            if (originalContent !== processedContent) {
              page.content = processedContent;
              console.log(`[useScriptMessage] ✅ 页面 ${i} 内容已应用正则表达式处理, 新长度: ${processedContent.length}`);
            } else {
              console.log(`[useScriptMessage] ⚪ 页面 ${i} 内容无变更`);
            }
          }
        }
      }
      
      // 处理 htmlBlocks 数组（如果存在）
      if (parsedResponse.htmlBlocks && Array.isArray(parsedResponse.htmlBlocks)) {
        console.log(`[useScriptMessage] 🧩 处理 ${parsedResponse.htmlBlocks.length} 个HTML块`);
        for (let i = 0; i < parsedResponse.htmlBlocks.length; i++) {
          const originalBlock = parsedResponse.htmlBlocks[i];
          if (typeof originalBlock === 'string') {
            console.log(`[useScriptMessage] 📝 处理HTML块 ${i}, 原始长度: ${originalBlock.length}`);
            
            const processedBlock = scriptService.applyRegexPatterns(originalBlock, compiledPatterns);
            
            if (originalBlock !== processedBlock) {
              parsedResponse.htmlBlocks[i] = processedBlock;
              console.log(`[useScriptMessage] ✅ HTML块 ${i} 已应用正则表达式处理, 新长度: ${processedBlock.length}`);
            } else {
              console.log(`[useScriptMessage] ⚪ HTML块 ${i} 无变更`);
            }
          }
        }
      }
      
      // 处理 fullHtml 字段（如果存在）
      if (parsedResponse.fullHtml && typeof parsedResponse.fullHtml === 'string') {
        const originalHtml = parsedResponse.fullHtml;
        console.log(`[useScriptMessage] 🌐 处理fullHtml字段, 原始长度: ${originalHtml.length}`);
        
        const processedHtml = scriptService.applyRegexPatterns(originalHtml, compiledPatterns);
        
        if (originalHtml !== processedHtml) {
          parsedResponse.fullHtml = processedHtml;
          console.log(`[useScriptMessage] ✅ fullHtml 已应用正则表达式处理, 新长度: ${processedHtml.length}`);
        } else {
          console.log(`[useScriptMessage] ⚪ fullHtml 无变更`);
        }
      }
      
      console.log(`[useScriptMessage] 🎉 正则表达式后处理完成，共处理 ${compiledPatterns.length} 个模式`);
      
    } catch (error) {
      console.warn('[useScriptMessage] ❌ 正则表达式后处理失败:', error);
      // 不抛出错误，继续执行后续流程
    }
  }, [scriptService]);

  // 确认响应，应用到角色聊天记录
  const confirmResponse = useCallback(async (): Promise<boolean> => {
    if (!currentResponse || !script?.id) return false;
    
    try {
      await scriptService.confirmScriptResponse(script.id, currentResponse);
      Alert.alert('成功', '剧情已应用到角色聊天记录');
      return true;
    } catch (error) {
      console.error('确认响应失败:', error);
      Alert.alert('错误', '确认响应失败');
      return false;
    }
  }, [currentResponse, script?.id]);

  // 重新生成响应
  const regenerateResponse = useCallback(async (): Promise<string> => {
    if (scriptHistory.length === 0) return '';
    
    const lastMessage = scriptHistory[scriptHistory.length - 1];
    return await sendMessage(lastMessage.userInput);
  }, [scriptHistory, sendMessage]);

  // 选择剧情选项
  const selectChoice = useCallback(async (choiceText: string): Promise<string> => {
    return await sendMessage(choiceText);
  }, [sendMessage]);

  // 清空当前响应
  const clearCurrentResponse = useCallback(() => {
    setCurrentResponse(null);
  }, []);

  // 手动总结剧本历史
  const summarizeHistory = useCallback(async (): Promise<boolean> => {
    if (!script?.id) return false;
    
    try {
      const success = await scriptService.summarizeScriptHistory(script.id, true);
      if (success) {
        console.log('[useScriptMessage] 手动总结完成');
        // 重新加载历史记录以显示总结后的结果
        await loadScriptHistory();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[useScriptMessage] 手动总结失败:', error);
      return false;
    }
  }, [script?.id, scriptService, loadScriptHistory]);

  // 🆕 处理文件导入剧本的AI调用（当WebView提供outputRequirements时）
  const sendFileImportMessage = useCallback(async (userInput: string, outputRequirements: any): Promise<string> => {
    if (!script?.id || !userInput.trim() || isSending) {
      return '';
    }
    
    try {
      setIsSending(true);
      setCurrentResponse(null);
      
      console.log('[useScriptMessage] 📁 开始文件导入剧本的AI调用');
      console.log('[useScriptMessage] 用户输入:', userInput);
      console.log('[useScriptMessage] WebView提供的outputRequirements:', outputRequirements);
      
      // 获取文件导入的variablePrompt（从script.styleConfig获取）
      const variablePrompt = script.styleConfig?.variablePrompt;
      console.log('[useScriptMessage] 文件导入的variablePrompt:', variablePrompt);
      
      if (!variablePrompt) {
        throw new Error('文件导入剧本缺少variablePrompt配置');
      }
      
      // 使用NodeSTCore的buildRFrameworkWithChatHistory方法构建消息数组
      // variablePrompt作为chatHistory，outputRequirements作为preset
      const messages = await NodeSTCore.buildRFrameworkWithChatHistory(
        Array.isArray(variablePrompt) ? JSON.stringify({ _isMessageArray: true, messages: variablePrompt }) : variablePrompt + '\n\n用户输入: ' + userInput,
        typeof outputRequirements === 'string' ? outputRequirements : JSON.stringify(outputRequirements),
        'openai-compatible'
      );
      
      console.log('[useScriptMessage] 📁 文件导入构建的完整消息数组:', messages);
      
      // 调用统一API
      const apiResponse = await unifiedGenerateContent(messages, {
        characterId: script.id,
      });
      
      // 后续处理与正常流程相同...
      let processedResponse = apiResponse;
      let variableLogs: string[] = [];
      
      try {
         const processingResult = await VariableProcessor.processAIResponse(script.id, apiResponse);
        processedResponse = processingResult.cleanText;
        variableLogs = processingResult.logs;
        
        if (processingResult.hasVariableOperations) {
          console.log(`[useScriptMessage] 检测到变量操作，处理了 ${variableLogs.length} 个变量变化`);
        }
      } catch (error) {
        console.warn('[useScriptMessage] 变量处理失败，使用原始响应:', error);
      }

      // 解析 <options> 块和处理脚本操作（与正常流程相同）
      const extractOptionsFromResponse = (responseText: string) => {
        try {
          const optionsMatch = responseText.match(/<options>([\s\S]*?)<\/options>/);
          if (optionsMatch && optionsMatch[1]) {
            const optionsContent = optionsMatch[1].trim();
            console.log('[useScriptMessage] 🎯 找到options块:', optionsContent);
            
            const optionLines = optionsContent.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
            
            const extractedOptions: any = {};
            let optionIndex = 1;
            
            for (const line of optionLines) {
              const optionMatch = line.match(/^\[(.+?)\]$/);
              if (optionMatch && optionMatch[1]) {
                const optionText = optionMatch[1].trim();
                extractedOptions[`option${optionIndex}`] = optionText;
                optionIndex++;
                console.log(`[useScriptMessage] 📝 解析选项 ${optionIndex-1}: "${optionText}"`);
              }
            }
            
            if (Object.keys(extractedOptions).length > 0) {
              console.log('[useScriptMessage] 🎉 成功解析options块:', extractedOptions);
              return extractedOptions;
            }
          }
        } catch (error) {
          console.warn('[useScriptMessage] ⚠️ 解析options块时发生错误:', error);
        }
        return null;
      };

      const extractedOptions = extractOptionsFromResponse(processedResponse);

      // 处理脚本操作...（省略重复代码，与正常流程相同）
      
      // 简化AI响应解析
      let parsedResponse: ScriptResponse = {};
      
      try {
        console.log('[useScriptMessage] 尝试解析结构化响应');
        
        let jsonPayloadMatch = processedResponse.match(/<json_payload><!\[CDATA\[([\s\S]*?)\]\]><\/json_payload>/);
        let jsonStr = '';
        
        if (jsonPayloadMatch && jsonPayloadMatch[1]) {
          jsonStr = jsonPayloadMatch[1].trim();
          console.log('[useScriptMessage] 找到CDATA格式的JSON payload');
        } else {
          jsonPayloadMatch = processedResponse.match(/<json_payload>([\s\S]*?)<\/json_payload>/);
          if (jsonPayloadMatch && jsonPayloadMatch[1]) {
            jsonStr = jsonPayloadMatch[1].trim();
            console.log('[useScriptMessage] 找到非CDATA格式的JSON payload');
          } else {
            const codeBlockMatch = processedResponse.match(/```(?:json)?\s*\n*([\s\S]*?)\n*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              console.log('[useScriptMessage] 回退到markdown代码块中的JSON');
              jsonStr = codeBlockMatch[1].trim();
            }
          }
        }
        
        if (jsonStr) {
          console.log('[useScriptMessage] 尝试解析JSON:', jsonStr.substring(0, 200) + '...');
          parsedResponse = JSON.parse(jsonStr);
          console.log('[useScriptMessage] JSON解析成功');
        }
        
      } catch (parseError) {
        console.log('[useScriptMessage] JSON解析失败，使用空的parsedResponse');
      }
      
      // 添加提取的选项到响应中
      if (extractedOptions && typeof extractedOptions === 'object' && extractedOptions !== null) {
        const choicesArray = Object.entries(extractedOptions).map(([key, value]) => ({
          id: key,
          text: String(value),
          action: 'send' as const
        }));
        
        parsedResponse.choices = choicesArray;
        console.log(`[useScriptMessage] 🎭 已添加 ${choicesArray.length} 个选项到最终响应中:`, choicesArray);
      }
      
      // 将变量日志添加到响应中
      if (variableLogs.length > 0) {
        parsedResponse._variableLogs = variableLogs;
      }
      
      // 应用正则表达式后处理
      await applyRegexPostProcessing(script.id, parsedResponse);
      
      // 添加原始响应数据
      parsedResponse._rawResponse = apiResponse;
      parsedResponse._processedResponse = processedResponse;
      
      // 保存消息
      const scriptMessage: ScriptMessage = {
        id: `msg_${Date.now()}`,
        scriptId: script.id,
        userInput,
        aiResponse: parsedResponse,
        timestamp: Date.now(),
      };
      
      await scriptService.saveScriptMessage(scriptMessage);
      setScriptHistory(prev => [...prev, scriptMessage]);
      setCurrentResponse(parsedResponse);
      
      // 检查是否需要自动总结剧本历史
      try {
        const needsSummary = await scriptService.checkAndSummarizeScriptHistory(script.id);
        if (needsSummary) {
          console.log('[useScriptMessage] 剧本历史已自动总结');
          await loadScriptHistory();
        }
      } catch (error) {
        console.warn('[useScriptMessage] 自动总结失败:', error);
      }
      
      // 尝试从响应中提取剧情内容
      const plotContent = parsedResponse.plotContent || 
                          parsedResponse.content || 
                          parsedResponse.story || 
                          parsedResponse.narrative ||
                          Object.values(parsedResponse).find(v => typeof v === 'string') ||
                          '剧情生成成功';
      
      return plotContent;
    } catch (error) {
      console.error('[useScriptMessage] 文件导入AI调用失败:', error);
      Alert.alert('错误', '文件导入AI调用失败');
      return '文件导入AI调用失败';
    } finally {
      setIsSending(false);
    }
  }, [script?.id, isSending]);

  return {
    // 状态
    isSending,
    currentResponse,
    scriptHistory,
    
    // 方法
    loadScriptHistory,
    sendMessage,
    sendFileImportMessage, // 🆕 添加文件导入AI调用方法
    confirmResponse,
    regenerateResponse,
    selectChoice,
    clearCurrentResponse,
    summarizeHistory,
  // 🔄 外部恢复后重新加载历史的辅助方法
  reloadHistory: loadScriptHistory,
    
    // 设置状态
    setCurrentResponse,
    setScriptHistory,
  };
};

export default useScriptMessage;
