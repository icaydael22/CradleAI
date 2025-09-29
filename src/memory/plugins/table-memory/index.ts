/**
 * 表格记忆增强插件 - 主入口
 * 
 * 导出所有公共API和服务，作为插件与Mem0系统的接口。
 * 基于文件系统JSON存储的实现。
 */

import * as API from './api';
import { SheetManager } from './services/sheet-manager';
import { TemplateManager } from './services/template-manager';
import { StorageService } from './services/storage-service';
import { Sheet, toText } from './models/sheet';
import { SheetTemplate } from './models/template';
import { Cell } from './models/cell';
import { FileSystemStorage } from './services/file-system-storage';

// 插件已初始化标志
let initialized = false;

// 插件已启用标志
let enabled = false;

/**
 * 初始化插件
 * @param options 初始化选项
 * @returns 是否成功初始化
 */
export async function initialize(options: { 
  dbPath?: string; // 现在代表基础存储目录
  defaultTemplates?: boolean;
  useQueue?: boolean; // 新增: 是否使用队列系统
} = {}): Promise<boolean> {
  try {
    if (initialized) {
      console.log('[TableMemory] 插件已初始化，跳过');
      return true;
    }
    
    console.log('[TableMemory] 正在初始化插件...');
    
    // 修正：处理路径格式以确保兼容性
    let storagePath = options.dbPath;
    if (storagePath && storagePath.endsWith('.db')) {
      storagePath = storagePath.replace(/\.db$/, '_data');
      console.log(`[TableMemory] 修正存储路径: ${storagePath}`);
    }
    
    // 初始化文件系统存储服务，默认禁用队列系统
    await StorageService.initialize(storagePath, { 
      useQueue: options.useQueue ?? false // 默认不使用队列 
    });
    
    // 初始化模板管理器
    await TemplateManager.initialize();
    
    // 初始化表格管理器
    await SheetManager.initialize();
    
    // 如果需要，添加默认模板
    if (options.defaultTemplates !== false) {
      await createDefaultTemplates();
    }
    
    initialized = true;
    enabled = true;
    console.log('[TableMemory] 插件初始化完成');
    return true;
  } catch (error) {
    console.error('[TableMemory] 插件初始化失败:', error);
    return false;
  }
}

/**
 * 创建默认模板
 */
