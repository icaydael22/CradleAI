/**
 * ToDoList 点号路径支持的 Node.js 测试脚本
 * 这是一个简化的测试，模拟 VariableManager 的核心功能
 */

// 模拟 VariableManager 的核心功能
class MockVariableManager {
  constructor() {
    this.global = { variables: {}, tables: {}, hiddenVariables: {} };
    this.xmlTagConfig = { setVar: 'setVar' };
  }

  // 获取 ToDoList 默认模板
  getToDoListDefaultSchema() {
    return {
      chapterList: [],
      currentChapter: [],
      currentToDoList: [],
      completed: [],
      in_progress: [],
      pending: []
    };
  }

  // 解析点号路径并设置嵌套值
  setValueByDottedPath(obj, path, value) {
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
            if (typeof current[part] === 'object') {
              const arr = [];
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
            const obj = {};
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
        error: `设置路径 ${path} 失败: ${error.message}` 
      };
    }
  }

  // 简化的命令解析
  async parseCommands(commandStr) {
    const logs = [];
    let cleanText = commandStr;
    
    // 解析 setVar 命令 - 支持双引号和单引号
    const doubleQuoteRegex = /<setVar\s+name="([^"]+)"\s+value="([^"]*(?:\\.[^"]*)*)"/g;
    const singleQuoteRegex = /<setVar\s+name="([^"]+)"\s+value='([^']*(?:\\.[^']*)*)'/g;
    
    // 先处理双引号，再处理单引号
    const commands = [];
    
    let match;
    while ((match = doubleQuoteRegex.exec(commandStr))) {
      commands.push({
        name: match[1],
        value: match[2].replace(/\\"/g, '"')
      });
    }
    
    while ((match = singleQuoteRegex.exec(commandStr))) {
      commands.push({
        name: match[1],
        value: match[2].replace(/\\'/g, "'")
      });
    }
    
    for (const cmd of commands) {
      const { name, value } = cmd;
      
      console.log(`解析命令: name="${name}", value="${value}"`);
      
      if (name.includes('.')) {
        const pathParts = name.split('.');
        const rootVarName = pathParts[0];
        
        // 检查根变量是否存在
        if (!this.global.variables[rootVarName]) {
          let defaultValue = {};
          
          // 如果是 ToDoList，使用默认模板
          if (rootVarName === 'ToDoList') {
            defaultValue = this.getToDoListDefaultSchema();
          }
          
          // 自动注册根变量
          this.global.variables[rootVarName] = {
            type: 'object',
            value: defaultValue,
            isConditional: false
          };
          
          logs.push(`✅ 自动注册根变量: ${rootVarName} (类型: object)`);
        }
        
        const rootVariable = this.global.variables[rootVarName];
        
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
          logs.push(`🔄 点号路径设置: ${name} -> ${value}`);
        } else {
          logs.push(`❌ 点号路径设置失败: ${name} - ${setResult.error}`);
        }
      } else {
        // 普通变量设置
        if (!this.global.variables[name]) {
          this.global.variables[name] = {
            type: 'string',
            value: value,
            isConditional: false
          };
          logs.push(`✅ 注册变量: ${name} = ${value}`);
        } else {
          this.global.variables[name].value = value;
          logs.push(`🔄 更新变量: ${name} = ${value}`);
        }
      }
    }
    
    return { cleanText, logs, changed: logs.length > 0 };
  }

  // 简化的宏替换
  replaceMacros(str) {
    return str.replace(/\$\{([^}]+)\}/g, (match, macro) => {
      if (macro.includes('.')) {
        const parts = macro.split('.');
        const rootVarName = parts[0];
        
        if (this.global.variables[rootVarName]) {
          let current = this.global.variables[rootVarName].value;
          
          // 遍历路径
          for (let i = 1; i < parts.length; i++) {
            if (current === null || current === undefined) {
              return '';
            }
            
            const part = parts[i];
            
            if (Array.isArray(current)) {
              const idx = parseInt(part, 10);
              if (!isNaN(idx) && idx >= 0 && idx < current.length) {
                current = current[idx];
              } else {
                return '';
              }
            } else if (typeof current === 'object') {
              current = current[part];
            } else {
              return '';
            }
          }
          
          return current !== undefined ? current : '';
        }
      } else {
        // 简单变量
        if (this.global.variables[macro]) {
          return this.global.variables[macro].value;
        }
      }
      
      return '';
    });
  }

  getGlobalSystem() {
    return this.global;
  }
}

