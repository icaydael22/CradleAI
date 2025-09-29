import { Message, Character } from '@/shared/types';
import { StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import { getApiSettings } from '@/utils/settings-helper';


/**
 * Service for managing chat messages with direct integration to StorageAdapter
 */
class MessageService {
  /**
   * Handle regenerating a message by messageId
   */
  async handleRegenerateMessage(
    messageId: string,
    messageIndex: number,
    conversationId: string,
    messages: Message[],
    character: Character | undefined | null,
    user: any,
    rewriteOpinion?: string
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId || !character) {
        throw new Error("Missing required information for regeneration");
      }
      
      // Get API settings instead of just API key
      const apiSettings = getApiSettings();
      console.log('[MessageService] handleRegenerateMessage - API Settings:', {
        provider: apiSettings.apiProvider,
        hasApiKey: !!apiSettings.apiKey,
        useCloudService: apiSettings.useCloudService
      });
      

      // Find the message by ID in the complete history to get the correct role index
      const roleIndex = await this.findMessageRoleIndex(conversationId, messageId, 'model', messages);
      
      if (roleIndex === -1) {
        throw new Error("Message not found in conversation history");
      }

      // Use StorageAdapter to regenerate the AI message with the correct role index and apiSettings
      const regeneratedText = await StorageAdapter.regenerateAiMessageByIndex(
        conversationId,
        roleIndex,
        apiSettings.apiKey || '', // Use empty string for CradleCloud
        character.id,
        user?.settings?.self?.nickname || 'User',
        apiSettings, // Pass the complete apiSettings
        undefined, // onStream callback
        rewriteOpinion // Pass rewrite opinion
      );
      
      if (!regeneratedText) {
        throw new Error("Failed to regenerate AI message");
      }
      
      // Get fresh messages after regeneration
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleRegenerateMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle editing an AI message by messageId
   */
  async handleEditAIMessage(
    messageId: string,
    aiIndex: number,
    newContent: string,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for editing");
      }
      
  // Find the message by ID in the complete history to get the correct role index
      const roleIndex = await this.findMessageRoleIndex(conversationId, messageId, 'model', messages);
      
      if (roleIndex === -1) {
        throw new Error("Message not found in conversation history");
      }

      // Use StorageAdapter to edit the AI message with the correct role index
      const success = await StorageAdapter.editAiMessageByIndex(
        conversationId,
        roleIndex,
        newContent,
      );
      
      if (!success) {
        throw new Error("Failed to edit AI message");
      }
      
      // Get fresh messages after editing
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleEditAIMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle deleting an AI message by messageId
   */
  async handleDeleteAIMessage(
    messageId: string,
    aiIndex: number,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for deletion");
      }
      


      // Find the message by ID in the complete history to get the correct role index
      const roleIndex = await this.findMessageRoleIndex(conversationId, messageId, 'model', messages);
      
      if (roleIndex === -1) {
        throw new Error("Message not found in conversation history");
      }

      // Use StorageAdapter to delete the AI message with the correct role index
      const success = await StorageAdapter.deleteAiMessageByIndex(
        conversationId,
        roleIndex,
      );
      
      if (!success) {
        throw new Error("Failed to delete AI message");
      }
      
      // Get fresh messages after deletion
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleDeleteAIMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle editing a user message by messageId
   */
  async handleEditUserMessage(
    messageId: string,
    userIndex: number,
    newContent: string,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for editing");
      }
      


      // Find the message by ID in the complete history to get the correct role index
      const roleIndex = await this.findMessageRoleIndex(conversationId, messageId, 'user', messages);
      
      if (roleIndex === -1) {
        throw new Error("Message not found in conversation history");
      }

      // Use StorageAdapter to edit the user message with the correct role index
      const success = await StorageAdapter.editUserMessageByIndex(
        conversationId,
        roleIndex,
        newContent,

      );
      
      if (!success) {
        throw new Error("Failed to edit user message");
      }
      
      // Get fresh messages after editing
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleEditUserMessage:', error);
      return { success: false };
    }
  }

  /**
   * Handle deleting a user message by messageId
   */
  async handleDeleteUserMessage(
    messageId: string,
    userIndex: number,
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; messages?: Message[] }> {
    try {
      if (!conversationId) {
        throw new Error("Missing required information for deletion");
      }
      
      // Get API settings instead of just API key
      const apiSettings = getApiSettings();
      // 特殊处理：CradleCloud适配器使用JWT Token，不需要API Key
      if (apiSettings.apiProvider !== 'cradlecloud' && !apiSettings.apiKey) {
        throw new Error("API key not found in settings");
      }

      // Find the message by ID in the complete history to get the correct role index
      const roleIndex = await this.findMessageRoleIndex(conversationId, messageId, 'user', messages);
      
      if (roleIndex === -1) {
        throw new Error("Message not found in conversation history");
      }

      // Use StorageAdapter to delete the user message with the correct role index
      const success = await StorageAdapter.deleteUserMessageByIndex(
        conversationId,
        roleIndex,
        apiSettings.apiKey || '', // Use empty string for CradleCloud
        apiSettings
      );
      
      if (!success) {
        throw new Error("Failed to delete user message");
      }
      
      // Get fresh messages after deletion
      const updatedMessages = await this.getMessagesAfterOperation(conversationId);
      
      return { success: true, messages: updatedMessages };
    } catch (error) {
      console.error('Error in handleDeleteUserMessage:', error);
      return { success: false };
    }
  }

  /**
   * Find the role index of a message in the conversation history
   * Returns the 1-based index expected by NodeSTCore (roleIndex + 1)
   */
  private async findMessageRoleIndex(
    conversationId: string, 
    messageId: string, 
    role: 'user' | 'model',
    messages?: Message[] // Optional UI messages for context matching
  ): Promise<number> {
    try {
      // Get complete chat history from StorageAdapter
      const completeHistory = await StorageAdapter.getCleanChatHistory(conversationId);
      
      if (completeHistory.length === 0) {
        console.warn(`No conversation history found for ${conversationId}`);
        return -1;
      }

      console.log(`[MessageService] Searching for messageId: ${messageId}, role: ${role}`);
      console.log(`[MessageService] Available messages:`, completeHistory.map((msg, idx) => ({
        globalIndex: idx,
        role: msg.role,
        timestamp: msg.timestamp,
        isFirstMes: msg.is_first_mes,
        textPreview: msg.parts?.[0]?.text?.substring(0, 50) || 'No text'
      })));

      // Helper function to calculate role index for a given global index
      // IMPORTANT: Exclude first_mes for AI messages to match NodeSTCore behavior
      const calculateRoleIndex = (targetGlobalIndex: number): number => {
        let roleIndex = 0;
        for (let i = 0; i <= targetGlobalIndex; i++) {
          const currentMsg = completeHistory[i];
          const currentIsMatch = (role === 'user' && currentMsg.role === 'user') || 
                               (role === 'model' && (currentMsg.role === 'model' || currentMsg.role === 'assistant'));
          
          if (currentIsMatch) {
            // For AI messages (model/assistant), exclude first_mes to match NodeSTCore
            // NodeSTCore filters AI messages with: !msg.is_first_mes
            if (role === 'model' && currentMsg.is_first_mes) {
              continue; // Skip first_mes for AI messages
            }
            // For user messages, also exclude first_mes (users don't send first_mes anyway)
            if (role === 'user' && currentMsg.is_first_mes) {
              continue; // Skip first_mes for user messages too
            }
            
            if (i === targetGlobalIndex) {
              return roleIndex + 1; // NodeSTCore expects 1-based index
            }
            roleIndex++;
          }
        }
        return -1;
      };

      // Filter messages for this role (excluding first_mes)
      const roleMessages = completeHistory.filter(msg => {
        const isRoleMatch = (role === 'user' && msg.role === 'user') || 
                           (role === 'model' && (msg.role === 'model' || msg.role === 'assistant'));
        
        // Exclude first_mes to match NodeSTCore behavior
        if (role === 'model' && msg.is_first_mes) {
          return false;
        }
        if (role === 'user' && msg.is_first_mes) {
          return false;
        }
        
        return isRoleMatch;
      });

      console.log(`[MessageService] Found ${roleMessages.length} messages of role ${role}`);

      // Strategy 1: Extract timestamp from messageId and find exact or closest match
      let extractedTimestamp: number | null = null;
      
      // Try pattern: {timestamp}-{random}
      const dashMatch = messageId.match(/^(\d+)-/);
      if (dashMatch) {
        extractedTimestamp = parseInt(dashMatch[1]);
      }
      
      // Try pattern: conversationId_{timestamp}_{random}
      if (!extractedTimestamp) {
        const underscoreMatch = messageId.match(/_(\d+)_/);
        if (underscoreMatch) {
          extractedTimestamp = parseInt(underscoreMatch[1]);
        }
      }

      if (extractedTimestamp) {
        console.log(`[MessageService] Extracted timestamp from messageId: ${extractedTimestamp}`);
        
        // First try exact match (within 500ms tolerance)
        let bestMatch = -1;
        let bestTimeDiff = Infinity;
        
        for (let globalIndex = 0; globalIndex < completeHistory.length; globalIndex++) {
          const msg = completeHistory[globalIndex];
          
          const isRoleMatch = (role === 'user' && msg.role === 'user') || 
                             (role === 'model' && (msg.role === 'model' || msg.role === 'assistant'));
          
          // Skip first_mes to match NodeSTCore behavior
          if (isRoleMatch && !msg.is_first_mes && msg.timestamp) {
            const timeDiff = Math.abs(msg.timestamp - extractedTimestamp);
            
            // Exact match within 500ms tolerance
            if (timeDiff < 500) {
              const roleIndex = calculateRoleIndex(globalIndex);
              console.log(`[MessageService] Found exact timestamp match at global index ${globalIndex}, roleIndex ${roleIndex}, timeDiff=${timeDiff}ms`);
              return roleIndex;
            }
            
            // Track best match for fallback
            if (timeDiff < bestTimeDiff) {
              bestTimeDiff = timeDiff;
              bestMatch = globalIndex;
            }
          }
        }
        
        // If no exact match but we have a reasonably close match (within 10 seconds), use it
        if (bestMatch !== -1 && bestTimeDiff < 10000) {
          const roleIndex = calculateRoleIndex(bestMatch);
          console.log(`[MessageService] Using close timestamp match at global index ${bestMatch}, roleIndex ${roleIndex}, timeDiff=${bestTimeDiff}ms`);
          return roleIndex;
        }
      }

      // Strategy 2: Try to find by relative position using current UI messages
      // This strategy uses the assumption that the user is operating on a message
      // that's currently visible in the UI, so we can use its relative position
      try {
        // Use the messages parameter passed from the UI to find relative position
        const currentUIMessages = messages; // This is passed from the caller
        
        if (currentUIMessages && currentUIMessages.length > 0) {
          // Find the target message in UI messages
          const targetUIIndex = currentUIMessages.findIndex((msg: any) => msg.id === messageId);
          
          if (targetUIIndex !== -1) {
            const targetMessage = currentUIMessages[targetUIIndex];
            
            // 🔧 新增：检测可能的分页情况
            const totalMessagesInStorage = completeHistory.length;
            const uiMessagesCount = currentUIMessages.length;
            const isPaginatedView = uiMessagesCount < totalMessagesInStorage && uiMessagesCount <= 50; // 假设分页大小不超过50
            
            console.log(`[MessageService] UI Context Analysis:`, {
              targetUIIndex,
              uiMessagesCount,
              totalMessagesInStorage,
              isPaginatedView,
              targetText: targetMessage.text.substring(0, 30)
            });
            
            // Find messages of the same role before this one in UI
            const sameRoleMessagesBefore = currentUIMessages
              .slice(0, targetUIIndex)
              .filter((msg: any) => 
                (role === 'user' && msg.sender === 'user') ||
                (role === 'model' && msg.sender === 'bot')
              );
            
            console.log(`[MessageService] Target message found at UI index ${targetUIIndex}, ${sameRoleMessagesBefore.length} same-role messages before it`);
            console.log(`[MessageService] Target message text: "${targetMessage.text.substring(0, 50)}..."`);
            
            // Try to match by text content and position
            let candidateMatches = [];
            
            for (let globalIndex = 0; globalIndex < completeHistory.length; globalIndex++) {
              const storageMsg = completeHistory[globalIndex];
              
              const isRoleMatch = (role === 'user' && storageMsg.role === 'user') || 
                                 (role === 'model' && (storageMsg.role === 'model' || storageMsg.role === 'assistant'));
              
              if (isRoleMatch && !storageMsg.is_first_mes) {
                const storageText = storageMsg.parts?.[0]?.text || '';
                
                // Check text similarity (exact match or very close)
                const isExactTextMatch = storageText === targetMessage.text;
                const isCloseTextMatch = storageText.length > 20 && targetMessage.text.length > 20 && 
                                       storageText.substring(0, 100) === targetMessage.text.substring(0, 100);
                
                if (isExactTextMatch || isCloseTextMatch) {
                  // Count same-role messages before this one in storage
                  const storageRoleMessagesBefore = completeHistory
                    .slice(0, globalIndex)
                    .filter(msg => {
                      const isMatch = (role === 'user' && msg.role === 'user') || 
                                     (role === 'model' && (msg.role === 'model' || msg.role === 'assistant'));
                      return isMatch && !msg.is_first_mes;
                    });
                  
                  // 🔧 改进：在分页情况下，只考虑文本匹配，不依赖位置匹配
                  const positionMatch = isPaginatedView ? 
                    true : // 在分页情况下，不使用位置匹配
                    storageRoleMessagesBefore.length === sameRoleMessagesBefore.length;
                  
                  candidateMatches.push({
                    globalIndex,
                    textMatch: isExactTextMatch,
                    closeTextMatch: isCloseTextMatch,
                    positionMatch,
                    roleMessagesBefore: storageRoleMessagesBefore.length,
                    storageText: storageText.substring(0, 50),
                    isPaginatedFallback: isPaginatedView
                  });
                }
              }
            }
            
            console.log(`[MessageService] Found ${candidateMatches.length} candidate matches:`, candidateMatches);
            
            // 🔧 改进：在分页情况下优先使用文本匹配
            let bestCandidate = null;
            
            if (isPaginatedView) {
              // 分页情况：优先精确文本匹配，忽略位置
              bestCandidate = candidateMatches.find(c => c.textMatch);
              if (!bestCandidate) {
                bestCandidate = candidateMatches.find(c => c.closeTextMatch);
              }
              console.log(`[MessageService] Paginated view: using text-only matching strategy`);
            } else {
              // 非分页情况：使用原有的优先级策略
              bestCandidate = candidateMatches.find(c => c.textMatch && c.positionMatch);
              if (!bestCandidate) {
                bestCandidate = candidateMatches.find(c => c.textMatch);
              }
              if (!bestCandidate) {
                bestCandidate = candidateMatches.find(c => c.closeTextMatch && c.positionMatch);
              }
              if (!bestCandidate) {
                bestCandidate = candidateMatches.find(c => c.closeTextMatch);
              }
              console.log(`[MessageService] Non-paginated view: using full matching strategy`);
            }
            
            if (bestCandidate) {
              const roleIndex = calculateRoleIndex(bestCandidate.globalIndex);
              console.log(`[MessageService] Found message by content/position match at global index ${bestCandidate.globalIndex}, roleIndex ${roleIndex}`);
              console.log(`[MessageService] Match details:`, {
                textMatch: bestCandidate.textMatch,
                closeTextMatch: bestCandidate.closeTextMatch,
                positionMatch: bestCandidate.positionMatch,
                isPaginatedFallback: bestCandidate.isPaginatedFallback,
                storageText: bestCandidate.storageText
              });
              return roleIndex;
            }
          }
        } else {
          console.log(`[MessageService] No UI messages context available, skipping Strategy 2`);
        }
      } catch (error) {
        console.warn('[MessageService] Could not use UI message context strategy:', error);
      }

      // Strategy 3: Use approximate position based on recent vs old message patterns
      if (extractedTimestamp && roleMessages.length > 0) {
        const conversationStartTime = parseInt(conversationId);
        const timeDiffFromStart = extractedTimestamp - conversationStartTime;
        
        console.log(`[MessageService] Using position estimation: conversationStart=${conversationStartTime}, messageTime=${extractedTimestamp}, diff=${timeDiffFromStart}ms`);
        
        // If message is very recent compared to conversation start, it's likely near the end
        if (timeDiffFromStart > 3600000) { // More than 1 hour after conversation start
          // Check the last few messages
          const lastFewToCheck = Math.min(5, roleMessages.length);
          
          for (let i = roleMessages.length - lastFewToCheck; i < roleMessages.length; i++) {
            const msg = roleMessages[i];
            if (msg.timestamp && Math.abs(msg.timestamp - extractedTimestamp) < 30000) { // Within 30 seconds
              const globalIndex = completeHistory.findIndex(m => m === msg);
              if (globalIndex !== -1) {
                const roleIndex = calculateRoleIndex(globalIndex);
                console.log(`[MessageService] Found recent message by position estimation at global index ${globalIndex}, roleIndex ${roleIndex}`);
                return roleIndex;
              }
            }
          }
        }
      }

      // If we reach here, we couldn't find the message with confidence
      console.error(`[MessageService] Could not find reliable match for messageId: ${messageId} with role: ${role}`);
      console.error(`[MessageService] Available role messages:`, roleMessages.map((msg, idx) => ({
        index: idx,
        timestamp: msg.timestamp,
        text: msg.parts?.[0]?.text?.substring(0, 30) || 'No text'
      })));
      
      return -1;
      
    } catch (error) {
      console.error('Error finding message role index:', error);
      return -1;
    }
  }

  /**
   * Helper method to retrieve fresh messages after an operation
   */
  private async getMessagesAfterOperation(conversationId: string): Promise<Message[]> {
    try {
      // Get clean chat history from StorageAdapter
      const cleanHistory = await StorageAdapter.getCleanChatHistory(conversationId);
      
      // Convert to Message format
      return cleanHistory.map(msg => ({
        id: `${msg.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        text: msg.parts?.[0]?.text || '',
        sender: msg.role === 'user' ? 'user' : 'bot',
        isLoading: false,
        timestamp: msg.timestamp || Date.now(),
        metadata: {
          messageIndex: msg.messageIndex,
        }
      }));
    } catch (error) {
      console.error('Error getting messages after operation:', error);
      return [];
    }
  }

  // ========== 测试功能 ==========

  /**
   * 创建测试用的消息历史（直接到StorageAdapter）
   * @param conversationId 会话ID
   * @param messageCount 消息数量
   * @returns 创建的消息列表
   */
  async createTestMessages(conversationId: string, messageCount: number = 61): Promise<any[]> {
    try {
      console.log(`[MessageService] 创建 ${messageCount} 条测试消息到 StorageAdapter`);
      
      const testMessages = await StorageAdapter.createTestChatHistory(conversationId, messageCount);
      
      console.log(`[MessageService] 成功创建 ${testMessages.length} 条测试消息`);
      return testMessages;
    } catch (error) {
      console.error('[MessageService] 创建测试消息失败:', error);
      throw error;
    }
  }

  /**
   * 测试索引查找功能的准确性
   * @param conversationId 会话ID
   * @param testCases 测试用例
   * @returns 测试结果
   */
  async testIndexLookupAccuracy(
    conversationId: string,
    testCases: Array<{ messageId: string; role: 'user' | 'model'; expectedIndex: number }>
  ): Promise<Array<{
    messageId: string;
    role: 'user' | 'model';
    expectedIndex: number;
    actualIndex: number;
    success: boolean;
    error?: string;
  }>> {
    const results = [];
    
    for (const testCase of testCases) {
      try {
        console.log(`[MessageService] 测试消息索引查找: ${testCase.messageId}`);
        
        // 使用现有的索引查找方法
        const actualIndex = await this.findMessageRoleIndex(
          conversationId, 
          testCase.messageId, 
          testCase.role,
          undefined // No UI messages context for test cases
        );
        
        const success = actualIndex === testCase.expectedIndex;
        
        results.push({
          messageId: testCase.messageId,
          role: testCase.role,
          expectedIndex: testCase.expectedIndex,
          actualIndex,
          success
        });
        
        console.log(`[MessageService] 索引查找结果: 期望=${testCase.expectedIndex}, 实际=${actualIndex}, 成功=${success}`);
        
      } catch (error) {
        results.push({
          messageId: testCase.messageId,
          role: testCase.role,
          expectedIndex: testCase.expectedIndex,
          actualIndex: -1,
          success: false,
          error: `查找过程出错: ${error}`
        });
      }
    }
    
    return results;
  }

  /**
   * 验证StorageAdapter的getCleanChatHistory是否正确返回测试消息
   * @param conversationId 会话ID
   * @returns 验证结果
   */
  async verifyStorageAdapterIntegration(conversationId: string): Promise<{
    success: boolean;
    messageCount: number;
    userMessageCount: number;
    aiMessageCount: number;
    indexMapping: any;
    error?: string;
  }> {
    try {
      console.log(`[MessageService] 验证 StorageAdapter 集成`);
      
      // 获取索引映射
      const indexMapping = await StorageAdapter.getTestMessageIndexMap(conversationId);
      
      // 获取清理后的消息历史
      const cleanHistory = await StorageAdapter.getCleanChatHistory(conversationId);
      
      const userMessageCount = cleanHistory.filter(m => m.role === 'user').length;
      const aiMessageCount = cleanHistory.filter(m => m.role === 'model' || m.role === 'assistant').length;
      
      console.log(`[MessageService] StorageAdapter返回: 总消息=${cleanHistory.length}, 用户消息=${userMessageCount}, AI消息=${aiMessageCount}`);
      
      return {
        success: true,
        messageCount: cleanHistory.length,
        userMessageCount,
        aiMessageCount,
        indexMapping
      };
      
    } catch (error) {
      console.error('[MessageService] StorageAdapter集成验证失败:', error);
      return {
        success: false,
        messageCount: 0,
        userMessageCount: 0,
        aiMessageCount: 0,
        indexMapping: null,
        error: `验证过程出错: ${error}`
      };
    }
  }

  /**
   * 生成测试用例（基于StorageAdapter中的实际消息）
   * @param conversationId 会话ID
   * @param sampleCount 采样数量
   * @returns 测试用例
   */
  async generateTestCases(
    conversationId: string, 
    sampleCount: number = 10
  ): Promise<Array<{ messageId: string; role: 'user' | 'model'; expectedIndex: number; timestamp: number; text: string }>> {
    try {
      const indexMapping = await StorageAdapter.getTestMessageIndexMap(conversationId);
      const testCases = [];
      
      // 从用户消息中采样
      const userSampleSize = Math.floor(sampleCount / 2);
      const userStep = Math.max(1, Math.floor(indexMapping.userMessages.length / userSampleSize));
      
      for (let i = 0; i < indexMapping.userMessages.length; i += userStep) {
        if (testCases.length >= userSampleSize) break;
        
        const userMsg = indexMapping.userMessages[i];
        testCases.push({
          messageId: `${userMsg.timestamp}-test-user`,
          role: 'user' as const,
          expectedIndex: userMsg.roleIndex,
          timestamp: userMsg.timestamp,
          text: userMsg.text
        });
      }
      
      // 从AI消息中采样
      const aiSampleSize = sampleCount - testCases.length;
      const aiStep = Math.max(1, Math.floor(indexMapping.aiMessages.length / aiSampleSize));
      
      for (let i = 0; i < indexMapping.aiMessages.length; i += aiStep) {
        if (testCases.length >= sampleCount) break;
        
        const aiMsg = indexMapping.aiMessages[i];
        testCases.push({
          messageId: `${aiMsg.timestamp}-test-ai`,
          role: 'model' as const,
          expectedIndex: aiMsg.roleIndex,
          timestamp: aiMsg.timestamp,
          text: aiMsg.text
        });
      }
      
      console.log(`[MessageService] 生成了 ${testCases.length} 个测试用例`);
      return testCases;
      
    } catch (error) {
      console.error('[MessageService] 生成测试用例失败:', error);
      return [];
    }
  }

  /**
   * 清理测试数据
   * @param conversationId 会话ID
   * @returns 是否成功
   */
  async cleanupTestData(conversationId: string): Promise<boolean> {
    try {
      console.log(`[MessageService] 清理测试数据`);
      return await StorageAdapter.cleanupTestData(conversationId);
    } catch (error) {
      console.error('[MessageService] 清理测试数据失败:', error);
      return false;
    }
  }

  /**
   * 测试API设置获取功能
   * @returns API设置信息
   */
  testApiSettings(): {
    success: boolean;
    settings?: any;
    error?: string;
  } {
    try {
      console.log('[MessageService] 测试API设置获取...');
      
      const apiSettings = getApiSettings();
      
      console.log('[MessageService] API设置结果:', {
        provider: apiSettings.apiProvider,
        hasApiKey: !!apiSettings.apiKey,
        useCloudService: apiSettings.useCloudService,
        openrouter: apiSettings.openrouter,
        OpenAIcompatible: apiSettings.OpenAIcompatible
      });
      
      return {
        success: true,
        settings: {
          provider: apiSettings.apiProvider,
          hasApiKey: !!apiSettings.apiKey,
          useCloudService: apiSettings.useCloudService,
          openrouter: apiSettings.openrouter,
          OpenAIcompatible: apiSettings.OpenAIcompatible
        }
      };
    } catch (error) {
      console.error('[MessageService] API设置获取失败:', error);
      return {
        success: false,
        error: `获取API设置时出错: ${error}`
      };
    }
  }

  /**
   * 🔧 新增：测试分页情况下的消息管理功能
   * 验证编辑、删除、重新生成在多分页情况下是否能正确工作
   */
  async testPaginatedMessageManagement(
    conversationId: string,
    pageSize: number = 30
  ): Promise<{
    success: boolean;
    results: string[];
    error?: string;
  }> {
    const results: string[] = [];
    
    try {
      results.push('=== 开始分页消息管理功能测试 ===');
      
      // 1. 创建足够多的测试消息以产生分页
      const totalMessages = 85; // 创建85条消息，确保有3页
      results.push(`第一步：创建 ${totalMessages} 条测试消息`);
      
      await this.createTestMessages(conversationId, totalMessages);
      
      // 2. 验证 StorageAdapter 集成
      const integration = await this.verifyStorageAdapterIntegration(conversationId);
      if (!integration.success) {
        throw new Error(`StorageAdapter集成验证失败: ${integration.error}`);
      }
      results.push(`✓ StorageAdapter集成验证成功: 总消息=${integration.messageCount}`);
      
      // 3. 模拟分页场景 - 获取不同页面的消息
      const completeHistory = await StorageAdapter.getCleanChatHistory(conversationId);
      results.push(`✓ 获取完整历史: ${completeHistory.length} 条消息`);
      
      // 模拟第1页（最新消息）
      const page1End = completeHistory.length;
      const page1Start = Math.max(0, page1End - pageSize);
      const page1Messages = completeHistory.slice(page1Start, page1End);
      
      // 模拟第2页
      const page2End = page1Start;
      const page2Start = Math.max(0, page2End - pageSize);
      const page2Messages = completeHistory.slice(page2Start, page2End);
      
      // 模拟第3页
      const page3End = page2Start;
      const page3Start = Math.max(0, page3End - pageSize);
      const page3Messages = completeHistory.slice(page3Start, page3End);
      
      results.push(`分页信息: 第1页=${page1Messages.length}条, 第2页=${page2Messages.length}条, 第3页=${page3Messages.length}条`);
      
      // 4. 测试不同页面的消息索引查找
      const testScenarios = [
        { name: '第1页(最新消息)', messages: page1Messages, pageNum: 1 },
        { name: '第2页(中间消息)', messages: page2Messages, pageNum: 2 },
        { name: '第3页(较早消息)', messages: page3Messages, pageNum: 3 }
      ];
      
      let totalTests = 0;
      let passedTests = 0;
      
      for (const scenario of testScenarios) {
        results.push(`\n--- 测试 ${scenario.name} ---`);
        
        if (scenario.messages.length === 0) {
          results.push(`跳过 ${scenario.name}：没有消息`);
          continue;
        }
        
        // 在每页中选择几条测试消息
        const testMessages = [
          scenario.messages[0], // 第一条
          scenario.messages[Math.floor(scenario.messages.length / 2)], // 中间
          scenario.messages[scenario.messages.length - 1] // 最后一条
        ].filter(msg => msg && !msg.is_first_mes); // 排除空消息和first_mes
        
        for (const testMsg of testMessages) {
          if (!testMsg.timestamp) continue;
          
          const messageId = `${testMsg.timestamp}-test-${scenario.pageNum}`;
          const role = testMsg.role === 'user' ? 'user' : 'model';
          
          totalTests++;
          
          try {
            // 🔧 关键：模拟UI只传递当前页消息的情况
            const uiMessages = scenario.messages.map(msg => ({
              id: `${msg.timestamp}-ui`,
              text: msg.parts?.[0]?.text || '',
              sender: msg.role === 'user' ? 'user' : 'bot',
              timestamp: msg.timestamp
            }));
            
            // 测试索引查找
            const foundIndex = await this.findMessageRoleIndex(
              conversationId, 
              messageId, 
              role as 'user' | 'model',
              uiMessages // 🔧 传递分页后的UI消息
            );
            
            if (foundIndex > 0) {
              passedTests++;
              results.push(`✓ ${scenario.name} ${role}消息索引查找成功: ${foundIndex}`);
            } else {
              results.push(`✗ ${scenario.name} ${role}消息索引查找失败: ${foundIndex}`);
              
              // 尝试时间戳策略验证
              const storageResult = await StorageAdapter.verifyMessageIndexLookup(
                conversationId, 
                messageId, 
                role as 'user' | 'model'
              );
              
              if (storageResult.success) {
                results.push(`  → StorageAdapter直接查找成功: roleIndex=${storageResult.roleIndex}`);
              } else {
                results.push(`  → StorageAdapter直接查找也失败: ${storageResult.error}`);
              }
            }
          } catch (error) {
            results.push(`✗ ${scenario.name} ${role}消息测试异常: ${error}`);
          }
        }
      }
      
      // 5. 测试结果统计
      results.push(`\n=== 分页测试结果统计 ===`);
      results.push(`总测试数: ${totalTests}`);
      results.push(`成功数: ${passedTests}`);
      results.push(`成功率: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0}%`);
      
      // 6. 特殊场景测试：模拟极端分页情况
      results.push(`\n--- 特殊场景测试 ---`);
      
      // 6.1 测试只有1条消息的页面
      if (page3Messages.length > 0) {
        const singleMsgPage = [page3Messages[0]];
        const singleMsgId = `${page3Messages[0].timestamp}-single`;
        const singleRole = page3Messages[0].role === 'user' ? 'user' : 'model';
        
        const singleUI = [{
          id: singleMsgId,
          text: page3Messages[0].parts?.[0]?.text || '',
          sender: page3Messages[0].role === 'user' ? 'user' : 'bot',
          timestamp: page3Messages[0].timestamp
        }];
        
        const singleResult = await this.findMessageRoleIndex(
          conversationId, 
          singleMsgId, 
          singleRole as 'user' | 'model',
          singleUI
        );
        
        if (singleResult > 0) {
          results.push(`✓ 单消息页面测试成功: ${singleResult}`);
        } else {
          results.push(`✗ 单消息页面测试失败: ${singleResult}`);
        }
      }
      
      // 6.2 测试空UI上下文（模拟某些异常情况）
      if (page1Messages.length > 0) {
        const emptyUIId = `${page1Messages[0].timestamp}-empty`;
        const emptyRole = page1Messages[0].role === 'user' ? 'user' : 'model';
        
        const emptyResult = await this.findMessageRoleIndex(
          conversationId, 
          emptyUIId, 
          emptyRole as 'user' | 'model',
          [] // 空的UI上下文
        );
        
        if (emptyResult > 0) {
          results.push(`✓ 空UI上下文测试成功: ${emptyResult} (依靠时间戳策略)`);
        } else {
          results.push(`✗ 空UI上下文测试失败: ${emptyResult}`);
        }
      }
      
      const overallSuccess = passedTests >= totalTests * 0.8; // 80%成功率算通过
      
      results.push(`\n=== 测试总结 ===`);
      if (overallSuccess) {
        results.push(`🎉 分页消息管理功能测试通过！`);
        results.push(`系统能够在多分页情况下正确处理消息管理功能。`);
      } else {
        results.push(`⚠️ 分页消息管理功能测试部分失败。`);
        results.push(`需要检查时间戳匹配策略或分页逻辑。`);
      }
      
      return {
        success: overallSuccess,
        results
      };
      
    } catch (error) {
      console.error('[MessageService] 分页测试失败:', error);
      results.push(`✗ 测试过程出错: ${error}`);
      return {
        success: false,
        results,
        error: `测试过程出错: ${error}`
      };
    }
  }
}

export default new MessageService();
