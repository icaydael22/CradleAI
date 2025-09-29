import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceUtils } from '@/utils/device-utils';
import { API_CONFIG } from '@/constants/api-config';

// 存储键名
const LICENSE_KEY_STORAGE_KEY = 'license_key';
const LICENSE_INFO_STORAGE_KEY = 'license_info';  // 新增：存储完整的许可证信息
const IS_INITIALIZING_KEY = 'license_service_initializing';

export interface LicenseInfo {
  licenseKey: string;
  deviceId: string;
  planId: string;
  expiryDate: string;
  customerEmail?: string;
  email?: string; // Add email field
  deviceCount?: number;
  isValid: boolean;
  validationDate?: string; // 新增：上次验证日期，用于判断是否需要重新验证
}

class LicenseService {
  private licenseKey: string | null = null;
  private licenseInfo: LicenseInfo | null = null;
  private deviceId: string | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * 初始化服务，从存储中加载许可证
   */
  public async initialize(): Promise<void> {
    // 防止重复初始化
    if (this.initialized) return;
    
    // 如果已经在初始化中，等待现有的初始化完成
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 创建初始化promise并存储它
    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // 检查是否有其他初始化过程在进行中
      const isInitializing = await AsyncStorage.getItem(IS_INITIALIZING_KEY);
      if (isInitializing === 'true') {
        console.log('[LicenseService] 另一个初始化过程正在进行，等待...');
        // 等待一小段时间，让其他初始化完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.initialized = true;
        return;
      }

      // 标记初始化开始
      await AsyncStorage.setItem(IS_INITIALIZING_KEY, 'true');
      
      console.log('[LicenseService] 初始化许可证服务...');
      
      // 获取设备ID
      this.deviceId = await DeviceUtils.getDeviceId();
      console.log('[LicenseService] 设备ID:', this.deviceId ? this.deviceId.substring(0, 4) + '****' : '未获取');
      
      // 尝试从存储加载完整的许可证信息
      const storedInfoString = await AsyncStorage.getItem(LICENSE_INFO_STORAGE_KEY);
      if (storedInfoString) {
        try {
          const storedInfo = JSON.parse(storedInfoString) as LicenseInfo;
          this.licenseInfo = storedInfo;
          this.licenseKey = storedInfo.licenseKey;
          console.log('[LicenseService] 从存储加载许可证信息成功');
          
          // 如果存储的设备ID与当前设备ID不匹配，可能是许可证被移动到新设备
          if (storedInfo.deviceId !== this.deviceId) {
            console.warn('[LicenseService] 存储的设备ID与当前设备ID不匹配，可能需要重新验证');
            // 不立即清除，但在下次验证时将会更新设备ID
          }
          
          // 只有在找不到完整信息时才尝试加载单独的licenseKey
        } catch (error) {
          console.error('[LicenseService] 解析存储的许可证信息失败:', error);
        }
      } else {
        // 如果没有找到完整的许可证信息，尝试加载许可证密钥
        this.licenseKey = await AsyncStorage.getItem(LICENSE_KEY_STORAGE_KEY);
        console.log('[LicenseService] 从存储加载许可证密钥:', this.licenseKey ? '成功' : '未找到');
      }
      
      // 检查存储的许可证信息是否需要重新验证
      const shouldRevalidate = this.shouldRevalidateLicense();
      
      // 如果有许可证密钥且需要重新验证，验证其有效性
      if (this.licenseKey && shouldRevalidate) {
        try {
          console.log('[LicenseService] 重新验证已存储的许可证...');
          const info = await this._verifyLicenseInternal(this.licenseKey);
          this.licenseInfo = info;
          
          // 更新验证日期
          this.licenseInfo.validationDate = new Date().toISOString();
          
          // 保存更新后的许可证信息
          await this.saveLicenseInfoToStorage();
          
          console.log('[LicenseService] 许可证重新验证成功');
        } catch (error) {
          console.warn('[LicenseService] 存储的许可证重新验证失败:', error);
          // 许可证验证失败，但不清除存储的许可证信息
          // 这里我们仍然保留许可证信息，但标记为无效
          if (this.licenseInfo) {
            this.licenseInfo.isValid = false;
            // 保存更新后的许可证信息
            await this.saveLicenseInfoToStorage();
          }
        }
      }
      
      this.initialized = true;
      console.log('[LicenseService] 许可证服务初始化完成');
    } catch (error) {
      console.error('[LicenseService] 初始化许可证服务失败:', error);
      this.initialized = true; // 即使失败也标记为已初始化，避免反复初始化
    } finally {
      // 清除初始化标记
      await AsyncStorage.removeItem(IS_INITIALIZING_KEY);
      this.initializationPromise = null;
    }
  }

  /**
   * 判断是否需要重新验证许可证
   * 如果许可证信息不完整，或上次验证时间超过7天，则需要重新验证
   */
  private shouldRevalidateLicense(): boolean {
    if (!this.licenseInfo) return true;
    if (!this.licenseInfo.validationDate) return true;
    
    // 检查上次验证时间是否在7天内
    const lastValidation = new Date(this.licenseInfo.validationDate);
    const now = new Date();
    const diffDays = (now.getTime() - lastValidation.getTime()) / (1000 * 60 * 60 * 24);
    
    // 如果超过7天，或者验证日期无效，需要重新验证
    return isNaN(diffDays) || diffDays > 7;
  }

  /**
   * 将许可证信息保存到存储
   */
  private async saveLicenseInfoToStorage(): Promise<void> {
    if (!this.licenseInfo) return;
    
    try {
      const infoString = JSON.stringify(this.licenseInfo);
      await AsyncStorage.setItem(LICENSE_INFO_STORAGE_KEY, infoString);
      await AsyncStorage.setItem(LICENSE_KEY_STORAGE_KEY, this.licenseInfo.licenseKey);
      console.log('[LicenseService] 许可证信息已保存到存储');
    } catch (error) {
      console.error('[LicenseService] 保存许可证信息失败:', error);
    }
  }

  /**
   * 验证许可证密钥 - 公开接口
   */
  public async verifyLicense(licenseKey: string): Promise<LicenseInfo> {
    console.log('[LicenseService] 开始验证新许可证:', licenseKey.substring(0, 4) + '****');
    
    // 确保已初始化
    if (!this.initialized) {
      console.log('[LicenseService] 验证前初始化服务');
      await this.initialize();
    }
    
    // 实际验证过程
    const licenseInfo = await this._verifyLicenseInternal(licenseKey);
    
    // 更新验证日期
    licenseInfo.validationDate = new Date().toISOString();
    
    // 保存许可证信息
    this.licenseKey = licenseKey;
    this.licenseInfo = licenseInfo;
    
    // 保存到存储
    await this.saveLicenseInfoToStorage();
    
    return licenseInfo;
  }

  /**
   * 验证许可证密钥 - 内部实现
   */
  private async _verifyLicenseInternal(licenseKey: string): Promise<LicenseInfo> {
    // 获取设备ID
    if (!this.deviceId) {
      this.deviceId = await DeviceUtils.getDeviceId();
      console.log('[LicenseService] 获取设备ID:', this.deviceId.substring(0, 4) + '****');
    }
    
    // 首先测试与服务器的连接
    console.log('[LicenseService] 测试与授权服务器的连接');
    const connectivityResult = await this.testServerConnectivity();
    console.log('[LicenseService] 服务器连接测试结果:', connectivityResult);
    
    if (!connectivityResult.anySuccess) {
      console.error('[LicenseService] 连接测试失败:', connectivityResult.details);
      throw new Error('无法连接到授权服务器，请检查网络连接后重试');
    }
    
    // 请求数据 - 确保与后端文档中的格式一致
    const requestData = {
      license_key: licenseKey,
      device_id: this.deviceId
    };
    
    console.log('[LicenseService] 将使用设备ID:', this.deviceId);
    
    // 定义所有要尝试的URL (主要 + 备用)
    const urlsToTry = [
      API_CONFIG.LICENSE_API_URL,
    ];
    
    // 记录所有错误以便报告
    const errors: string[] = [];
    
    // 依次尝试每个URL
    for (const apiUrl of urlsToTry) {
      try {
        console.log(`[LicenseService] 尝试验证授权：${apiUrl}`);
        
        // 增强的fetch请求，包含超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
        
        console.log('[LicenseService] 请求数据:', JSON.stringify(requestData));
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'CradleIntro-App/1.0',
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
          // 禁用缓存，确保总是发送新请求
          cache: 'no-store',
        }).catch(err => {
          console.error(`[LicenseService] Fetch异常: ${err.message}`);
          throw err;
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[LicenseService] ${apiUrl} 响应状态码:`, response.status);
        
        // 获取响应文本
        const responseText = await response.text();
        console.log(`[LicenseService] ${apiUrl} 响应内容:`, responseText);
        
        if (!response.ok) {
          const errorMsg = `验证失败(${response.status}): ${responseText}`;
          errors.push(errorMsg);
          console.error(`[LicenseService] ${errorMsg}`);
          continue; // 尝试下一个URL
        }
        
        // 尝试解析响应JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          const errorMsg = `响应不是有效的JSON: ${responseText}`;
          errors.push(errorMsg);
          console.error(`[LicenseService] ${errorMsg}`);
          continue; // 尝试下一个URL
        }
        
        if (!data.success) {
          const errorMsg = data.error || '许可证验证失败';
          errors.push(errorMsg);
          console.error(`[LicenseService] ${errorMsg}`);
          continue; // 尝试下一个URL
        }
        
        // 成功响应 - 创建许可证信息对象
        const licenseInfo: LicenseInfo = {
          licenseKey: licenseKey,
          deviceId: this.deviceId!,
          isValid: true,
          planId: data.license_info.plan_id || 'standard',
          expiryDate: data.license_info.expiry_date || 'permanent',
          customerEmail: data.license_info.customer_email,
          email: data.license_info.email, // Store email from response
          deviceCount: data.license_info.device_count || 1
        };
        
        return licenseInfo;
        
      } catch (error) {
        // 记录错误并继续尝试下一个URL
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${apiUrl}: ${errorMsg}`);
        console.error(`[LicenseService] ${apiUrl} 请求失败:`, errorMsg);
      }
    }
    
    // 所有URL都失败了，抛出综合错误
    const finalError = `所有许可证验证尝试均失败: ${errors.join('; ')}`;
    console.error(`[LicenseService] ${finalError}`);
    throw new Error(finalError);
  }

  /**
   * 测试服务器连接性
   */
  private async testServerConnectivity(): Promise<{
    domainConnected: boolean;
    apiEndpointConnected: boolean;
    anySuccess: boolean;
    details: string;
  }> {
    const result = {
      domainConnected: false,
      apiEndpointConnected: false,
      anySuccess: false,
      details: ''
    };
    
    const details: string[] = [];
    
    // 测试基本域名连接
    try {
      console.log(`测试域名连接: https://${API_CONFIG.LICENSE_SERVER_DOMAIN}`);
      const domainController = new AbortController();
      const domainTimeoutId = setTimeout(() => domainController.abort(), 10000);
      
      const domainResponse = await fetch(`https://${API_CONFIG.LICENSE_SERVER_DOMAIN}`, {
        method: 'HEAD',
        signal: domainController.signal,
        cache: 'no-store' as RequestCache,
      });
      
      clearTimeout(domainTimeoutId);
      
      result.domainConnected = domainResponse.ok || domainResponse.status < 500;
      details.push(`域名连接: ${result.domainConnected ? '成功' : '失败'} (${domainResponse.status})`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      details.push(`域名连接失败: ${errorMsg}`);
      console.error('域名连接测试失败:', error);
    }
    
    // 测试API端点连接
    try {
      // 使用健康检查API或者只是对API URL的HEAD请求
      const healthUrl = API_CONFIG.LICENSE_API_URL.replace('/license/verify', '/health');
      console.log(`测试API端点连接: ${healthUrl}`);
      
      const apiController = new AbortController();
      const apiTimeoutId = setTimeout(() => apiController.abort(), 10000);
      
      const apiResponse = await fetch(healthUrl, {
        method: 'GET',
        signal: apiController.signal,
        cache: 'no-store' as RequestCache,
      });
      
      clearTimeout(apiTimeoutId);
      
      result.apiEndpointConnected = apiResponse.ok;
      details.push(`API端点连接: ${result.apiEndpointConnected ? '成功' : '失败'} (${apiResponse.status})`);
      
      if (apiResponse.ok) {
        // 尝试读取健康检查响应
        const healthText = await apiResponse.text();
        details.push(`健康检查响应: ${healthText}`);
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      details.push(`API端点连接失败: ${errorMsg}`);
      console.error('API端点连接测试失败:', error);
    }
    
    // 尝试备用URL的简单连接测试

    
    // 如果任一连接测试成功，则整体标记为成功
    result.anySuccess = result.domainConnected || result.apiEndpointConnected;
    result.details = details.join('; ');
    
    return result;
  }

  /**
   * 获取许可证信息
   */
  public async getLicenseInfo(): Promise<LicenseInfo | null> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.licenseInfo;
  }

  /**
   * 检查是否有有效的许可证
   */
  public async hasValidLicense(): Promise<boolean> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.licenseInfo !== null && this.licenseInfo.isValid;
  }

  /**
   * 获取包含许可证信息的HTTP请求头
   */
  public async getLicenseHeaders(): Promise<Record<string, string>> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 检查许可证和设备ID
    if (!this.licenseKey || !this.deviceId) {
      return {};
    }
    
    // 检查许可证有效性（如果有许可证信息）
    if (this.licenseInfo && !this.licenseInfo.isValid) {
      return {};
    }
    
    const headers = {
      'X-License-Key': this.licenseKey,
      'X-Device-ID': this.deviceId
    };
    
    return headers;
  }

  /**
   * 清除许可证
   */
  public async clearLicense(): Promise<void> {
    this.licenseKey = null;
    this.licenseInfo = null;
    await AsyncStorage.removeItem(LICENSE_KEY_STORAGE_KEY);
    await AsyncStorage.removeItem(LICENSE_INFO_STORAGE_KEY); // 同时清除许可证信息
  }
  
  /**
   * 刷新许可证状态
   * 从服务器获取最新的许可证信息
   */
  public async refreshLicenseStatus(): Promise<LicenseInfo | null> {
    // 确保已初始化
    if (!this.initialized) {
      await this.initialize();
    }
    
    // 如果没有许可证密钥，无法刷新
    if (!this.licenseKey) {
      return null;
    }
    
    try {
      // 重新验证许可证
      const info = await this.verifyLicense(this.licenseKey);
      this.licenseInfo = info;
      return info;
    } catch (error) {
      console.error('Failed to refresh license status:', error);
      return null;
    }
  }

  /**
   * 检查服务是否已初始化
   * 公开方法，供外部组件检查初始化状态
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}

// 导出单例
export const licenseService = new LicenseService();
