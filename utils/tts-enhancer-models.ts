/**
 * TTS Enhancer Models Utility
 * Handles fetching and filtering models suitable for TTS enhancement
 */

import { CloudServiceProvider } from '@/services/cloud-service-provider';

// Define interface for OpenRouter models
export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  provider?: {
    id?: string;
    name?: string;
  };
}

// Default TTS enhancer models to use when API call fails
const DEFAULT_TTS_MODELS: OpenRouterModel[] = [
  { id: "anthropic/claude-instant-v1", name: "Claude Instant", provider: { id: "anthropic", name: "Anthropic" } },
  { id: "openai/gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: { id: "openai", name: "OpenAI" } },
  { id: "meta-llama/meta-llama-3-8b-instruct", name: "Llama 3 8B", provider: { id: "meta", name: "Meta" } },
  { id: "mistralai/mistral-7b-instruct-v0.2", name: "Mistral 7B", provider: { id: "mistral", name: "Mistral AI" } }
];

/**
 * Fetch available models from OpenRouter suitable for TTS enhancement
 * Using the approach from ModelSelector.tsx
 */
export async function fetchTTSEnhancerModels(): Promise<OpenRouterModel[]> {
  try {
    const endpoint = 'https://openrouter.ai/api/v1/models';
    let response: Response;

    // Try to get models through CloudServiceProvider if available
    if (CloudServiceProvider.isEnabled()) {
      console.log('[TTS Enhancer] Fetching models through CloudServiceProvider');
      try {
        response = await CloudServiceProvider.forwardRequest(
          endpoint,
          { 
            method: 'GET',
            headers: {
              'HTTP-Referer': 'https://github.com',
              'X-Title': 'AI Chat App'
            }
          },
          'openrouter'
        );
      } catch (error) {
        console.warn('[TTS Enhancer] Failed to fetch models through CloudServiceProvider, falling back to direct', error);
        // Fall back to direct request
        response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'AI Chat App'
          }
        });
      }
    } else {
      // Make direct request if CloudServiceProvider is not enabled
      console.log('[TTS Enhancer] Fetching models directly');
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'HTTP-Referer': 'https://github.com',
          'X-Title': 'AI Chat App'
        }
      });
    }

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data?.data && Array.isArray(data.data)) {
      // Filter models to those suitable for TTS enhancement
      // We want text-based models that are good for creative tasks
      const suitableModels = data.data
        .filter((model: any) => {
          // Ensure model has text output capability
          const hasTextOutput = model.architecture?.output_modalities?.includes('text');
          
          // Filter out models with "vision" in name as they're not ideal for TTS enhancement
          const isNotVision = !model.name?.toLowerCase().includes('vision');
          
          return hasTextOutput !== false && isNotVision;
        })
        .map((model: any) => ({
          id: model.id,
          name: model.name,
          description: model.description,
          context_length: model.context_length,
          provider: {
            id: model.provider?.id || getProviderFromId(model.id),
            name: model.provider?.name || getProviderNameFromId(model.id)
          }
        }));
      
      // Add default models if they're not already in the list
    const modelIds: Set<string> = new Set(suitableModels.map((model: OpenRouterModel) => model.id));
      const missingDefaults = DEFAULT_TTS_MODELS.filter(model => !modelIds.has(model.id));
      
      return [...suitableModels, ...missingDefaults];
    }
    
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('[TTS Enhancer] Error fetching models:', error);
    // Return default models on error
    return DEFAULT_TTS_MODELS;
  }
}

// Extract provider ID from model ID
function getProviderFromId(modelId: string): string {
  const parts = modelId.split('/');
  return parts[0] || '';
}

// Get provider name based on provider ID
function getProviderNameFromId(modelId: string): string {
  const providerId = getProviderFromId(modelId);
  
  switch (providerId) {
    case 'openai': return 'OpenAI';
    case 'anthropic': return 'Anthropic';
    case 'meta-llama': case 'meta': return 'Meta';
    case 'mistralai': return 'Mistral AI';
    case 'google': return 'Google';
    default: return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
}

// Get provider emoji for UI display
export function getProviderEmoji(providerId: string | undefined): string {
  if (!providerId) return '⚪';
  
  switch(providerId.toLowerCase()) {
    case 'openai': return '🟢';
    case 'anthropic': return '🟣';
    case 'google': return '🔵';
    case 'meta': case 'meta-llama': return '🟡';
    case 'mistralai': case 'mistral': return '🔴';
    default: return '⚪';
  }
}

// Filter and sort models specifically for TTS enhancement
export function filterAndSortForTTSEnhancement(models: OpenRouterModel[]): OpenRouterModel[] {
  return [...models]
    .filter(model => {
      // Exclude very large models that would be slow for TTS enhancement
      const isLargeModel = 
        model.id.includes('gpt-4-turbo') || 
        model.id.includes('gpt-4-1106') ||
        model.id.includes('claude-3-opus') || 
        model.id.includes('claude-3-sonnet') ||
        model.id.includes('llama-3-70b');
      
      return !isLargeModel;
    })
    .sort((a, b) => {
      // Prioritize models known to work well with TTS enhancement
      const getPriority = (id: string): number => {
        if (id.includes('claude-instant')) return 1;
        if (id.includes('gpt-3.5-turbo')) return 2;
        if (id.includes('mistral-7b')) return 3;
        if (id.includes('llama-3-8b')) return 4;
        if (id.includes('gemini')) return 5;
        return 10;
      };
      
      const priorityA = getPriority(a.id);
      const priorityB = getPriority(b.id);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.name.localeCompare(b.name);
    });
}
