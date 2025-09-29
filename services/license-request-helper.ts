import axios from 'axios';

// API base URL
const API_BASE_URL = 'https://cradleintro.top/api/license';

// License verification response interface
export interface LicenseVerifyResponse {
  success: boolean;
  message?: string;
  error?: string;
  device_id?: string;
  license_info?: {
    id: number;
    code: string;
    plan_id: string;
    created_at: number;
    expires_at: number;
    is_active: boolean;
    devices: string;
    created_date: string;
    expiry_date: string;
    device_count: number;
    is_expired: boolean;
  };
}

/**
 * Helper for making license API requests
 */
export class LicenseRequestHelper {
  // API endpoint URLs
  private static readonly API_BASE_URL = 'https://cradleintro.top/api/v1';
  private static readonly LICENSE_VERIFY_URL = `${LicenseRequestHelper.API_BASE_URL}/license/verify`;
  
  /**
   * Verify a license key with the server
   * 
   * @param licenseKey The license key to verify
   * @param deviceId The device ID to associate with the license
   * @returns The verification response
   */
  public static async verifyLicense(licenseKey: string, deviceId: string): Promise<any> {
    try {
      const response = await fetch(this.LICENSE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          license_key: licenseKey,
          device_id: deviceId
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `验证失败，状态: ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error('License API error:', error);
      throw error;
    }
  }
  
  /**
   * Add license headers to any API request
   * 
   * @param headers The existing headers object
   * @param licenseKey The license key
   * @param deviceId The device ID
   * @returns The headers object with license headers added
   */
  public static addLicenseHeaders(
    headers: Record<string, string>,
    licenseKey: string,
    deviceId: string
  ): Record<string, string> {
    return {
      ...headers,
      'X-License-Key': licenseKey,
      'X-Device-ID': deviceId
    };
  }
  
  /**
   * Check if license verification is available
   * (Used to verify the API server is reachable)
   * 
   * @returns True if the license service is available
   */
  public static async checkServiceAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.success === true;
      }
      
      return false;
    } catch (error) {
      console.warn('License service unavailable:', error);
      return false;
    }
  }
}
