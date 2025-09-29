import { Plugin, PluginCallbacks, PluginNetworkConfig } from './index';

// Plugin callbacks for async operations
export type { PluginCallbacks };

/**
 * Types specific to image generation plugins
 */

// Image generation parameters
export interface ImageGenerationParams {
  // Core parameters
  width: number;
  height: number;
  positiveTags: string[];
  negativeTags: string[];
  
  // Optional parameters
  seed?: number | string;
  steps?: number;
  scale?: number;
  sampler?: string;
  noiseSchedule?: string;
  
  // Character details
  characterTags?: string[];
  artistPrompt?: string | null;
  characterPrompts?: CharacterPromptData[];
  
  // Provider-specific settings
  modelName?: string;
  batchSize?: number;
  
  // Additional settings
  useCharacterCoords?: boolean;
  useCharacterOrder?: boolean;
  
  // Raw custom prompt (if any)
  customPrompt?: string;
}

// Character prompt data for multi-character images
export interface CharacterPromptData {
  prompt: string;
  positions: { x: number; y: number }[];
}

// Image generation result
export interface ImageGenerationResult {
  imageUrl: string;
  localUri?: string;
  seed?: number | string;
  generationParams?: ImageGenerationParams;
  meta?: any;
}

// Image generation plugin interface
export interface ImageGenerationPlugin extends Plugin {
  type: 'image';
  supportedModalities: ['image'];
  capabilities: ('generate' | 'edit')[];
  
  // Network configuration if this is a service-based plugin
  networkConfig?: PluginNetworkConfig;
  
  // Get plugin settings schema
  getSettingsSchema(): PluginSettingField[];
  
  // Generate an image
  generateImage(
    params: ImageGenerationParams,
    callbacks: PluginCallbacks
  ): void;
  
  // Abort current generation
  abort?(): void;
  
  // Get default parameters for this generator
  getDefaultParams?(): Partial<ImageGenerationParams>;
  
  // Get supported models, samplers, etc.
  getSupportedModels?(): string[];
  getSupportedSamplers?(): string[];
  getSupportedNoiseSchedules?(): string[];
}

// Plugin setting field definition
export interface PluginSettingField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'token';
  label: string;
  defaultValue?: any;
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: {label: string; value: any}[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}
