import { CircleService } from './circle-service';
import { Character, GlobalSettings } from '../shared/types';
import { CirclePost, CircleResponse } from '../shared/types/circle-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { scheduleCirclePostNotification } from '@/utils/notification-utils';
import * as FileSystem from 'expo-file-system'; // Add FileSystem import

// Single instance for queue management
let instance: CircleScheduler | null = null;

export class CircleScheduler {
  // Queue for creating posts
  private postQueue: Array<{
    character: Character;
    apiKey?: string;
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
    priority: number;
  }> = [];

  // Queue for interactions
  private interactionQueue: Array<{
    character: Character;
    post: CirclePost;
    apiKey?: string;
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
    images?: string[];
    priority: number;
    callback?: (response: CircleResponse) => void;
  }> = [];

  // Processing state
  private isProcessing: boolean = false;
  private processingInterval: number = 3000; // 3 seconds between requests

  // Last processed timestamp
  private lastScheduleCheck: number = 0;
  private scheduledPostsCache: Record<string, string[]> = {};
  private characterCache: Character[] = []; // Add a character cache
  private lastProcessedTimes: Record<string, { [timeString: string]: string }> = {};

  // Map to track update callbacks by postId
  private updateCallbacks: Map<string, UpdateCallback[]> = new Map();

  // Add activation state
  private isActive: boolean = false;
  private checkInterval: any = null;

  private constructor() {
    console.log('【CircleScheduler】创建调度器实例');
    // Don't automatically start - wait for activation
  }

  // Get the singleton instance
  static getInstance(): CircleScheduler {
    if (!instance) {
      instance = new CircleScheduler();
    }
    return instance;
  }

  // Add a method to register callbacks
  public registerUpdateCallback(postId: string, callback: UpdateCallback): void {
    if (!this.updateCallbacks.has(postId)) {
      this.updateCallbacks.set(postId, []);
    }
    this.updateCallbacks.get(postId)!.push(callback);
  }

  // Add a method to unregister callbacks
  public unregisterUpdateCallback(postId: string, callback: UpdateCallback): void {
    if (this.updateCallbacks.has(postId)) {
      const callbacks = this.updateCallbacks.get(postId)!;
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      if (callbacks.length === 0) {
        this.updateCallbacks.delete(postId);
      }
    }
  }

