import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DialogMode = 'normal' | 'background-focus' | 'visual-novel';

interface DialogModeContextType {
  mode: DialogMode;
  setMode: (mode: DialogMode) => void;
  visualNovelSettings: {
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
  };
  updateVisualNovelSettings: (settings: Partial<{
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
  }>) => void;
  isHistoryModalVisible: boolean;
  setHistoryModalVisible: (visible: boolean) => void;
}

const DialogModeContext = createContext<DialogModeContextType>({
  mode: 'normal',
  setMode: () => {},
  visualNovelSettings: {
    fontFamily: 'System',
    textColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  updateVisualNovelSettings: () => {},
  isHistoryModalVisible: false,
  setHistoryModalVisible: () => {},
});

export const DialogModeProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [mode, setModeState] = useState<DialogMode>('normal');
  const [isHistoryModalVisible, setHistoryModalVisible] = useState(false);
  const [visualNovelSettings, setVisualNovelSettings] = useState({
    fontFamily: 'System',
    textColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // 默认带alpha
  });

  // Load saved mode on mount
  useEffect(() => {
    const loadSavedMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem('dialogMode');
        if (savedMode) {
          setModeState(savedMode as DialogMode);
        }

        const savedSettings = await AsyncStorage.getItem('visualNovelSettings');
        if (savedSettings) {
          setVisualNovelSettings(JSON.parse(savedSettings));
        }
      } catch (error) {
        console.error('Failed to load dialog mode:', error);
      }
    };

    loadSavedMode();
  }, []);

  // Save mode whenever it changes
  const setMode = async (newMode: DialogMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem('dialogMode', newMode);
    } catch (error) {
      console.error('Failed to save dialog mode:', error);
    }
  };

  // Update visual novel settings
  const updateVisualNovelSettings = async (settings: Partial<{
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
  }>) => {
    const newSettings = { ...visualNovelSettings, ...settings };
    setVisualNovelSettings(newSettings);
    try {
      await AsyncStorage.setItem('visualNovelSettings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save visual novel settings:', error);
    }
  };

  return (
    <DialogModeContext.Provider 
      value={{ 
        mode, 
        setMode, 
        visualNovelSettings, 
        updateVisualNovelSettings,
        isHistoryModalVisible,
        setHistoryModalVisible
      }}
    >
      {children}
    </DialogModeContext.Provider>
  );
};

export const useDialogMode = () => useContext(DialogModeContext);
