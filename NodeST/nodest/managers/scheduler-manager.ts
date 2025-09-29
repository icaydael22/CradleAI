import AsyncStorage from '@react-native-async-storage/async-storage';
import { PromptBuilderService, DEntry, RFrameworkEntry } from '../services/prompt-builder-service';
import { GeminiAdapter } from '../utils/gemini-adapter';

// 定义一个任务接口
interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

export class SchedulerManager {
  private geminiAdapter: GeminiAdapter | null = null;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.geminiAdapter = new GeminiAdapter(apiKey);
    }
  }
  
  private async saveJson(key: string, data: any): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`保存数据失败，键名: ${key}:`, error);
      throw error;
    }
  }

  private async loadJson<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`加载数据失败，键名: ${key}:`, error);
      return null;
    }
  }
  
  // 处理日程管理相关查询
  async processSchedulerQuery(userQuery: string, userId: string, apiKey?: string): Promise<string> {
    try {
      console.log(`【日程管理】处理用户查询: ${userQuery}`);
      
      // 1. 加载用户任务
      const userTasks = await this.loadJson<Task[]>(`scheduler_${userId}_tasks`) || [];
      
      // 2. 构建R框架
      const rFramework: RFrameworkEntry[] = [
        // 基本介绍
        PromptBuilderService.createRFrameworkEntry({
          name: "Scheduler Description",
          content: "你是一个专业的日程管理助手，可以帮助用户管理任务、安排日程，并提供时间管理建议。",
          identifier: "schedulerDescription"
        }),
        // 功能说明
        PromptBuilderService.createRFrameworkEntry({
          name: "Scheduler Features",
          content: `你可以执行以下操作：
1. 创建新任务 (格式: 添加任务: [标题] - [描述] - [截止日期] - [优先级])
2. 完成任务 (格式: 完成任务: [任务ID或标题])
3. 列出所有任务或按条件筛选
4. 提供时间管理建议
请分析用户意图并执行适当的操作。`,
          identifier: "schedulerFeatures"
        }),
        // 聊天历史容器
        PromptBuilderService.createChatHistoryContainer("schedulerHistory")
      ];
      
      // 3. 构建D类条目
      const dEntries: DEntry[] = [];
      
      // 任务列表作为D类条目，使其始终可见
      if (userTasks.length > 0) {
        const pendingTasks = userTasks.filter(task => !task.completed);
        const tasksText = pendingTasks.map(task => 
          `- ID: ${task.id}\n  标题: ${task.title}\n  描述: ${task.description}\n  截止日期: ${task.dueDate}\n  优先级: ${task.priority}`
        ).join('\n\n');
        
        dEntries.push(PromptBuilderService.createDEntry({
          name: "Pending Tasks",
          content: `【待处理任务】\n${tasksText}`,
          depth: 1, // 在用户消息之前立即插入
          constant: true
        }));
      }
      
      // 添加今日日期信息作为D类条目
      const today = new Date().toLocaleDateString();
      dEntries.push(PromptBuilderService.createDEntry({
        name: "Current Date",
        content: `【当前日期】\n今天是 ${today}`,
        depth: 1,
        constant: true
      }));
      
      // 4. 使用PromptBuilderService构建最终请求
      const messages = PromptBuilderService.buildPrompt({
        rFramework,
        dEntries,
        userMessage: userQuery
      });
      
      // 5. 转换为文本格式
      const prompt = PromptBuilderService.messagesToText(messages);
      
      // 6. 发送请求获取响应
      if (!this.geminiAdapter && apiKey) {
        this.geminiAdapter = new GeminiAdapter(apiKey);
      }
      
      if (!this.geminiAdapter) {
        throw new Error("API adapter not initialized");
      }
      
      // 发送到Gemini API并获取响应
      const message = { role: "user", parts: [{ text: prompt }] };
      const response = await this.geminiAdapter.generateContent([message]);
      
      // 7. 解析响应以检测任务操作
      await this.processResponseForTaskOperations(response, userTasks, userId);
      
      return response;
    } catch (error) {
      console.error('【日程管理】处理查询失败:', error);
      return "抱歉，处理您的请求时出现问题。请稍后再试。";
    }
  }
  
  // 处理响应中可能包含的任务操作
  private async processResponseForTaskOperations(
    response: string, 
    currentTasks: Task[], 
    userId: string
  ): Promise<void> {
    // 简单的规则解析示例 - 实际应用中可能需要更复杂的解析
    // 检测添加任务
    const addTaskMatch = response.match(/添加任务: (.+?) - (.+?) - (.+?) - (低|中|高)/);
    if (addTaskMatch) {
      const [, title, description, dueDate, priority] = addTaskMatch;
      
      const newTask: Task = {
        id: `task_${Date.now()}`,
        title,
        description,
        dueDate,
        priority: priority === '低' ? 'low' : priority === '中' ? 'medium' : 'high',
        completed: false
      };
      
      currentTasks.push(newTask);
      await this.saveJson(`scheduler_${userId}_tasks`, currentTasks);
      console.log(`【日程管理】添加了新任务: ${title}`);
    }
    
    // 检测完成任务
    const completeTaskMatch = response.match(/完成任务: (.+)/);
    if (completeTaskMatch) {
      const taskIdentifier = completeTaskMatch[1];
      
      // 查找匹配的任务（通过ID或标题）
      const taskIndex = currentTasks.findIndex(
        task => task.id === taskIdentifier || task.title === taskIdentifier
      );
      
      if (taskIndex !== -1) {
        currentTasks[taskIndex].completed = true;
        await this.saveJson(`scheduler_${userId}_tasks`, currentTasks);
        console.log(`【日程管理】标记任务完成: ${currentTasks[taskIndex].title}`);
      }
    }
  }
}
