import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useCharacters } from '@/constants/CharactersContext';
import { useUser } from '@/constants/UserContext';
import { CircleService } from '@/services/circle-service';
import { CirclePost } from '@/shared/types/circle-types';
import { Character } from '@/shared/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// import { registerForPushNotificationsAsync, listenForNotificationInteractions } from '@/services/notification-service';

// Component for managing automatic circle post generation
export const CircleManager = () => {
  const { characters } = useCharacters();
  const { user } = useUser(); // Get user for API settings
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastPostTimestamp, setLastPostTimestamp] = useState(Date.now());
  const [scheduledTimes, setScheduledTimes] = useState<Record<string, string[]>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  const INTERVAL_BETWEEN_POSTS = 30 * 60 * 1000; // 30 minutes
  
  // Load scheduled times and notification settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load scheduled times
        const storedTimes = await AsyncStorage.getItem('character_scheduled_times');
        if (storedTimes) {
          setScheduledTimes(JSON.parse(storedTimes));
          console.log('【朋友圈管理器】已加载角色定时发布设置');
        }
        
        // Check notifications status
        const notificationSetting = await AsyncStorage.getItem('circle_notifications_enabled');
        setNotificationsEnabled(notificationSetting === 'true');
      } catch (error) {
        console.error('【朋友圈管理器】加载设置失败:', error);
      }
    };
    
    loadSettings();
    
    // Setup notification handlers
    // const setupNotifications = async () => {
    //   if (notificationsEnabled) {
    //     await registerForPushNotificationsAsync();
    //   }
    // };
    // setupNotifications();
    
    // Listen for notification interactions
    // const unsubscribe = listenForNotificationInteractions((notification) => {
    //   const data = notification.request.content.data;
    //   if (data?.type === 'circle_post') {
    //     console.log('【朋友圈管理器】收到朋友圈通知点击:', data);
    //     // Here we could navigate to the post or explore page if needed
    //   }
    // });
    // return () => {
    //   unsubscribe();
    // };
    return () => {};
  }, [notificationsEnabled]);
  
  // Get API settings from user context
  const getApiSettings = () => {
    const apiKey = user?.settings?.chat?.characterApiKey || '';
    
    // Extract OpenRouter settings if enabled
    const apiSettings = {
      apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
      openrouter: user?.settings?.chat?.apiProvider === 'openrouter' && user?.settings?.chat?.openrouter
        ? {
            enabled: true,
            apiKey: user?.settings?.chat?.openrouter.apiKey,
            model: user?.settings?.chat?.openrouter.model
          }
        : undefined
    };
    
    return { apiKey, apiSettings };
  };
  
  // Create a test post
  const createTestPost = async () => {
    if (isProcessing) return;
    if (!characters || characters.length === 0) return;
    
    setIsProcessing(true);
    try {
      const { apiKey, apiSettings } = getApiSettings();
      console.log('【朋友圈管理器】创建测试帖子，使用API设置:', apiSettings);
      
      // Only select characters with circle interaction enabled
      const enabledCharacters = characters.filter(c => c.circleInteraction);
      
      if (enabledCharacters.length > 0) {
        const result = await CircleService.publishTestPost(
          enabledCharacters,
          apiKey,
          apiSettings
        );
        
        if (result.post) {
          console.log(`【朋友圈管理器】发布测试帖子成功，内容: "${result.post.content.substring(0, 30)}..."`);
          // Trigger character interactions with this post
          await triggerInteractions(result.post, enabledCharacters);
          setLastPostTimestamp(Date.now());
        }
      }
    } catch (error) {
      console.error('【朋友圈管理器】创建测试帖子失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Trigger character interactions with a post
  const triggerInteractions = async (post: CirclePost, enabledCharacters: Character[]) => {
    try {
      const { apiKey, apiSettings } = getApiSettings();
      
      // Filter out the author of the post
      const respondingCharacters = enabledCharacters.filter(c => 
        c.id !== post.characterId && c.circleInteraction
      );
      
      if (respondingCharacters.length > 0) {
        // Process at most 3 random characters to avoid too many API calls
        const sampleSize = Math.min(3, respondingCharacters.length);
        const selectedCharacters = respondingCharacters
          .sort(() => 0.5 - Math.random())
          .slice(0, sampleSize);
        
        console.log(`【朋友圈管理器】选择 ${selectedCharacters.length} 个角色进行互动`);
        
        // Process interactions
        await CircleService.processPostResponses(
          post,
          selectedCharacters,
          apiKey,
          apiSettings
        );
      }
    } catch (error) {
      console.error('【朋友圈管理器】触发角色互动失败:', error);
    }
  };
  
  // Check if it's time to create a new post based on scheduled times
  const checkScheduledTimes = async () => {
    if (isProcessing || Object.keys(scheduledTimes).length === 0) return;
    
    try {
      // Get current time
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;
      
      // Check each character's scheduled times
      for (const [characterId, times] of Object.entries(scheduledTimes)) {
        // Find matching time (+/- 1 minute tolerance)
        const matchingTime = times.find(time => {
          const [timeHours, timeMinutes] = time.split(':').map(Number);
          const timeTotalMinutes = timeHours * 60 + timeMinutes;
          const currentTotalMinutes = parseInt(hours) * 60 + parseInt(minutes);
          return Math.abs(timeTotalMinutes - currentTotalMinutes) <= 1;
        });
        
        if (matchingTime) {
          // Find the character
          const character = characters.find(c => c.id === characterId);
          if (character && character.circleInteraction) {
            console.log(`【朋友圈管理器】检测到角色 ${character.name} 的定时发布时间: ${matchingTime}`);
            
            // Get API settings
            const { apiKey, apiSettings } = getApiSettings();
            
            // Create scheduled post with high priority
            const scheduler = await import('@/services/circle-scheduler').then(
              module => module.CircleScheduler.getInstance()
            );
            
            await scheduler.schedulePost(character, apiKey, apiSettings, true);
            console.log(`【朋友圈管理器】已安排角色 ${character.name} 的定时发布`);
          }
        }
      }
    } catch (error) {
      console.error('【朋友圈管理器】检查定时发布失败:', error);
    }
  };
  
  // Check if it's time to create a random post based on frequency
  const checkFrequencySchedule = () => {
    if (isProcessing) return;
    
    const now = Date.now();
    const timeSinceLastPost = now - lastPostTimestamp;
    
    if (timeSinceLastPost >= INTERVAL_BETWEEN_POSTS) {
      console.log('【朋友圈管理器】基于频率间隔，尝试创建新帖子');
      createTestPost();
    }
  };
  
  // Initialize and set up interval checks
  useEffect(() => {
    // Initial check
    checkScheduledTimes();
    checkFrequencySchedule();
    
    // Set up intervals for scheduled times (every minute)
    const scheduledCheckId = setInterval(() => {
      checkScheduledTimes();
    }, 60 * 1000); // Every minute
    
    // Set up interval for frequency-based posts (every 5 minutes)
    const frequencyCheckId = setInterval(() => {
      checkFrequencySchedule();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => {
      clearInterval(scheduledCheckId);
      clearInterval(frequencyCheckId);
    };
  }, [lastPostTimestamp, isProcessing, characters, scheduledTimes]);
  
  // Don't render anything visible
  return null;
};

export default CircleManager;