  // Load scheduled times from AsyncStorage and FileSystem
  private async loadScheduledTimes(): Promise<void> {
    try {
      // First try to get characters from FileSystem (where CharactersContext stores them)
      try {
        console.log('【CircleScheduler】尝试从FileSystem加载角色');
        const charactersStr = await FileSystem.readAsStringAsync(
          FileSystem.documentDirectory + 'characters.json',
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(() => '[]');
        
        if (charactersStr && charactersStr !== '[]') {
          const characters: Character[] = JSON.parse(charactersStr);
          this.characterCache = characters; // Store characters in cache
          console.log(`【CircleScheduler】从FileSystem加载了${characters.length}个角色`);
          
          // Extract scheduled times from characters
          const scheduledTimes: Record<string, string[]> = {};
          characters.forEach(character => {
            if (character.circleInteraction && character.circleScheduledTimes?.length) {
              // Use characterId as the key for scheduled times
              scheduledTimes[character.id] = character.circleScheduledTimes;
              
              // If character has a conversationId, also map it to the same times
              if (character.conversationId) {
                scheduledTimes[character.conversationId] = character.circleScheduledTimes;
              }
            }
          });
          
          this.scheduledPostsCache = scheduledTimes;
          console.log(`【CircleScheduler】从角色中加载了${Object.keys(scheduledTimes).length}个发布时间设置`);
          return; // Exit early if we got characters from FileSystem
        }
      } catch (fsError) {
        console.error('【CircleScheduler】从FileSystem加载角色失败:', fsError);
      }
      
      // If FileSystem loading fails, fall back to AsyncStorage
      console.log('【CircleScheduler】从FileSystem加载失败，尝试AsyncStorage');
      
      // Try to get characters list from user_characters
      const charactersString = await AsyncStorage.getItem('user_characters');
      if (charactersString) {
        const characters: Character[] = JSON.parse(charactersString);
        this.characterCache = characters; // Store characters in cache
        
        // Extract scheduled times from characters
        const scheduledTimes: Record<string, string[]> = {};
        characters.forEach(character => {
          if (character.circleInteraction && character.circleScheduledTimes?.length) {
            // Use characterId as the key for scheduled times
            scheduledTimes[character.id] = character.circleScheduledTimes;
            
            // If character has a conversationId, also map it to the same times
            if (character.conversationId) {
              scheduledTimes[character.conversationId] = character.circleScheduledTimes;
            }
          }
        });
        
        this.scheduledPostsCache = scheduledTimes;
        console.log(`【CircleScheduler】从AsyncStorage加载了${Object.keys(scheduledTimes).length}个发布时间设置`);
      } else {
        // Last resort: try to load from plain 'characters' key
        const plainCharactersString = await AsyncStorage.getItem('characters');
        if (plainCharactersString) {
          const characters: Character[] = JSON.parse(plainCharactersString);
          this.characterCache = characters;
          console.log(`【CircleScheduler】从AsyncStorage 'characters'键加载了${characters.length}个角色`);
          
          // Extract scheduled times
          const scheduledTimes: Record<string, string[]> = {};
          characters.forEach(character => {
            if (character.circleInteraction && character.circleScheduledTimes?.length) {
              scheduledTimes[character.id] = character.circleScheduledTimes;
              if (character.conversationId) {
                scheduledTimes[character.conversationId] = character.circleScheduledTimes;
              }
            }
          });
          
          this.scheduledPostsCache = scheduledTimes;
          console.log(`【CircleScheduler】从'characters'键加载了${Object.keys(scheduledTimes).length}个发布时间设置`);
        }
        
        // Final fallback to old format
        const storedTimes = await AsyncStorage.getItem('character_scheduled_times');
        if (storedTimes) {
          this.scheduledPostsCache = JSON.parse(storedTimes);
          console.log(`【CircleScheduler】(旧格式)加载了${Object.keys(this.scheduledPostsCache).length}个角色的发布时间设置`);
        }
      }
    } catch (error) {
      console.error('【CircleScheduler】加载定时发布设置失败:', error);
    }
  }

  // Save the last processed time for a character-time pair
  private async saveLastProcessedTime(characterId: string, timeString: string): Promise<void> {
    try {
      // Find character in the cache by characterId
      const characterIndex = this.characterCache.findIndex(c => c.id === characterId);
      
      if (characterIndex >= 0) {
        const character = this.characterCache[characterIndex];
        
        // Initialize lastProcessedTimes if needed
        if (!character.circleLastProcessedTimes) {
          character.circleLastProcessedTimes = {};
        }
        
        // Update the last processed time
        character.circleLastProcessedTimes[timeString] = this.getTodayDateString();
        
        // Update character in cache
        this.characterCache[characterIndex] = character;
        
        // Save updated character back to both storage locations to ensure consistency
        try {
          // First try FileSystem (primary storage in CharactersContext)
          const existingStr = await FileSystem.readAsStringAsync(
            FileSystem.documentDirectory + 'characters.json'
          ).catch(() => '[]');
          
          if (existingStr && existingStr !== '[]') {
            const existingCharacters = JSON.parse(existingStr);
            const updatedCharacters = existingCharacters.map((c: Character) => 
              c.id === characterId ? {...c, circleLastProcessedTimes: character.circleLastProcessedTimes} : c
            );
            
            await FileSystem.writeAsStringAsync(
              FileSystem.documentDirectory + 'characters.json',
              JSON.stringify(updatedCharacters),
              { encoding: FileSystem.EncodingType.UTF8 }
            );
            console.log(`【CircleScheduler】已更新FileSystem中角色 ${characterId} 的处理时间记录`);
          }
        } catch (fsError) {
          console.error('【CircleScheduler】更新FileSystem中的处理时间记录失败:', fsError);
        }
        
        // Also update in AsyncStorage for backward compatibility
        try {
          await AsyncStorage.getItem('user_characters').then(async (charactersString) => {
            if (charactersString) {
              const characters: Character[] = JSON.parse(charactersString);
              const updatedCharacters = characters.map(c => 
                c.id === characterId ? {...c, circleLastProcessedTimes: character.circleLastProcessedTimes} : c
              );
              
              await AsyncStorage.setItem('user_characters', JSON.stringify(updatedCharacters));
              console.log(`【CircleScheduler】已更新AsyncStorage中角色 ${characterId} 的处理时间记录`);
            }
          });
        } catch (asyncError) {
          console.error('【CircleScheduler】更新AsyncStorage中的处理时间记录失败:', asyncError);
        }
        
        console.log(`【CircleScheduler】已记录角色 ${characterId} 的发布时间 ${timeString} 为已处理`);
      } else {
        console.error(`【CircleScheduler】无法记录处理时间，未找到角色ID ${characterId}`);
      }
    } catch (error) {
      console.error('【CircleScheduler】保存处理时间记录失败:', error);
    }
  }

  // Check if a specific time for a character was already processed today
  private isTimeProcessedToday(idKey: string, timeString: string): boolean {
    // First try to find character by id
    let character = this.characterCache.find(c => c.id === idKey);
    
    // If not found, try finding by conversationId
    if (!character) {
      character = this.characterCache.find(c => c.conversationId === idKey);
    }
    
    if (!character || !character.circleLastProcessedTimes) {
      return false;
    }
    
    const lastProcessed = character.circleLastProcessedTimes[timeString];
    const today = this.getTodayDateString();
    
    const isProcessed = lastProcessed === today;
    console.log(`【CircleScheduler】检查角色 ${character.name} (${idKey}) 时间 ${timeString} 是否已处理: ${isProcessed ? '已处理' : '未处理'}, 上次处理日期: ${lastProcessed || '无'}, 今日: ${today}`);
    
    return isProcessed;
  }

  // Get today's date as string in format YYYY-MM-DD
  private getTodayDateString(): string {
    const date = new Date();
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  }

  // Add method to check if any scheduled tasks exist
  public async hasScheduledTasks(): Promise<boolean> {
    await this.loadScheduledTimes();
    return Object.keys(this.scheduledPostsCache).length > 0;
  }

  // Add method to activate scheduler
  public async activate(): Promise<void> {
    if (this.isActive) {
      console.log('【CircleScheduler】调度器已激活，跳过');
      return;
    }

    const hasScheduled = await this.hasScheduledTasks();
    if (!hasScheduled) {
      console.log('【CircleScheduler】没有定时任务，不启动调度器');
      return;
    }

    console.log('【CircleScheduler】激活调度器，开始监控定时任务');
    this.isActive = true;
    
    // Load scheduled times on startup
    await this.loadScheduledTimes();
    
    // Start the scheduled post checking loop
    this.startScheduledPostsCheck();
  }

  // Add method to deactivate scheduler
  public async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    console.log('【CircleScheduler】停用调度器');
    this.isActive = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Add method to refresh scheduler state
  public async refreshSchedulerState(): Promise<void> {
    const hasScheduled = await this.hasScheduledTasks();
    
    if (hasScheduled && !this.isActive) {
      console.log('【CircleScheduler】检测到新的定时任务，激活调度器');
      await this.activate();
    } else if (!hasScheduled && this.isActive) {
      console.log('【CircleScheduler】没有定时任务，停用调度器');
      await this.deactivate();
    }
  }

  // Start the periodic check for scheduled posts
  private startScheduledPostsCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Initial check
    this.checkForScheduledPosts();
    
    // Set up recurring checks
    this.checkInterval = setInterval(() => {
      if (this.isActive) {
        this.checkForScheduledPosts();
      }
    }, 60000); // Check every minute
  }

