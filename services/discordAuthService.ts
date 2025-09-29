import AsyncStorage from '@react-native-async-storage/async-storage';
import { DiscordUser, DiscordAuthResult } from '@/types/discord';
import { getDiscordConfig } from '@/utils/appConfig';

const STORAGE_KEYS = {
  DISCORD_TOKEN: '@discord_token',
  DISCORD_USER: '@discord_user',
  DISCORD_AUTH_TIMESTAMP: '@discord_auth_timestamp',
};

export class DiscordAuthService {
  private authServiceUrl: string;

  constructor() {
    const cfg = getDiscordConfig();
    this.authServiceUrl = cfg?.AUTH_SERVICE_URL || '';
    if (!this.authServiceUrl) {
      console.warn('AUTH_SERVICE_URL not configured in app.json extra.discord');
    }
  }

  /**
   * 构建Discord OAuth2授权URL
   * @param state 可选的状态参数，用于标识WebView环境
   * @returns Discord OAuth2授权URL
   */
  buildAuthUrl(state?: string): string {
    console.log('=== Building Discord OAuth2 URL ===');
    
    const cfg = getDiscordConfig();
    const clientId = cfg?.DISCORD_CLIENT_ID;
    const redirectUri = cfg?.DISCORD_REDIRECT_URI;
    
    console.log('Environment config:', {
      clientId: clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET',
      redirectUri: redirectUri || 'NOT SET',
      authServiceUrl: this.authServiceUrl || 'NOT SET'
    });

    if (!clientId || !redirectUri) {
      const error = 'Discord OAuth2 configuration not found';
      console.error('❌', error);
      throw new Error(error);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      prompt: 'none',
    });

    // 添加WebView标识到state参数
    const finalState = state || 'expo_dev_webview';
    params.set('state', finalState);
    
    const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    console.log('✅ Generated OAuth2 URL with state:', finalState);
    console.log('Full URL:', url);

    return url;
  }

  /**
   * 处理认证成功回调
   * @param token JWT token
   * @param user 用户信息
   */
  async handleAuthSuccess(token: string, user: DiscordUser): Promise<void> {
    console.log('=== Handling Discord Auth Success ===');
    console.log('User info:', {
      id: user.id,
      username: user.username,
      roles: user.roles?.length || 0,
      tokenLength: token.length
    });

    try {
      const timestamp = Date.now().toString();
      
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.DISCORD_TOKEN, token),
        AsyncStorage.setItem(STORAGE_KEYS.DISCORD_USER, JSON.stringify(user)),
        AsyncStorage.setItem(STORAGE_KEYS.DISCORD_AUTH_TIMESTAMP, timestamp),
      ]);

      console.log('✅ Discord authentication data saved successfully');
      console.log('Saved at timestamp:', timestamp);
    } catch (error) {
      console.error('❌ Failed to save Discord authentication data:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否已登录
   * @returns 是否已登录
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.DISCORD_TOKEN);
      const user = await AsyncStorage.getItem(STORAGE_KEYS.DISCORD_USER);
      
      if (!token || !user) {
        return false;
      }

      // 可选：验证token是否仍然有效
      const isValid = await this.verifyToken(token);
      return isValid;
    } catch (error) {
      console.error('Failed to check Discord login status:', error);
      return false;
    }
  }

  /**
   * 获取存储的用户信息
   * @returns 用户信息或null
   */
  async getUser(): Promise<DiscordUser | null> {
    try {
      const userJson = await AsyncStorage.getItem(STORAGE_KEYS.DISCORD_USER);
      if (!userJson) {
        return null;
      }

      return JSON.parse(userJson) as DiscordUser;
    } catch (error) {
      console.error('Failed to get Discord user:', error);
      return null;
    }
  }

  /**
   * 获取存储的JWT token
   * @returns JWT token或null
   */
  async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.DISCORD_TOKEN);
    } catch (error) {
      console.error('Failed to get Discord token:', error);
      return null;
    }
  }

  /**
   * 验证JWT token是否有效
   * @param token JWT token
   * @returns 是否有效
   */
  async verifyToken(token?: string): Promise<boolean> {
    try {
      const tokenToVerify = token || await this.getToken();
      if (!tokenToVerify) {
        return false;
      }

      const response = await fetch(`${this.authServiceUrl}/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('Token verification failed:', response.status);
        return false;
      }

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  /**
   * 刷新JWT token
   * @returns 新的token或null
   */
  async refreshToken(): Promise<string | null> {
    try {
      const currentToken = await this.getToken();
      if (!currentToken) {
        throw new Error('No token to refresh');
      }

      const response = await fetch(`${this.authServiceUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.token) {
        await AsyncStorage.setItem(STORAGE_KEYS.DISCORD_TOKEN, result.token);
        return result.token;
      }

      throw new Error('Invalid refresh response');
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  /**
   * 获取当前用户的最新信息
   * @returns 用户信息或null
   */
  async getCurrentUser(): Promise<DiscordUser | null> {
    try {
      const token = await this.getToken();
      if (!token) {
        return null;
      }

      const response = await fetch(`${this.authServiceUrl}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('Get current user failed:', response.status);
        return null;
      }

      const result = await response.json();
      if (result.success && result.user) {
        // 更新本地存储的用户信息
        await AsyncStorage.setItem(STORAGE_KEYS.DISCORD_USER, JSON.stringify(result.user));
        return result.user;
      }

      return null;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  /**
   * 登出并清除所有认证数据
   */
  async logout(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.DISCORD_TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.DISCORD_USER),
        AsyncStorage.removeItem(STORAGE_KEYS.DISCORD_AUTH_TIMESTAMP),
      ]);

      console.log('Discord authentication data cleared');
    } catch (error) {
      console.error('Failed to clear Discord authentication data:', error);
      throw error;
    }
  }

  /**
   * 获取认证时间戳
   * @returns 认证时间戳或null
   */
  async getAuthTimestamp(): Promise<number | null> {
    try {
      const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.DISCORD_AUTH_TIMESTAMP);
      return timestamp ? parseInt(timestamp, 10) : null;
    } catch (error) {
      console.error('Failed to get auth timestamp:', error);
      return null;
    }
  }

  /**
   * 检查认证是否过期（默认24小时）
   * @param maxAgeHours 最大有效时间（小时）
   * @returns 是否过期
   */
  async isAuthExpired(maxAgeHours: number = 24): Promise<boolean> {
    try {
      const timestamp = await this.getAuthTimestamp();
      if (!timestamp) {
        return true;
      }

      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000; // 转换为毫秒
      
      return (now - timestamp) > maxAge;
    } catch (error) {
      console.error('Failed to check auth expiration:', error);
      return true;
    }
  }

  /**
   * 获取 Authorization header
   * @returns { Authorization: 'Bearer <token>' } 或 null
   */
  async getAuthHeader(): Promise<{ Authorization: string } | null> {
    const token = await this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }
}

// 创建单例实例
export const discordAuthService = new DiscordAuthService();

// 导出类型
export type { DiscordUser, DiscordAuthResult };
