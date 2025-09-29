/**
 * ToDoList 点号路径支持的测试
 */

import { VariableManager } from '../core/VariableManager';

export class ToDoListTest {
  private variableManager: VariableManager;

  constructor() {
    this.variableManager = new VariableManager();
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 开始 ToDoList 点号路径测试...\n');

    try {
      await this.testToDoListAutoRegistration();
      await this.testDottedPathSetting();
      await this.testMacroResolution();
      await this.testComplexNestedOperations();
      
      console.log('✅ 所有测试通过！');
    } catch (error) {
      console.error('❌ 测试失败:', error);
      throw error;
    }
  }

  // 测试 ToDoList 自动注册
  async testToDoListAutoRegistration(): Promise<void> {
    console.log('📝 测试 1: ToDoList 自动注册...');
    
    // 使用点号路径触发 ToDoList 自动注册
    const result = await this.variableManager.parseCommands(
      '<setVar name="ToDoList.chapterList.0" value="第一章：初遇">设置第一章</setVar>'
    );
    
    // 检查是否成功注册 ToDoList
    const global = this.variableManager.getGlobalSystem();
    const todoList = global.variables['ToDoList'];
    
    if (!todoList) {
      throw new Error('ToDoList 未被自动注册');
    }
    
    if (todoList.type !== 'object') {
      throw new Error(`ToDoList 类型错误，期望 'object'，实际 '${todoList.type}'`);
    }
    
    // 检查默认结构
    const value = todoList.value;
    const expectedFields = ['chapterList', 'currentChapter', 'currentToDoList', 'completed', 'in_progress', 'pending'];
    
    for (const field of expectedFields) {
      if (!(field in value)) {
        throw new Error(`ToDoList 缺少字段: ${field}`);
      }
    }
    
    // 检查第一章是否设置成功
    if (!Array.isArray(value.chapterList) || value.chapterList[0] !== '第一章：初遇') {
      throw new Error('第一章设置失败');
    }
    
    console.log('✅ ToDoList 自动注册测试通过');
    console.log('   - 已注册 ToDoList 变量');
    console.log('   - 包含所有必需字段');
    console.log('   - 第一章设置成功');
    console.log(`   - 当前值: ${JSON.stringify(value, null, 2)}\n`);
  }

  // 测试点号路径设置
  async testDottedPathSetting(): Promise<void> {
    console.log('📝 测试 2: 点号路径设置...');
    
    // 设置多个点号路径
    await this.variableManager.parseCommands(`
      <setVar name="ToDoList.chapterList.1" value="第二章：调查">设置第二章</setVar>
      <setVar name="ToDoList.currentChapter" value="第一章：初遇">设置当前章节</setVar>
      <setVar name="ToDoList.in_progress.0" value="meet_hero">设置进行中任务</setVar>
    `);
    
    const global = this.variableManager.getGlobalSystem();
    const todoList = global.variables['ToDoList'].value;
    
    // 验证设置结果
    if (todoList.chapterList[1] !== '第二章：调查') {
      throw new Error('第二章设置失败');
    }
    
    if (todoList.currentChapter !== '第一章：初遇') {
      throw new Error('当前章节设置失败');
    }
    
    if (todoList.in_progress[0] !== 'meet_hero') {
      throw new Error('进行中任务设置失败');
    }
    
    console.log('✅ 点号路径设置测试通过');
    console.log('   - 数组索引路径正常工作');
    console.log('   - 对象键路径正常工作');
    console.log(`   - 当前值: ${JSON.stringify(todoList, null, 2)}\n`);
  }

  // 测试宏解析
  async testMacroResolution(): Promise<void> {
    console.log('📝 测试 3: 宏解析...');
    
    // 测试点号路径宏
    const chapter1 = this.variableManager.replaceMacros('${ToDoList.chapterList.0}');
    const chapter2 = this.variableManager.replaceMacros('${ToDoList.chapterList.1}');
    const currentChapter = this.variableManager.replaceMacros('${ToDoList.currentChapter}');
    const inProgressTask = this.variableManager.replaceMacros('${ToDoList.in_progress.0}');
    
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
  }

  // 测试复杂嵌套操作
  async testComplexNestedOperations(): Promise<void> {
    console.log('📝 测试 4: 复杂嵌套操作...');
    
    // 设置复杂的嵌套对象
    await this.variableManager.parseCommands(`
      <setVar name="ToDoList.currentToDoList.0" value='{"id":"task1","title":"寻找英雄","status":"completed"}'>设置任务对象</setVar>
      <setVar name="ToDoList.currentToDoList.1" value='{"id":"task2","title":"收集线索","status":"in_progress"}'>设置第二个任务</setVar>
    `);
    
    // 修改嵌套对象的属性
    await this.variableManager.parseCommands(`
      <setVar name="ToDoList.currentToDoList.0.status" value="completed">更新任务状态</setVar>
      <setVar name="ToDoList.currentToDoList.1.title" value="深入调查">更新任务标题</setVar>
    `);
    
    const global = this.variableManager.getGlobalSystem();
    const todoList = global.variables['ToDoList'].value;
    
    // 验证嵌套对象设置
    if (!todoList.currentToDoList[0] || todoList.currentToDoList[0].id !== 'task1') {
      throw new Error('第一个任务对象设置失败');
    }
    
    if (todoList.currentToDoList[0].status !== 'completed') {
      throw new Error('任务状态更新失败');
    }
    
    if (todoList.currentToDoList[1].title !== '深入调查') {
      throw new Error('任务标题更新失败');
    }
    
    // 测试嵌套宏解析
    const task1Id = this.variableManager.replaceMacros('${ToDoList.currentToDoList.0.id}');
    const task1Status = this.variableManager.replaceMacros('${ToDoList.currentToDoList.0.status}');
    const task2Title = this.variableManager.replaceMacros('${ToDoList.currentToDoList.1.title}');
    
    if (task1Id !== 'task1' || task1Status !== 'completed' || task2Title !== '深入调查') {
      throw new Error('嵌套宏解析失败');
    }
    
    console.log('✅ 复杂嵌套操作测试通过');
    console.log('   - JSON 对象设置成功');
    console.log('   - 嵌套属性修改成功');
    console.log('   - 嵌套宏解析正常');
    console.log(`   - 当前 currentToDoList: ${JSON.stringify(todoList.currentToDoList, null, 2)}\n`);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  const test = new ToDoListTest();
  test.runAllTests().catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
}