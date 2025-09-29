// 变量系统核心实现
// 提供变量、表格、隐变量的管理与操作

import * as FileSystem from 'expo-file-system';
import { VariableSystem, Variable, TableColumn, VariableType, VariableSystemConfig, ConditionBranch,XMLTagConfig } from '../variable-types';
import { FileOperationLockManager } from './FileOperationLockManager';
import { DynamicMacroResolver } from '../DynamicMacroResolver';

export class VariableManager {
  public global: VariableSystem;
  public characters: Record<string, VariableSystem>;
  public xmlTagConfig: XMLTagConfig;
  private fileSystemPath: string;
  private scriptId?: string;
  private lockManager: FileOperationLockManager;

  constructor(xmlTagConfig?: XMLTagConfig, scriptId?: string) {
    this.global = { variables: {}, tables: {}, hiddenVariables: {} };
    this.characters = {};
    this.lockManager = FileOperationLockManager.getInstance();
    this.xmlTagConfig = xmlTagConfig || {
      setVar: 'setVar',
      registerVar: 'registerVar',
      registerVars: 'registerVars',
      unregisterVar: 'unregisterVar',
      unregisterVars: 'unregisterVars',
      registerTable: 'registerTable',
      unregisterTable: 'unregisterTable',
      registerHiddenVar: 'registerHiddenVar',
      unregisterHiddenVar: 'unregisterHiddenVar',
      setTable: 'setTable',
      addTableRow: 'addTableRow',
      removeTableRow: 'removeTableRow',
      setHiddenVar: 'setHiddenVar',
    };
    this.fileSystemPath = FileSystem.documentDirectory + 'variables/';
    this.scriptId = scriptId;
    this.initFileSystem();
  }

  // ==================== 存档快照支持 ====================
  /**
   * 导出当前变量系统（全局+角色）的快照，用于剧本存档。
   * 注意：不包含临时运行态，只序列化必要字段。
   */
  exportSnapshots(): { global: VariableSystem; characters: Record<string, VariableSystem> } {
    // 深拷贝以避免引用共享
    const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
    return {
      global: deepClone(this.global),
      characters: deepClone(this.characters)
    };
  }

  /**
   * 载入存档快照，覆盖当前变量系统。
   * 载入后自动持久化到文件。
   */
  async loadSnapshots(snapshot: { global: VariableSystem; characters: Record<string, VariableSystem> }): Promise<void> {
    if (!snapshot) return;
    try {
      this.global = snapshot.global || { variables: {}, tables: {}, hiddenVariables: {} };
      this.characters = snapshot.characters || {};
      // 持久化全局
      await this.saveGlobalToFile();
      // 持久化每个角色
      for (const characterId of Object.keys(this.characters)) {
        await this.saveCharacterToFile(characterId);
      }
      console.log('[VariableManager] ✅ 变量快照已载入');
    } catch (e) {
      console.error('[VariableManager] ❌ 载入变量快照失败:', e);
    }
  }

