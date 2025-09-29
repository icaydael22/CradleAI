import React from 'react';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NodeSTManager } from '@/utils/NodeSTManager';
import { Character } from '@/shared/types';

// 标记导入状态的 key
const IMPORTED_FLAG_KEY = 'defaultCharacterImported_v2';
// 默认角色ID常量
export const DEFAULT_CHARACTER_ID = 'default-character-v2';

// 工具函数：将静态资源图片保存到 Filesystem 并返回本地 URI
async function saveAssetToFilesystem(assetModule: any, filename: string): Promise<string> {
  try {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();
    
    if (!asset.localUri) {
      throw new Error(`Failed to download asset for ${filename}`);
    }
    
    const destPath = FileSystem.documentDirectory + filename;
    const info = await FileSystem.getInfoAsync(destPath);
    if (!info.exists) {
      await FileSystem.copyAsync({ from: asset.localUri, to: destPath });
      console.log(`[DefaultCharacterImporter] Asset copied to ${destPath}`);
    } else {
      console.log(`[DefaultCharacterImporter] Asset already exists at ${destPath}`);
    }
    return destPath;
  } catch (error) {
    console.error(`[DefaultCharacterImporter] Error saving asset ${filename}:`, error);
    throw error;
  }
}

// 工具函数：读取静态 JSON 文件
async function loadStaticJson(assetModule: any): Promise<any> {
  try {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();
    
    if (!asset.localUri) {
      throw new Error('Failed to download JSON asset');
    }
    
    const content = await FileSystem.readAsStringAsync(asset.localUri);
    console.log(`[DefaultCharacterImporter] JSON loaded, length: ${content.length}`);
    return JSON.parse(content);
  } catch (error) {
    console.error('[DefaultCharacterImporter] Error loading JSON:', error);
    throw error;
  }
}

// 主导入函数（仅导入一次）- 修改返回值类型，返回导入的角色ID和角色对象
export async function importDefaultCharactersIfNeeded(
  addCharacter: (c: Character) => Promise<any>,
  addConversation: (c: { id: string; title: string }) => Promise<any>,
  setCharacterBackgroundImage: (id: string, uri: string) => Promise<any>,
  setCharacterAvatar: (id: string, uri: string) => Promise<any>
): Promise<{imported: boolean, characterId: string | null, character?: Character}> {
  // 检查是否已导入
  try {
    const imported = await AsyncStorage.getItem(IMPORTED_FLAG_KEY);
    if (imported === '1') {
      console.log('[DefaultCharacterImporter] Characters already imported, skipping');
      
      try {
        const charactersPath = FileSystem.documentDirectory + 'characters.json';
        const fileInfo = await FileSystem.getInfoAsync(charactersPath);
        
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(charactersPath);
          const characters = JSON.parse(content);
          
          const defaultChar = Array.isArray(characters) && 
            characters.find((char: any) => char.id === DEFAULT_CHARACTER_ID);
          
          if (defaultChar) {
            return {imported: false, characterId: defaultChar.id, character: defaultChar};
          }
        }
      } catch (e) {
        console.warn('[DefaultCharacterImporter] Error checking default character:', e);
      }
      
      return {imported: false, characterId: null};
    }

    console.log('[DefaultCharacterImporter] Beginning import of default characters...');

    const characterJsonPath = require('@/assets/default_characters/character1.json');
    console.log('[DefaultCharacterImporter] Character JSON required:', characterJsonPath);
    
    const characterJson = characterJsonPath;

    console.log('[DefaultCharacterImporter] Saving avatar image...');
    const avatarUri = await saveAssetToFilesystem(
      require('@/assets/default_characters/character1-avatar.png'),
      'character1-avatar.png'
    );
    
    console.log('[DefaultCharacterImporter] Saving background image...');
    const bgUri = await saveAssetToFilesystem(
      require('@/assets/default_characters/character1-bg.png'),
      'character1-bg.png'
    );

    const character: Character = {
      ...characterJson,
      id: DEFAULT_CHARACTER_ID || characterJson.id || `default-${Date.now()}`,
      avatar: avatarUri,
      backgroundImage: bgUri,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      jsonData: JSON.stringify(characterJson),
    };

    console.log(`[DefaultCharacterImporter] Character object created: ${character.name} (${character.id})`);

    await addCharacter(character);
    console.log('[DefaultCharacterImporter] Character added to context');
    
    await addConversation({ id: character.id, title: character.name });
    console.log('[DefaultCharacterImporter] Conversation added to context');

    await setCharacterBackgroundImage(character.id, bgUri);
    await setCharacterAvatar(character.id, avatarUri);
    console.log('[DefaultCharacterImporter] Character images set');

    console.log('[DefaultCharacterImporter] Initializing NodeST...');
    await NodeSTManager.processChatMessage({
      userMessage: "你好！",
      conversationId: character.id,
      status: "新建角色",
      apiKey: '',
      character,
    });
    console.log('[DefaultCharacterImporter] NodeST initialized');

    await AsyncStorage.setItem(IMPORTED_FLAG_KEY, '1');
    console.log('[DefaultCharacterImporter] Default character import completed successfully');
    
    return {imported: true, characterId: character.id, character: character};
  } catch (e) {
    console.warn('[DefaultCharacterImporter] 导入流程异常:', e);
    throw e;
  }
}

// 用于开发调试：重置导入标记
export async function resetDefaultCharacterImported() {
  try {
    await AsyncStorage.removeItem(IMPORTED_FLAG_KEY);
    console.log('[DefaultCharacterImporter] Import flag reset successfully');
    return true;
  } catch (error) {
    console.error('[DefaultCharacterImporter] Error resetting import flag:', error);
    return false;
  }
}

export default null;
