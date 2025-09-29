import { VNDBCharacter } from '@/src/services/vndb/types';

/**
 * Formats VNDB character traits grouped by their category
 * 
 * @param character - VNDB character data
 * @returns Formatted character information with traits grouped by category
 */
export function formatVNDBCharacter(character: VNDBCharacter): string {
  if (!character) return 'No character data available';
  
  // Begin with basic information
  let formattedInfo = '';
  
  formattedInfo += `角色名称：${character.name || 'Unknown'}\n`;
  formattedInfo += `角色年龄：${character.age !== null && character.age !== undefined ? character.age : 'Unknown'}\n`;
  formattedInfo += `角色描述：${character.description || 'No description available'}\n`;

  // Process traits if available
  if (character.traits && character.traits.length > 0) {
    formattedInfo += '特征：\n';
    
    // Group traits by their category (group_name)
    const traitsByCategory: Record<string, string[]> = {};
    
    character.traits.forEach(trait => {
      if (!trait.group_name || !trait.name) return;
      
      if (!traitsByCategory[trait.group_name]) {
        traitsByCategory[trait.group_name] = [];
      }
      
      traitsByCategory[trait.group_name].push(trait.name);
    });
    
    // Add each category and its traits
    Object.entries(traitsByCategory).forEach(([category, traits]) => {
      formattedInfo += `  -${category}：${traits.join(', ')}\n`;
    });
  } else {
    formattedInfo += '特征：无特征数据\n';
  }
  
  return formattedInfo;
}

/**
 * Process multiple VNDB characters and format them
 * 
 * @param characters - Array of VNDB character objects
 * @returns Array of formatted character information strings
 */
export function formatVNDBCharacters(characters: VNDBCharacter[]): string[] {
  return characters.map(formatVNDBCharacter);
}

/**
 * Process a VNDB API response and output formatted character information
 * 
 * @param response - The complete VNDB API response
 * @returns Formatted character information for all characters in the response
 */
export function processVNDBResponse(response: any): string {
  try {
    if (!response || !response.results || !Array.isArray(response.results)) {
      return 'No valid character data found in the response';
    }
    
    // Format each character and join them with dividers
    return formatVNDBCharacters(response.results)
      .join('\n\n---\n\n');
  } catch (error) {
    return `Error processing VNDB response: ${error instanceof Error ? error.message : String(error)}`;
  }
}
