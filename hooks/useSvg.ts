/**
 * SVG管理自定义Hook
 * 功能：SVG文件加载、修改、热更新
 * 
 * 主要特性：
 * 1. SVG文件导入与存储管理
 * 2. SVG元素动态修改（颜色、可见性、属性等）
 * 3. 热更新机制，修改后自动刷新画布
 * 4. 基于output.txt的地图结构理解，提供针对性的修改方法
 */

import { useState, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system';

// SVG元素修改类型定义
export interface SvgElementUpdate {
  // 元素选择器（基于output.txt的层级结构）
  selector: string;
  // 修改类型
  updateType: 'color' | 'visibility' | 'attribute' | 'style';
  // 修改值
  value: string | boolean;
  // 可选：属性名称（当updateType为'attribute'或'style'时）
  attributeName?: string;
}

// 预定义的地图图层修改操作（基于output.txt分析）
export interface MapLayerOperations {
  // 海洋图层操作
  ocean: {
    changeColor: (color: string) => void;
    togglePattern: (visible: boolean) => void;
  };
  // 湖泊图层操作
  lakes: {
    changeFreshwaterColor: (color: string) => void;
    changeSaltColor: (color: string) => void;
    toggleVisibility: (visible: boolean) => void;
  };
  // 陆地图层操作
  landmass: {
    changeColor: (color: string) => void;
    toggleMask: (enabled: boolean) => void;
  };
  // 河流图层操作
  rivers: {
    changeColor: (color: string) => void;
    changeWidth: (width: string) => void;
    toggleVisibility: (visible: boolean) => void;
  };
  // 国家/地区图层操作
  regions: {
    changeStateColor: (stateId: string, color: string) => void;
    toggleStateBorders: (visible: boolean) => void;
    toggleProvincesBorders: (visible: boolean) => void;
  };
  // 道路图层操作
  routes: {
    toggleRoads: (visible: boolean) => void;
    toggleTrails: (visible: boolean) => void;
    toggleSeaRoutes: (visible: boolean) => void;
    changeRoadColor: (color: string) => void;
  };
  // 标签图层操作
  labels: {
    toggleBurgLabels: (visible: boolean) => void;
    toggleStateLabels: (visible: boolean) => void;
    changeLabelColor: (color: string) => void;
  };
  // 图标图层操作
  icons: {
    toggleBurgIcons: (visible: boolean) => void;
    toggleAnchors: (visible: boolean) => void;
    changeIconSize: (size: string) => void;
  };
}

export const useSvg = () => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [svgPath, setSvgPath] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // 用于存储原始SVG内容的引用
  const originalSvgRef = useRef<string | null>(null);

  /**
   * 从文件系统加载SVG文件
   */
  const loadSvgFromFile = useCallback(async (fileUri: string) => {
    try {
      // 处理Android content URI的问题
      let content: string;
      
      if (fileUri.startsWith('content://')) {
        // 对于content URI，需要先复制到应用缓存目录
        const tempFileName = `temp_${Date.now()}.svg`;
        const tempUri = `${FileSystem.cacheDirectory}${tempFileName}`;
        
        // 复制文件到本地缓存
        await FileSystem.copyAsync({
          from: fileUri,
          to: tempUri
        });
        
        // 从本地缓存读取
        content = await FileSystem.readAsStringAsync(tempUri);
        
        // 清理临时文件
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      } else {
        // 对于file URI，直接读取
        content = await FileSystem.readAsStringAsync(fileUri);
      }
      
      // 生成本地存储路径
      const fileName = `map_${Date.now()}.svg`;
      const localPath = `${FileSystem.documentDirectory}maps/${fileName}`;
      
      // 确保目录存在
      const dirPath = `${FileSystem.documentDirectory}maps/`;
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
      
      // 保存到本地
      await FileSystem.writeAsStringAsync(localPath, content);
      
      // 更新状态
      originalSvgRef.current = content;
      setSvgContent(content);
      setSvgPath(localPath);
      
      console.log('SVG文件已加载:', localPath, '大小:', content.length, '字符');
      return localPath;
    } catch (error) {
      console.error('加载SVG文件失败:', error);
      throw error;
    }
  }, []);

  /**
   * 重新加载SVG（从本地存储）
   */
  const reloadSvg = useCallback(async () => {
    if (!svgPath) return;
    
    try {
      const content = await FileSystem.readAsStringAsync(svgPath);
      setSvgContent(content);
      setUpdateCounter(prev => prev + 1);
      console.log('SVG已重新加载');
    } catch (error) {
      console.error('重新加载SVG失败:', error);
      throw error;
    }
  }, [svgPath]);

  /**
   * 更新SVG元素
   */
  const updateSvgElement = useCallback(async (update: SvgElementUpdate) => {
    if (!svgContent || !svgPath) {
      throw new Error('没有加载的SVG文件');
    }

    setIsUpdating(true);
    
    try {
      let updatedContent = svgContent;
      
      // 根据更新类型执行相应的修改
      switch (update.updateType) {
        case 'color':
          updatedContent = updateElementColor(updatedContent, update.selector, update.value as string);
          break;
        case 'visibility':
          updatedContent = updateElementVisibility(updatedContent, update.selector, update.value as boolean);
          break;
        case 'attribute':
          if (update.attributeName) {
            updatedContent = updateElementAttribute(
              updatedContent, 
              update.selector, 
              update.attributeName, 
              update.value as string
            );
          }
          break;
        case 'style':
          if (update.attributeName) {
            updatedContent = updateElementStyle(
              updatedContent, 
              update.selector, 
              update.attributeName, 
              update.value as string
            );
          }
          break;
      }
      
      // 保存更新后的内容
      await FileSystem.writeAsStringAsync(svgPath, updatedContent);
      
      // 更新状态，触发热更新
      setSvgContent(updatedContent);
      setUpdateCounter(prev => prev + 1);
      
      console.log('SVG元素已更新:', update.selector);
    } catch (error) {
      console.error('更新SVG元素失败:', error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [svgContent, svgPath]);

  /**
   * 重置SVG到原始状态
   */
  const resetSvg = useCallback(async () => {
    if (!originalSvgRef.current || !svgPath) return;
    
    try {
      await FileSystem.writeAsStringAsync(svgPath, originalSvgRef.current);
      setSvgContent(originalSvgRef.current);
      setUpdateCounter(prev => prev + 1);
      console.log('SVG已重置到原始状态');
    } catch (error) {
      console.error('重置SVG失败:', error);
      throw error;
    }
  }, [svgPath]);

  /**
   * 基于地图结构的快捷操作方法
   */
  const mapOperations: MapLayerOperations = {
    ocean: {
      changeColor: (color: string) => {
        updateSvgElement({
          selector: '#oceanBase',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      togglePattern: (visible: boolean) => {
        updateSvgElement({
          selector: '#oceanPattern',
          updateType: 'visibility',
          value: visible
        });
      }
    },
    lakes: {
      changeFreshwaterColor: (color: string) => {
        updateSvgElement({
          selector: '#freshwater',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      changeSaltColor: (color: string) => {
        updateSvgElement({
          selector: '#salt',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      toggleVisibility: (visible: boolean) => {
        updateSvgElement({
          selector: '#lakes',
          updateType: 'visibility',
          value: visible
        });
      }
    },
    landmass: {
      changeColor: (color: string) => {
        updateSvgElement({
          selector: '#landmass',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      toggleMask: (enabled: boolean) => {
        updateSvgElement({
          selector: '#landmass',
          updateType: 'attribute',
          attributeName: 'mask',
          value: enabled ? 'url(#land)' : 'none'
        });
      }
    },
    rivers: {
      changeColor: (color: string) => {
        updateSvgElement({
          selector: '#rivers',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      changeWidth: (width: string) => {
        updateSvgElement({
          selector: '#rivers path',
          updateType: 'attribute',
          attributeName: 'stroke-width',
          value: width
        });
      },
      toggleVisibility: (visible: boolean) => {
        updateSvgElement({
          selector: '#rivers',
          updateType: 'visibility',
          value: visible
        });
      }
    },
    regions: {
      changeStateColor: (stateId: string, color: string) => {
        updateSvgElement({
          selector: `#statesBody [data-state="${stateId}"]`,
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      },
      toggleStateBorders: (visible: boolean) => {
        updateSvgElement({
          selector: '#stateBorders',
          updateType: 'visibility',
          value: visible
        });
      },
      toggleProvincesBorders: (visible: boolean) => {
        updateSvgElement({
          selector: '#provinceBorders',
          updateType: 'visibility',
          value: visible
        });
      }
    },
    routes: {
      toggleRoads: (visible: boolean) => {
        updateSvgElement({
          selector: '#roads',
          updateType: 'visibility',
          value: visible
        });
      },
      toggleTrails: (visible: boolean) => {
        updateSvgElement({
          selector: '#trails',
          updateType: 'visibility',
          value: visible
        });
      },
      toggleSeaRoutes: (visible: boolean) => {
        updateSvgElement({
          selector: '#searoutes',
          updateType: 'visibility',
          value: visible
        });
      },
      changeRoadColor: (color: string) => {
        updateSvgElement({
          selector: '#roads',
          updateType: 'attribute',
          attributeName: 'stroke',
          value: color
        });
      }
    },
    labels: {
      toggleBurgLabels: (visible: boolean) => {
        updateSvgElement({
          selector: '#burgLabels',
          updateType: 'visibility',
          value: visible
        });
      },
      toggleStateLabels: (visible: boolean) => {
        updateSvgElement({
          selector: '#states',
          updateType: 'visibility',
          value: visible
        });
      },
      changeLabelColor: (color: string) => {
        updateSvgElement({
          selector: '#labels text',
          updateType: 'attribute',
          attributeName: 'fill',
          value: color
        });
      }
    },
    icons: {
      toggleBurgIcons: (visible: boolean) => {
        updateSvgElement({
          selector: '#burgIcons',
          updateType: 'visibility',
          value: visible
        });
      },
      toggleAnchors: (visible: boolean) => {
        updateSvgElement({
          selector: '#anchors',
          updateType: 'visibility',
          value: visible
        });
      },
      changeIconSize: (size: string) => {
        updateSvgElement({
          selector: '#burgIcons circle',
          updateType: 'attribute',
          attributeName: 'r',
          value: size
        });
      }
    }
  };

  return {
    // 状态
    svgContent,
    svgPath,
    isUpdating,
    updateCounter,
    
    // 基础操作
    loadSvgFromFile,
    updateSvgElement,
    reloadSvg,
    resetSvg,
    
    // 地图专用操作
    mapOperations
  };
};

// 工具函数：更新元素颜色
function updateElementColor(svgContent: string, selector: string, color: string): string {
  // 实现颜色更新逻辑
  const regex = new RegExp(`(${selector}[^>]*fill=")([^"]*)(")`, 'g');
  return svgContent.replace(regex, `$1${color}$3`);
}

// 工具函数：更新元素可见性
function updateElementVisibility(svgContent: string, selector: string, visible: boolean): string {
  const displayValue = visible ? 'block' : 'none';
  const regex = new RegExp(`(${selector}[^>]*style="[^"]*display:)([^;]*)(;[^"]*")`, 'g');
  
  if (svgContent.match(regex)) {
    return svgContent.replace(regex, `$1${displayValue}$3`);
  } else {
    // 如果没有style属性，添加一个
    const addStyleRegex = new RegExp(`(${selector}[^>]*)>`, 'g');
    return svgContent.replace(addStyleRegex, `$1 style="display:${displayValue}">`);
  }
}

// 工具函数：更新元素属性
function updateElementAttribute(svgContent: string, selector: string, attributeName: string, value: string): string {
  const regex = new RegExp(`(${selector}[^>]*${attributeName}=")([^"]*)(")`, 'g');
  
  if (svgContent.match(regex)) {
    return svgContent.replace(regex, `$1${value}$3`);
  } else {
    // 如果属性不存在，添加属性
    const addAttrRegex = new RegExp(`(${selector}[^>]*)>`, 'g');
    return svgContent.replace(addAttrRegex, `$1 ${attributeName}="${value}">`);
  }
}

// 工具函数：更新元素样式
function updateElementStyle(svgContent: string, selector: string, styleName: string, value: string): string {
  const styleRegex = new RegExp(`(${selector}[^>]*style="[^"]*${styleName}:)([^;]*)(;[^"]*")`, 'g');
  
  if (svgContent.match(styleRegex)) {
    return svgContent.replace(styleRegex, `$1${value}$3`);
  } else {
    // 如果样式不存在，添加到style属性中
    const addStyleRegex = new RegExp(`(${selector}[^>]*style=")([^"]*)(")`, 'g');
    if (svgContent.match(addStyleRegex)) {
      return svgContent.replace(addStyleRegex, `$1$2;${styleName}:${value}$3`);
    } else {
      // 如果没有style属性，创建一个
      const createStyleRegex = new RegExp(`(${selector}[^>]*)>`, 'g');
      return svgContent.replace(createStyleRegex, `$1 style="${styleName}:${value}">`);
    }
  }
}
