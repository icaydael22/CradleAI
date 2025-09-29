import AsyncStorage from '@react-native-async-storage/async-storage';
import { Character } from '@/shared/types';
import { CharacterStorageService } from '@/services/CharacterStorageService';

/**
 * 根据ID加载角色信息的工具类
 * 现在使用新的CharacterStorageService进行数据访问，提供向后兼容的备选方案
 */
export class CharacterLoader {
  /**
   * 根据ID加载单个角色
   * @param characterId 角色ID
   * @returns 角色对象，如果未找到则返回null
   */
  static async loadCharacterById(characterId: string): Promise<Character | null> {
    try {
      console.log(`【角色加载器】尝试加载角色 ID: ${characterId}`);
      
      // 首先尝试使用新的CharacterStorageService
      try {
        const storageService = CharacterStorageService.getInstance();
        const character = await storageService.getCharacter(characterId);
        if (character) {
          console.log(`【角色加载器】从CharacterStorageService找到角色: ${character.name}`);
          return character;
        }
      } catch (storageError) {
        console.error('【角色加载器】从CharacterStorageService加载角色失败:', storageError);
      }
      
      // 备选方案：从FileSystem加载（兼容旧格式）
      try {
        const FileSystem = require('expo-file-system');
        const charactersStr = await FileSystem.readAsStringAsync(
          FileSystem.documentDirectory + 'characters.json',
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(() => '[]');
        
        if (charactersStr && charactersStr !== '[]') {
          const allCharacters: Character[] = JSON.parse(charactersStr);
          console.log(`【角色加载器】从FileSystem加载了${allCharacters.length}个角色`);
          
          // 查找指定ID的角色
          const character = allCharacters.find(c => c.id === characterId);
          if (character) {
            console.log(`【角色加载器】在FileSystem中找到角色: ${character.name}`);
            return character;
          }
        }
      } catch (fsError) {
        console.error('【角色加载器】从FileSystem加载角色失败:', fsError);
      }
      
      // 从AsyncStorage的user_characters键加载
      try {
        const charactersString = await AsyncStorage.getItem('user_characters');
        if (charactersString) {
          const characters: Character[] = JSON.parse(charactersString);
          const character = characters.find(c => c.id === characterId);
          if (character) {
            console.log(`【角色加载器】在AsyncStorage的user_characters中找到角色: ${character.name}`);
            return character;
          }
        }
      } catch (asyncError) {
        console.error('【角色加载器】从AsyncStorage user_characters加载角色失败:', asyncError);
      }
      
      // 从AsyncStorage的characters键加载
      try {
        const plainCharactersString = await AsyncStorage.getItem('characters');
        if (plainCharactersString) {
          const characters: Character[] = JSON.parse(plainCharactersString);
          const character = characters.find(c => c.id === characterId);
          if (character) {
            console.log(`【角色加载器】在AsyncStorage的characters中找到角色: ${character.name}`);
            return character;
          }
        }
      } catch (plainError) {
        console.error('【角色加载器】从AsyncStorage characters加载角色失败:', plainError);
      }
      
      // 最后尝试从角色专属键加载
      try {
        const characterData = await AsyncStorage.getItem(`character_${characterId}`);
        if (characterData) {
          const character = JSON.parse(characterData);
          console.log(`【角色加载器】从专属键加载到角色: ${character.name}`);
          return character;
        }
      } catch (characterError) {
        console.error(`【角色加载器】从专属键加载角色 ${characterId} 失败:`, characterError);
      }
      
      console.warn(`【角色加载器】未找到角色 ID: ${characterId}`);
      return null;
    } catch (error) {
      console.error(`【角色加载器】加载角色失败:`, error);
      return null;
    }
  }

  /**
   * 根据ID列表加载多个角色
   * @param characterIds 角色ID数组
   * @returns 角色对象数组
   */
  static async loadCharactersByIds(characterIds: string[]): Promise<Character[]> {
    try {
      console.log(`【角色加载器】尝试加载角色列表，数量: ${characterIds.length}，IDs: ${JSON.stringify(characterIds)}`);
      
      // 首先尝试使用新的CharacterStorageService
      try {
        const storageService = CharacterStorageService.getInstance();
        const characters = await storageService.getCharacters(characterIds);
        if (characters.length === characterIds.length) {
          console.log(`【角色加载器】从CharacterStorageService加载了所有${characters.length}个角色`);
          return characters;
        } else if (characters.length > 0) {
          console.log(`【角色加载器】从CharacterStorageService加载了${characters.length}个角色，部分角色未找到`);
          return characters;
        }
      } catch (storageError) {
        console.error('【角色加载器】从CharacterStorageService加载角色失败:', storageError);
      }
      
      // 备选方案：使用旧的加载方式
      const characters: Character[] = [];
      
      // 首先尝试从FileSystem加载所有角色
      let allCharacters: Character[] = [];
      let foundInFileSystem = false;
      
      try {
        const FileSystem = require('expo-file-system');
        const charactersStr = await FileSystem.readAsStringAsync(
          FileSystem.documentDirectory + 'characters.json',
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(() => '[]');
        
        if (charactersStr && charactersStr !== '[]') {
          allCharacters = JSON.parse(charactersStr);
          console.log(`【角色加载器】从FileSystem加载了${allCharacters.length}个角色`);
          foundInFileSystem = true;
          
          // 过滤出需要的角色
          const foundCharacters = allCharacters.filter(c => characterIds.includes(c.id));
          if (foundCharacters.length === characterIds.length) {
            console.log(`【角色加载器】在FileSystem找到所有${foundCharacters.length}个所需角色`);
            return foundCharacters;
          }
          
          // 如果找到部分角色，先添加到结果中
          if (foundCharacters.length > 0) {
            characters.push(...foundCharacters);
            console.log(`【角色加载器】在FileSystem找到了${foundCharacters.length}个角色，继续搜索其余角色`);
            // 更新待查找的角色ID
            characterIds = characterIds.filter(id => !foundCharacters.some(c => c.id === id));
          }
        }
      } catch (fsError) {
        console.error('【角色加载器】从FileSystem加载角色失败:', fsError);
      }
      
      // 如果还有未找到的角色，尝试从AsyncStorage的user_characters键加载
      if (characterIds.length > 0) {
        try {
          const charactersString = await AsyncStorage.getItem('user_characters');
          if (charactersString) {
            const userCharacters: Character[] = JSON.parse(charactersString);
            console.log(`【角色加载器】从AsyncStorage的user_characters加载了${userCharacters.length}个角色`);
            
            const foundCharacters = userCharacters.filter(c => characterIds.includes(c.id));
            if (foundCharacters.length > 0) {
              characters.push(...foundCharacters);
              console.log(`【角色加载器】在user_characters中找到${foundCharacters.length}个角色`);
              // 更新待查找的角色ID
              characterIds = characterIds.filter(id => !foundCharacters.some(c => c.id === id));
            }
          }
        } catch (asyncError) {
          console.error('【角色加载器】从AsyncStorage user_characters加载角色失败:', asyncError);
        }
      }
      
      // 如果还有未找到的角色，尝试从AsyncStorage的characters键加载
      if (characterIds.length > 0) {
        try {
          const plainCharactersString = await AsyncStorage.getItem('characters');
          if (plainCharactersString) {
            const plainCharacters: Character[] = JSON.parse(plainCharactersString);
            console.log(`【角色加载器】从AsyncStorage的characters加载了${plainCharacters.length}个角色`);
            
            const foundCharacters = plainCharacters.filter(c => characterIds.includes(c.id));
            if (foundCharacters.length > 0) {
              characters.push(...foundCharacters);
              console.log(`【角色加载器】在characters中找到${foundCharacters.length}个角色`);
              // 更新待查找的角色ID
              characterIds = characterIds.filter(id => !foundCharacters.some(c => c.id === id));
            }
          }
        } catch (plainError) {
          console.error('【角色加载器】从AsyncStorage characters加载角色失败:', plainError);
        }
      }
      
      // 如果还有未找到的角色，直接尝试从专属键逐个加载
      if (characterIds.length > 0) {
        console.log(`【角色加载器】尝试从专属键逐个加载剩余的${characterIds.length}个角色`);
        
        for (const id of characterIds) {
          try {
            const characterData = await AsyncStorage.getItem(`character_${id}`);
            if (characterData) {
              const character = JSON.parse(characterData);
              characters.push(character);
              console.log(`【角色加载器】从专属键加载到角色: ${character.name}`);
            } else {
              console.warn(`【角色加载器】未找到角色 ID: ${id}`);
            }
          } catch (characterError) {
            console.error(`【角色加载器】从专属键加载角色 ${id} 失败:`, characterError);
          }
        }
      }
      
      console.log(`【角色加载器】最终加载到 ${characters.length} 个角色`);
      
      // Report any characters that couldn't be loaded
      const loadedIds = new Set(characters.map(c => c.id));
      const missingIds = characterIds.filter(id => !loadedIds.has(id));
      if (missingIds.length > 0) {
        console.warn(`【角色加载器】以下 ${missingIds.length} 个角色未能加载: ${JSON.stringify(missingIds)}`);
      }
      
      return characters;
    } catch (error) {
      console.error(`【角色加载器】批量加载角色失败:`, error);
      return [];
    }
  }

  /**
   * 加载所有角色
   * @returns 所有可用角色的数组
   */
  static async loadAllCharacters(): Promise<Character[]> {
    try {
      console.log(`【角色加载器】尝试加载所有角色`);
      
      // 首先尝试使用新的CharacterStorageService
      try {
        const storageService = CharacterStorageService.getInstance();
        const characters = await storageService.getAllCharacters();
        if (characters.length > 0) {
          console.log(`【角色加载器】从CharacterStorageService加载了${characters.length}个角色`);
          return characters;
        }
      } catch (storageError) {
        console.error('【角色加载器】从CharacterStorageService加载角色失败:', storageError);
      }
      
      // 备选方案：使用旧的加载方式
      let characters: Character[] = [];
      let foundSource = '';
      
      // 首先尝试从FileSystem加载
      try {
        const FileSystem = require('expo-file-system');
        const charactersStr = await FileSystem.readAsStringAsync(
          FileSystem.documentDirectory + 'characters.json',
          { encoding: FileSystem.EncodingType.UTF8 }
        ).catch(() => '[]');
        
        if (charactersStr && charactersStr !== '[]') {
          characters = JSON.parse(charactersStr);
          foundSource = 'FileSystem';
          console.log(`【角色加载器】从FileSystem加载了${characters.length}个角色`);
          if (characters.length > 0) {
            return characters;
          }
        }
      } catch (fsError) {
        console.error('【角色加载器】从FileSystem加载角色失败:', fsError);
      }
      
      // 尝试从AsyncStorage的user_characters键加载
      if (characters.length === 0) {
        try {
          const charactersString = await AsyncStorage.getItem('user_characters');
          if (charactersString) {
            characters = JSON.parse(charactersString);
            foundSource = 'AsyncStorage user_characters';
            console.log(`【角色加载器】从AsyncStorage的user_characters加载了${characters.length}个角色`);
            if (characters.length > 0) {
              return characters;
            }
          }
        } catch (asyncError) {
          console.error('【角色加载器】从AsyncStorage user_characters加载角色失败:', asyncError);
        }
      }
      
      // 从AsyncStorage的characters键加载
      if (characters.length === 0) {
        try {
          const plainCharactersString = await AsyncStorage.getItem('characters');
          if (plainCharactersString) {
            characters = JSON.parse(plainCharactersString);
            foundSource = 'AsyncStorage characters';
            console.log(`【角色加载器】从AsyncStorage的characters加载了${characters.length}个角色`);
            if (characters.length > 0) {
              return characters;
            }
          }
        } catch (plainError) {
          console.error('【角色加载器】从AsyncStorage characters加载角色失败:', plainError);
        }
      }
      
      if (characters.length === 0) {
        console.warn(`【角色加载器】未能从任何源加载角色`);
      } else {
        console.log(`【角色加载器】最终从${foundSource}获取到 ${characters.length} 个角色`);
      }
      
      return characters;
    } catch (error) {
      console.error(`【角色加载器】加载所有角色失败:`, error);
      return [];
    }
  }
}
