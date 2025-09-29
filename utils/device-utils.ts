import { Platform, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Utility functions for device identification
 */
export class DeviceUtils {
  /**
   * Generate a unique device ID
   */
  public static async getDeviceId(): Promise<string> {
    // Check if we already have a stored device ID
    const storedDeviceId = await AsyncStorage.getItem('device_id');
    if (storedDeviceId) {
      return storedDeviceId;
    }

    // Generate a new device ID
    let deviceId: string;

    try {
      // Try to get a unique identifier based on the platform
      if (Platform.OS === 'web') {
        // For web, create a fingerprint based on browser information
        deviceId = await this.generateWebDeviceId();
      } else {
        // For React Native, use native methods
        deviceId = await this.generateNativeDeviceId();
      }
    } catch (error) {
      // Fallback to a random ID
      deviceId = `device-${Math.random().toString(36).substring(2, 15)}`;
      console.warn("Using fallback device ID generation:", error);
    }

    // Store the device ID for future use
    await AsyncStorage.setItem('device_id', deviceId);
    return deviceId;
  }

  /**
   * Generate a device ID for web platforms
   */
  private static async generateWebDeviceId(): Promise<string> {
    const nav = window.navigator;
    const screen = window.screen;
    
    // Collect various browser/device properties
    const components = [
      nav.userAgent,
      nav.language,
      screen.colorDepth,
      `${screen.width}x${screen.height}`,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      !!window.indexedDB
    ];
    
    // Add canvas fingerprint if possible
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw some text with specific styling
        canvas.width = 200;
        canvas.height = 50;
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('CradleIntro-FP', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('CradleIntro-FP', 4, 17);
        
        // Add the canvas data to the fingerprint
        components.push(canvas.toDataURL());
      }
    } catch (e) {
      // Canvas fingerprinting failed, continue without it
    }
    
    // Create a fingerprint from all components
    const fingerprint = components.join('###');
    return `web-${this.hashString(fingerprint)}`;
  }

  /**
   * Generate a device ID for native platforms
   */
  private static async generateNativeDeviceId(): Promise<string> {
    try {
      // Get screen dimensions and other available info
      const { width, height, scale, fontScale } = Dimensions.get('window');
      
      // Collect various device identifiers
      const components = [
        Platform.OS,
        Platform.Version,
        String(width),
        String(height),
        String(scale),
        String(fontScale),

        new Date().getTimezoneOffset().toString()
      ];
      
      // Try to get additional identifiers if available based on platform
      if (Platform.OS === 'ios') {
        try {
          // iOS-specific identifiers if needed
          // This uses what's available in React Native core
          if (Platform.constants?.systemName) components.push(Platform.constants.systemName);
          if (Platform.constants?.osVersion) components.push(Platform.constants.osVersion);
        } catch (e) {
          console.warn('Error getting iOS device info:', e);
        }
      } else if (Platform.OS === 'android') {
        try {
          // Android-specific identifiers if needed
          if (Platform.constants?.Release) components.push(Platform.constants.Release);
          if (Platform.constants?.Serial) components.push(Platform.constants.Serial);
        } catch (e) {
          console.warn('Error getting Android device info:', e);
        }
      }

      // Check for any previously stored legacy device ID (from when DeviceInfo was used)
      const legacyDeviceId = await AsyncStorage.getItem('legacy_device_id');
      if (legacyDeviceId) {
        components.push(legacyDeviceId);
      }
      
      // Create a device ID from the components
      return `native-${this.hashString(components.join('###'))}`;
    } catch (error) {
      console.error("Error generating native device ID:", error);
      throw error;
    }
  }

  /**
   * Create a hash string from input text
   */
  private static hashString(text: string): string {
    let hash = 5381;
    let i = text.length;

    while (i) {
      hash = (hash * 33) ^ text.charCodeAt(--i);
    }

    // Convert to a positive 32-bit integer and then to a hex string
    return (hash >>> 0).toString(16);
  }
}
