import { ImageGenerationParams, ImageGenerationResult } from '../types/image';
import { useImageGenerationPlugin } from '../hooks/useImageGenerationPlugin';

/**
 * Adapter for integrating image generation plugins with ImageRegenerationModal
 */
export const createImageGenerationAdapter = (pluginId: string) => {
  return () => {
    const {
      isLoading,
      progress,
      error,
      result,
      generateImage,
      abortGeneration,
      getDefaultParams
    } = useImageGenerationPlugin(pluginId);
    
    // Convert the modal's input format to the plugin's format
    const adaptParams = (modalParams: any): ImageGenerationParams => {
      const pluginParams: ImageGenerationParams = {
        width: modalParams.width || 512,
        height: modalParams.height || 768,
        positiveTags: modalParams.positiveTags || [],
        negativeTags: modalParams.negativeTags || [],
      };
      
      // Add optional parameters if present
      if (modalParams.seed !== undefined) {
        pluginParams.seed = modalParams.seed;
      }
      
      if (modalParams.steps !== undefined) {
        pluginParams.steps = modalParams.steps;
      }
      
      if (modalParams.characterTags) {
        pluginParams.characterTags = modalParams.characterTags;
      }
      
      if (modalParams.artistPrompt) {
        pluginParams.artistPrompt = modalParams.artistPrompt;
      }
      
      // Handle provider-specific settings
      if (modalParams.novelaiSettings) {
        pluginParams.modelName = modalParams.novelaiSettings.model;
        pluginParams.sampler = modalParams.novelaiSettings.sampler;
        pluginParams.scale = modalParams.novelaiSettings.scale;
        pluginParams.noiseSchedule = modalParams.novelaiSettings.noiseSchedule;
        pluginParams.useCharacterCoords = modalParams.novelaiSettings.useCoords;
        pluginParams.useCharacterOrder = modalParams.novelaiSettings.useOrder;
      }
      
      // Add character prompts if available
      if (modalParams.characterPrompts && modalParams.characterPrompts.length > 0) {
        pluginParams.characterPrompts = modalParams.characterPrompts.map((char: any) => ({
          prompt: char.prompt,
          positions: [char.position]
        }));
      }
      
      return pluginParams;
    };
    
    // Convert the plugin's result format to the modal's expected format
    const adaptResult = (pluginResult: ImageGenerationResult): any => {
      return {
        url: pluginResult.imageUrl,
        localUri: pluginResult.localUri,
        seed: pluginResult.seed,
        // Additional metadata that might be useful for the modal
        meta: pluginResult.meta
      };
    };
    
    return {
      isLoading,
      progressMessage: progress?.message,
      progressPercent: progress?.percent,
      error,
      generatedResult: result ? adaptResult(result) : null,
      
      generateImage: async (modalParams: any) => {
        const pluginParams = adaptParams(modalParams);
        const result = await generateImage(pluginParams);
        return result ? adaptResult(result) : null;
      },
      
      abortGeneration,
      
      getDefaultSettings: async () => {
        const defaultParams = await getDefaultParams();
        return defaultParams;
      }
    };
  };
};
