import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { discordAuthService } from './discordAuthService';

class ApiService {
  private static instance: ApiService;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：自动添加认证头
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const authHeader = await discordAuthService.getAuthHeader();
          if (authHeader && config.headers) {
            Object.assign(config.headers, authHeader);
          }
        } catch (error) {
          console.warn('Failed to add auth header:', error);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器：处理认证错误
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          console.warn('Authentication failed, attempting token refresh...');
          
          try {
            // 尝试刷新token
            const newToken = await discordAuthService.refreshToken();              if (newToken && error.config && !error.config._retry) {
                error.config._retry = true;
                const authHeader = await discordAuthService.getAuthHeader();
                if (authHeader && error.config.headers) {
                  Object.assign(error.config.headers, authHeader);
                }
                return this.axiosInstance.request(error.config);
              }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            // Token刷新失败，清除本地认证数据
            await discordAuthService.logout();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * 通用GET请求
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.get(url, config);
    return response.data;
  }

  /**
   * 通用POST请求
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.post(url, data, config);
    return response.data;
  }

  /**
   * 通用PUT请求
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.put(url, data, config);
    return response.data;
  }

  /**
   * 通用DELETE请求
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axiosInstance.delete(url, config);
    return response.data;
  }

  /**
   * 检查用户是否有权限访问某个功能
   */
  async checkPermission(feature: string): Promise<boolean> {
    try {
      const user = await discordAuthService.getUser();
      if (!user) {
        return false;
      }

      // 这里可以根据用户的身份组来判断权限
      // 示例：检查用户是否有VIP角色
      const vipRoles = [
        'VIP_ROLE_ID_1',
        'VIP_ROLE_ID_2',
        // 添加更多VIP角色ID
      ];

      const hasVipRole = user.roles.some(roleId => vipRoles.includes(roleId));
      
      switch (feature) {
        case 'premium_api':
          return hasVipRole;
        case 'unlimited_requests':
          return hasVipRole;
        default:
          return true; // 默认允许
      }
    } catch (error) {
      console.error('Failed to check permission:', error);
      return false;
    }
  }

  /**
   * 获取用户的速率限制信息
   */
  async getRateLimitInfo(): Promise<{
    limit: number;
    remaining: number;
    resetTime: number;
  } | null> {
    try {
      const response = await this.get('/api/rate-limit/status');
      return response;
    } catch (error) {
      console.error('Failed to get rate limit info:', error);
      return null;
    }
  }

  /**
   * 示例：调用需要认证的API
   */
  async getProtectedData(): Promise<any> {
    try {
      return await this.get('/api/protected/data');
    } catch (error) {
      console.error('Failed to get protected data:', error);
      throw error;
    }
  }

  /**
   * 示例：上传文件到需要认证的API
   */
  async uploadFile(file: File | Blob, endpoint: string): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      return await this.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * 设置基础URL
   */
  setBaseURL(baseURL: string): void {
    this.axiosInstance.defaults.baseURL = baseURL;
  }

  /**
   * 获取axios实例（用于高级用法）
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

export const apiService = ApiService.getInstance();
export default apiService;
