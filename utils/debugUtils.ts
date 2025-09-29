/**
 * Debug utilities for development
 */

/**
 * Safely logs a JSON object with proper formatting and depth limits
 * @param label Label for the log entry
 * @param data Data to log
 * @param options Additional options
 */
export function safeJsonLog(
  label: string, 
  data: any, 
  options: { 
    showFullObject?: boolean,
    maxDepth?: number,
    showKeys?: boolean 
  } = {}
) {
  const { showFullObject = false, maxDepth = 1, showKeys = true } = options;
  
  try {
    // Always log object keys at minimum
    if (data && typeof data === 'object') {
      console.log(
        `[${label}] Object keys: ${Object.keys(data).join(', ')}`
      );
      
      // If we want to show the full structure
      if (showFullObject) {
        const stringified = JSON.stringify(
          data, 
          (key, value) => {
            // Limit string length
            if (typeof value === 'string' && value.length > 100) {
              return value.substring(0, 97) + '...';
            }
            return value;
          },
          2
        );
        
        if (stringified.length > 1000) {
          console.log(`[${label}] Data preview (truncated): ${stringified.substring(0, 1000)}...`);
        } else {
          console.log(`[${label}] Data: ${stringified}`);
        }
      }
      
      // Log data size
      console.log(
        `[${label}] Data size: ${JSON.stringify(data).length} characters`
      );
    } else {
      console.log(`[${label}] Data: ${data}`);
    }
  } catch (error) {
    console.error(`[${label}] Error logging data:`, error);
  }
}

/**
 * Checks and logs the validity of a character object
 * @param label Label for the log entry
 * @param character Character object to check
 */
export function checkCharacterValidity(label: string, character: any) {
  try {
    if (!character) {
      console.error(`[${label}] Character is null or undefined`);
      return false;
    }
    
    console.log(`[${label}] Character check:`, {
      id: character.id,
      name: character.name,
      hasAvatar: !!character.avatar,
      hasDescription: !!character.description,
      hasJsonData: !!character.jsonData,
      jsonDataLength: character.jsonData?.length || 0
    });
    
    if (!character.id) {
      console.error(`[${label}] Character missing ID`);
      return false;
    }
    
    if (!character.jsonData) {
      console.warn(`[${label}] Character missing jsonData`);
    } else {
      try {
        const parsed = JSON.parse(character.jsonData);
        console.log(`[${label}] JSON valid with keys:`, Object.keys(parsed).join(', '));
        
        // Check for essential components
        const hasRoleCard = !!parsed.roleCard;
        const hasWorldBook = !!parsed.worldBook;
        
        if (!hasRoleCard || !hasWorldBook) {
          console.warn(`[${label}] Character JSON missing essential components:`, {
            hasRoleCard,
            hasWorldBook
          });
          return false;
        }
        
        return true;
      } catch (error) {
        console.error(`[${label}] Failed to parse character jsonData:`, error);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`[${label}] Error checking character:`, error);
    return false;
  }
}
