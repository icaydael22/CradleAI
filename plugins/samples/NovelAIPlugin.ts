import { ImageGenerationPlugin, ImageGenerationParams, PluginSettingField } from '../types/image';
import type { PluginCallbacks } from '../types/image';

/**
 * NovelAI Image Generator Plugin
 * Demonstrates implementation of an image generation plugin
 */

// Use closure variable for abortController instead of interface property
let abortController: AbortController | null = null;

const NovelAIPlugin: ImageGenerationPlugin = {
  id: 'novelai-image-generator',
  name: 'NovelAI Image Generator',
  version: '1.0.0',
  description: 'Image generation using NovelAI API',
  author: 'Cradle Dev',
  type: 'image',
  supportedModalities: ['image'],
  capabilities: ['generate'],

  // Settings schema
  getSettingsSchema(): PluginSettingField[] {
    return [
      {
        name: 'token',
        type: 'token',
        label: 'NovelAI API Token',
        placeholder: 'Enter your NovelAI token',
        description: 'Your NovelAI API token for authentication',
        required: true
      },
      {
        name: 'defaultModel',
        type: 'select',
        label: 'Default Model',
        defaultValue: 'nai-diffusion-4',
        options: [
          { label: 'NAI Diffusion V4', value: 'nai-diffusion-4' },
          { label: 'NAI Diffusion V3', value: 'nai-diffusion-3' }
        ],
        required: true
      },
      {
        name: 'defaultSteps',
        type: 'number',
        label: 'Default Steps',
        defaultValue: 28,
        validation: {
          min: 1,
          max: 50
        }
      }
    ];
  },

  // Generate image
  async generateImage(params: ImageGenerationParams, callbacks: PluginCallbacks): Promise<void> {
    try {
      const { onProgress, onSuccess, onError } = callbacks;

      // Create abort controller
      abortController = new AbortController();
      const { signal } = abortController;

      // Signal progress
      onProgress?.('Preparing generation request...');

      // Check token (should be stored in secure storage)
      const token = 'mock-token'; // In real implementation, get from secure storage

      if (!token) {
        throw new Error('NovelAI token not configured. Please set up your token in plugin settings.');
      }

      // Building the generation payload
      onProgress?.('Building generation payload...', 0.1);

      // Format prompts properly
      const mainPrompt = params.positiveTags.join(', ');
      const negativePrompt = params.negativeTags.join(', ');

      // Mock API call
      onProgress?.('Sending request to NovelAI...', 0.3);

      // In a real implementation, make actual API call here
      // This is a mock that simulates the generation process

      // Check if aborted during request preparation
      if (signal.aborted) {
        throw new Error('Generation aborted by user');
      }

      // Simulate API delay
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (signal.aborted) {
            reject(new Error('Generation aborted by user'));
          } else {
            resolve();
          }
        }, 2000);

        // Handle abort during timeout
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Generation aborted by user'));
        });
      });

      onProgress?.('Processing generation...', 0.6);

      // Simulate more processing time
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (signal.aborted) {
            reject(new Error('Generation aborted by user'));
          } else {
            resolve();
          }
        }, 1000);

        // Handle abort during timeout
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Generation aborted by user'));
        });
      });

      // Generate mock seed if not provided
      const seedValue = params.seed ? 
        (typeof params.seed === 'string' ? parseInt(params.seed) : params.seed) : 
        Math.floor(Math.random() * 2**32);

      onProgress?.('Finalizing image...', 0.9);

      // Return a placeholder image for demonstration
      // In real implementation, this would be the actual generated image
      const mockImageUrl = 'https://via.placeholder.com/512x768?text=NovelAI+Mock+Image';

      onSuccess({
        imageUrl: mockImageUrl,
        seed: seedValue,
        generationParams: params,
        meta: {
          provider: 'novelai',
          model: params.modelName || 'nai-diffusion-4',
          timeTaken: 3000 // ms
        }
      });

    } catch (error) {
      console.error('NovelAI plugin generation error:', error);
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      abortController = null;
    }
  },

  // Abort current generation
  abort(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
      console.log('NovelAI plugin: Generation aborted');
    }
  },

  // Get default parameters
  getDefaultParams(): Partial<ImageGenerationParams> {
    return {
      width: 512,
      height: 768,
      steps: 28,
      scale: 11,
      sampler: 'k_euler_ancestral',
      noiseSchedule: 'karras',
      modelName: 'nai-diffusion-4'
    };
  },

  // Support information
  getSupportedModels(): string[] {
    return ['nai-diffusion-4', 'nai-diffusion-3', 'nai-diffusion-2', 'nai-diffusion'];
  },

  getSupportedSamplers(): string[] {
    return [
      'k_euler_ancestral', 
      'k_euler', 
      'k_dpmpp_2m', 
      'k_dpmpp_sde', 
      'k_dpm_2_ancestral',
      'ddim'
    ];
  },

  getSupportedNoiseSchedules(): string[] {
    return ['karras', 'exponential', 'polyexponential', 'linear'];
  }
};

// Export the plugin
export default NovelAIPlugin;
