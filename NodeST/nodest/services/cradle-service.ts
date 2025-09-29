import { FeedData, FeedType, CharacterGeneratorService, CharacterInitialData, CharacterGenerationResult } from './character-generator-service';
import { GeminiAdapter } from '../utils/gemini-adapter';
import { OpenRouterAdapter } from '../utils/openrouter-adapter'; // Add OpenRouter adapter import
import { RoleCardJson, WorldBookJson } from '@/shared/types';

interface ProcessResult {
  success: boolean;
  errorMessage?: string;
  processedFeeds?: FeedData[];
}

/**
 * 摇篮系统服务 - 管理角色培育过程
 */
export class CradleService {
  private characterGenerator: CharacterGeneratorService | null = null;
  private pendingFeeds: FeedData[] = [];
  private initialized: boolean = false;
  private geminiAdapter: GeminiAdapter;
  private openRouterAdapter: OpenRouterAdapter | null = null;
  private roleCard: RoleCardJson | null = null;
  private worldBook: WorldBookJson | null = null;

  // Add apiSettings as an optional parameter
  constructor(apiKey: string, apiSettings?: {
    apiProvider: 'gemini' | 'openrouter';
    openrouter?: {
      enabled: boolean;
      apiKey: string;
      model: string;
    }
  }) {
    this.geminiAdapter = new GeminiAdapter(apiKey);
    
    // Initialize OpenRouter if settings are provided
    if (apiSettings?.apiProvider === 'openrouter' && 
        apiSettings.openrouter?.enabled && 
        apiSettings.openrouter?.apiKey) {
      this.openRouterAdapter = new OpenRouterAdapter(
        apiSettings.openrouter.apiKey,
        apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
      );
      console.log('[CradleService] OpenRouter adapter initialized');
    }
    
    // Get the appropriate adapter based on settings
    const adapter = this.getActiveAdapter();
    this.characterGenerator = new CharacterGeneratorService(adapter);
  }
  
  // Helper method to get the active adapter
  private getActiveAdapter() {
    if (this.openRouterAdapter) {
      console.log('[CradleService] Using OpenRouter adapter');
      return this.openRouterAdapter;
    }
    console.log('[CradleService] Using Gemini adapter');
    return this.geminiAdapter;
  }
  
  // Update API settings
  public updateApiSettings(apiSettings: {
    apiProvider: 'gemini' | 'openrouter';
    openrouter?: {
      enabled: boolean;
      apiKey: string;
      model: string;
    }
  }) {
    // Reinitialize OpenRouter if needed
    if (apiSettings.apiProvider === 'openrouter' && 
        apiSettings.openrouter?.enabled && 
        apiSettings.openrouter?.apiKey) {
      this.openRouterAdapter = new OpenRouterAdapter(
        apiSettings.openrouter.apiKey,
        apiSettings.openrouter.model || 'openai/gpt-3.5-turbo'
      );
      console.log('[CradleService] OpenRouter adapter updated');
    } else {
      this.openRouterAdapter = null;
      console.log('[CradleService] OpenRouter adapter disabled');
    }
    
    // Get the appropriate adapter based on settings
    const adapter = this.getActiveAdapter();
    this.characterGenerator = new CharacterGeneratorService(adapter);
  }

  /**
   * 初始化服务
   */
  initialize(): void {
    if (this.initialized) return;
    
    console.log("初始化摇篮系统服务...");
    this.initialized = true;
  }

  /**
   * 停止服务
   */
  shutdown(): void {
    console.log("关闭摇篮系统服务...");
    this.initialized = false;
  }

  /**
   * 创建初始角色
   * @param initialData 初始角色数据
   * @returns 生成结果
   */
  async createInitialCharacter(initialData: CharacterInitialData): Promise<CharacterGenerationResult> {
    console.log("创建初始角色...", initialData);
    if (!this.characterGenerator) {
      throw new Error('Character generator not initialized');
    }
    return await this.characterGenerator.generateInitialCharacter(initialData);
  }