// 测试函数
async function runTests() {
  console.log('🧪 开始 ToDoList 点号路径测试...\n');
  
  const vm = new MockVariableManager();
  
  try {
    // 测试 1: ToDoList 自动注册
    console.log('📝 测试 1: ToDoList 自动注册...');
    
    await vm.parseCommands('<setVar name="ToDoList.chapterList.0" value="第一章：初遇">设置第一章</setVar>');
    
    const global = vm.getGlobalSystem();
    const todoList = global.variables['ToDoList'];
    
    if (!todoList) {
      throw new Error('ToDoList 未被自动注册');
    }
    
    if (todoList.type !== 'object') {
      throw new Error(`ToDoList 类型错误，期望 'object'，实际 '${todoList.type}'`);
    }
    
    const value = todoList.value;
    const expectedFields = ['chapterList', 'currentChapter', 'currentToDoList', 'completed', 'in_progress', 'pending'];
    
    for (const field of expectedFields) {
      if (!(field in value)) {
        throw new Error(`ToDoList 缺少字段: ${field}`);
      }
    }
    
    if (!Array.isArray(value.chapterList) || value.chapterList[0] !== '第一章：初遇') {
      throw new Error('第一章设置失败');
    }
    
    console.log('✅ ToDoList 自动注册测试通过');
    console.log('   - 已注册 ToDoList 变量');
    console.log('   - 包含所有必需字段');
    console.log('   - 第一章设置成功');
    console.log(`   - 当前值: ${JSON.stringify(value, null, 2)}\n`);

    // 测试 2: 点号路径设置
    console.log('📝 测试 2: 点号路径设置...');
    
    await vm.parseCommands(`
      <setVar name="ToDoList.chapterList.1" value="第二章：调查">设置第二章</setVar>
      <setVar name="ToDoList.currentChapter" value="第一章：初遇">设置当前章节</setVar>
      <setVar name="ToDoList.in_progress.0" value="meet_hero">设置进行中任务</setVar>
    `);
    
    const todoListUpdated = global.variables['ToDoList'].value;
    
    if (todoListUpdated.chapterList[1] !== '第二章：调查') {
      throw new Error('第二章设置失败');
    }
    
    if (todoListUpdated.currentChapter !== '第一章：初遇') {
      throw new Error('当前章节设置失败');
    }
    
    if (todoListUpdated.in_progress[0] !== 'meet_hero') {
      throw new Error('进行中任务设置失败');
    }
    
    console.log('✅ 点号路径设置测试通过');
    console.log('   - 数组索引路径正常工作');
    console.log('   - 对象键路径正常工作');
    console.log(`   - 当前值: ${JSON.stringify(todoListUpdated, null, 2)}\n`);

    // 测试 3: 宏解析
    console.log('📝 测试 3: 宏解析...');
    
    const chapter1 = vm.replaceMacros('${ToDoList.chapterList.0}');
    const chapter2 = vm.replaceMacros('${ToDoList.chapterList.1}');
    const currentChapter = vm.replaceMacros('${ToDoList.currentChapter}');
    const inProgressTask = vm.replaceMacros('${ToDoList.in_progress.0}');
    
    if (chapter1 !== '第一章：初遇') {
      throw new Error(`第一章宏解析失败，期望 '第一章：初遇'，实际 '${chapter1}'`);
    }
    
    if (chapter2 !== '第二章：调查') {
      throw new Error(`第二章宏解析失败，期望 '第二章：调查'，实际 '${chapter2}'`);
    }
    
    if (currentChapter !== '第一章：初遇') {
      throw new Error(`当前章节宏解析失败，期望 '第一章：初遇'，实际 '${currentChapter}'`);
    }
    
    if (inProgressTask !== 'meet_hero') {
      throw new Error(`进行中任务宏解析失败，期望 'meet_hero'，实际 '${inProgressTask}'`);
    }
    
    console.log('✅ 宏解析测试通过');
    console.log(`   - \${ToDoList.chapterList.0} = "${chapter1}"`);
    console.log(`   - \${ToDoList.chapterList.1} = "${chapter2}"`);
    console.log(`   - \${ToDoList.currentChapter} = "${currentChapter}"`);
    console.log(`   - \${ToDoList.in_progress.0} = "${inProgressTask}"\n`);

    // 测试 4: 复杂嵌套操作
    console.log('📝 测试 4: 复杂嵌套操作...');
    
    const result1 = await vm.parseCommands(
      '<setVar name="ToDoList.currentToDoList.0" value=\'{"id":"task1","title":"寻找英雄","status":"in_progress"}\'>设置任务对象</setVar>\n' +
      '<setVar name="ToDoList.currentToDoList.1" value=\'{"id":"task2","title":"收集线索","status":"pending"}\'>设置第二个任务</setVar>'
    );
    
    console.log('第一步结果:', result1.logs);
    
    const result2 = await vm.parseCommands(
      '<setVar name="ToDoList.currentToDoList.0.status" value="completed">更新任务状态</setVar>\n' +
      '<setVar name="ToDoList.currentToDoList.1.title" value="深入调查">更新任务标题</setVar>'
    );
    
    console.log('第二步结果:', result2.logs);
    
    const finalTodoList = global.variables['ToDoList'].value;
    console.log('最终状态:', JSON.stringify(finalTodoList.currentToDoList, null, 2));
    
    if (!finalTodoList.currentToDoList[0] || finalTodoList.currentToDoList[0].id !== 'task1') {
      throw new Error('第一个任务对象设置失败');
    }
    
    if (finalTodoList.currentToDoList[0].status !== 'completed') {
      throw new Error('任务状态更新失败');
    }
    
    if (finalTodoList.currentToDoList[1].title !== '深入调查') {
      throw new Error('任务标题更新失败');
    }
    
    const task1Id = vm.replaceMacros('${ToDoList.currentToDoList.0.id}');
    const task1Status = vm.replaceMacros('${ToDoList.currentToDoList.0.status}');
    const task2Title = vm.replaceMacros('${ToDoList.currentToDoList.1.title}');
    
    if (task1Id !== 'task1' || task1Status !== 'completed' || task2Title !== '深入调查') {
      throw new Error(`嵌套宏解析失败: task1Id="${task1Id}", task1Status="${task1Status}", task2Title="${task2Title}"`);
    }
    
    console.log('✅ 复杂嵌套操作测试通过');
    console.log('   - JSON 对象设置成功');
    console.log('   - 嵌套属性修改成功');
    console.log('   - 嵌套宏解析正常');
    console.log(`   - 当前 currentToDoList: ${JSON.stringify(finalTodoList.currentToDoList, null, 2)}\n`);

    console.log('🎉 所有测试通过！ToDoList 点号路径功能正常工作。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
runTests();