async function createDefaultTemplates(): Promise<void> {
  try {
    // 检查是否已有模板
    const templates = await TemplateManager.getAllTemplates();
    if (templates.length > 0) {
      console.log('[TableMemory] 已存在模板，跳过创建默认模板');
      return;
    }
    
    console.log('[TableMemory] 创建默认模板...');
    
    // 创建角色特征表模板
    const characterTemplate = await TemplateManager.createTemplate({
      name: "特征表格",
      type: "dynamic",
      columns: [
        { value: "角色名", valueIsOnly: true, columnDataType: "text", columnNote: "角色的名称" },
        { value: "身体特征", valueIsOnly: false, columnDataType: "text", columnNote: "外貌、体型等特征" },
        { value: "性格", valueIsOnly: false, columnDataType: "text", columnNote: "性格特点" },
        { value: "职业", valueIsOnly: false, columnDataType: "text", columnNote: "角色的职业" },
        { value: "爱好", valueIsOnly: false, columnDataType: "text", columnNote: "兴趣爱好" },
        { value: "喜欢的事物", valueIsOnly: false, columnDataType: "text", columnNote: "喜欢的作品、人物、物品等" },
        { value: "住所", valueIsOnly: false, columnDataType: "text", columnNote: "居住地" },
        { value: "其他重要信息", valueIsOnly: false, columnDataType: "text", columnNote: "其它值得记录的信息" }
      ],
      rows: 2,
      note: "记录角色的基本特征",
      initPrompt: "请仔细分析以下对话内容，初始化角色特征表格。表格已有标题行，你需要添加内容行。使用'/'分隔多个相同类别的特征，例如'高大/蓝眼睛/金发'。未知信息填写'未知'。请返回完整的markdown表格，包含标题行和所有内容行。",
      insertPrompt: "请分析聊天内容，提取角色特征信息，添加新行到表格中。",
      deletePrompt: "请删除表格中不再相关的角色行。",
      updatePrompt: "请根据聊天内容更新角色特征表格。可以添加新角色行，或更新现有角色的特征。使用'/'分隔多个相同类别的特征，例如'高大/蓝眼睛/金发'。"
    });
    
    // 创建社交关系表模板
    const socialTemplate = await TemplateManager.createTemplate({
      name: "关系表格",
      type: "dynamic",
      columns: [
        { value: "角色名", valueIsOnly: true, columnDataType: "text", columnNote: "角色的名称" },
        { value: "对用户关系", valueIsOnly: false, columnDataType: "text", columnNote: "关系类型，如朋友、敌人等" },
        { value: "对用户态度", valueIsOnly: false, columnDataType: "text", columnNote: "情感态度，如友好、敌对等" },
        { value: "对用户好感", valueIsOnly: false, columnDataType: "text", columnNote: "好感度，如高、中、低等" }
      ],
      rows: 2,
      note: "记录角色与用户的社交关系",
      initPrompt: "请仔细分析以下对话内容，初始化角色与用户的社交关系表格。表格已有标题行，你需要添加内容行。使用'/'分隔多个态度描述，例如'友好/关心'。未知信息填写'未知'。请以完整markdown表格形式返回，确保包含标题行和正确的表格分隔符。",
      insertPrompt: "请分析聊天内容，提取角色与用户的社交关系信息，添加新行到表格中。",
      deletePrompt: "请删除表格中不再相关的角色行。",
      updatePrompt: "请根据聊天内容更新角色与用户的社交关系表格。可以添加新角色行，或更新现有角色与用户的关系。使用'/'分隔多个态度描述，例如'友好/关心'。"
    });
    
    // 创建时空表模板
    const timeSpaceTemplate = await TemplateManager.createTemplate({
      name: "时空表格",
      type: "static",
      columns: [
        { value: "日期", valueIsOnly: true, columnDataType: "text", columnNote: "当前日期" },
        { value: "时间", valueIsOnly: true, columnDataType: "text", columnNote: "当前时间" },
        { value: "地点（当前描写）", valueIsOnly: true, columnDataType: "text", columnNote: "当前场景地点" },
        { value: "此地角色", valueIsOnly: false, columnDataType: "text", columnNote: "当前场景中的角色" }
      ],
      rows: 1,
      note: "记录当前场景的时间和地点信息",
      initPrompt: "请仔细分析以下对话内容，填写时空表格。表格只应有一行数据，记录当前场景的时间、地点和角色信息。日期格式：YYYY-MM-DD，时间格式：HH:MM，地点格式：大区域>小区域，如'异世界>酒馆'。请以完整markdown表格形式返回，确保格式正确。",
      insertPrompt: "",
      deletePrompt: "",
      updatePrompt: "请根据最新的聊天内容更新时空表格。表格应只有一行，显示最新的时间、地点和角色信息。日期格式：YYYY-MM-DD，时间格式：HH:MM，地点格式：大区域>小区域。"
    });
    
    // 创建事件历史表模板
    const eventTemplate = await TemplateManager.createTemplate({
      name: "事件表格",
      type: "dynamic",
      columns: [
        { value: "角色", valueIsOnly: false, columnDataType: "text", columnNote: "相关角色" },
        { value: "事件简述", valueIsOnly: true, columnDataType: "text", columnNote: "事件内容简述" },
        { value: "日期", valueIsOnly: false, columnDataType: "text", columnNote: "事件发生日期" },
        { value: "地点", valueIsOnly: false, columnDataType: "text", columnNote: "事件发生地点" },
        { value: "情绪", valueIsOnly: false, columnDataType: "text", columnNote: "角色情绪" }
      ],
      rows: 2,
      note: "记录重要事件的历史",
      initPrompt: "请仔细分析以下对话内容，初始化重要事件历史表格。表格已有标题行，你需要添加内容行，记录对话中发生的重要事件。日期格式：YYYY-MM-DD HH:MM，地点格式同'时空表格'。请以标准markdown表格形式返回完整表格，包括标题行和所有内容行。",
      insertPrompt: "请分析聊天内容，提取重要事件信息，添加新行到表格中。",
      deletePrompt: "请删除表格中不再相关的事件行。",
      updatePrompt: "请根据聊天内容更新重要事件历史表格。添加新发生的重要事件，使用'/'分隔多个情绪描述。如果事件过多，可以合并相似的事件。"
    });
    
    // 创建重要物品表模板
    const itemTemplate = await TemplateManager.createTemplate({
      name: "物品表格",
      type: "dynamic",
      columns: [
        { value: "拥有人", valueIsOnly: false, columnDataType: "text", columnNote: "物品拥有者" },
        { value: "物品描述", valueIsOnly: false, columnDataType: "text", columnNote: "物品外观和特征描述" },
        { value: "物品名", valueIsOnly: true, columnDataType: "text", columnNote: "物品的名称" },
        { value: "重要原因", valueIsOnly: false, columnDataType: "text", columnNote: "物品重要性的原因" }
      ],
      rows: 2,
      note: "记录重要物品信息",
      initPrompt: "请仔细分析以下对话内容，初始化重要物品表格。表格已有标题行，你需要添加内容行，记录对话中提到的重要物品。未知信息填写'未知'。请返回完整的markdown表格，确保格式正确，包含标题行和所有内容行。",
      insertPrompt: "请分析聊天内容，提取重要物品信息，添加新行到表格中。",
      deletePrompt: "请删除表格中不再相关的物品行。",
      updatePrompt: "请根据聊天内容更新重要物品表格。添加新出现的重要物品，或更新现有物品的信息。"
    });
    
    // 创建任务表模板
    const taskTemplate = await TemplateManager.createTemplate({
      name: "任务表格",
      type: "dynamic",
      columns: [
        { value: "角色", valueIsOnly: false, columnDataType: "text", columnNote: "任务相关角色" },
        { value: "任务", valueIsOnly: true, columnDataType: "text", columnNote: "任务、命令或约定内容" },
        { value: "地点", valueIsOnly: false, columnDataType: "text", columnNote: "任务地点" },
        { value: "持续时间", valueIsOnly: false, columnDataType: "text", columnNote: "任务的持续时间或期限" }
      ],
      rows: 2,
      note: "记录任务、命令或约定信息",
      initPrompt: "请仔细分析以下对话内容，初始化任务表格。表格已有标题行，你需要添加内容行，记录对话中提到的任务、命令或约定。未知信息填写'未知'。请以markdown表格形式返回完整表格，标题行和表格分隔符必须保留。",
      insertPrompt: "请分析聊天内容，提取任务、命令或约定信息，添加新行到表格中。",
      deletePrompt: "请删除表格中已完成或不再相关的任务行。",
      updatePrompt: "请根据聊天内容更新任务表格。添加新的任务、命令或约定，或更新现有任务的状态。"
    });
    
    // 设置默认选择模板
    await TemplateManager.updateSettings({
      selectedTemplates: [
        characterTemplate.uid,
        socialTemplate.uid,
        timeSpaceTemplate.uid,
        eventTemplate.uid,
        itemTemplate.uid,
        taskTemplate.uid
      ]
    });
    
    console.log('[TableMemory] 默认模板创建完成');
  } catch (error) {
    console.error('[TableMemory] 创建默认模板失败:', error);
  }
}

