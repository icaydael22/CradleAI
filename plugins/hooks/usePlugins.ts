import { useState, useEffect } from 'react';
import { PluginRegistry } from '../PluginRegistry';
import { PluginRegistryItem, Plugin } from '../types';

/**
 * Hook for accessing and managing plugins
 */
export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize on mount
  useEffect(() => {
    let isMounted = true;
    
    const initializeRegistry = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        await PluginRegistry.initialize();
        
        if (isMounted) {
          setPlugins(PluginRegistry.getPlugins());
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      }
    };
    
    initializeRegistry();
    
    return () => {
      isMounted = false;
    };
  }, []);
  
  // Refresh available plugins from remote repository
  const refreshPlugins = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      
      const updatedPlugins = await PluginRegistry.fetchAvailablePlugins();
      
      setPlugins(updatedPlugins);
      setIsRefreshing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRefreshing(false);
    }
  };
  
  // Install a plugin by ID
  const installPlugin = async (pluginId: string) => {
    try {
      setError(null);
      
      await PluginRegistry.installPlugin(pluginId);
      setPlugins(PluginRegistry.getPlugins());
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  
  // Uninstall a plugin by ID
  const uninstallPlugin = async (pluginId: string) => {
    try {
      setError(null);
      
      await PluginRegistry.uninstallPlugin(pluginId);
      setPlugins(PluginRegistry.getPlugins());
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  
  // Get a specific plugin instance
  const getPlugin = <T extends Plugin>(pluginId: string): T | undefined => {
    return PluginRegistry.getPlugin<T>(pluginId);
  };
  
  return {
    plugins,
    isLoading,
    isRefreshing,
    error,
    refreshPlugins,
    installPlugin,
    uninstallPlugin,
    getPlugin
  };
}
