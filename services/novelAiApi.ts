import axios from 'axios';

interface GenerationOptions {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  sampler?: string;
  steps?: number;
  scale?: number;
  seed?: number;
  resolution?: string;
}

interface GenerationResult {
  success: boolean;
  task_id?: string;
  image_url?: string;
  error?: string;
  message?: string;
}

interface TaskStatusResult {
  task_id: string;
  status: string;
  done: boolean;
  success?: boolean;
  image_url?: string;
  error?: string;
}

export class NovelAIApiClient {
  private apiUrl: string;
  
  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }
  
  async generateImage(params: {
    auth_type: 'token' | 'login';
    token?: string;
    email?: string;
    password?: string;
    prompt: string;
    negative_prompt?: string;
    model?: string;
    sampler?: string;
    steps?: number;
    scale?: number;
    resolution?: string;
    seed?: number;
  }): Promise<GenerationResult> {
    try {
      const response = await axios.post(`${this.apiUrl}/generate`, params, {
        timeout: 90000 // 增加到90秒
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          success: false,
          error: `请求失败 (${error.response.status}): ${error.response.data?.error || error.message}`
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送生成请求失败'
      };
    }
  }
  
  async checkTaskStatus(taskId: string): Promise<TaskStatusResult> {
    try {
      const response = await axios.get(`${this.apiUrl}/task_status/${taskId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          task_id: taskId,
          status: 'error',
          done: true,
          success: false,
          error: `请求失败 (${error.response.status}): ${error.response.data?.error || error.message}`
        };
      }
      return {
        task_id: taskId,
        status: 'error',
        done: true,
        success: false,
        error: error instanceof Error ? error.message : '查询任务状态失败'
      };
    }
  }
}

// 创建默认的实例
const defaultApiUrl = 'https://your-api-server.com';
export const novelAiApi = new NovelAIApiClient(defaultApiUrl);
