import { ChatMessage }  from '@/shared/types';
/**
 * Cloud Service Tracker
 * 
 * A utility to track and query cloud service status in real-time
 * This provides a centralized way to check if cloud service is enabled
 * that works across both web and React Native environments
 */

// Store the cloud service status
let cloudServiceEnabled = false;

// Event listeners for status changes
const listeners: Array<(enabled: boolean) => void> = [];

/**
 * Update the cloud service status
 * This should be called whenever the status changes in the UI or settings
 */
export function updateCloudServiceStatus(enabled: boolean): void {
  // Only trigger updates if the status actually changed
  if (cloudServiceEnabled !== enabled) {
    cloudServiceEnabled = enabled;
    
    // Log the status change
    console.log(`[CloudServiceTracker] Status updated to: ${enabled ? 'enabled' : 'disabled'}`);
    
    // Store in localStorage for web environment
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cloud_service_enabled', enabled ? 'true' : 'false');
    }
    
    // Store in global object for React Native environment
    if (typeof global !== 'undefined') {
      (global as any).__CLOUD_SERVICE_ENABLED = enabled;
    }
    
    // Notify all listeners
    listeners.forEach(listener => {
      try {
        listener(enabled);
      } catch (e) {
        console.error('[CloudServiceTracker] Error in listener:', e);
      }
    });
  }
}

/**
 * Check if cloud service is currently enabled
 * This will check all available sources to determine the current status
 */
export function isCloudServiceEnabled(): boolean {
  // First check our in-memory variable
  if (cloudServiceEnabled) {
    return true;
  }
  
  // Then check localStorage (web)
  if (typeof localStorage !== 'undefined') {
    const storedValue = localStorage.getItem('cloud_service_enabled');
    if (storedValue === 'true') {
      // Update our in-memory state to match
      cloudServiceEnabled = true;
      return true;
    }
  }
  
  // Then check global (React Native)
  if (typeof global !== 'undefined' && (global as any).__CLOUD_SERVICE_ENABLED === true) {
    // Update our in-memory state to match
    cloudServiceEnabled = true;
    return true;
  }
  
  // Check if the CloudServiceProvider is initialized
  try {
    // We need to import dynamically to avoid circular dependencies
    const { CloudServiceProvider } = require('@/services/cloud-service-provider');
    if (CloudServiceProvider && typeof CloudServiceProvider.isEnabled === 'function') {
      const isEnabled = CloudServiceProvider.isEnabled();
      if (isEnabled) {
        // Update our in-memory state to match
        cloudServiceEnabled = true;
        return true;
      }
    }
  } catch (e) {
    // Ignore errors in case CloudServiceProvider is not available
  }
  
  // Finally check global settings if available
  try {
    const { getUserSettingsGlobally } = require('./settings-helper');
    const settings = getUserSettingsGlobally();
    if (settings?.chat?.useCloudService) {
      // Update our in-memory state to match
      cloudServiceEnabled = true;
      return true;
    }
  } catch (e) {
    // Ignore errors in case settings-helper is not available
  }
  
  // If we get here, cloud service is not enabled
  return false;
}

/**
 * Add a listener for cloud service status changes
 */
export function addCloudServiceStatusListener(listener: (enabled: boolean) => void): () => void {
  listeners.push(listener);
  
  // Return a function to remove this listener
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Initialize the tracker by checking all sources
 * This should be called early in the app lifecycle
 */
export function initCloudServiceTracker(): void {
  // Check if license is valid and settings have useCloudService enabled
  (async () => {
    try {
      const { licenseService } = require('@/services/license-service');
      const { getUserSettingsGlobally } = require('./settings-helper');
      
      // Get current license status
      const licenseInfo = await licenseService.getLicenseInfo();
      const settings = getUserSettingsGlobally();
      
      // If license is valid and cloud service is enabled in settings
      if (licenseInfo?.isValid && settings?.chat?.useCloudService) {
        updateCloudServiceStatus(true);
      }
    } catch (e) {
      console.error('[CloudServiceTracker] 启动初始化失败:', e);
    }
  })();
  
  // Just call isCloudServiceEnabled to check all sources
  const isEnabled = isCloudServiceEnabled();
  console.log(`[CloudServiceTracker] Initialized. Cloud service is ${isEnabled ? 'enabled' : 'disabled'}`);
}

/**
 * Convert Gemini-style messages to standard OpenAI format
 */
export function convertGeminiMessagesToStandard(
  messages: ChatMessage[]
): Array<{ role: string, content: string }> {
  return messages.map(msg => {
    // Handle different message formats
    if (msg.parts && Array.isArray(msg.parts)) {
      // Extract text from parts array
      const textContent = msg.parts.map(part => {
        if (typeof part === 'object') {
          if (part.text) return part.text;
          // Handle recursive parts if they exist
          if (part.parts && Array.isArray(part.parts)) {
            return part.parts.map(subpart => 
              typeof subpart === 'object' && subpart.text ? subpart.text : 
              typeof subpart === 'string' ? subpart : ''
            ).join(' ');
          }
        }
        return typeof part === 'string' ? part : '';
      }).join(' ').trim();
      
      return {
        role: msg.role === 'model' ? 'assistant' : msg.role, // Convert 'model' role to 'assistant'
        content: textContent || '(Empty content)'  // Ensure we never send empty content
      };
    } else {
      // Fallback for unexpected message format
      return {
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: 'Content unavailable'
      };
    }
  });
}