  // 初始化文件系统
  private async initFileSystem() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.fileSystemPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.fileSystemPath, { intermediates: true });
      }
    } catch (error) {
      console.error('Failed to initialize file system:', error);
    }
  }

  // 保存全局变量到文件
  private async saveGlobalToFile() {
    const lockKey = 'global_variables';
    await this.lockManager.acquire(lockKey, async () => {
      try {
        const filePath = this.fileSystemPath + 'global.json';
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(this.global, null, 2));
        console.log('🔒 [Lock] Global variables saved successfully');
      } catch (error) {
        console.error('Failed to save global variables:', error);
        throw error;
      }
    });
  }

  // 保存角色变量到文件
  private async saveCharacterToFile(characterId: string) {
    const lockKey = `character_variables_${characterId}`;
    await this.lockManager.acquire(lockKey, async () => {
      try {
        const filePath = this.fileSystemPath + `character_${characterId}.json`;
        const characterData = this.characters[characterId];
        if (characterData) {
          await FileSystem.writeAsStringAsync(filePath, JSON.stringify(characterData, null, 2));
          console.log(`🔒 [Lock] Character ${characterId} variables saved successfully`);
        }
      } catch (error) {
        console.error(`Failed to save character ${characterId} variables:`, error);
        throw error;
      }
    });
  }

  // 从文件加载全局变量
  private async loadGlobalFromFile(): Promise<VariableSystem | null> {
    try {
      const filePath = this.fileSystemPath + 'global.json';
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load global variables:', error);
    }
    return null;
  }

  // 从文件加载角色变量
  private async loadCharacterFromFile(characterId: string): Promise<VariableSystem | null> {
    try {
      const filePath = this.fileSystemPath + `character_${characterId}.json`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Failed to load character ${characterId} variables:`, error);
    }
    return null;
  }

  // 初始化角色变量系统（API接口1）
  async initCharacter(characterId: string, configJson?: string | VariableSystemConfig): Promise<boolean> {
    try {
      let config: VariableSystemConfig = {};

      // 如果提供了配置对象或JSON字符串，解析它
      if (configJson) {
        if (typeof configJson === 'string') {
          config = JSON.parse(configJson);
        } else {
          config = configJson;
        }
      } else {
        // 尝试从文件加载
        const loadedData = await this.loadCharacterFromFile(characterId);
        if (loadedData) {
          this.characters[characterId] = loadedData;
          return true;
        }
      }

      this.characters[characterId] = {
        variables: config.variables || {},
        tables: config.tables || {},
        hiddenVariables: config.hiddenVariables || {},
      };

      // 保存到文件
      await this.saveCharacterToFile(characterId);
      return true;
    } catch (error) {
      console.error(`Failed to initialize character ${characterId}:`, error);
      return false;
    }
  }

  // 初始化全局变量系统（API接口2）
  async initGlobal(configJson?: string | VariableSystemConfig): Promise<boolean> {
    try {
      let config: VariableSystemConfig = {};

      // 如果提供了配置对象或JSON字符串，解析它
      if (configJson) {
        if (typeof configJson === 'string') {
          config = JSON.parse(configJson);
        } else {
          config = configJson;
        }
      } else {
        // 尝试从文件加载
        const loadedData = await this.loadGlobalFromFile();
        if (loadedData) {
          this.global = loadedData;
          return true;
        }
      }

      this.global = {
        variables: config.variables || {},
        tables: config.tables || {},
        hiddenVariables: config.hiddenVariables || {},
      };

      // 保存到文件
      await this.saveGlobalToFile();
      return true;
    } catch (error) {
      console.error('Failed to initialize global variables:', error);
      return false;
    }
  }

  // ==================== 11个API接口方法 ====================

  // 获取角色变量系统（API接口3）
  async getCharacterVariables(characterId: string): Promise<VariableSystem | null> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      return this.characters[characterId] || null;
    } catch (error) {
      console.error(`Failed to get character ${characterId} variables:`, error);
      return null;
    }
  }

  // 获取全局变量系统（API接口4）
  async getGlobalVariables(): Promise<VariableSystem> {
    try {
      if (!this.global.variables && !this.global.tables && !this.global.hiddenVariables) {
        await this.initGlobal();
      }
      return this.global;
    } catch (error) {
      console.error('Failed to get global variables:', error);
      return { variables: {}, tables: {}, hiddenVariables: {} };
    }
  }

  // 解析角色命令（API接口5）
  async parseCharacterCommands(characterId: string, commandStr: string): Promise<string> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      const result = await this.parseCommands(commandStr, characterId);
      return result.cleanText;
    } catch (error) {
      console.error(`Failed to parse character ${characterId} commands:`, error);
      return commandStr;
    }
  }

  // 解析角色命令（增强版本，返回日志）
  async parseCharacterCommandsWithLogs(characterId: string, commandStr: string): Promise<{ cleanText: string, logs: string[] }> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      const result = await this.parseCommands(commandStr, characterId);
      return { cleanText: result.cleanText, logs: result.logs };
    } catch (error) {
      console.error(`Failed to parse character ${characterId} commands:`, error);
      return { cleanText: commandStr, logs: [] };
    }
  }

  // 替换角色宏（API接口6）
  async replaceCharacterMacros(characterId: string, text: string): Promise<string> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      // 使用async版本以支持动态宏解析
      return await this.replaceMacrosAsync(text, characterId);
    } catch (error) {
      console.error(`Failed to replace character ${characterId} macros:`, error);
      return text;
    }
  }

  // 替换全局宏（API接口7）
  async replaceGlobalMacros(text: string): Promise<string> {
    try {
      // 使用async版本以支持动态宏解析
      return await this.replaceMacrosAsync(text);
    } catch (error) {
      console.error('Failed to replace global macros:', error);
      return text;
    }
  }

  // 注册角色变量（API接口8）
  async registerCharacterVariables(characterId: string, registerCommands: string): Promise<boolean> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      const result = await this.parseRegisterCommands(registerCommands, characterId);
      if (result.errors && result.errors.length > 0) {
        console.error(`Failed to register some character ${characterId} variables:`, result.errors);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Failed to register character ${characterId} variables:`, error);
      return false;
    }
  }

  // 注销角色变量（API接口9）
  async unregisterCharacterVariables(characterId: string, unregisterCommands: string): Promise<boolean> {
    try {
      if (!this.characters[characterId]) {
        await this.initCharacter(characterId);
      }
      this.parseUnregisterCommands(unregisterCommands, characterId);
      await this.saveCharacterToFile(characterId);
      return true;
    } catch (error) {
      console.error(`Failed to unregister character ${characterId} variables:`, error);
      return false;
    }
  }

  // 注册全局变量（API接口10）
  async registerGlobalVariables(registerCommands: string): Promise<boolean> {
    try {
      const result = await this.parseRegisterCommands(registerCommands);
      if (result.errors && result.errors.length > 0) {
        console.error('Failed to register some global variables:', result.errors);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Failed to register global variables:', error);
      return false;
    }
  }

  // 注销全局变量（API接口11）
  async unregisterGlobalVariables(unregisterCommands: string): Promise<boolean> {
    try {
      this.parseUnregisterCommands(unregisterCommands);
      await this.saveGlobalToFile();
      return true;
    } catch (error) {
      console.error('Failed to unregister global variables:', error);
      return false;
    }
  }

  // 获取角色变量系统
  getCharacterSystem(characterId: string): VariableSystem | undefined {
    return this.characters[characterId];
  }

  // 获取全局变量系统
  getGlobalSystem(): VariableSystem {
    return this.global;
  }


  // 宏替换（支持嵌套）
  replaceMacros(str: string, characterId?: string): string {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return str;
    
    let result = str;
    let depth = 0;
    const maxDepth = 10;
    
    // 多层嵌套解析，从内到外
    while (depth < maxDepth) {
      const macroRegex = /\$\{([^{}]+)\}/g;
      let hasReplacement = false;
      let newResult = result;
      
      let match;
      while ((match = macroRegex.exec(result))) {
        const macro = match[1];
        let value = this.resolveMacro(macro, sys);
        if (value !== undefined && value !== null) {
          // 安全的值序列化：对象/数组使用 JSON.stringify，其他使用 String()
          let stringValue: string;
          if (typeof value === 'object' && value !== null) {
            try {
              stringValue = JSON.stringify(value);
            } catch (error) {
              // JSON 序列化失败时的安全回退（例如循环引用）
              console.warn(`[VariableManager] JSON.stringify failed for macro ${macro}:`, error);
              stringValue = String(value);
            }
          } else {
            stringValue = String(value);
          }
          newResult = newResult.replace(match[0], stringValue);
          hasReplacement = true;
        }
      }
      
      if (!hasReplacement) break;
      result = newResult;
      depth++;
    }
    
    return result;
  }

  // 异步宏替换（支持动态宏）
  async replaceMacrosAsync(str: string, characterId?: string): Promise<string> {
    // 先进行同步宏替换
    let result = this.replaceMacros(str, characterId);
    
    // 然后处理动态宏
    result = await DynamicMacroResolver.resolveDynamicMacros(result);
    
    return result;
  }

  // 解析单个宏
  public resolveMacro(macro: string, sys: VariableSystem): any {
    // 先处理嵌套宏：如果macro内还包含${...}，先解析内层
    if (macro.includes('${')) {
      macro = this.replaceMacros('${' + macro + '}', sys === this.global ? undefined : this.getCharacterIdFromSystem(sys))
        .slice(2, -1); // 移除外层的${}
    }
    
    // 支持 tableName.columnName 或 tableName.columnName.rowIndex 或嵌套对象路径
    if (macro.includes('.')) {
      const parts = macro.split('.');
      
      // 首先检查是否是表格语法
      if (parts.length === 2) {
        const [tableName, columnName] = parts;
        if (sys.tables[tableName]) {
          // 默认取第一行
          return sys.tables[tableName].rows[0]?.[columnName];
        }
      } else if (parts.length === 3) {
        const [tableName, columnName, rowIndex] = parts;
        if (sys.tables[tableName]) {
          const parsed = parseInt(rowIndex, 10);
          const idx = !isNaN(parsed)
            ? parsed
            : (sys.variables[rowIndex] ? Number(sys.variables[rowIndex].value) : 0);
          return sys.tables[tableName].rows[idx]?.[columnName];
        }
      }
      
      // 如果不是表格语法，尝试作为嵌套对象路径解析
      const rootVarName = parts[0];
      if (sys.variables[rootVarName]) {
        const rootVariable = sys.variables[rootVarName];
        let current = rootVariable.value;
        
        // 遍历路径
        for (let i = 1; i < parts.length; i++) {
          if (current === null || current === undefined) {
            return '';
          }
          
          const part = parts[i];
          
          if (Array.isArray(current)) {
            // 当前是数组
            const idx = parseInt(part, 10);
            if (!isNaN(idx) && idx >= 0 && idx < current.length) {
              current = current[idx];
            } else {
              return '';
            }
          } else if (typeof current === 'object') {
            // 当前是对象
            current = current[part];
          } else {
            return '';
          }
        }
        
        return current !== undefined ? current : '';
      }
    }
    
    // 隐变量（支持期限检查）
    if (sys.hiddenVariables[macro]) {
      const hiddenVar = sys.hiddenVariables[macro];
      
      // 检查是否已过期
      if (hiddenVar.hasExpiration && hiddenVar.isExpired) {
        return '';
      }
      
      // 检查条件
      if (this.checkCondition(hiddenVar.condition, sys)) {
        const value = hiddenVar.value;
        
        // 如果有期限，标记为已过期并异步保存
        if (hiddenVar.hasExpiration && !hiddenVar.isExpired) {
          hiddenVar.isExpired = true;
          this.saveSystemAsync(sys);
        }
        
        return value;
      }
      return '';
    }
    
    // 动态宏处理（支持参数化：name:id:count） —— 即使未注册也解析
    if (this.isDynamicMacro(macro)) {
      return this.resolveDynamicMacro(macro, sys);
    }

    // 普通变量（支持条件变量）
    if (sys.variables[macro]) {
      const variable = sys.variables[macro];
      
      // 条件变量处理
      if (variable.isConditional && variable.branches) {
        return this.evaluateConditionalVariable(variable, sys);
      }
      
      // 普通变量
      return variable.value;
    }
    
    return '';
  }

  // 辅助方法：从系统对象获取characterId
  public getCharacterIdFromSystem(sys: VariableSystem): string | undefined {
    for (const [id, charSys] of Object.entries(this.characters)) {
      if (charSys === sys) return id;
    }
    return undefined;
  }

  // 条件表达式实现
  public checkCondition(expr: string, sys: VariableSystem): boolean {
    try {
      // 替换变量名为对应的值
      let cond = expr.replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, (varName) => {
        if (sys.variables[varName]) {
          const value = sys.variables[varName].value;
          return typeof value === 'string' ? `"${value}"` : String(value);
        }
        return varName;
      });
      
      // 替换逻辑操作符
      cond = cond.replace(/\sand\s/g, ' && ').replace(/\sor\s/g, ' || ');
      
      // 安全的表达式求值
      return new Function('return ' + cond)();
    } catch {
      return false;
    }
  }

  // 识别并执行xml标签命令（增强版本，返回日志）
  async parseCommands(str: string, characterId?: string): Promise<{ cleanText: string, logs: string[], changed: boolean, errors?: string[] }> {
    const lockKey = characterId ? `parse_commands_${characterId}` : 'parse_commands_global';
    
    // 使用锁确保同一角色/全局的解析操作不会并发，并等待锁释放
    return await this.lockManager.acquire(lockKey, async () => {
      const sys = characterId ? this.characters[characterId] : this.global;
      if (!sys) return { cleanText: str, logs: [], changed: false, errors: ['系统未找到'] };

      let result = str;
      const logs: string[] = [];
      const errors: string[] = [];
      let hasChanges = false;

      try {
        // 解析 setVar 命令
        const setVarResult = this.parseSetVarCommands(result, sys);
        result = setVarResult.cleanText;
        logs.push(...setVarResult.logs);
        if (setVarResult.logs.length > 0) hasChanges = true;
        
        // 解析 setTable 命令
        const setTableResult = this.parseSetTableRowCommands(result, sys);
        result = setTableResult.cleanText;
        logs.push(...setTableResult.logs);
        if (setTableResult.logs.length > 0) hasChanges = true;
        
        // 解析 addTableRow 命令
        const addTableResult = this.parseAddTableRowCommands(result, sys);
        result = addTableResult.cleanText;
        logs.push(...addTableResult.logs);
        if (addTableResult.logs.length > 0) hasChanges = true;
        
        // 解析 removeTableRow 命令
        const removeTableResult = this.parseRemoveTableRowCommands(result, sys);
        result = removeTableResult.cleanText;
        logs.push(...removeTableResult.logs);
        if (removeTableResult.logs.length > 0) hasChanges = true;
        
        // 解析 setHiddenVar 命令
        const setHiddenResult = this.parseSetHiddenVarCommands(result, sys);
        result = setHiddenResult.cleanText;
        logs.push(...setHiddenResult.logs);
        if (setHiddenResult.logs.length > 0) hasChanges = true;

        // 如果有变更，则等待持久化完成
        if (hasChanges) {
          if (characterId) {
            await this.saveCharacterToFile(characterId);
          } else {
            await this.saveGlobalToFile();
          }
        }

        return { cleanText: result, logs, changed: hasChanges, errors: errors.length > 0 ? errors : undefined };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        errors.push(`解析命令时发生错误: ${errorMsg}`);
        return { cleanText: str, logs, changed: false, errors };
      }
    });
  }

  // HTML实体解码辅助函数
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'); // &amp; 必须最后处理
  }

  // 解析 setVar 命令（支持属性格式和内容格式）
  public parseSetVarCommands(str: string, sys: VariableSystem): { cleanText: string, logs: string[] } {
    const tagName = this.xmlTagConfig.setVar;
    const logs: string[] = [];
    
    // 先解码HTML实体
    const decodedStr = this.decodeHtmlEntities(str);
    
    // 1. 处理属性格式：<setVar name="..." value="...">...</setVar>
    const attributeRegex = new RegExp(`<${tagName}\\s+name="([^"]+)"\\s+value="([^"]*)"[^>]*>(.*?)</${tagName}>`, 'g');
    let cleanText = decodedStr.replace(attributeRegex, (match, name, value, content) => {
      if (!name) {
        logs.push(`⚠️ 忽略无效的变量名: ${name}`);
        return ''; // 移除XML标签
      }

      // 检查是否为点号路径
      if (name.includes('.')) {
        const pathParts = name.split('.');
        const rootVarName = pathParts[0];
        
        // 检查根变量是否存在
        if (!sys.variables[rootVarName]) {
          // 根变量不存在，需要自动注册
          const characterId = this.getCharacterIdFromSystem(sys);
          let defaultValue: any = {};
          
          // 如果是 ToDoList，使用默认模板
          if (rootVarName === 'ToDoList') {
            defaultValue = this.getToDoListDefaultSchema();
          }
          
          // 自动注册根变量
          const autoRegResult = this.autoRegisterVariable(rootVarName, JSON.stringify(defaultValue), sys, characterId);
          
          if (!autoRegResult.success) {
            logs.push(`❌ 自动注册根变量失败: ${rootVarName} - ${autoRegResult.error || '未知错误'}`);
            return '';
          }
          
          logs.push(`✅ 自动注册根变量: ${rootVarName} (类型: object, 使用默认模板)`);
        }
        
        const rootVariable = sys.variables[rootVarName];
        if (!rootVariable || (rootVariable.type !== 'object' && rootVariable.type !== 'array')) {
          logs.push(`❌ 变量 ${rootVarName} 不是对象或数组类型，无法使用点号路径`);
          return '';
        }
        
        // 确保根变量的值是对象
        if (typeof rootVariable.value !== 'object' || rootVariable.value === null) {
          if (rootVarName === 'ToDoList') {
            rootVariable.value = this.getToDoListDefaultSchema();
          } else {
            rootVariable.value = {};
          }
        }
        
        // 构建相对路径（去掉根变量名）
        const relativePath = pathParts.slice(1).join('.');
        
        // 使用点号路径设置值
        const setResult = this.setValueByDottedPath(rootVariable.value, relativePath, value);
        
        if (setResult.success) {
          logs.push(`🔄 点号路径设置: ${name} -> ${value} (属性格式)`);
        } else {
          logs.push(`❌ 点号路径设置失败: ${name} - ${setResult.error}`);
        }
        
        return ''; // 移除XML标签
      }

      // 原有的非点号路径处理逻辑
      if (sys.variables[name]) {
        // 变量已存在，更新值
        const variable = sys.variables[name];
        const oldValue = variable.value;
        try {
          variable.value = this.parseValue(value, variable.type);
          logs.push(`🔄 变量 ${name}: ${oldValue} -> ${variable.value} (属性格式)`);
        } catch (error) {
          logs.push(`❌ 变量 ${name} 值解析失败: ${value} (${error})`);
        }
      } else {
        // 变量不存在，自动注册
        const characterId = this.getCharacterIdFromSystem(sys);
        const autoRegResult = this.autoRegisterVariable(name, value, sys, characterId);
        
        if (autoRegResult.success) {
          logs.push(`✅ 自动注册变量: ${name} (类型: ${autoRegResult.type}, 值: ${value}) (属性格式)`);
        } else {
          logs.push(`❌ 自动注册变量失败: ${name} - ${autoRegResult.error || '未知错误'}`);
        }
      }
      return ''; // 移除XML标签
    });

    // 2. 处理内容格式：<setVar>name = value; ...</setVar> （兼容原有格式）
    const contentRegex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'g');
    cleanText = cleanText.replace(contentRegex, (match, content) => {
      const assignments = content.split(';').map((s: string) => s.trim()).filter(Boolean);
      for (const assignment of assignments) {
        // 支持形式：name = value, name+=value, name-=value, name++, name--
        let m;
        // ++/-- （无 RHS）
        if ((m = assignment.match(/^([a-zA-Z_][\w]*)\s*(\+\+|--)$/))) {
          const name = m[1];
          const op = m[2];
          if (!name) {
            logs.push(`⚠️ 忽略无效的变量名: ${assignment}`);
            continue;
          }

          if (sys.variables[name]) {
            const variable = sys.variables[name];
            if (variable.type === 'number') {
              const oldValue = Number(variable.value);
              const newValue = op === '++' ? oldValue + 1 : oldValue - 1;
              variable.value = newValue;
              logs.push(`🔄 变量 ${name}: ${oldValue} -> ${newValue} (${op})`);
            } else {
              logs.push(`⚠️ 忽略非数字变量的${op}操作: ${name} (类型: ${variable.type})`);
            }
          } else {
            // 变量不存在，自动注册为数字类型（默认值0，然后执行操作）
            const characterId = this.getCharacterIdFromSystem(sys);
            const autoRegResult = this.autoRegisterVariable(name, '0', sys, characterId);
            
            if (autoRegResult.success && sys.variables[name]) {
              const variable = sys.variables[name] as Variable;
              if (variable.type === 'number') {
                const oldValue = Number(variable.value);
                const newValue = op === '++' ? oldValue + 1 : oldValue - 1;
                variable.value = newValue;
                logs.push(`✅ 自动注册变量: ${name} (类型: number, 初始值: 0)`);
                logs.push(`🔄 变量 ${name}: ${oldValue} -> ${newValue} (${op})`);
              } else {
                logs.push(`❌ 自动注册变量后类型错误: ${name}`);
              }
            } else {
              logs.push(`❌ 自动注册变量失败: ${name} - ${autoRegResult.error || '未知错误'}`);
            }
          }
          continue;
        }

        // 带操作符的赋值（=, +=, -=）
        if ((m = assignment.match(/^([a-zA-Z_][\w]*)\s*(\+=|-=|=)\s*(.*)$/))) {
          const name = m[1];
          const op = m[2];
          const rawValue = m[3].trim();

          if (!name) {
            logs.push(`⚠️ 忽略无效的变量名: ${assignment}`);
            continue;
          }

          if (!sys.variables[name]) {
            // 变量不存在，自动注册
            const characterId = this.getCharacterIdFromSystem(sys);
            const autoRegResult = this.autoRegisterVariable(name, rawValue, sys, characterId);
            
            if (autoRegResult.success) {
              logs.push(`✅ 自动注册变量: ${name} (类型: ${autoRegResult.type}, 值: ${rawValue}) (内容格式)`);
              // 如果是 = 操作，已经设置了值，跳过后续操作
              if (op === '=') {
                continue;
              }
              // 对于 += 和 -= 操作，需要继续处理
            } else {
              logs.push(`❌ 自动注册变量失败: ${name} - ${autoRegResult.error || '未知错误'}`);
              continue;
            }
          }

          const variable = sys.variables[name] as Variable;
          const varType = variable.type;
          // 解析右值为目标类型（对于 +=/-=，rhs 也尝试解析为变量类型）
          let parsedRhs: any;
          try {
            parsedRhs = this.parseValue(rawValue, varType);
          } catch (error) {
            logs.push(`❌ 变量 ${name} 值解析失败: ${rawValue} (${error})`);
            continue;
          }

          if (op === '=') {
            const oldValue = variable.value;
            variable.value = parsedRhs;
            logs.push(`🔄 变量 ${name}: ${oldValue} -> ${variable.value} (内容格式)`);
          } else if ((op === '+=' || op === '-=') && varType === 'number') {
            const delta = Number(parsedRhs);
            const oldValue = Number(variable.value);
            const newValue = op === '+=' ? oldValue + delta : oldValue - delta;
            variable.value = newValue;
            logs.push(`🔄 变量 ${name}: ${oldValue} -> ${newValue} (${op})`);
          } else if ((op === '+=' || op === '-=') && varType === 'string') {
            // 对字符串执行拼接或（不常用的）移除后缀（这里仅实现拼接）
            const oldValue = String(variable.value);
            const newValue = op === '+=' ? oldValue + String(parsedRhs) : oldValue;
            variable.value = newValue;
            logs.push(`🔄 变量 ${name}: ${oldValue} -> ${newValue} (${op})`);
          } else {
            // 不支持的组合，忽略
            logs.push(`⚠️ 忽略不支持的赋值操作: ${assignment} (变量类型: ${varType}, 操作符: ${op})`);
          }
        } else {
          logs.push(`⚠️ 忽略无法解析的赋值: ${assignment}`);
        }
      }
      return ''; // 移除XML标签
    });

    return { cleanText, logs };
  }

  // 解析 setTable 命令
  public parseSetTableRowCommands(str: string, sys: VariableSystem): { cleanText: string, logs: string[] } {
    const tagName = this.xmlTagConfig.setTable;
    const regex = new RegExp(`<${tagName}\\s+table="([^"]+)"\\s+row="([^"]+)">(.*?)</${tagName}>`, 'g');
    const logs: string[] = [];
    
    const cleanText = str.replace(regex, (match, tableName, rowIndex, content) => {
      if (sys.tables[tableName]) {
        const idx = parseInt(rowIndex);
        if (idx >= 0 && idx < sys.tables[tableName].rows.length) {
          const assignments = content.split(';').filter(Boolean);
          for (const assignment of assignments) {
            const [colName, value] = assignment.split('=').map((s: string) => s.trim());
            if (colName && value !== undefined) {
              const column = sys.tables[tableName].columns.find(c => c.name === colName);
              if (column) {
                const oldValue = sys.tables[tableName].rows[idx][colName];
                const newValue = this.parseValue(value, column.type);
                sys.tables[tableName].rows[idx][colName] = newValue;
                logs.push(`📊 表格 ${tableName}[${idx}].${colName}: ${oldValue} -> ${newValue}`);
              }
            }
          }
        }
      }
      return '';
    });
    
    return { cleanText, logs };
  }

  // 解析 addTableRow 命令
  public parseAddTableRowCommands(str: string, sys: VariableSystem): { cleanText: string, logs: string[] } {
    const tagName = this.xmlTagConfig.addTableRow;
    const regex = new RegExp(`<${tagName}\\s+table="([^"]+)">(.*?)</${tagName}>`, 'g');
    const logs: string[] = [];
    
    const cleanText = str.replace(regex, (match, tableName, content) => {
      if (sys.tables[tableName]) {
        const newRow: Record<string, any> = {};
        const assignments = content.split(';').filter(Boolean);
        
        for (const assignment of assignments) {
          const [colName, value] = assignment.split('=').map((s: string) => s.trim());
          if (colName && value !== undefined) {
            const column = sys.tables[tableName].columns.find(c => c.name === colName);
            if (column) {
              newRow[colName] = this.parseValue(value, column.type);
            }
          }
        }
        
        // 检查必填字段
        const allRequiredFilled = sys.tables[tableName].columns
          .filter(c => c.required)
          .every(c => newRow[c.name] !== undefined);
          
        if (allRequiredFilled) {
          const newIndex = sys.tables[tableName].rows.length;
          sys.tables[tableName].rows.push(newRow);
          logs.push(`➕ 表格 ${tableName} 添加新行[${newIndex}]: ${JSON.stringify(newRow)}`);
        } else {
          logs.push(`❌ 表格 ${tableName} 添加行失败: 缺少必填字段`);
        }
      }
      return '';
    });
    
    return { cleanText, logs };
  }

  // 解析 removeTableRow 命令
  public parseRemoveTableRowCommands(str: string, sys: VariableSystem): { cleanText: string, logs: string[] } {
    const tagName = this.xmlTagConfig.removeTableRow;
    const regex = new RegExp(`<${tagName}\\s+table="([^"]+)"\\s+row="([^"]+)"></${tagName}>`, 'g');
    const logs: string[] = [];
    
    const cleanText = str.replace(regex, (match, tableName, rowIndex) => {
      if (sys.tables[tableName]) {
        const idx = parseInt(rowIndex);
        if (idx >= 0 && idx < sys.tables[tableName].rows.length) {
          const removedRow = sys.tables[tableName].rows[idx];
          sys.tables[tableName].rows.splice(idx, 1);
          logs.push(`➖ 表格 ${tableName} 删除行[${idx}]: ${JSON.stringify(removedRow)}`);
        } else {
          logs.push(`❌ 表格 ${tableName} 删除行失败: 索引 ${idx} 无效`);
        }
      }
      return '';
    });
    
    return { cleanText, logs };
  }

  // 解析 setHiddenVar 命令（支持期限参数）
  public parseSetHiddenVarCommands(str: string, sys: VariableSystem): { cleanText: string, logs: string[] } {
    const tagName = this.xmlTagConfig.setHiddenVar;
    const regex = new RegExp(`<${tagName}\\s+name="([^"]+)"\\s+condition="([^"]+)"(?:\\s+hasExpiration="(true|false)")?>(.*?)</${tagName}>`, 'g');
    const logs: string[] = [];
    
    const cleanText = str.replace(regex, (match, name, condition, hasExpiration, value) => {
      const hasExp = hasExpiration === 'true';
      const oldValue = sys.hiddenVariables[name]?.value;
      sys.hiddenVariables[name] = {
        condition: condition,
        value: value.trim(),
        hasExpiration: hasExp,
        isExpired: false
      };
      
      if (oldValue !== undefined) {
        logs.push(`🔒 隐变量 ${name}: ${oldValue} -> ${value.trim()} (条件: ${condition})`);
      } else {
        logs.push(`🔒 隐变量 ${name}: 新建 = ${value.trim()} (条件: ${condition})`);
      }
      
      return '';
    });
    
    return { cleanText, logs };
  }

  // 注册变量（支持条件变量）
  async registerVar(name: string, type: VariableType, initVal: any, characterId?: string, conditionalBranches?: ConditionBranch[]) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    
    const variable: Variable = { 
      type, 
      value: initVal,
      isConditional: !!conditionalBranches,
      branches: conditionalBranches
    };
    
    sys.variables[name] = variable;
    
    // 自动生成宏信息记录到控制台
    console.log(`📝 已注册变量宏: \${${name}} ${conditionalBranches ? '(条件变量)' : ''}`);
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 注销变量
  async unregisterVar(name: string, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    delete sys.variables[name];
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 注册表格
  async registerTable(name: string, columns: TableColumn[], characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    
    sys.tables[name] = {
      name,
      columns,
      rows: []
    };
    
    // 自动生成宏信息记录到控制台
    console.log(`📊 已注册表格宏: \${${name}.columnName} 或 \${${name}.columnName.rowIndex}`);
    columns.forEach(col => {
      console.log(`   - 列: \${${name}.${col.name}}`);
    });
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 注销表格
  async unregisterTable(name: string, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    delete sys.tables[name];
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 注册隐变量（支持期限）
  async registerHiddenVar(name: string, condition: string, value: any, characterId?: string, hasExpiration?: boolean) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    
    sys.hiddenVariables[name] = {
      condition,
      value,
      hasExpiration: hasExpiration || false,
      isExpired: false
    };
    
    // 自动生成宏信息记录到控制台
    console.log(`🔒 已注册隐变量宏: \${${name}} ${hasExpiration ? '(有期限)' : '(无期限)'}`);
    console.log(`   - 条件: ${condition}`);
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 注销隐变量
  async unregisterHiddenVar(name: string, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return;
    delete sys.hiddenVariables[name];
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 设置表格数据
  async setTableCell(tableName: string, rowIndex: number, columnName: string, value: any, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.tables[tableName]) return;
    
    const table = sys.tables[tableName];
    if (rowIndex >= 0 && rowIndex < table.rows.length) {
      const column = table.columns.find(c => c.name === columnName);
      if (column) {
        table.rows[rowIndex][columnName] = this.parseValue(String(value), column.type);
        
        // 保存到文件
        if (characterId) {
          await this.saveCharacterToFile(characterId);
        } else {
          await this.saveGlobalToFile();
        }
      }
    }
  }

  // 添加表格行
  async addTableRow(tableName: string, rowData: Record<string, any>, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.tables[tableName]) return;
    
    const table = sys.tables[tableName];
    const newRow: Record<string, any> = {};
    
    // 验证并转换数据类型
    for (const column of table.columns) {
      if (column.required && rowData[column.name] === undefined) {
        throw new Error(`Required column '${column.name}' is missing`);
      }
      
      if (rowData[column.name] !== undefined) {
        newRow[column.name] = this.parseValue(String(rowData[column.name]), column.type);
      }
    }
    
    table.rows.push(newRow);
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 删除表格行
  async removeTableRow(tableName: string, rowIndex: number, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.tables[tableName]) return;
    
    const table = sys.tables[tableName];
    if (rowIndex >= 0 && rowIndex < table.rows.length) {
      table.rows.splice(rowIndex, 1);
      
      // 保存到文件
      if (characterId) {
        await this.saveCharacterToFile(characterId);
      } else {
        await this.saveGlobalToFile();
      }
    }
  }

  // 设置变量值
  async setVariableValue(name: string, value: any, characterId?: string) {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.variables[name]) return;
    
    sys.variables[name].value = this.parseValue(String(value), sys.variables[name].type);
    
    // 保存到文件
    if (characterId) {
      await this.saveCharacterToFile(characterId);
    } else {
      await this.saveGlobalToFile();
    }
  }

  // 获取表格数据
  getTableData(tableName: string, characterId?: string): any[] {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.tables[tableName]) return [];
    
    return sys.tables[tableName].rows;
  }

  // 获取变量值
  getVariableValue(name: string, characterId?: string): any {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return undefined;
    
    return sys.variables[name]?.value;
  }

  // 获取隐变量值（如果条件满足）
  getHiddenVariableValue(name: string, characterId?: string): any {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys || !sys.hiddenVariables[name]) return undefined;
    
    const hiddenVar = sys.hiddenVariables[name];
    if (this.checkCondition(hiddenVar.condition, sys)) {
      return hiddenVar.value;
    }
    
    return undefined;
  }

  // 更新XML标签配置
  updateXmlTagConfig(config: Partial<XMLTagConfig>) {
    this.xmlTagConfig = { ...this.xmlTagConfig, ...config };
  }

  // 解析值类型
  public parseValue(val: string, type: VariableType): any {
    if (type === 'number') return Number(val);
    if (type === 'boolean') return val === 'true';
    if (type === 'object' || type === 'array') {
      try {
        return JSON.parse(val);
      } catch {
        return type === 'object' ? {} : [];
      }
    }
    return val;
  }

  // 获取 ToDoList 默认模板
  private getToDoListDefaultSchema(): object {
    return {
      chapterList: [],
      currentChapter: "",  // 修复：应该是空字符串，不是空数组
      currentToDoList: [],
      completed: [],
      in_progress: [],
      pending: []
    };
  }

  // 解析点号路径并设置嵌套值
  private setValueByDottedPath(obj: any, path: string, value: any): { success: boolean, error?: string } {
    try {
      const pathParts = path.split('.');
      let current = obj;
      
      // 遍历路径，除了最后一个部分
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        const nextPart = pathParts[i + 1];
        
        // 如果当前部分不存在，需要创建
        if (current[part] === undefined || current[part] === null) {
          // 判断下一个部分是数字索引还是字符串键来决定创建数组还是对象
          if (/^\d+$/.test(nextPart)) {
            current[part] = [];
          } else {
            current[part] = {};
          }
        }
        
        // 确保当前部分是正确的类型
        if (/^\d+$/.test(nextPart)) {
          // 下一部分是数字，当前应该是数组
          if (!Array.isArray(current[part])) {
            // 尝试转换为数组
            if (typeof current[part] === 'object') {
              const arr: any[] = [];
              Object.keys(current[part]).forEach(key => {
                const idx = parseInt(key);
                if (!isNaN(idx)) {
                  arr[idx] = current[part][key];
                }
              });
              current[part] = arr;
            } else {
              current[part] = [];
            }
          }
        } else {
          // 下一部分是字符串，当前应该是对象
          if (Array.isArray(current[part])) {
            // 将数组转换为对象
            const obj: any = {};
            current[part].forEach((item, idx) => {
              obj[idx.toString()] = item;
            });
            current[part] = obj;
          } else if (typeof current[part] !== 'object') {
            current[part] = {};
          }
        }
        
        current = current[part];
      }
      
      // 设置最终值
      const finalKey = pathParts[pathParts.length - 1];
      
      // 尝试解析 value 为合适的类型
      let parsedValue = value;
      try {
        // 如果 value 看起来像 JSON，尝试解析
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          parsedValue = JSON.parse(value);
        }
      } catch {
        // 解析失败，保持原始字符串
      }
      
      if (/^\d+$/.test(finalKey)) {
        // 数字索引，确保是数组
        if (!Array.isArray(current)) {
          return { success: false, error: `路径 ${path} 中的容器不是数组` };
        }
        const idx = parseInt(finalKey);
        current[idx] = parsedValue;
      } else {
        // 字符串键
        current[finalKey] = parsedValue;
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: `设置路径 ${path} 失败: ${error instanceof Error ? error.message : '未知错误'}` 
      };
    }
  }

  // 从值推断变量类型
  private inferVariableType(value: string): 'string' | 'number' | 'boolean' {
    // 去除首尾空白
    const trimmedValue = value.trim();
    
    // 检查布尔值
    if (trimmedValue.toLowerCase() === 'true' || trimmedValue.toLowerCase() === 'false') {
      return 'boolean';
    }
    
    // 检查数字（整数或浮点数）
    if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
      return 'number';
    }
    
    // 默认为字符串
    return 'string';
  }

  // 自动注册缺失的变量（同步版本，用于 parseSetVarCommands）
  private autoRegisterVariable(name: string, value: string, sys: VariableSystem, characterId?: string): { success: boolean, type: string, error?: string } {
    try {
      let inferredType: VariableType;
      let parsedValue: any;
      
      // 特殊处理 ToDoList
      if (name === 'ToDoList') {
        inferredType = 'object';
        console.log(`🔧 [DEBUG] autoRegisterVariable - ToDoList 特殊处理`);
        console.log(`🔧 [DEBUG] 输入 value: "${value}"`);
        console.log(`🔧 [DEBUG] value 长度: ${value.length}`);
        
        // 如果值为空字符串，使用默认模板
        if (value === '' || value === '""') {
          console.log(`🔧 [DEBUG] 使用默认模板（值为空）`);
          parsedValue = this.getToDoListDefaultSchema();
        } else {
          try {
            console.log(`🔧 [DEBUG] 尝试 JSON 解析...`);
            parsedValue = JSON.parse(value);
            console.log(`🔧 [DEBUG] JSON 解析成功，解析结果:`, JSON.stringify(parsedValue));
            
            // 只有当解析出的对象缺少必需字段时，才用默认值补充
            const defaultSchema = this.getToDoListDefaultSchema();
            console.log(`🔧 [DEBUG] 默认模板:`, JSON.stringify(defaultSchema));
            
            // 使用 AI 提供的值为主，默认值为辅
            const beforeMerge = { ...parsedValue };
            parsedValue = { ...defaultSchema, ...parsedValue };
            
            console.log(`🔧 [DEBUG] 合并前:`, JSON.stringify(beforeMerge));
            console.log(`🔧 [DEBUG] 合并后:`, JSON.stringify(parsedValue));
          } catch (error) {
            // JSON 解析失败，使用默认模板
            console.warn(`🔧 [DEBUG] ToDoList JSON 解析失败，使用默认模板. 原始值: ${value}`);
            console.warn(`🔧 [DEBUG] 解析错误:`, error);
            parsedValue = this.getToDoListDefaultSchema();
          }
        }
      } else {
        // 常规类型推断
        inferredType = this.inferVariableType(value);
        parsedValue = this.parseValue(value, inferredType);
      }
      
      // 创建变量对象
      const variable = { 
        type: inferredType, 
        value: parsedValue,
        isConditional: false
      };
      
      // 注册到系统
      sys.variables[name] = variable;
      
      // 记录日志
      console.log(`📝 自动注册变量宏: \${${name}} (类型: ${inferredType}, 初始值: ${JSON.stringify(parsedValue)})`);
      
      // 异步保存（不阻塞当前操作）
      setTimeout(async () => {
        try {
          if (characterId) {
            await this.saveCharacterToFile(characterId);
          } else {
            await this.saveGlobalToFile();
          }
        } catch (error) {
          console.error(`❌ 自动注册变量 ${name} 后保存失败:`, error);
        }
      }, 0);
      
      return { success: true, type: inferredType };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      return { success: false, type: 'string', error: errorMsg };
    }
  }

  // 解析注册命令
  async parseRegisterCommands(str: string, characterId?: string): Promise<{ cleanText: string, logs: string[], changed: boolean, errors?: string[] }> {
    const lockKey = characterId ? `register_commands_${characterId}` : 'register_commands_global';
    
    // 使用锁确保同一角色/全局的注册操作不会并发，并等待锁释放
    return await this.lockManager.acquire(lockKey, async () => {
      const sys = characterId ? this.characters[characterId] : this.global;
      if (!sys) return { cleanText: str, logs: [], changed: false, errors: ['系统未找到'] };

      let result = str;
      let hasChanges = false;
      const logs: string[] = [];
      const errors: string[] = [];

      try {
        // 解析 registerVar 命令（支持条件变量）
        const registerVarRegex = new RegExp(`<${this.xmlTagConfig.registerVar}\\s+name="([^"]+)"\\s+type="([^"]+)"\\s+initVal="([^"]*)"(?:\\s+conditional="([^"]*)")?\\s*/>`, 'g');
        result = result.replace(registerVarRegex, (match, name, type, initVal, conditional) => {
          let branches: ConditionBranch[] | undefined;
          let isConditional = false;
          
          // 解析条件分支
          if (conditional) {
            try {
              branches = JSON.parse(conditional);
              isConditional = true;
            } catch (error) {
              const errorMsg = `Failed to parse conditional branches for variable ${name}: ${error instanceof Error ? error.message : '未知错误'}`;
              console.error(errorMsg);
              errors.push(errorMsg);
              return match; // 保留原始标签，不删除
            }
          }
          
          sys.variables[name] = {
            type: type as VariableType,
            value: this.parseValue(initVal, type as VariableType),
            isConditional,
            branches
          };
          
          const logMsg = `📝 已注册变量宏: \${${name}} ${isConditional ? '(条件变量)' : ''}`;
          console.log(logMsg);
          logs.push(logMsg);
          hasChanges = true;
          return '';
        });

        // 解析 registerVars 命令
        const registerVarsRegex = new RegExp(`<${this.xmlTagConfig.registerVars}>(.*?)</${this.xmlTagConfig.registerVars}>`, 'g');
        result = result.replace(registerVarsRegex, (match, content) => {
          const varRegex = /<var\s+name="([^"]+)"\s+type="([^"]+)"\s+initVal="([^"]*)"(?:\s+conditional="([^"]*)")?\s*\/>/g;
          let varMatch;
          while ((varMatch = varRegex.exec(content))) {
            const [, name, type, initVal, conditional] = varMatch;
            let branches: ConditionBranch[] | undefined;
            let isConditional = false;
            
            if (conditional) {
              try {
                branches = JSON.parse(conditional);
                isConditional = true;
              } catch (error) {
                const errorMsg = `Failed to parse conditional branches for variable ${name}: ${error instanceof Error ? error.message : '未知错误'}`;
                console.error(errorMsg);
                errors.push(errorMsg);
                continue; // 跳过这个变量
              }
            }
            
            sys.variables[name] = {
              type: type as VariableType,
              value: this.parseValue(initVal, type as VariableType),
              isConditional,
              branches
            };
            
            const logMsg = `📝 已注册变量宏: \${${name}} ${isConditional ? '(条件变量)' : ''}`;
            console.log(logMsg);
            logs.push(logMsg);
            hasChanges = true;
          }
          return '';
        });

        // 解析 registerHiddenVar 命令（支持期限）
        const registerHiddenVarRegex = new RegExp(`<${this.xmlTagConfig.registerHiddenVar}\\s+name="([^"]+)"\\s+condition="([^"]+)"(?:\\s+hasExpiration="(true|false)")?>(.*?)</${this.xmlTagConfig.registerHiddenVar}>`, 'g');
        result = result.replace(registerHiddenVarRegex, (match, name, condition, hasExpiration, value) => {
          const hasExp = hasExpiration === 'true';
          sys.hiddenVariables[name] = {
            condition,
            value: value.trim(),
            hasExpiration: hasExp,
            isExpired: false
          };
          
          const logMsg = `🔒 已注册隐变量宏: \${${name}} ${hasExp ? '(有期限)' : '(无期限)'}`;
          const conditionMsg = `   - 条件: ${condition}`;
          console.log(logMsg);
          console.log(conditionMsg);
          logs.push(logMsg);
          logs.push(conditionMsg);
          hasChanges = true;
          return '';
        });

        // 解析 registerTable 命令
        const registerTableRegex = new RegExp(`<${this.xmlTagConfig.registerTable}\\s+name="([^"]+)"\\s+columns='([^']+)'\\s*/>`, 'g');
        result = result.replace(registerTableRegex, (match, name, columnsJson) => {
          try {
            const columns: TableColumn[] = JSON.parse(columnsJson);
            sys.tables[name] = {
              name,
              columns,
              rows: []
            };
            
            const logMsg = `📊 已注册表格宏: \${${name}.columnName} 或 \${${name}.columnName.rowIndex}`;
            console.log(logMsg);
            logs.push(logMsg);
            columns.forEach(col => {
              const colMsg = `   - 列: \${${name}.${col.name}}`;
              console.log(colMsg);
              logs.push(colMsg);
            });
            hasChanges = true;
          } catch (error) {
            const errorMsg = `Failed to parse table columns for ${name}: ${error instanceof Error ? error.message : '未知错误'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
            return match; // 保留原始标签，不删除
          }
          return '';
        });

        // 如果有变更，则等待持久化完成
        if (hasChanges) {
          if (characterId) {
            await this.saveCharacterToFile(characterId);
          } else {
            await this.saveGlobalToFile();
          }
        }

        return { cleanText: result, logs, changed: hasChanges, errors: errors.length > 0 ? errors : undefined };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        errors.push(`解析注册命令时发生错误: ${errorMsg}`);
        return { cleanText: str, logs, changed: false, errors };
      }
    });
  }

  // 解析注销命令
  parseUnregisterCommands(str: string, characterId?: string): string {
    const sys = characterId ? this.characters[characterId] : this.global;
    if (!sys) return str;

    let result = str;

    // 解析 unregisterVar 命令
    const unregisterVarRegex = new RegExp(`<${this.xmlTagConfig.unregisterVar}\\s+name="([^"]+)"\\s*/>`, 'g');
    result = result.replace(unregisterVarRegex, (match, name) => {
      delete sys.variables[name];
      return '';
    });

    // 解析 unregisterVars 命令
    const unregisterVarsRegex = new RegExp(`<${this.xmlTagConfig.unregisterVars}>(.*?)</${this.xmlTagConfig.unregisterVars}>`, 'g');
    result = result.replace(unregisterVarsRegex, (match, content) => {
      const varRegex = /<var\s+name="([^"]+)"\s*\/>/g;
      let varMatch;
      while ((varMatch = varRegex.exec(content))) {
        const [, name] = varMatch;
        delete sys.variables[name];
      }
      return '';
    });

    // 解析 unregisterTable 命令
    const unregisterTableRegex = new RegExp(`<${this.xmlTagConfig.unregisterTable}\\s+name="([^"]+)"\\s*/>`, 'g');
    result = result.replace(unregisterTableRegex, (match, name) => {
      delete sys.tables[name];
      return '';
    });

    // 解析 unregisterHiddenVar 命令
    const unregisterHiddenVarRegex = new RegExp(`<${this.xmlTagConfig.unregisterHiddenVar}\\s+name="([^"]+)"\\s*/>`, 'g');
    result = result.replace(unregisterHiddenVarRegex, (match, name) => {
      delete sys.hiddenVariables[name];
      return '';
    });

    return result;
  }

  // 异步保存系统数据
  private async saveSystemAsync(sys: VariableSystem) {
    try {
      const characterId = this.getCharacterIdFromSystem(sys);
      if (characterId) {
        await this.saveCharacterToFile(characterId);
      } else if (sys === this.global) {
        await this.saveGlobalToFile();
      }
    } catch (error) {
      console.error('Failed to save system data:', error);
    }
  }

  // 评估条件变量
  private evaluateConditionalVariable(variable: Variable, sys: VariableSystem): any {
    if (!variable.branches || variable.branches.length === 0) {
      return variable.value; // 退回到默认值
    }

    // 遍历所有分支
    for (const branch of variable.branches) {
      // 如果没有条件，说明是else分支
      if (!branch.condition) {
        return branch.value;
      }
      
      // 检查条件是否满足
      if (this.checkCondition(branch.condition, sys)) {
        return branch.value;
      }
    }
    
    // 如果没有匹配的分支，返回默认值
    return variable.value;
  }

  // 检查是否为动态宏
  private isDynamicMacro(macro: string): boolean {
    const dynamicMacros = [
      'scriptHistoryRecent',
      'characterChatRecent'
    ];
    // 支持参数化形式：scriptHistoryRecent:scriptId(:count) / characterChatRecent:characterId(:count)
    const base = macro.split(':')[0];
    return dynamicMacros.includes(base);
  }

  // 解析动态宏
  private resolveDynamicMacro(macro: string, sys: VariableSystem): string {
    try {
      // 解析参数化动态宏：name[:id[:count]]
      const parts = macro.split(':');
      const name = parts[0];
      const idArg = parts[1];
      const countArg = parts[2];
      const count = countArg ? (isNaN(Number(countArg)) ? 10 : Number(countArg)) : 10;

      switch (name) {
        case 'scriptHistoryRecent': {
          // 如果提供了 scriptId 参数，则直接返回该 scriptId 的占位符
            if (idArg) {
              return `[DYNAMIC:scriptHistory:${idArg}:${count}]`;
            }
            return this.getScriptHistoryRecent(sys).replace(/:10]/, `:${count}]`); // 复用现有逻辑并替换数量
        }
        case 'characterChatRecent': {
          if (idArg) {
            return `[DYNAMIC:chatHistory:${idArg}:${count}]`;
          }
          return this.getCharacterChatRecent(sys).replace(/:10]/, `:${count}]`);
        }
        default:
          return '';
      }
    } catch (error) {
      console.error(`解析动态宏 ${macro} 失败:`, error);
      return '';
    }
  }

  // 获取最近剧本历史（同步方法，返回占位符或缓存内容）
  private getScriptHistoryRecent(sys: VariableSystem): string {
    // 对于动态内容，返回一个特殊标记，实际解析在使用时进行
    const characterId = this.getCharacterIdFromSystem(sys);
    if (characterId) {
      // 这是一个剧本ID（通过characterId传递）
      return `[DYNAMIC:scriptHistory:${characterId}:10]`;
    }

    // 如果 VariableManager 绑定了 scriptId，则返回带 scriptId 的动态占位符
    if (this.scriptId) {
      return `[DYNAMIC:scriptHistory:${this.scriptId}:10]`;
    }
    return '暂无剧本历史';
  }

  // 获取最近角色聊天（同步方法，返回占位符或缓存内容）
  private getCharacterChatRecent(sys: VariableSystem): string {
    // 对于动态内容，返回一个特殊标记，实际解析在使用时进行
    const characterId = this.getCharacterIdFromSystem(sys);
    if (characterId) {
      return `[DYNAMIC:chatHistory:${characterId}:10]`;
    }
    return '暂无聊天历史';
  }
}