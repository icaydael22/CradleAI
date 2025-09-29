import { 
    PresetJson, 
    RoleCardJson, 
    WorldBookJson, 
    AuthorNoteJson, 
    ChatMessage, 
    ChatHistoryEntity,
    UserCustomSetting 
} from '../../../shared/types';


export class CharacterUtils {
    static buildRFramework(
        presetJson: PresetJson,
        roleCardJson: RoleCardJson,
        worldBookJson: WorldBookJson,
        options?: { 
            isCradleGeneration?: boolean  // Optional flag for cradle-specific behavior
        }
    ): [ChatMessage[], ChatHistoryEntity | null] {
        // First, create defensive copies of all input parameters to prevent modification issues
        const safePresetJson = this.ensureSafePreset(presetJson);
        const safeRoleCardJson = this.ensureSafeRoleCard(roleCardJson);
        const safeWorldBookJson = this.ensureSafeWorldBook(worldBookJson);
        
        const rEntries: ChatMessage[] = [];
        let chatHistory: ChatHistoryEntity | null = null;
        let chatHistoryIdentifier = "chatHistory"; // Default identifier

        // Enhanced Debug logs with roleCard data check
        console.log('[CharacterUtils] Building framework with roleCard validation:', {
            roleCardName: safeRoleCardJson.name,
            roleCardNameType: typeof safeRoleCardJson.name, 
            roleCardHasDescription: !!safeRoleCardJson.description,
            roleCardHasPersonality: !!safeRoleCardJson.personality,
            roleCardHasMesExample: !!safeRoleCardJson.mes_example,
            promptIdentifiers: safePresetJson.prompts.map(p => p.identifier),
            isCradleGeneration: options?.isCradleGeneration || false
        });

        try {
            // Ensure prompt_order exists and has valid entries
            if (!safePresetJson.prompt_order || !safePresetJson.prompt_order[0]) {
                safePresetJson.prompt_order = [{ order: [] }];
            }

            // 获取prompt order - with extra safety checks
            const promptOrder = safePresetJson.prompt_order[0]?.order
                ?.filter(item => item && item.enabled && item.identifier)
                ?.map(item => item.identifier) || [];
            
            console.log('[CharacterUtils] Prompt order:', promptOrder);

            // Find chatHistory position in the prompt order
            const chatHistoryPosition = promptOrder.findIndex(id => id.includes('chathistory') || id.includes('chatHistory'));
            console.log(`[CharacterUtils] Chat history position in prompt order: ${chatHistoryPosition}`);

            // 处理prompts数组
            const prompts = safePresetJson.prompts
                ?.filter(item => item && item.enable !== false && item.injection_position !== 1) || [];
            
            // Ensure name entry is always created if not in prompts
            let hasNameEntry = false;

            // 确保所有角色卡字段都有对应的条目
            // 创建必要的角色卡字段映射
            const roleCardFieldEntries: Record<string, ChatMessage> = {
                "charDescription": {
                    name: "Char Description",
                    role: "user",
                    parts: [{ text: safeRoleCardJson.description || "" }],
                    identifier: "charDescription"
                },
                "charPersonality": {
                    name: "Char Personality",
                    role: "user",
                    parts: [{ text: safeRoleCardJson.personality || "" }],
                    identifier: "charPersonality"
                },
                "scenario": {
                    name: "Scenario",
                    role: "user",
                    parts: [{ text: safeRoleCardJson.scenario || "" }],
                    identifier: "scenario"
                },
                "dialogueExamples": {
                    name: "Dialogue Examples",
                    role: "user",
                    parts: [{ text: safeRoleCardJson.mes_example || "" }],
                    identifier: "dialogueExamples"
                }
            };

            // 创建一个记录哪些角色卡字段已被处理的集合
            const processedRoleCardFields = new Set<string>();

            // First pass: Process all entries except chatHistory to find its identifier
            for (const item of prompts) {
                // Safety check for each item
                if (!item) continue;
                
                // Create a safe identifier - make sure it's never undefined
                const safeIdentifier = item.identifier || `generated_${Math.random().toString(36).substring(2, 9)}`;
                
                if (item.name === "Chat History" || safeIdentifier.toLowerCase().includes('chathistory')) {
                    // Record the identifier but don't add to rEntries yet
                    chatHistoryIdentifier = safeIdentifier;
                    chatHistory = {
                        name: item.name || "Chat History",
                        role: item.role || "system",
                        parts: [],
                        identifier: safeIdentifier
                    };

                    console.log(`[CharacterUtils] Found chatHistory with identifier: ${safeIdentifier}`);
                    continue; // Skip adding to rEntries for now
                }

                // 重要修改：创建新的框架条目时，强制使用角色卡中的最新内容
                const rEntry: ChatMessage = {
                    name: item.name || 'Unnamed Entry',
                    role: item.role || "user",
                    parts: [{ text: "" }],
                    identifier: safeIdentifier
                };

                // 强制使用角色卡中的最新内容
                const content = (() => {
                    switch (safeIdentifier) {
                        case "charDescription":
                            processedRoleCardFields.add("charDescription");
                            return safeRoleCardJson.description || "";
                        case "charPersonality":
                            processedRoleCardFields.add("charPersonality");
                            return safeRoleCardJson.personality || "";
                        case "scenario":
                            processedRoleCardFields.add("scenario");
                            return safeRoleCardJson.scenario || "";
                        case "dialogueExamples":
                            processedRoleCardFields.add("dialogueExamples");
                            return safeRoleCardJson.mes_example || "";
                        case "name":
                            hasNameEntry = true;
                            return safeRoleCardJson.name || "";
                        case "first_mes":
                            return safeRoleCardJson.first_mes || "";
                        default:
                            // 只有在找不到对应的角色卡内容时，才使用preset中的原始内容
                            return item.content || "";
                    }
                })();

                rEntry.parts[0].text = content;
                
                // Add special handling for injection prompts
                if (item.injection_position !== undefined) {
                    rEntry.injection_position = item.injection_position;
                }
                
                if (item.injection_depth !== undefined) {
                    rEntry.injection_depth = item.injection_depth;
                }
                
                // Check if this entry should be mapped to specific role
                // This is particularly important for character-system prompts
                if (item.role === "model" || item.role === "assistant") {
                    rEntry.role = "model";
                } else {
                    rEntry.role = "user";
                }

                // Check if this is a name entry
                if (safeIdentifier === "name") {
                    hasNameEntry = true;
                }

                rEntries.push(rEntry);
            }

            // 确保所有重要的角色卡字段都包含在条目中
            for (const field of ["charDescription", "charPersonality", "scenario", "dialogueExamples"]) {
                if (!processedRoleCardFields.has(field) && roleCardFieldEntries[field]) {
                    rEntries.push(roleCardFieldEntries[field]);
                    console.log(`[CharacterUtils] Added missing role card field: ${field}`);
                }
            }

            // If there's no name entry in the prompts but we have a roleCard name, add it
            if (!hasNameEntry && safeRoleCardJson.name) {
                rEntries.push({
                    name: "Name",
                    role: "user",
                    parts: [{ text: safeRoleCardJson.name || "Unnamed Character" }],
                    identifier: "name"
                });
                console.log('[CharacterUtils] Added missing name entry:', safeRoleCardJson.name);
            }

            // 按promptOrder排序 - the key part that needs fixing
            const sortedEntries: ChatMessage[] = [];
            
            // Process each identifier in the prompt order
            for (const id of promptOrder) {
                // Skip undefined identifiers
                if (!id) continue;
                
                // If this is the chatHistory identifier, create a placeholder 
                // that we'll replace later with the actual chatHistory
                if (id === chatHistoryIdentifier) {
                    console.log(`[CharacterUtils] Adding chatHistory placeholder at position defined in prompt order`);
                    sortedEntries.push({
                        name: "Chat History",
                        role: "system",
                        parts: [],
                        identifier: chatHistoryIdentifier,
                        is_chat_history_placeholder: true
                    });
                    continue;
                }
                
                // For other identifiers, find the matching entry
                let entry = rEntries.find(entry => entry?.identifier === id);
                if (!entry && roleCardFieldEntries[id]) {
                    entry = roleCardFieldEntries[id];
                    console.log(`[CharacterUtils] Using roleCardFieldEntry for ${id}`);
                }
                
                if (entry) {
                    console.log(`[CharacterUtils] Adding entry for ${id} at position ${sortedEntries.length}`);
                    sortedEntries.push(entry);
                } else {
                    console.log(`[CharacterUtils] No entry found for identifier: ${id}`);
                }
            }

            // 处理position-based条目
            const positionBasedEntries: ChatMessage[] = [];
            
            // Safely process world book entries
            if (safeWorldBookJson && safeWorldBookJson.entries) {
                for (const key in safeWorldBookJson.entries) {
                    const entry = safeWorldBookJson.entries[key];
                    if (entry && !entry.disable && (entry.position === 4)) {
                        positionBasedEntries.push({
                            name: entry.comment || 'World Book Entry',
                            role: "user",
                            parts: [{ text: entry.content || '' }],
                            position: entry.position,
                            insertion_order: entry.order || 0
                        });
                    }
                }
            }
            
            // Sort entries by insertion_order
            positionBasedEntries.sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));
            
