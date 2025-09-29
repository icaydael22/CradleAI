import { VNDBCharacter } from '@/src/services/vndb/types';

/**
 * Formats VNDB character data in a way that's optimized for LLM consumption
 * by highlighting the most important aspects and removing unnecessary details
 * 
 * @param character - VNDB character data
 * @returns Formatted character information
 */
export function formatVNDBCharacterForLLM(character: VNDBCharacter): string {
  if (!character) return '';
  
  const parts = [];
  
  // Basic information
  parts.push(`### ${character.name || 'Unknown Character'}`);
  
  if (character.original) {
    parts.push(`原名: ${character.original}`);
  }
  
  if (character.age !== null && character.age !== undefined) {
    parts.push(`年龄: ${character.age}`);
  }
  
  // Physical attributes in a concise section
  const physicalAttributes = [];
  if (character.sex) {
    const gender = character.sex[0] === 'm' ? '男性' : 
                   character.sex[0] === 'f' ? '女性' : 
                   character.sex[0] === 'b' ? '双性' : '未知';
    physicalAttributes.push(`性别: ${gender}`);
  }
  
  if (character.height) physicalAttributes.push(`身高: ${character.height}cm`);
  if (character.weight) physicalAttributes.push(`体重: ${character.weight}kg`);
  
  if (physicalAttributes.length > 0) {
    parts.push(`**物理特征:** ${physicalAttributes.join(' | ')}`);
  }
  
  // Description - most important for character generation
  if (character.description) {
    // Clean up description by removing markup
    const cleanDescription = character.description
      .replace(/\[.*?\]/g, '') // Remove square bracket markup
      .replace(/\r\n|\r|\n/g, ' ') // Replace line breaks with spaces
      .trim();
    
    parts.push(`**描述:** ${cleanDescription}`);
  }
  
  // Traits organized by category
  if (character.traits && character.traits.length > 0) {
    const traitsByCategory: Record<string, string[]> = {};
    
    character.traits.forEach(trait => {
      if (!trait.group_name || !trait.name) return;
      
      if (!traitsByCategory[trait.group_name]) {
        traitsByCategory[trait.group_name] = [];
      }
      
      traitsByCategory[trait.group_name].push(trait.name);
    });
    
    if (Object.keys(traitsByCategory).length > 0) {
      parts.push('**特征:**');
      
      Object.entries(traitsByCategory).forEach(([category, traits]) => {
        parts.push(`- ${category}: ${traits.join(', ')}`);
      });
    }
  }
  
  return parts.join('\n');
}

/**
 * Format multiple VNDB characters in a compact way for LLM consumption
 * 
 * @param characters - Array of VNDB character objects
 * @returns Formatted string with character information
 */
export function formatVNDBCharactersForLLM(characters: VNDBCharacter[] | undefined): string {
  if (!characters || characters.length === 0) {
    return "未找到任何角色参考信息。";
  }
  
  return characters.map(formatVNDBCharacterForLLM).join('\n\n');
}
