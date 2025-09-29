
// 默认预设条目的配置
export const DEFAULT_PRESET_ENTRIES = {
  // 可编辑条目
  EDITABLE: [
    { id: "main", name: "Main", identifier: "main" },
    { id: "enhance", name: "Enhance Definitions", identifier: "enhance_def" },
    { id: "auxiliary", name: "Auxiliary Prompt", identifier: "aux_prompt" },
    { id: "post_history", name: "Post-History Instructions", identifier: "post_hist" }
  ],
  
  // 只可排序条目 (与角色卡关联)
  FIXED: [
    { id: "world_info_before", name: "World Info (before)", identifier: "world_before" },
    { id: "char_desc", name: "Char Description", identifier: "char_desc" },
    { id: "char_pers", name: "Char Personality", identifier: "char_pers" },
    { id: "scenario", name: "Scenario", identifier: "scenario" },
    { id: "world_info_after", name: "World Info (after)", identifier: "world_after" },
    { id: "chat_examples", name: "Chat Examples", identifier: "chat_ex" },
    { id: "chat_history", name: "Chat History", identifier: "chat_hist" }
  ]
};

// 默认条目顺序
export const DEFAULT_PRESET_ORDER = [
  "main",
  "world_before", 
  "char_desc",
  "char_pers",
  "scenario",
  "enhance_def",
  "aux_prompt",
  "world_after",
  "chat_ex",
  "chat_hist",
  "post_hist"
];

export interface PresetEntry {
  id: string;
  name: string;
  content: string;
  identifier: string;
  isEditable: boolean;
  insertType: 'relative' | 'chat';
  role: 'user' | 'model';
  depth?: number;
  order: number;
}