  /**
   * 获取当前所有投喂数据
   * @returns 投喂数据数组
   */
  getAllFeeds(): FeedData[] {
    return [...this.pendingFeeds];
  }

  /**
   * 手动触发处理待处理的投喂
   * @returns 处理结果
   */
  async processFeeds(): Promise<ProcessResult> {
    const unprocessedFeeds = this.pendingFeeds.filter(feed => !feed.processed);
    if (unprocessedFeeds.length === 0) {
      console.log("没有需要处理的投喂数据");
      return {
        success: true,
        processedFeeds: []
      };
    }

    console.log(`手动处理${unprocessedFeeds.length}条投喂数据...`);
    return await this.processUnprocessedFeeds();
  }

  /**
   * 获取当前角色数据
   */
  getCurrentCharacterData(): { roleCard?: RoleCardJson; worldBook?: WorldBookJson } {
    if (!this.characterGenerator) {
      return { roleCard: undefined, worldBook: undefined };
    }
    return this.characterGenerator.getCurrentCharacterData();
  }

  /**
   * 重置生成器状态
   */
  reset(): void {
    if (!this.characterGenerator) {
      throw new Error('Character generator not initialized');
    }
    this.characterGenerator.reset();
    this.pendingFeeds = [];
    console.log("摇篮系统服务已重置");
  }

  /**
   * 处理未处理的投喂数据
   */
  private async processUnprocessedFeeds(): Promise<ProcessResult> {
    if (!this.characterGenerator) {
      return {
        success: false,
        errorMessage: 'Character generator not initialized'
      };
    }
    
    console.log('[CradleService] Processing unprocessed feeds...');
    
    try {
      // Get all unprocessed feeds
      const unprocessedFeeds = this.pendingFeeds.filter(feed => !feed.processed);
      if (unprocessedFeeds.length === 0) {
        return {
          success: true,
          processedFeeds: []
        };
      }
      
      // Segregate feeds by type
      const knowledgeFeeds = unprocessedFeeds.filter(feed => feed.type === FeedType.KNOWLEDGE);
      const otherFeeds = unprocessedFeeds.filter(feed => feed.type !== FeedType.KNOWLEDGE);
      
      let result: CharacterGenerationResult | null = null;
      let knowledgeEntry = null;
      

      
      // Process regular feeds through the character generator
      if (otherFeeds.length > 0 || !this.roleCard) {
        // Check if we already have a character initialized
        const currentData = this.characterGenerator.getCurrentCharacterData();
        if (currentData.roleCard) {
          // Update existing character with new feeds
          console.log('[CradleService] Updating existing character with new feeds');
          result = await this.characterGenerator.updateWithFeeds(otherFeeds);
        } else {
          // Create initial character if this is our first processing
          console.log('[CradleService] Creating initial character from feeds');
          const initialData: CharacterInitialData = {
            name: "Cradle Character",
            description: "A character being developed in the Cradle System",
            personality: "Personality will be determined based on feed data"
          };
          result = await this.characterGenerator.generateInitialCharacter(initialData);
        }
      } else {
        result = {
          success: true,
          roleCard: this.roleCard,
          worldBook: this.worldBook || { entries: {} } 
        };
      }
      

      
      
      console.log('[CradleService] Character generation/update successful');
      
      // Update internal state with processed character data
      this.roleCard = result.roleCard || this.roleCard;
      this.worldBook = result.worldBook || this.worldBook;
      
      // Mark all processed feeds
      unprocessedFeeds.forEach(feed => {
        const index = this.pendingFeeds.findIndex(f => f.id === feed.id);
        if (index !== -1) {
          this.pendingFeeds[index].processed = true;
        }
      });
      
      return {
        success: true,
        processedFeeds: unprocessedFeeds
      };
    } catch (error) {
      console.error('[CradleService] Error processing feeds:', error);
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }


}