/**
 * 设置插件启用状态
 * @param value 是否启用
 */
export function setEnabled(value: boolean): void {
  enabled = value;
  console.log(`[TableMemory] 插件${value ? '已启用' : '已禁用'}`);
}

/**
 * 获取插件启用状态
 * @returns 是否启用
 */
export function isEnabled(): boolean {
  return initialized && enabled;
}

/**
 * 重置文件系统存储 - 清空缓存和队列
 * @returns 是否成功重置
 */
export async function resetDatabaseConnection(): Promise<boolean> {
  try {
    // 重置文件系统存储
    return await StorageService.resetDatabase();
  } catch (error) {
    console.error('[TableMemory] 重置文件系统存储失败:', error);
    return false;
  }
}

/**
 * 检查文件系统操作队列状态
 */
export async function checkDatabaseLock(): Promise<{
  isLocked: boolean;
  queueLength: number;
  isProcessingQueue: boolean;
}> {
  try {
    // 改为调用StorageService的方法
    return await StorageService.checkDatabaseLock();
  } catch (error) {
    console.error('[TableMemory] 检查文件系统状态失败:', error);
    return {
      isLocked: false,
      queueLength: 0,
      isProcessingQueue: false
    };
  }
}

/**
 * 切换是否使用队列系统 (新增)
 * @param useQueue 是否使用队列
 */
export function setUseQueueSystem(useQueue: boolean): void {
  try {
    FileSystemStorage.setUseQueueSystem(useQueue);
  } catch (error) {
    console.error('[TableMemory] 设置队列系统失败:', error);
  }
}

/**
 * 获取表格文本表示
 * 兼容性导出，方便集成层使用
 */
export { toText };

// 导出模型
export type { Sheet, SheetTemplate, Cell };

// 导出API
export { API };

// 导出API中的主要方法，方便直接调用
export const {
  processChat,
  getSelectedTemplates,
  getAllTemplates,
  createSheetsFromTemplates,
  getCharacterSheets,
  getSheetByName,
  insertRow,
  updateRow,
  deleteRow,
  init,
  selectTemplates,
  getSelectedTemplateIds,
  rebuildSheet,
  deleteSheet,
  getSheet,
  getCharacterTablesData
} = API;

// 导出默认对象
export default {
  initialize,
  isEnabled,
  setEnabled,
  resetDatabaseConnection,
  checkDatabaseLock,
  setUseQueueSystem // 新增
};
