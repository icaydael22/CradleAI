import React, { createContext, useContext, useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { User, GlobalSettings } from '@/shared/types';
import { storeUserSettingsGlobally, updateCloudServiceStatus } from '@/utils/settings-helper';

interface UserContextProps {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  updateSettings: (settings: Partial<GlobalSettings>) => Promise<void>;
  loading: boolean;
  updateAvatar: (uri: string) => Promise<void>;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

const USER_FILE_PATH = FileSystem.documentDirectory + 'user.json';

async function readUserFromFile(): Promise<User | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(USER_FILE_PATH);
    if (!fileInfo.exists) return null;
    const content = await FileSystem.readAsStringAsync(USER_FILE_PATH);
    return JSON.parse(content);
  } catch (e) {
    console.error('[UserContext] Failed to read user file:', e);
    return null;
  }
}

async function writeUserToFile(user: User): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(USER_FILE_PATH, JSON.stringify(user));
  } catch (e) {
    console.error('[UserContext] Failed to write user file:', e);
  }
}

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const parsedUser = await readUserFromFile();
        if (parsedUser) {
          setUser(parsedUser);

          if (parsedUser.settings) {
            storeUserSettingsGlobally(parsedUser.settings);
            if (parsedUser.settings.chat && parsedUser.settings.chat.useCloudService !== undefined) {
              updateCloudServiceStatus(parsedUser.settings.chat.useCloudService);
            }
          }
        } else {
          const defaultUser: User = {
            id: 'user-1',
            name: 'User',
            avatar: null as any,
            settings: {
              license: {
                enabled: false,
                licenseKey: undefined,
                deviceId: undefined,
                planId: undefined,
                expiryDate: undefined
              },
              app: {
                darkMode: true,
                autoSave: true,
                notifications: {
                  enabled: false
                }
              },
              chat: {
                typingDelay: 300,
                serverUrl: '',
                characterApiKey: '',
                xApiKey: '',
                apiProvider: 'gemini',
                useGeminiKeyRotation: false,
                useGeminiModelLoadBalancing: false,
                additionalGeminiKeys: [],
                temperature: 0.7,
                maxTokens: 8192,
                maxtokens: 8192,
                useZhipuEmbedding: false,
                useCloudService: false,
                zhipuApiKey: '',
                geminiTemperature: 0.7,
                geminiMaxTokens: 2048,
                openrouter: {
                  enabled: false,
                  apiKey: '',
                  model: 'openai/gpt-3.5-turbo',
                  useBackupModels: false,
                  backupModels: [],
                  autoRoute: false,
                  sortingStrategy: 'price',
                  dataCollection: true,
                  ignoredProviders: []
                },
                OpenAIcompatible: {
                  enabled: false,
                  apiKey: '',
                  model: ''
                }
              },
              self: {
                nickname: '我',
                gender: 'other',
                description: ''
              },
              tts: {
                enabled: false,
                provider: 'doubao',
                appid: '',
                token: '',
                voiceType: 'zh_male_M392_conversation_wvae_bigtts',
                encoding: 'mp3',
                speedRatio: 1.0,
                transport: 'stream',
                // 新增 minimax 字段
                minimaxApiToken: '',
                minimaxModel: 'minimax/speech-02-turbo'
              },
            }
          };
          setUser(defaultUser);
          await writeUserToFile(defaultUser);

          if (defaultUser.settings) {
            storeUserSettingsGlobally(defaultUser.settings);
            if (defaultUser.settings.chat) {
              updateCloudServiceStatus(defaultUser.settings.chat.useCloudService || false);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const updateAvatar = async (uri: string): Promise<void> => {
    if (!user) return;

    const updatedUser = {
      ...user,
      avatar: uri
    };
    setUser(updatedUser);
    await writeUserToFile(updatedUser);
  };

  const updateSettings = async (settings: Partial<GlobalSettings>) => {
    if (!user) return;
    try {
      if (!user.settings) throw new Error('User settings not initialized');

      // 互斥逻辑：只允许一个 provider enabled
      let apiProvider = settings.chat?.apiProvider || user.settings.chat.apiProvider || 'gemini';
      let openrouterEnabled = apiProvider === 'openrouter';
      let openaiCompatibleEnabled = apiProvider === 'openai-compatible';

      // --- 修正：OpenAIcompatible多渠道流式参数同步 ---
      let updatedOpenAIcompatible = {
        ...(user.settings.chat.OpenAIcompatible || { enabled: false, apiKey: '', model: '', endpoint: '' }),
        ...(settings.chat?.OpenAIcompatible || {})
      };
      // 如果有providers数组，更新selectedProviderId对应的provider的参数
      if (
        updatedOpenAIcompatible.providers &&
        Array.isArray(updatedOpenAIcompatible.providers) &&
        updatedOpenAIcompatible.selectedProviderId
      ) {
        updatedOpenAIcompatible.providers = updatedOpenAIcompatible.providers.map((p: any) => {
          if (p.id === updatedOpenAIcompatible.selectedProviderId) {
            return {
              ...p,
              // 只覆盖有传入的字段
              ...(settings.chat?.OpenAIcompatible?.apiKey !== undefined ? { apiKey: settings.chat.OpenAIcompatible.apiKey } : {}),
              ...(settings.chat?.OpenAIcompatible?.model !== undefined ? { model: settings.chat.OpenAIcompatible.model } : {}),
              ...(settings.chat?.OpenAIcompatible?.endpoint !== undefined ? { endpoint: settings.chat.OpenAIcompatible.endpoint } : {}),
              ...(settings.chat?.OpenAIcompatible?.stream !== undefined ? { stream: settings.chat.OpenAIcompatible.stream } : {}),
              ...(settings.chat?.OpenAIcompatible?.temperature !== undefined ? { temperature: settings.chat.OpenAIcompatible.temperature } : {}),
              ...(settings.chat?.OpenAIcompatible?.max_tokens !== undefined ? { max_tokens: settings.chat.OpenAIcompatible.max_tokens } : {}),
            };
          }
          return p;
        });
      }

      const updatedUser = {
        ...user,
        settings: {
          ...user.settings,
          app: {
            ...user.settings.app,
            ...settings.app
          },
          chat: {
            ...user.settings.chat,
            ...settings.chat,
            apiProvider,
            // 确保模型字段被覆盖
            geminiPrimaryModel: settings.chat?.geminiPrimaryModel ?? user.settings.chat.geminiPrimaryModel,
            geminiBackupModel: settings.chat?.geminiBackupModel ?? user.settings.chat.geminiBackupModel,
            retryDelay: settings.chat?.retryDelay ?? user.settings.chat.retryDelay,
            geminiTemperature: settings.chat?.geminiTemperature ?? user.settings.chat.geminiTemperature ?? 0.7,
            geminiMaxTokens: settings.chat?.geminiMaxTokens ?? user.settings.chat.geminiMaxTokens ?? 2048,
            openrouter: {
              ...(user.settings.chat.openrouter || {}),
              ...(settings.chat?.openrouter || {}),
              enabled: openrouterEnabled
            },
            OpenAIcompatible: {
              ...updatedOpenAIcompatible,
              enabled: openaiCompatibleEnabled
            },
            novelai: {
              ...(user.settings.chat.novelai || {}),
              ...(settings.chat?.novelai || {})
            },
          },
          self: {
            ...user.settings.self,
            ...settings.self
          },
          // 新增：确保TTS设置被正确合并
          tts: {
            ...(user.settings.tts || { enabled: false }),
            ...(settings.tts || {}),
            // provider 字段优先 settings.tts.provider
            provider: settings.tts?.provider || user.settings.tts?.provider || 'doubao',
            // 新增：合并 minimax 字段
            minimaxApiToken: settings.tts?.minimaxApiToken ?? user.settings.tts?.minimaxApiToken,
            minimaxModel: settings.tts?.minimaxModel ?? user.settings.tts?.minimaxModel,
          },
          // 保留search设置
          search: {
            ...(user.settings.search || {}),
            ...settings.search
          },
          // 保留license设置
          license: {
            ...(user.settings.license || { enabled: false }),
            ...settings.license
          }
        }
      };

      setUser(updatedUser);
      await writeUserToFile(updatedUser);

      storeUserSettingsGlobally(updatedUser.settings);

      if (settings.chat && settings.chat.useCloudService !== undefined) {
        updateCloudServiceStatus(settings.chat.useCloudService);
      }

      console.log('[UserContext] Settings updated successfully, apiProvider:',
        updatedUser.settings.chat.apiProvider,
        'useCloudService:', updatedUser.settings.chat.useCloudService,
        'OpenAIcompatible.endpoint:', updatedUser.settings.chat.OpenAIcompatible?.endpoint
      );
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error('Failed to update settings');
    }
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      setUser, 
      updateSettings, 
      loading,
      updateAvatar 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};