            console.log('[CharacterUtils] Position-based entries:', positionBasedEntries.length);

            // 在Char Description前后插入条目
            const charDescIndex = sortedEntries.findIndex(entry => entry && entry.name === "Char Description");
            if (charDescIndex !== -1) {
                const beforeEntries = positionBasedEntries.filter(e => e && e.position === 0);
                const afterEntries = positionBasedEntries.filter(e => e && e.position === 1);

                // 在角色描述前插入 position=0 的条目
                for (const entry of beforeEntries.reverse()) {
                    if (!entry) continue;
                    sortedEntries.splice(charDescIndex, 0, entry);
                }

                // 在角色描述后插入 position=1 的条目
                let insertIndex = charDescIndex + 1;
                for (const entry of afterEntries) {
                    if (!entry) continue;
                    sortedEntries.splice(insertIndex, 0, entry);
                    insertIndex++;
                }
            }

            // Remove all the special chatHistory insertion logic and instead just return it
            // This will ensure it's handled properly by the caller, which will inject the full
            // chatHistory at the position of the placeholder

            // Additional logging after sorting to see final framework
            console.log('[CharacterUtils] Final framework structure:', {
                hasNameEntry: hasNameEntry || sortedEntries.some(e => e.identifier === "name" || e.name === "Name"),
                roleCardName: safeRoleCardJson.name,
                sortedEntriesCount: sortedEntries.length,
                hasChatHistoryPlaceholder: sortedEntries.some(e => e.is_chat_history_placeholder),
                entries: sortedEntries.map(e => ({
                    name: e?.name,
                    identifier: e?.identifier,
                    isChatHistoryPlaceholder: e?.is_chat_history_placeholder
                }))
            });

