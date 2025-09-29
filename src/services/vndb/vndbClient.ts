/**
 * VNDB API 客户端
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { 
  VNDBQueryParams, 
  VNDBCharacterResponse, 
  VNDBError, 
  VNDBCharacter,
  CharacterQueryOptions
} from './types';
import { VNDBLogger, defaultLogger } from './logger';

export class VNDBClient {
  private client: AxiosInstance;
  private logger: VNDBLogger;
  private apiToken: string;
  
  /**
   * 创建VNDB API客户端实例
   * @param logger 自定义日志记录器(可选)
   */
  constructor(logger?: VNDBLogger) {
    this.logger = logger || defaultLogger;
    this.apiToken = 'sino-ydi9x-qwye1-zk4e-beido-5ya9p-b7et'; // 使用文档提供的token
    
    // 创建Axios实例
    this.client = axios.create({
      baseURL: 'https://api.vndb.org/kana',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiToken}`
      },
      timeout: 10000 // 10秒超时
    });
    
    this.logger.info('VNDB API客户端已初始化');
    
    // 添加请求拦截器，记录请求信息
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`发送请求: ${config.method?.toUpperCase()} ${config.url}`, 
          config.data ? `请求数据: ${JSON.stringify(config.data)}` : '');
        return config;
      },
      (error) => {
        this.logger.error('请求发送失败', error);
        return Promise.reject(error);
      }
    );
    
    // 添加响应拦截器，记录响应信息
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`收到响应: ${response.status} ${response.statusText}`, 
          response.data ? `响应数据: ${JSON.stringify(response.data).slice(0, 200)}...` : '');
        return response;
      },
      (error: AxiosError) => {
        const status = error.response?.status;
        const data = error.response?.data;
        
        this.logger.error(`API请求失败: ${status}`, {
          url: error.config?.url,
          data: error.config?.data,
          response: data
        });
        
        // 将错误信息标准化
        const vndbError: VNDBError = {
          code: status || 500,
          message: this.getErrorMessage(status, data)
        };
        
        return Promise.reject(vndbError);
      }
    );
  }
  
  /**
   * 获取错误消息
   */
  private getErrorMessage(status?: number, data?: any): string {
    if (typeof data === 'string') return data;
    
    switch(status) {
      case 400: return '无效的请求格式或参数';
      case 401: return '认证失败，无效的令牌';
      case 404: return '请求的资源不存在';
      case 429: return '请求频率超过限制，请稍后再试';
      case 500: return 'VNDB服务器内部错误';
      case 502: return 'VNDB服务器暂时不可用';
      default: return '未知错误';
    }
  }
  
  /**
   * 验证身份认证信息
   */
  async verifyAuth(): Promise<boolean> {
    try {
      this.logger.info('正在验证VNDB API认证');
      const response = await this.client.get('/authinfo');
      this.logger.info('VNDB API认证验证成功');
      return true;
    } catch (error) {
      this.logger.error('VNDB API认证验证失败', error);
      return false;
    }
  }
  
  /**
   * 构建查询过滤器
   */
  private buildFilter(options: CharacterQueryOptions): any {
    const filters = [];
    
    // 处理各种过滤条件
    if (options.id) {
      filters.push(["id", "=", options.id]);
    }
    
    if (options.search) {
      filters.push(["search", "=", options.search]);
    }
    
    if (options.role) {
      filters.push(["role", "=", options.role]);
    }
    
    if (options.bloodType) {
      filters.push(["blood_type", "=", options.bloodType]);
    }
    
    if (options.sex) {
      filters.push(["sex", "=", options.sex]);
    }
    
    if (options.sexSpoil) {
      filters.push(["sex_spoil", "=", options.sexSpoil]);
    }
    
    if (options.height !== undefined) {
      filters.push(["height", "=", options.height]);
    }
    
    if (options.weight !== undefined) {
      filters.push(["weight", "=", options.weight]);
    }
    
    if (options.bust !== undefined) {
      filters.push(["bust", "=", options.bust]);
    }
    
    if (options.waist !== undefined) {
      filters.push(["waist", "=", options.waist]);
    }
    
    if (options.hips !== undefined) {
      filters.push(["hips", "=", options.hips]);
    }
    
    if (options.cup !== undefined) {
      filters.push(["cup", "=", options.cup]);
    }
    
    if (options.age !== undefined) {
      filters.push(["age", "=", options.age]);
    }
    
    if (options.trait) {
      filters.push(["trait", "=", options.trait]);
    }
    
    if (options.dtrait) {
      filters.push(["dtrait", "=", options.dtrait]);
    }
    
    if (options.birthday) {
      filters.push(["birthday", "=", options.birthday]);
    }
    
    if (options.vn) {
      filters.push(["vn", "=", options.vn]);
    }
    
    // 如果有多个过滤条件，使用AND组合它们
    return filters.length > 1 ? ["and", ...filters] : filters.length === 1 ? filters[0] : [];
  }
  
  /**
   * 构建字段列表
   */
  private buildFields(options: CharacterQueryOptions): string {
    // 如果提供了自定义字段列表，使用它
    if (options.fields) {
      // Handle both string and array input
      if (Array.isArray(options.fields)) {
        return options.fields.join(',');
      }
      return options.fields;
    }
    
    // 更正默认字段列表 - 去除vn字段，保留vns对象中的其他有效字段
    return 'name,original,aliases,description,image{id,url,dims},blood_type,height,weight,bust,waist,hips,cup,age,birthday,sex,vns{spoiler,role},traits{spoiler,lie}';
  }
  
  /**
   * 查询角色信息
   */
  async getCharacters(options: CharacterQueryOptions = {}): Promise<VNDBCharacterResponse> {
    const startTime = Date.now();
    this.logger.info('开始查询角色信息', options);
    
    try {
      // 构建查询参数
      const queryParams: VNDBQueryParams = {
        filters: options.filters || this.buildFilter(options),
        fields: this.buildFields(options),
        sort: options.sort || 'id',
        reverse: options.reverse || false,
        results: options.results || 10,
        page: options.page || 1,
        count: options.count || false
      };
      
      this.logger.debug('构建的查询参数', queryParams);
      
      // 发送请求
      const response = await this.client.post<VNDBCharacterResponse>('/character', queryParams);
      
      const duration = Date.now() - startTime;
      this.logger.info(`角色查询完成，耗时 ${duration}ms，返回 ${response.data.results.length} 条结果`);
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`角色查询失败，耗时 ${duration}ms`, error);
      throw error;
    }
  }
  
  /**
   * 根据ID获取单个角色信息
   */
  async getCharacterById(id: string, fields?: string[]): Promise<VNDBCharacter | null> {
    this.logger.info(`通过ID查询角色: ${id}`);
    
    try {
      const response = await this.getCharacters({
        id,
        fields,
        results: 1
      });
      
      if (response.results.length > 0) {
        this.logger.info(`成功获取角色信息: ${response.results[0].name} (${id})`);
        return response.results[0];
      } else {
        this.logger.warn(`未找到ID为 ${id} 的角色`);
        return null;
      }
    } catch (error) {
      this.logger.error(`通过ID查询角色失败: ${id}`, error);
      throw error;
    }
  }
  
  /**
   * 搜索角色
   */
  async searchCharacters(searchTerm: string, options: Omit<CharacterQueryOptions, 'search'> = {}): Promise<VNDBCharacterResponse> {
    this.logger.info(`搜索角色: "${searchTerm}"`);
    
    try {
      const response = await this.getCharacters({
        ...options,
        search: searchTerm
      });
      
      this.logger.info(`搜索完成，共找到 ${response.results.length} 个角色`);
      return response;
    } catch (error) {
      this.logger.error(`搜索角色失败: "${searchTerm}"`, error);
      throw error;
    }
  }
  
  /**
   * 获取角色特征
   */
  async getCharacterTraits(characterId: string): Promise<VNDBCharacter | null> {
    this.logger.info(`获取角色特征: ${characterId}`);
    
    try {
      return await this.getCharacterById(characterId, ['id', 'name', 'traits{spoiler,lie,trait}']);
    } catch (error) {
      this.logger.error(`获取角色特征失败: ${characterId}`, error);
      throw error;
    }
  }
  
  /**
   * 分页获取所有角色
   */
  async getAllCharacters(options: CharacterQueryOptions = {}): Promise<VNDBCharacterResponse> {
    this.logger.info('获取所有角色列表');
    
    try {
      return await this.getCharacters({
        ...options,
        results: options.results || 25,
        page: options.page || 1
      });
    } catch (error) {
      this.logger.error('获取所有角色列表失败', error);
      throw error;
    }
  }
}
