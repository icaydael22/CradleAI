/**
 * Plugin system core types
 */

// Base plugin interface that all plugins must implement
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
}

// Plugin metadata from remote source
export interface PluginMetadata extends Plugin {
  path: string;
  hash: string;
  supportedAppVersions: string[];
  lastUpdated: string;
  size: number;
  tags?: string[];
}

// Plugin registry item with status
export interface PluginRegistryItem {
  metadata: PluginMetadata;
  status: 'installed' | 'available' | 'downloading' | 'error' | 'incompatible';
  installedVersion?: string;
  lastUsed?: number;
  error?: string;
}

// Plugin network configuration
export interface PluginNetworkConfig {
  mode: 'local' | 'lan' | 'remote';
  protocol: 'http' | 'https' | 'ws' | 'wss';
  defaultPort?: number;
  discovery?: 'mdns' | 'manual';
  configFields?: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    options?: {label: string; value: string}[];
  }[];
}

// Plugin callbacks for async operations
export interface PluginCallbacks {
  onProgress?: (message: string, progress?: number) => void;
  onSuccess: (result: any, meta?: any) => void;
  onError: (error: Error) => void;
  onAbort?: () => void;
  onDataChunk?: (chunk: ArrayBuffer | string) => void;
}

// Plugin capability types
export type PluginModality = 'image' | 'audio' | 'video' | 'text';
export type PluginCapability = 'generate' | 'edit' | 'analyze' | 'transform';

// Plugin type (code vs service)
export type PluginType = 'code' | 'service';