  // Check if any posts should be scheduled based on current time
  private async checkForScheduledPosts(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Don't check too frequently
      const now = Date.now();
      if (now - this.lastScheduleCheck < 55000) { // Minimum 55 seconds between checks
        return;
      }
      this.lastScheduleCheck = now;
      
      // Reload the scheduled times in case they were updated
      await this.loadScheduledTimes();
      
      // If no scheduled tasks exist after reloading, deactivate
      if (Object.keys(this.scheduledPostsCache).length === 0) {
        console.log('【CircleScheduler】没有定时任务，自动停用调度器');
        await this.deactivate();
        return;
      }
      
      // Get current time as HH:MM
      const date = new Date();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;
      
      console.log(`【CircleScheduler】检查定时发布任务，当前时间: ${currentTime}, 调度任务数: ${Object.keys(this.scheduledPostsCache).length}`);
      
      // Check each character's scheduled times
      for (const [idKey, times] of Object.entries(this.scheduledPostsCache)) {
        for (const timeString of times) {
          // Check if this exact time matches (or is within 1 minute) and wasn't already processed today
          if (this.isTimeMatching(currentTime, timeString) && !this.isTimeProcessedToday(idKey, timeString)) {
            console.log(`【CircleScheduler】检测到角色 ${idKey} 的定时发布时间: ${timeString}, 开始处理`);
            
            // Find the character from our cache - first try using idKey as characterId
            let character = this.characterCache.find(c => c.id === idKey);
            
            // If not found, try using idKey as conversationId
            if (!character) {
              character = this.characterCache.find(c => c.conversationId === idKey);
              
              // Log all available character IDs for debugging
              if (!character) {
                console.error(`【CircleScheduler】未找到ID或会话ID为 ${idKey} 的角色. 可用角色IDs: ${this.characterCache.map(c => `${c.id}${c.conversationId ? '/' + c.conversationId : ''}`).join(', ')}`);
                continue;
              }
            }
            
            if (!character.circleInteraction) {
              console.log(`【CircleScheduler】角色 ${character.name} 未启用朋友圈互动，跳过发布`);
              continue;
            }
            
            console.log(`【CircleScheduler】找到角色 ${character.name}，安排发布定时朋友圈`);
            
            // Get API settings from AsyncStorage
            const settings = await this.getAPISettings();
            
            // Schedule post with high priority and mark it as scheduled
            await this.schedulePost(character, settings?.apiKey, settings?.apiSettings, true);
            
            // Mark this time as processed for today
            await this.saveLastProcessedTime(character.id, timeString);
            
            console.log(`【CircleScheduler】成功安排角色 ${character.name} 的定时发布任务`);
          }
        }
      }
    } catch (error) {
      console.error('【CircleScheduler】检查定时发布失败:', error);
    }
  }

  // Add helper method to get API settings
  private async getAPISettings(): Promise<{
    apiKey?: string;
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
  }> {
    try {
      // Try to get user settings
      const userSettingsString = await AsyncStorage.getItem('user_settings');
      if (!userSettingsString) return {};
      
      const userSettings = JSON.parse(userSettingsString);
      
      // Extract API key and settings
      const apiKey = userSettings?.chat?.characterApiKey;
      const apiSettings = {
        apiProvider: userSettings?.chat?.apiProvider || 'gemini',
        openrouter: userSettings?.chat?.openrouter
      };
      
      return { apiKey, apiSettings };
    } catch (error) {
      console.error('【CircleScheduler】获取API设置失败:', error);
      return {};
    }
  }
  
  // Schedule a post
  public async schedulePost(
    character: Character,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    isScheduled: boolean = false // New parameter to track if this is a scheduled post
  ): Promise<{ success: boolean; error?: string; post?: string }> {
    return new Promise((resolve) => {
      // Add to queue with appropriate priority
      this.postQueue.push({
        character,
        apiKey,
        apiSettings,
        priority: isScheduled ? 2 : 1 // Scheduled posts get higher priority
      });
      
      console.log(`【CircleScheduler】已将角色 ${character.name} 的${isScheduled ? '定时' : ''}帖子添加到队列，优先级: ${isScheduled ? 2 : 1}`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        console.log(`【CircleScheduler】队列处理器未运行，启动处理`);
        this.processQueues();
      } else {
        console.log(`【CircleScheduler】队列处理器正在运行中，将等待处理`);
      }
      
      // Always resolve immediately - we're just queuing
      resolve({ success: true });
    });
  }

  // Schedule an interaction
  public async scheduleInteraction(
    character: Character,
    post: CirclePost,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    images?: string[]
  ): Promise<CircleResponse> {
    return new Promise((resolve) => {
      // Add to queue
      this.interactionQueue.push({
        character,
        post,
        apiKey,
        apiSettings,
        images,
        priority: 0 // Default priority for regular interactions
      });
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueues();
      }
      
      // Resolve with temporary response - actual response will be processed when queue is processed
      resolve({
        success: true,
        action: {
          like: false,
          comment: undefined
        },
        error: 'Interaction queued for processing'
      });
    });
  }

  // Schedule user post interaction with higher priority
  public async scheduleUserPostInteraction(
    character: Character,
    userPost: CirclePost,
    apiKey?: string,
    apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>,
    images?: string[]
  ): Promise<CircleResponse> {
    return new Promise((resolve, reject) => {
      // Add to queue with higher priority
      this.interactionQueue.push({
        character,
        post: userPost,
        apiKey,
        apiSettings,
        images,
        priority: 3, // Highest priority for user posts
        callback: (response: CircleResponse) => {
          // This callback will be called when the interaction is actually processed
          resolve(response);
        }
      });
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueues();
      }
      
      // No immediate resolve - we'll wait for the callback
      // This prevents the race condition by not returning until processing is complete
    });
  }

  // Process the queues
  private async processQueues(): Promise<void> {
    // If already processing, don't start a new process
    if (this.isProcessing) {
      console.log(`【CircleScheduler】队列正在处理中，跳过当前处理请求`);
      return;
    }
    
    console.log(`【CircleScheduler】开始处理队列，帖子队列: ${this.postQueue.length}，互动队列: ${this.interactionQueue.length}`);
    this.isProcessing = true;
    
    try {
      while (this.postQueue.length > 0 || this.interactionQueue.length > 0) {
        // Delay between processing items to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, this.processingInterval));
        
        // Prioritize interactions by user posts - highest priority (3)
        const userPostInteraction = this.interactionQueue.find(item => item.priority === 3);
        if (userPostInteraction) {
          console.log('【CircleScheduler】处理用户帖子互动（最高优先级）');
          this.interactionQueue = this.interactionQueue.filter(item => item !== userPostInteraction);
          await this.processInteraction(userPostInteraction);
          continue;
        }
        
        // Next prioritize scheduled posts - priority 2
        const scheduledPost = this.postQueue.find(item => item.priority === 2);
        if (scheduledPost) {
          console.log('【CircleScheduler】处理已排期的角色定时发布（高优先级）');
          this.postQueue = this.postQueue.filter(item => item !== scheduledPost);
          await this.processPost(scheduledPost, true); // Pass true to indicate scheduled post
          continue;
        }
        
        // Then regular posts - priority 1
        if (this.postQueue.length > 0) {
          console.log('【CircleScheduler】处理常规帖子发布请求');
          const post = this.postQueue.shift();
          if (post) {
            await this.processPost(post);
          }
          continue;
        }
        
        // Finally, regular interactions - priority 0
        if (this.interactionQueue.length > 0) {
          console.log('【CircleScheduler】处理常规互动请求');
          const interaction = this.interactionQueue.shift();
          if (interaction) {
            await this.processInteraction(interaction);
          }
        }
      }
      
      console.log(`【CircleScheduler】队列处理完成`);
    } catch (error) {
      console.error('【CircleScheduler】处理队列时出错:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process a post request - modified to ensure proper error handling
  private async processPost(
    item: {
      character: Character;
      apiKey?: string;
      apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
    },
    isScheduled: boolean = false
  ): Promise<void> {
    try {
      console.log(`【CircleScheduler】处理${isScheduled ? '定时' : ''}帖子请求，角色: ${item.character.name}`);
      
      // Create a new post
      const response = await CircleService.createNewPost(
        item.character,
        isScheduled ? this.getScheduledPostPrompt(item.character) : this.getRandomPostPrompt(item.character),
        item.apiKey,
        item.apiSettings
      );
      
      if (response.success) {
        console.log(`【CircleScheduler】角色 ${item.character.name} 成功发布了${isScheduled ? '定时' : ''}朋友圈`);
        
        // Extract post content from response
        let postContent = '';
        if (response.post) {
          postContent = response.post;
        } else if (response.action?.comment) {
          postContent = response.action.comment;
        }
        
        // If this is a scheduled post, send notification
        if (isScheduled && postContent) {
          try {
            // await scheduleCirclePostNotification(
            //   item.character.name,
            //   item.character.id,
            //   postContent
            // );
          } catch (notificationError) {
            // console.error(`【CircleScheduler】发送通知失败:`, notificationError);
          }
          
          // Check if the post was already created by CircleService
          // If response contains a postId, it means CircleService already saved it
          if (!response.post) {
            console.log(`【CircleScheduler】帖子没有ID，需要手动保存到存储`);
            
            // Save the post to storage to ensure it appears in the timeline
            try {
              // Load existing posts with careful error handling
              let posts = [];
              try {
                const postsString = await AsyncStorage.getItem('circle_posts');
                if (postsString) {
                  posts = JSON.parse(postsString);
                  // Verify it's an array
                  if (!Array.isArray(posts)) {
                    console.error('【CircleScheduler】circle_posts不是一个数组，重置为空数组');
                    posts = [];
                  }
                }
              } catch (loadError) {
                console.error('【CircleScheduler】加载已有帖子失败:', loadError);
                posts = []; // Reset to empty array on error
              }
              
              // Create a new post object
              const newPost = {
                id: `post-${Date.now()}-${item.character.id}`,
                characterId: item.character.id,
                characterName: item.character.name,
                characterAvatar: item.character.avatar || null,
                content: postContent,
                createdAt: new Date().toISOString(),
                comments: [],
                likes: 0,
                likedBy: [],
                hasLiked: false
              };
              
              // Add the new post to the beginning of the array
              posts.unshift(newPost);
              
              // Save back to AsyncStorage with error handling
              try {
                await AsyncStorage.setItem('circle_posts', JSON.stringify(posts));
                console.log(`【CircleScheduler】已保存定时帖子到存储`);
              } catch (saveError) {
                console.error('【CircleScheduler】保存帖子到存储失败:', saveError);
              }
              
              // Add to the character's circlePosts property
              // Instead of using AsyncStorage 'characters' key, use the character from cache
              try {
                // Find the character in cache by ID
                const charIndex = this.characterCache.findIndex(c => c.id === item.character.id);
                
                if (charIndex >= 0) {
                  // Get the character from cache
                  const character = this.characterCache[charIndex];
                  
                  // Add post to character's posts
                  if (!character.circlePosts) {
                    character.circlePosts = [];
                  }
                  
                  character.circlePosts.unshift(newPost);
                  
                  // Update character in cache
                  this.characterCache[charIndex] = character;
                  
                  // Save updated character back to FileSystem
                  try {
                    const existingStr = await FileSystem.readAsStringAsync(
                      FileSystem.documentDirectory + 'characters.json'
                    ).catch(() => '[]');
                    
                    if (existingStr && existingStr !== '[]') {
                      const existingCharacters = JSON.parse(existingStr);
                      const updatedCharacters = existingCharacters.map((c: Character) => 
                        c.id === character.id ? {...c, circlePosts: character.circlePosts} : c
                      );
                      
                      await FileSystem.writeAsStringAsync(
                        FileSystem.documentDirectory + 'characters.json',
                        JSON.stringify(updatedCharacters),
                        { encoding: FileSystem.EncodingType.UTF8 }
                      );
                      console.log(`【CircleScheduler】已将帖子添加到FileSystem的角色 ${character.name} 帖子列表`);
                    }
                  } catch (fsError) {
                    console.error('【CircleScheduler】更新FileSystem中的角色帖子列表失败:', fsError);
                  }
                  
                  // For backward compatibility, also try to update in AsyncStorage
                  try {
                    const charactersString = await AsyncStorage.getItem('user_characters');
                    if (charactersString) {
                      const characters = JSON.parse(charactersString);
                      const characterIndex = characters.findIndex((c: Character) => c.id === item.character.id);
                      
                      if (characterIndex >= 0) {
                        // Add post to character's posts
                        if (!characters[characterIndex].circlePosts) {
                          characters[characterIndex].circlePosts = [];
                        }
                        
                        characters[characterIndex].circlePosts.unshift(newPost);
                        
                        // Save updated characters
                        await AsyncStorage.setItem('user_characters', JSON.stringify(characters));
                        console.log(`【CircleScheduler】已将帖子添加到AsyncStorage中角色 ${item.character.name} 的帖子列表`);
                      }
                    }
                  } catch (asyncError) {
                    console.error('【CircleScheduler】更新AsyncStorage中的角色帖子列表失败:', asyncError);
                  }
                } else {
                  console.error(`【CircleScheduler】在缓存中未找到角色 ${item.character.id}，无法更新角色的帖子列表`);
                }
              } catch (characterUpdateError) {
                console.error('【CircleScheduler】更新角色帖子列表失败:', characterUpdateError);
              }
            } catch (saveError) {
              console.error(`【CircleScheduler】保存帖子失败:`, saveError);
            }
          } else {
            console.log(`【CircleScheduler】帖子已由CircleService保存，ID: ${response.post}`);
          }
        }
      } else {
        console.error(`【CircleScheduler】角色 ${item.character.name} 发布${isScheduled ? '定时' : ''}朋友圈失败:`, response.error);
      }
    } catch (error) {
      console.error(`【CircleScheduler】处理帖子时出错:`, error);
    }
  }

  // Process an interaction request - modified to handle callbacks
  private async processInteraction(
    item: {
      character: Character;
      post: CirclePost;
      apiKey?: string;
      apiSettings?: Pick<GlobalSettings['chat'], 'apiProvider' | 'openrouter'>;
      images?: string[];
      callback?: (response: CircleResponse) => void;
    }
  ): Promise<void> {
    try {
      console.log(`【CircleScheduler】处理互动请求，角色: ${item.character.name}，帖子作者: ${item.post.characterName}`);
      
      // Process interaction
      const response = await CircleService.processCircleInteraction(
        item.character,
        item.post,
        item.apiKey,
        item.apiSettings
      );
      
      if (response.success) {
        console.log(`【CircleScheduler】角色 ${item.character.name} 成功与 ${item.post.characterName} 的帖子互动`);
        
        // Call any registered callbacks for this post
        if (this.updateCallbacks.has(item.post.id)) {
          this.updateCallbacks.get(item.post.id)!.forEach(callback => {
            try {
              // Get the updated post from the response
              const { updatedPost } = CircleService.updatePostWithResponse(item.post, item.character, response);
              callback(updatedPost);
            } catch (callbackError) {
              console.error(`【CircleScheduler】调用更新回调失败:`, callbackError);
            }
          });
        }
      } else {
        console.error(`【CircleScheduler】角色 ${item.character.name} 互动失败:`, response.error);
      }
      
      // Call the item callback if provided (to resolve the Promise)
      if (item.callback) {
        item.callback(response);
      }
    } catch (error) {
      console.error(`【CircleScheduler】处理互动时出错:`, error);
      // Call the item callback with an error response
      if (item.callback) {
        item.callback({
          success: false,
          error: error instanceof Error ? error.message : '处理互动时出错'
        });
      }
    }
  }

  // Check if current time matches scheduled time (within 1 minute tolerance)
  private isTimeMatching(currentTime: string, scheduledTime: string): boolean {
    const [currentHours, currentMinutes] = currentTime.split(':').map(Number);
    const [scheduledHours, scheduledMinutes] = scheduledTime.split(':').map(Number);
    
    // Direct match
    if (currentHours === scheduledHours && currentMinutes === scheduledMinutes) {
      console.log(`【CircleScheduler】时间完全匹配: ${currentTime} = ${scheduledTime}`);
      return true;
    }
    
    // Within 1 minute tolerance (to prevent missing due to the exact minute)
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const scheduledTotalMinutes = scheduledHours * 60 + scheduledMinutes;
    const diff = Math.abs(currentTotalMinutes - scheduledTotalMinutes);
    
    if (diff === 1) {
      console.log(`【CircleScheduler】时间相差1分钟，视为匹配: ${currentTime} ≈ ${scheduledTime}`);
      return true;
    }
    
    return false;
  }

  // Generate a prompt for scheduled posts
  private getScheduledPostPrompt(character: Character): string {
    // Generate a prompt appropriate for the character
    const timeOfDay = this.getTimeOfDay();
    const characterSpecificPrompts: Record<string, string[]> = {
      default: [
        `分享一下我在${timeOfDay}的近况和想法`,
        `最近发生了一些有趣的事情，想和大家分享`,
        `${timeOfDay}好！简单分享一下我的感受`,
        `今天是怎样的一天呢？我来说说我的${timeOfDay}`,
      ]
    };
    
    // Get specific prompts for this character type if available
    const prompts = characterSpecificPrompts[character.id] || characterSpecificPrompts.default;
    
    // Choose a random prompt
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  // Get the current time of day description
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return "上午";
    } else if (hour >= 12 && hour < 14) {
      return "中午";
    } else if (hour >= 14 && hour < 18) {
      return "下午";
    } else if (hour >= 18 && hour < 22) {
      return "傍晚";
    } else {
      return "晚上";
    }
  }

  // Generate a random post prompt
  private getRandomPostPrompt(character: Character): string {
    const generalPrompts = [
      "分享一个最近的想法或心情",
      "今天发生了什么有趣的事情",
      "有什么想和朋友们分享的吗？",
      "随意聊聊近况",
      "谈谈最近的感受"
    ];
    
    return generalPrompts[Math.floor(Math.random() * generalPrompts.length)];
  }
}

// Add a type for update callbacks
type UpdateCallback = (post: CirclePost) => void;
