import { useState, useCallback, useRef } from 'react';
import { PluginRegistry } from '../PluginRegistry';
import { ImageGenerationPlugin, ImageGenerationParams, ImageGenerationResult } from '../types/image';

/**
 * Hook for using image generation plugins
 */
export function useImageGenerationPlugin(pluginId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{message: string; percent?: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageGenerationResult | null>(null);
  
  // Keep reference to current plugin
  const pluginRef = useRef<ImageGenerationPlugin | null>(null);
  
  // Load the plugin
  const loadPlugin = useCallback(async (): Promise<ImageGenerationPlugin | null> => {
    try {
      if (pluginRef.current) {
        return pluginRef.current;
      }
      
      setError(null);
      const plugin = await PluginRegistry.loadPlugin(pluginId) as ImageGenerationPlugin;
      
      if (!plugin || plugin.supportedModalities[0] !== 'image' || !plugin.capabilities.includes('generate')) {
        throw new Error(`Plugin ${pluginId} is not a valid image generation plugin`);
      }
      
      pluginRef.current = plugin;
      return plugin;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [pluginId]);
  
  // Generate image using the plugin
  const generateImage = useCallback(async (params: ImageGenerationParams): Promise<ImageGenerationResult | null> => {
    try {
      setIsLoading(true);
      setProgress({ message: 'Loading plugin...' });
      setError(null);
      setResult(null);
      
      const plugin = await loadPlugin();
      if (!plugin) {
        throw new Error(`Failed to load plugin ${pluginId}`);
      }
      
      setProgress({ message: 'Starting generation...' });
      
      return new Promise<ImageGenerationResult | null>((resolve) => {
        plugin.generateImage(params, {
          onProgress: (message, progressPercent) => {
            setProgress({ 
              message, 
              percent: progressPercent !== undefined ? progressPercent * 100 : undefined 
            });
          },
          onSuccess: (generationResult) => {
            setResult(generationResult);
            setIsLoading(false);
            setProgress(null);
            resolve(generationResult);
          },
          onError: (err) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            setIsLoading(false);
            setProgress(null);
            resolve(null);
          },
          onAbort: () => {
            setIsLoading(false);
            setProgress(null);
            resolve(null);
          }
        });
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsLoading(false);
      setProgress(null);
      return null;
    }
  }, [pluginId, loadPlugin]);
  
  // Abort current generation
  const abortGeneration = useCallback(() => {
    const plugin = pluginRef.current;
    if (plugin && plugin.abort && isLoading) {
      plugin.abort();
    }
  }, [isLoading]);
  
  // Get default parameters
  const getDefaultParams = useCallback(async (): Promise<Partial<ImageGenerationParams> | null> => {
    try {
      const plugin = await loadPlugin();
      if (plugin && plugin.getDefaultParams) {
        return plugin.getDefaultParams();
      }
      return null;
    } catch (error) {
      console.error('Error getting default params:', error);
      return null;
    }
  }, [loadPlugin]);
  
  return {
    isLoading,
    progress,
    error,
    result,
    generateImage,
    abortGeneration,
    getDefaultParams
  };
}
