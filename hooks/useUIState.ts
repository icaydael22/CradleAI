import { useState, useCallback } from 'react';

export interface UIState {
  // Sidebar and modals
  isSidebarVisible: boolean;
  isSettingsSidebarVisible: boolean;
  isMemoSheetVisible: boolean;
  isKeyboardVisible: boolean;
  isNovelAITestVisible: boolean;
  isVNDBTestVisible: boolean;
  groupSettingsSidebarVisible: boolean;
  isHistoryModalVisible: boolean;
  
  // Save/Load system
  isSaveManagerVisible: boolean;
  isPreviewMode: boolean;
  previewBannerVisible: boolean;
  
  // Memory
  isMemoryPanelVisible: boolean;
  
  // TTS
  isTtsEnhancerEnabled: boolean;
  isTtsEnhancerModalVisible: boolean;
  
  // Video
  isVideoReady: boolean;
  
  // UI visibility
  isTopBarVisible: boolean;
  isTestMarkdownVisible: boolean;
  isMessageTestVisible: boolean;
  isWebViewTestVisible: boolean;
  
  // Group management
  isGroupManageModalVisible: boolean;
}

interface UIActions {
  toggleSidebar: () => void;
  toggleSettingsSidebar: () => void;
  toggleMemoSheet: () => void;
  toggleGroupSettings: () => void;
  toggleHistoryModal: () => void;
  toggleSaveManager: () => void;
  togglePreviewMode: () => void;
  toggleMemoryPanel: () => void;
  toggleTtsEnhancer: () => void;
  toggleTtsEnhancerModal: () => void;
  toggleTopBar: () => void;
  toggleTestMarkdown: () => void;
  toggleMessageTest: () => void;
  toggleWebViewTest: () => void;
  toggleGroupManagement: () => void;
  setKeyboardVisible: (visible: boolean) => void;
  setVideoReady: (ready: boolean) => void;
  setPreviewBannerVisible: (visible: boolean) => void;
}

const initialUIState: UIState = {
  isSidebarVisible: false,
  isSettingsSidebarVisible: false,
  isMemoSheetVisible: false,
  isKeyboardVisible: false,
  isNovelAITestVisible: false,
  isVNDBTestVisible: false,
  groupSettingsSidebarVisible: false,
  isHistoryModalVisible: false,
  isSaveManagerVisible: false,
  isPreviewMode: false,
  previewBannerVisible: false,
  isMemoryPanelVisible: false,
  isTtsEnhancerEnabled: false,
  isTtsEnhancerModalVisible: false,
  isVideoReady: false,
  isTopBarVisible: true,
  isTestMarkdownVisible: false,
  isMessageTestVisible: false,
  isWebViewTestVisible: false,
  isGroupManageModalVisible: false,
};

export const useUIState = (): [UIState, UIActions] => {
  const [state, setState] = useState<UIState>(initialUIState);

  const createToggle = useCallback((key: keyof UIState) => () => {
    setState(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const createSetter = useCallback((key: keyof UIState) => (value: any) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const actions: UIActions = {
    toggleSidebar: createToggle('isSidebarVisible'),
    toggleSettingsSidebar: createToggle('isSettingsSidebarVisible'),
    toggleMemoSheet: createToggle('isMemoSheetVisible'),
    toggleGroupSettings: createToggle('groupSettingsSidebarVisible'),
    toggleHistoryModal: createToggle('isHistoryModalVisible'),
    toggleSaveManager: createToggle('isSaveManagerVisible'),
    togglePreviewMode: createToggle('isPreviewMode'),
    toggleMemoryPanel: createToggle('isMemoryPanelVisible'),
    toggleTtsEnhancer: createToggle('isTtsEnhancerEnabled'),
    toggleTtsEnhancerModal: createToggle('isTtsEnhancerModalVisible'),
    toggleTopBar: createToggle('isTopBarVisible'),
    toggleTestMarkdown: createToggle('isTestMarkdownVisible'),
    toggleMessageTest: createToggle('isMessageTestVisible'),
    toggleWebViewTest: createToggle('isWebViewTestVisible'),
    toggleGroupManagement: createToggle('isGroupManageModalVisible'),
    setKeyboardVisible: createSetter('isKeyboardVisible'),
    setVideoReady: createSetter('isVideoReady'),
    setPreviewBannerVisible: createSetter('previewBannerVisible'),
  };

  return [state, actions];
};
