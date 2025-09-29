/**
 * 文件系统工具函数
 * 
 * 提供与文件系统交互的实用函数。
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * 获取数据库文件路径
 * @param filename 文件名
 * @returns 完整文件路径
 */
export async function getDatabasePath(filename: string): Promise<string> {
  try {
    // 确保文件名不为空
    if (!filename) {
      throw new Error('文件名不能为空');
    }
    
    // 对于Android平台
    if (Platform.OS === 'android') {
      // 使用文档目录存储数据库
      const dirPath = `${FileSystem.documentDirectory}databases`;
      
      // 检查目录是否存在，如不存在则创建
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
        console.log(`[FileSystem] 已创建目录: ${dirPath}`);
      }
      
      return `${dirPath}/${filename}`;
    }
    
    // 对于iOS平台
    if (Platform.OS === 'ios') {
      // iOS可直接使用文档目录
      return `${FileSystem.documentDirectory}${filename}`;
    }
    
    // 对于Web平台（仅作为回退选项）
    return filename;
  } catch (error) {
    console.error('[FileSystem] 获取数据库路径失败:', error);
    // 提供一个默认的回退路径
    return filename;
  }
}

/**
 * 检查文件是否存在
 * @param path 文件路径
 * @returns 是否存在
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(path);
    return fileInfo.exists;
  } catch (error) {
    console.error(`[FileSystem] 检查文件 ${path} 是否存在时出错:`, error);
    return false;
  }
}

/**
 * 删除文件
 * @param path 文件路径
 * @returns 是否成功
 */
export async function deleteFile(path: string): Promise<boolean> {
  try {
    if (await fileExists(path)) {
      await FileSystem.deleteAsync(path);
      console.log(`[FileSystem] 已删除文件: ${path}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[FileSystem] 删除文件 ${path} 时出错:`, error);
    return false;
  }
}

/**
 * 读取文本文件
 * @param path 文件路径
 * @returns 文件内容
 */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    if (await fileExists(path)) {
      const content = await FileSystem.readAsStringAsync(path);
      return content;
    }
    return null;
  } catch (error) {
    console.error(`[FileSystem] 读取文件 ${path} 时出错:`, error);
    return null;
  }
}

/**
 * 写入文本文件
 * @param path 文件路径
 * @param content 文件内容
 * @returns 是否成功
 */
export async function writeTextFile(path: string, content: string): Promise<boolean> {
  try {
    await FileSystem.writeAsStringAsync(path, content);
    console.log(`[FileSystem] 已写入文件: ${path}`);
    return true;
  } catch (error) {
    console.error(`[FileSystem] 写入文件 ${path} 时出错:`, error);
    return false;
  }
}