            return [sortedEntries, chatHistory];
        } catch (error) {
            console.error('[CharacterUtils] Error in buildRFramework:', error, {
                presetJson: typeof presetJson,
                roleCardJson: typeof roleCardJson,
                worldBookJson: typeof worldBookJson
            });
            
            // Create a guaranteed safe fallback
            try {
                // Provide a minimal valid framework as fallback
                const safeName = safeRoleCardJson?.name || "Unnamed Character";
                const safePersonality = safeRoleCardJson?.personality || "Friendly";
                const safeDescription = safeRoleCardJson?.description || "No description provided.";
                
                console.log('[CharacterUtils] Creating minimal framework with:', {
                    safeName,
                    safePersonality,
                    safeDescription
                });
                
                const minimalFramework: ChatMessage[] = [
                    {
                        name: "Character Info",
                        role: "user",
                        parts: [{ 
                            text: `Name: ${safeName}\n` +
                                  `Personality: ${safePersonality}\n` +
                                  `Description: ${safeDescription}`
                        }],
                        identifier: "character_info"
                    },
                    {
                        name: "Chat History",
                        role: "system",
                        parts: [],
                        identifier: "chatHistory"
                    }
                ];
                
                const minimalChatHistory: ChatHistoryEntity = {
                    name: "Chat History",
                    role: "system",
                    parts: [],
                    identifier: "chatHistory"
                };
                
                return [minimalFramework, minimalChatHistory];
            } catch (fallbackError) {
                console.error('[CharacterUtils] Even minimal framework creation failed:', fallbackError);
                
                // Absolute minimum fallback that cannot fail
                return [
                    [{
                        name: "Minimal Info",
                        role: "user",
                        parts: [{ text: "This is a fallback minimal framework." }],
                        identifier: "minimal"
                    }], 
                    null
                ];
            }
        }
    }

    // Create safe versions of input parameters
    private static ensureSafeRoleCard(roleCardJson: RoleCardJson | undefined): RoleCardJson {
        if (!roleCardJson) {
            console.error('[CharacterUtils] roleCardJson is undefined or null');
            return {
                name: "Unnamed Character",
                first_mes: "Hello!",
                description: "This character has missing information.",
                personality: "Friendly",
                scenario: "",
                mes_example: ""
            };
        }
        
        // Create a defensive copy
        const safeRoleCard: RoleCardJson = {
            name: roleCardJson.name || "Unnamed Character",
            first_mes: roleCardJson.first_mes || "Hello!",
            description: roleCardJson.description || "No description provided.",
            personality: roleCardJson.personality || "Friendly",
            scenario: roleCardJson.scenario || "",
            mes_example: roleCardJson.mes_example || "",
            background: roleCardJson.background || undefined,
            data: roleCardJson.data || undefined
        };
        
        return safeRoleCard;
    }
    
    private static ensureSafePreset(presetJson: PresetJson | undefined): PresetJson {
        if (!presetJson || !presetJson.prompts || !Array.isArray(presetJson.prompts)) {
            console.error('[CharacterUtils] presetJson is undefined or invalid');
            // Return a default preset with the required framework structure
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
        }
        
        // Create a defensive copy
        const safePreset: PresetJson = {
            prompts: presetJson.prompts.map(prompt => ({
                name: prompt.name || "Unnamed Prompt",
                content: prompt.content || "",
                enable: prompt.enable !== false,
                identifier: prompt.identifier || `prompt_${Math.random().toString(36).substring(2, 9)}`,
                injection_position: prompt.injection_position,
                injection_depth: prompt.injection_depth,
                role: prompt.role || "user"
            })),
            prompt_order: Array.isArray(presetJson.prompt_order) ? 
                presetJson.prompt_order.map(order => ({
                    order: Array.isArray(order.order) ? 
                        order.order.map(item => ({
                            identifier: item.identifier || "",
                            enabled: item.enabled !== false
                        })) : []
                })) : 
                [{ order: [] }]
        };
        
        // Ensure at least one order item exists
        if (!safePreset.prompt_order.length || !safePreset.prompt_order[0].order.length) {
            safePreset.prompt_order = [{
                order: safePreset.prompts.map(p => ({
                    identifier: p.identifier || "",
                    enabled: p.enable !== false
                }))
            }];
        }
        
        return safePreset;
    }
    
    private static ensureSafeWorldBook(worldBookJson: WorldBookJson | undefined): WorldBookJson {
        if (!worldBookJson || !worldBookJson.entries) {
            console.error('[CharacterUtils] worldBookJson is undefined or invalid');
            return { entries: {} };
        }
        
        // Create a defensive copy
        const safeWorldBook: WorldBookJson = {
            entries: {}
        };
        
        // Safely copy entries
        for (const key in worldBookJson.entries) {
            const entry = worldBookJson.entries[key];
            if (entry) {
                safeWorldBook.entries[key] = {
                    comment: entry.comment || key,
                    content: entry.content || "",
                    disable: !!entry.disable,
                    position: entry.position || 0,
                    constant: entry.constant !== false,
                    key: Array.isArray(entry.key) ? [...entry.key] : [],
                    order: entry.order || 0,
                    depth: entry.depth || 0,
                    vectorized: !!entry.vectorized
                };
            }
        }
        
        return safeWorldBook;
    }

    static extractDEntries(
        presetJson: PresetJson,
        worldBookJson: WorldBookJson,
        authorNoteJson?: AuthorNoteJson
    ): ChatMessage[] {
        try {
            // Create safe versions of inputs first
            const safePresetJson = this.ensureSafePreset(presetJson);
            const safeWorldBookJson = this.ensureSafeWorldBook(worldBookJson);
            
            const dEntries: ChatMessage[] = [];

            // 从prompt_order提取enabled状态
            const enabledIdentifiers = new Set(
                safePresetJson.prompt_order[0]?.order
                    .filter(item => item.enabled)
                    .map(item => item.identifier)
            );

            // 处理preset中的injection_position=1的条目
            for (const item of safePresetJson.prompts) {
                if (item.injection_position === 1 && enabledIdentifiers.has(item.identifier || '')) {
                    dEntries.push({
                        name: item.name || 'Unnamed Prompt',
                        parts: [{ text: item.content || '' }],
                        role: item.role || "user",
                        injection_depth: item.injection_depth || 0,
                        identifier: item.identifier,
                        is_d_entry: true,
                        position: 4, // 强制设为position=4，这样会被作为D类条目处理
                        constant: true // preset中的条目默认constant=true
                    });
                }
            }

            // 添加作者注释
            if (authorNoteJson) {
                dEntries.push({
                    name: "Author Note",
                    parts: [{ text: authorNoteJson.content || '' }],
                    role: authorNoteJson.role || "user",
                    injection_depth: authorNoteJson.injection_depth || 0,
                    is_d_entry: true,
                    is_author_note: true,
                    is_first_mes: false
                });
            }

            // 处理世界书中的D类条目
            for (const [key, entry] of Object.entries(safeWorldBookJson.entries)) {
                if (!entry.disable && [2, 3, 4].includes(entry.position)) {
                    if ([2, 3].includes(entry.position) && !authorNoteJson) {
                        continue;
                    }

                    dEntries.push({
                        name: entry.comment || key,
                        parts: [{ text: entry.content || '' }],
                        role: "user",
                        is_d_entry: true,
                        position: entry.position,
                        key: entry.key,
                        constant: entry.constant,
                        injection_depth: entry.depth
                    });
                }
            }

            return dEntries;
        } catch (error) {
            console.error('[CharacterUtils] Error in extractDEntries:', error);
            // Return empty array as fallback
            return [];
        }
    }

    /**
     * Saves a global custom user setting
     * @param customSetting The custom setting to save globally
     * @returns Promise that resolves to true if successful
     */
    public static async saveGlobalCustomSetting(customSetting: UserCustomSetting): Promise<boolean> {
        try {
            // Import AsyncStorage
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            
            // Store the setting with the global key
            await AsyncStorage.setItem('global_user_custom_setting', JSON.stringify({
                ...customSetting,
                global: true // Ensure it's marked as global
            }));
            
            console.log('[CharacterUtils] Global custom setting saved');
            return true;
        } catch (error) {
            console.error('[CharacterUtils] Error saving global custom setting:', error);
            return false;
        }
    }

    /**
     * Gets the global custom user setting if it exists
     * @returns Promise that resolves to the custom setting or null
     */
    public static async getGlobalCustomSetting(): Promise<UserCustomSetting | null> {
        try {
            // Import AsyncStorage
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            
            // Retrieve the setting
            const settingData = await AsyncStorage.getItem('global_user_custom_setting');
            if (!settingData) return null;
            
            return JSON.parse(settingData);
        } catch (error) {
            console.error('[CharacterUtils] Error getting global custom setting:', error);
            return null;
        }
    }
}
