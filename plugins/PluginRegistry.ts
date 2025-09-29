import { 
  Plugin, 
  PluginMetadata, 
  PluginRegistryItem 
} from './types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLUGIN_STORAGE_KEY = 'app_plugins_registry';
const PLUGIN_REPO_URL = 'https://raw.githubusercontent.com/your-org/your-plugin-repo/main';

class PluginRegistryManager {
  private plugins: Map<string, PluginRegistryItem> = new Map();
  private loadedPlugins: Map<string, Plugin> = new Map();
  private isInitialized: boolean = false;
  
  /**
   * Initialize the plugin registry
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Load previously saved registry data
      const storedData = await AsyncStorage.getItem(PLUGIN_STORAGE_KEY);
      if (storedData) {
        const parsedData: PluginRegistryItem[] = JSON.parse(storedData);
        parsedData.forEach(item => {
          this.plugins.set(item.metadata.id, item);
        });
      }
      
      this.isInitialized = true;
      console.log('[PluginRegistry] Initialized with', this.plugins.size, 'plugins');
    } catch (error) {
      console.error('[PluginRegistry] Failed to initialize:', error);
      throw new Error(`Plugin registry initialization failed: ${error}`);
    }
  }
  
  /**
   * Fetch available plugins from remote repository
   */
  async fetchAvailablePlugins(): Promise<PluginRegistryItem[]> {
    try {
      console.log('[PluginRegistry] Fetching available plugins from:', `${PLUGIN_REPO_URL}/plugins.json`);
      
      const response = await fetch(`${PLUGIN_REPO_URL}/plugins.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.status}`);
      }
      
      const pluginsData: PluginMetadata[] = await response.json();
      const existingPlugins = Array.from(this.plugins.values());
      
      // Update registry with fetched plugins
      pluginsData.forEach(metadata => {
        const existing = this.plugins.get(metadata.id);
        
        if (!existing) {
          this.plugins.set(metadata.id, {
            metadata,
            status: 'available'
          });
        } else {
          // Update metadata but keep installed status
          this.plugins.set(metadata.id, {
            ...existing,
            metadata,
            status: existing.status === 'installed' ? 
              (metadata.version === existing.installedVersion ? 'installed' : 'available') : 
              'available'
          });
        }
      });
      
      // Save updated registry
      await this.saveRegistry();
      
      return Array.from(this.plugins.values());
    } catch (error) {
      console.error('[PluginRegistry] Error fetching plugins:', error);
      throw error;
    }
  }
  
  /**
   * Install a plugin by ID
   */
  async installPlugin(pluginId: string): Promise<Plugin> {
    const pluginItem = this.plugins.get(pluginId);
    if (!pluginItem) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }
    
    try {
      // Update status to downloading
      this.plugins.set(pluginId, {
        ...pluginItem,
        status: 'downloading'
      });
      
      // Fetch plugin code
      const pluginCodeUrl = `${PLUGIN_REPO_URL}/${pluginItem.metadata.path}`;
      console.log(`[PluginRegistry] Installing plugin from: ${pluginCodeUrl}`);
      
      const response = await fetch(pluginCodeUrl);
      if (!response.ok) {
        throw new Error(`Failed to download plugin: ${response.status}`);
      }
      
      const pluginCode = await response.text();
      
      // Verify plugin hash (mock implementation - should use proper hash verification)
      if (!this.verifyPlugin(pluginCode, pluginItem.metadata.hash)) {
        throw new Error('Plugin verification failed: hash mismatch');
      }
      
      // Save plugin code to persistent storage
      await AsyncStorage.setItem(
        `plugin_code_${pluginId}`, 
        pluginCode
      );
      
      // Load plugin into sandbox and register
      const plugin = await this.loadPluginToSandbox(pluginCode, pluginItem.metadata);
      this.loadedPlugins.set(pluginId, plugin);
      
      // Update registry
      this.plugins.set(pluginId, {
        ...pluginItem,
        status: 'installed',
        installedVersion: pluginItem.metadata.version,
        lastUsed: Date.now()
      });
      
      await this.saveRegistry();
      
      return plugin;
    } catch (error) {
      // Update status to error
      this.plugins.set(pluginId, {
        ...pluginItem,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      await this.saveRegistry();
      console.error(`[PluginRegistry] Failed to install plugin ${pluginId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load a plugin by ID (from installed plugins)
   */
  async loadPlugin(pluginId: string): Promise<Plugin> {
    if (this.loadedPlugins.has(pluginId)) {
      return this.loadedPlugins.get(pluginId)!;
    }
    
    const pluginItem = this.plugins.get(pluginId);
    if (!pluginItem || pluginItem.status !== 'installed') {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }
    
    try {
      // Load plugin code from storage
      const pluginCode = await AsyncStorage.getItem(`plugin_code_${pluginId}`);
      if (!pluginCode) {
        throw new Error(`Plugin ${pluginId} code not found in storage`);
      }
      
      // Load plugin into sandbox and register
      const plugin = await this.loadPluginToSandbox(pluginCode, pluginItem.metadata);
      this.loadedPlugins.set(pluginId, plugin);
      
      // Update last used timestamp
      this.plugins.set(pluginId, {
        ...pluginItem,
        lastUsed: Date.now()
      });
      
      await this.saveRegistry();
      
      return plugin;
    } catch (error) {
      console.error(`[PluginRegistry] Failed to load plugin ${pluginId}:`, error);
      throw error;
    }
  }
  
  /**
   * Uninstall a plugin by ID
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const pluginItem = this.plugins.get(pluginId);
    if (!pluginItem) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }
    
    try {
      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginId);
      
      // Remove stored code
      await AsyncStorage.removeItem(`plugin_code_${pluginId}`);
      
      // Update registry
      this.plugins.set(pluginId, {
        ...pluginItem,
        status: 'available',
        installedVersion: undefined,
        error: undefined
      });
      
      await this.saveRegistry();
      console.log(`[PluginRegistry] Uninstalled plugin ${pluginId}`);
    } catch (error) {
      console.error(`[PluginRegistry] Failed to uninstall plugin ${pluginId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all registered plugins
   */
  getPlugins(): PluginRegistryItem[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get a specific plugin instance
   */
  getPlugin<T extends Plugin>(pluginId: string): T | undefined {
    return this.loadedPlugins.get(pluginId) as T | undefined;
  }
  
  /**
   * Save the plugin registry to persistent storage
   */
  private async saveRegistry(): Promise<void> {
    try {
      const data = Array.from(this.plugins.values());
      await AsyncStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[PluginRegistry] Failed to save registry:', error);
    }
  }
  
  /**
   * Verify plugin integrity
   */
  private verifyPlugin(code: string, hash: string): boolean {
    // In a real implementation, compute hash of code and compare with expected hash
    // For now, we'll just return true for demonstration
    console.log('[PluginRegistry] Verifying plugin hash:', hash);
    return true;
  }
  
  /**
   * Load plugin code into a sandbox environment
   */
  private async loadPluginToSandbox(code: string, metadata: PluginMetadata): Promise<Plugin> {
    // In a real implementation, this would use a proper sandboxing mechanism
    // For demonstration, we'll evaluate the code with some basic safeguards
    console.log(`[PluginRegistry] Loading plugin to sandbox: ${metadata.id}`);
    
    try {
      // Create sandbox environment
      const sandbox = {
        plugin: null,
        console: {
          log: (...args: any[]) => console.log(`[Plugin ${metadata.id}]`, ...args),
          error: (...args: any[]) => console.error(`[Plugin ${metadata.id}]`, ...args),
          warn: (...args: any[]) => console.warn(`[Plugin ${metadata.id}]`, ...args)
        },
        setTimeout, 
        clearTimeout,
        fetch
      };
      
      // Function wrapper for evaluation in context
      const evaluateInSandbox = new Function(
        'sandbox',
        `with (sandbox) { 
          ${code}
          return plugin; 
        }`
      );
      
      // Execute in sandbox
      const plugin = evaluateInSandbox(sandbox);
      
      if (!plugin || !plugin.id || plugin.id !== metadata.id) {
        throw new Error('Invalid plugin: missing or incorrect ID');
      }
      
      console.log(`[PluginRegistry] Successfully loaded plugin: ${metadata.id}`);
      return plugin;
    } catch (error) {
      console.error(`[PluginRegistry] Error loading plugin in sandbox: ${metadata.id}`, error);
      throw new Error(`Failed to load plugin in sandbox: ${error}`);
    }
  }
}

// Export singleton instance
export const PluginRegistry = new PluginRegistryManager();
