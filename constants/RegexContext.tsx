import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RegexTool } from '@/shared/types';

interface RegexContextType {
  regexTools: RegexTool[];
  addRegexTool: (tool: Omit<RegexTool, 'id'>) => Promise<void>;
  updateRegexTool: (id: string, updates: Partial<RegexTool>) => Promise<void>;
  deleteRegexTool: (id: string) => Promise<void>;
  toggleRegexTool: (id: string) => Promise<void>;
  applyRegexTools: (text: string, target: 'ai' | 'user') => string;
}

const RegexContext = createContext<RegexContextType | undefined>(undefined);

export const RegexProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [regexTools, setRegexTools] = useState<RegexTool[]>([]);

  // 加载已保存的正则工具
  useEffect(() => {
    const loadRegexTools = async () => {
      try {
        const storedTools = await AsyncStorage.getItem('regexTools');
        if (storedTools) {
          setRegexTools(JSON.parse(storedTools));
        }
      } catch (error) {
        console.error('Failed to load regex tools:', error);
      }
    };

    loadRegexTools();
  }, []);

  // 保存正则工具到持久存储
  const saveRegexTools = async (tools: RegexTool[]) => {
    try {
      await AsyncStorage.setItem('regexTools', JSON.stringify(tools));
    } catch (error) {
      console.error('Failed to save regex tools:', error);
    }
  };

  // 添加新的正则工具
  const addRegexTool = async (tool: Omit<RegexTool, 'id'>) => {
    const newTool = { ...tool, id: Date.now().toString() };
    const updatedTools = [...regexTools, newTool];
    setRegexTools(updatedTools);
    await saveRegexTools(updatedTools);
  };

  // 更新现有正则工具
  const updateRegexTool = async (id: string, updates: Partial<RegexTool>) => {
    const updatedTools = regexTools.map(tool => 
      tool.id === id ? { ...tool, ...updates } : tool
    );
    setRegexTools(updatedTools);
    await saveRegexTools(updatedTools);
  };

  // 删除正则工具
  const deleteRegexTool = async (id: string) => {
    const updatedTools = regexTools.filter(tool => tool.id !== id);
    setRegexTools(updatedTools);
    await saveRegexTools(updatedTools);
  };

  // 切换正则工具的启用状态
  const toggleRegexTool = async (id: string) => {
    const updatedTools = regexTools.map(tool => 
      tool.id === id ? { ...tool, enabled: !tool.enabled } : tool
    );
    setRegexTools(updatedTools);
    await saveRegexTools(updatedTools);
  };

  // 应用所有启用的正则工具到文本
  const applyRegexTools = (text: string, target: 'ai' | 'user') => {
    let processedText = text;
    
    // 只应用目标匹配且已启用的工具
    regexTools
      .filter(tool => tool.enabled && tool.target === target)
      .forEach(tool => {
        try {
          const regex = new RegExp(tool.pattern, 'g');
          processedText = processedText.replace(regex, tool.replacement);
        } catch (error) {
          console.error(`Error applying regex tool ${tool.id}:`, error);
        }
      });
    
    return processedText;
  };

  return (
    <RegexContext.Provider value={{
      regexTools,
      addRegexTool,
      updateRegexTool,
      deleteRegexTool,
      toggleRegexTool,
      applyRegexTools,
    }}>
      {children}
    </RegexContext.Provider>
  );
};

export const useRegex = () => {
  const context = useContext(RegexContext);
  if (context === undefined) {
    throw new Error('useRegex must be used within a RegexProvider');
  }
  return context;
};
