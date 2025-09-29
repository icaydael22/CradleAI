// Re-export all plugin-related components for easy imports
export * from './types';
export * from './types/image';
export { PluginRegistry } from './PluginRegistry';
export { usePlugins } from './hooks/usePlugins';
export { useImageGenerationPlugin } from './hooks/useImageGenerationPlugin';
export { createImageGenerationAdapter } from './adapters/ImageRegenerationAdapter';
export { default as PluginManager } from './components/PluginManager';

// Sample plugins
import NovelAIPlugin from './samples/NovelAIPlugin';

// Export sample plugins for easy access during development
export const SamplePlugins = {
  NovelAIPlugin
};
