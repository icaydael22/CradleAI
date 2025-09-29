/**
 * SVG文件系统管理Hook
 * 专门用于WebView文件系统加载和热更新
 * 
 * 主要特性：
 * 1. SVG文件保存到固定路径供WebView访问
 * 2. 热更新机制，修改文件后自动刷新WebView
 * 3. 基于Fantasy Map Generator的地图元素修改方法
 * 4. 文件版本管理和缓存机制
 */

import { useState, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system';

export interface SvgModificationOptions {
  // 海洋相关
  oceanColor?: string;
  oceanPatternVisible?: boolean;
  
  // 湖泊相关
  freshwaterColor?: string;
  saltColor?: string;
  lakesVisible?: boolean;
  
  // 陆地相关
  landColor?: string;
  
  // 河流相关
  riverColor?: string;
  riversVisible?: boolean;
  
  // 边界相关
  stateBordersVisible?: boolean;
  provinceBordersVisible?: boolean;
  
  // 标签相关
  burgLabelsVisible?: boolean;
  stateLabelsVisible?: boolean;
  labelColor?: string;
  
  // 图标相关
  burgIconsVisible?: boolean;
  anchorsVisible?: boolean;
  
  // 自定义修改
  customReplacements?: Array<{
    search: string | RegExp;
    replace: string;
    description?: string;
  }>;
}

export const useSvgFileSystem = () => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [svgFilePath, setSvgFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [modificationHistory, setModificationHistory] = useState<string[]>([]);
  
  // 存储原始SVG内容
  const originalSvgRef = useRef<string | null>(null);
  
  // 固定的文件路径
  const SVG_FILE_NAME = 'current_map.svg';
  const getFilePath = () => `${FileSystem.documentDirectory}${SVG_FILE_NAME}`;
  
  /**
   * 从外部文件导入SVG到文件系统
   */
  const importSvgFromFile = useCallback(async (fileUri: string) => {
    setIsLoading(true);
    
    try {
      // 处理Android content URI
      let content: string;
      
      if (fileUri.startsWith('content://')) {
        const tempFileName = `temp_${Date.now()}.svg`;
        const tempUri = `${FileSystem.cacheDirectory}${tempFileName}`;
        
        await FileSystem.copyAsync({ from: fileUri, to: tempUri });
        content = await FileSystem.readAsStringAsync(tempUri);
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      } else {
        content = await FileSystem.readAsStringAsync(fileUri);
      }
      
      // 确保目录存在
      const docDir = FileSystem.documentDirectory;
      if (docDir) {
        const dirInfo = await FileSystem.getInfoAsync(docDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
        }
      }
      
      // 保存到固定路径
      const filePath = getFilePath();
      await FileSystem.writeAsStringAsync(filePath, content);
      
      // 更新状态
      originalSvgRef.current = content;
      setSvgContent(content);
      setSvgFilePath(filePath);
      setModificationHistory(['导入原始文件']);
      
      console.log('SVG文件已导入到文件系统:', filePath);
      return filePath;
    } catch (error) {
      console.error('导入SVG文件失败:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * 修改SVG内容并触发热更新
   */
  const modifySvg = useCallback(async (
    modifications: SvgModificationOptions,
    description?: string
  ) => {
    if (!svgContent || !svgFilePath) {
      throw new Error('没有加载的SVG文件');
    }
    
    setIsLoading(true);
    
    try {
      let modifiedContent = svgContent;
      const changes: string[] = [];
      
      // 海洋修改
      if (modifications.oceanColor) {
        modifiedContent = modifiedContent.replace(
          /#466eab/g,
          modifications.oceanColor
        );
        modifiedContent = modifiedContent.replace(
          /fill="rgb\(70,\s*110,\s*171\)"/g,
          `fill="${modifications.oceanColor}"`
        );
        changes.push(`海洋颜色: ${modifications.oceanColor}`);
      }
      
      // 湖泊修改
      if (modifications.freshwaterColor) {
        modifiedContent = modifiedContent.replace(
          /#a6c1fd/g,
          modifications.freshwaterColor
        );
        changes.push(`淡水颜色: ${modifications.freshwaterColor}`);
      }
      
      if (modifications.saltColor) {
        modifiedContent = modifiedContent.replace(
          /#409b8a/g,
          modifications.saltColor
        );
        changes.push(`盐水颜色: ${modifications.saltColor}`);
      }
      
      // 陆地修改
      if (modifications.landColor) {
        modifiedContent = modifiedContent.replace(
          /#eef6fb/g,
          modifications.landColor
        );
        changes.push(`陆地颜色: ${modifications.landColor}`);
      }
      
      // 河流修改
      if (modifications.riverColor) {
        modifiedContent = modifiedContent.replace(
          /#5d97bb/g,
          modifications.riverColor
        );
        changes.push(`河流颜色: ${modifications.riverColor}`);
      }
      
      // 可见性修改
      if (modifications.lakesVisible !== undefined) {
        const display = modifications.lakesVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="lakes"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`湖泊可见性: ${modifications.lakesVisible ? '显示' : '隐藏'}`);
      }
      
      if (modifications.riversVisible !== undefined) {
        const display = modifications.riversVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="rivers"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`河流可见性: ${modifications.riversVisible ? '显示' : '隐藏'}`);
      }
      
      if (modifications.stateBordersVisible !== undefined) {
        const display = modifications.stateBordersVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="stateBorders"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`国家边界: ${modifications.stateBordersVisible ? '显示' : '隐藏'}`);
      }
      
      if (modifications.provinceBordersVisible !== undefined) {
        const display = modifications.provinceBordersVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="provinceBorders"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`省份边界: ${modifications.provinceBordersVisible ? '显示' : '隐藏'}`);
      }
      
      if (modifications.burgLabelsVisible !== undefined) {
        const display = modifications.burgLabelsVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="burgLabels"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`城镇标签: ${modifications.burgLabelsVisible ? '显示' : '隐藏'}`);
      }
      
      if (modifications.stateLabelsVisible !== undefined) {
        const display = modifications.stateLabelsVisible ? 'block' : 'none';
        modifiedContent = modifiedContent.replace(
          /(<g id="states"[^>]*style="[^"]*)(display:\s*[^;]*)(;[^"]*")/,
          `$1display:${display}$3`
        );
        changes.push(`国家标签: ${modifications.stateLabelsVisible ? '显示' : '隐藏'}`);
      }
      
      // 自定义替换
      if (modifications.customReplacements) {
        modifications.customReplacements.forEach(replacement => {
          const beforeLength = modifiedContent.length;
          modifiedContent = modifiedContent.replace(replacement.search, replacement.replace);
          const afterLength = modifiedContent.length;
          
          if (beforeLength !== afterLength) {
            changes.push(replacement.description || '自定义修改');
          }
        });
      }
      
      // 如果没有变化，直接返回
      if (changes.length === 0) {
        console.log('没有检测到SVG变化');
        return;
      }
      
      // 写入文件系统
      await FileSystem.writeAsStringAsync(svgFilePath, modifiedContent);
      
      // 更新状态
      setSvgContent(modifiedContent);
      setWebViewKey(prev => prev + 1); // 触发WebView重新加载
      
      // 记录修改历史
      const historyEntry = description || changes.join(', ');
      setModificationHistory(prev => [...prev, historyEntry]);
      
      console.log('SVG修改完成:', changes);
      return changes;
    } catch (error) {
      console.error('修改SVG失败:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [svgContent, svgFilePath]);
  
  /**
   * 重置SVG到原始状态
   */
  const resetSvg = useCallback(async () => {
    if (!originalSvgRef.current || !svgFilePath) {
      throw new Error('没有原始SVG数据');
    }
    
    try {
      const originalContent = originalSvgRef.current;
      await FileSystem.writeAsStringAsync(svgFilePath, originalContent);
      
      setSvgContent(originalContent);
      setWebViewKey(prev => prev + 1);
      setModificationHistory(['重置到原始状态']);
      
      console.log('SVG已重置到原始状态');
    } catch (error) {
      console.error('重置SVG失败:', error);
      throw error;
    }
  }, [svgFilePath]);
  
  /**
   * 获取当前文件信息
   */
  const getFileInfo = useCallback(async () => {
    if (!svgFilePath) return null;
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(svgFilePath);
      return {
        exists: fileInfo.exists,
        size: fileInfo.size,
        path: svgFilePath,
        modificationTime: fileInfo.modificationTime
      };
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  }, [svgFilePath]);
  
  /**
   * 清理资源
   */
  const clearSvg = useCallback(async () => {
    try {
      if (svgFilePath) {
        await FileSystem.deleteAsync(svgFilePath, { idempotent: true });
      }
      
      setSvgContent(null);
      setSvgFilePath(null);
      setModificationHistory([]);
      originalSvgRef.current = null;
      
      console.log('SVG资源已清理');
    } catch (error) {
      console.error('清理SVG资源失败:', error);
    }
  }, [svgFilePath]);
  
  return {
    // 状态
    svgContent,
    svgFilePath,
    isLoading,
    webViewKey,
    modificationHistory,
    
    // 基础操作
    importSvgFromFile,
    modifySvg,
    resetSvg,
    clearSvg,
    getFileInfo,
    
    // 工具方法
    hasFile: !!svgFilePath,
    fileSize: svgContent ? Math.round(svgContent.length / 1024) : 0,
  };
};


