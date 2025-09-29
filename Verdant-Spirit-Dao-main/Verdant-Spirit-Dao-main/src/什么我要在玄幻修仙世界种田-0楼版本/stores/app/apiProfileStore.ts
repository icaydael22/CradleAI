import { defineStore } from 'pinia';
import { ref } from 'vue';
import { z } from 'zod';

// Zod Schema for a single secondary API profile
export const SecondaryApiProfileSchema = z.object({
  id: z.string().default(() => `profile_${Date.now()}`),
  name: z.string().default('默认配置'),
  source: z.enum(['openai', 'claude', 'makersuite', 'deepseek']).default('openai'),
  apiUrl: z.string().default('https://api.openai.com/v1'),
  apiKey: z.string().default(''),
  model: z.string().default(''),
  useSummary: z.boolean().default(true),
  useFullContext: z.boolean().default(false),
  fallbackEnabled: z.boolean().default(false),
  fallbackThreshold: z.number().min(1).default(3),
});

export type SecondaryApiProfile = z.infer<typeof SecondaryApiProfileSchema>;

export const useApiProfileStore = defineStore('apiProfile', () => {
  // --- State ---
  const profiles = ref<SecondaryApiProfile[]>([SecondaryApiProfileSchema.parse({})]);
  const activeProfileId = ref<string | undefined>(profiles.value[0]?.id);

  // --- Actions ---
  function setProfiles(newProfiles: SecondaryApiProfile[], newActiveProfileId?: string) {
    profiles.value = newProfiles;
    // 优先使用传入的 activeId，如果它有效的话
    if (newActiveProfileId && newProfiles.some(p => p.id === newActiveProfileId)) {
      activeProfileId.value = newActiveProfileId;
    } else {
      // 否则，默认选择最后一个 profile
      // 这在 fetchSettings 加载时尤其有用，可以默认显示用户最后一次的配置
      activeProfileId.value = newProfiles[newProfiles.length - 1]?.id;
    }
  }

  return {
    profiles,
    activeProfileId,
    setProfiles,
  };
});
