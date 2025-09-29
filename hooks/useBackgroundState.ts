import { useState, useCallback, useMemo, useRef } from 'react';
import { Character } from '@/shared/types';
import { Group } from '@/src/group';

export interface BackgroundState {
  // Video state
  isVideoReady: boolean;
  videoError: string | null;
  
  // Background generation state
  extraBgStates: Record<string, {
    isGenerating: boolean;
    taskId: string | null;
    error: string | null;
    image: string | null;
  }>;
  
  // Auto image generation state
  autoImageStates: Record<string, {
    isGenerating: boolean;
    taskId: string | null;
    error: string | null;
  }>;
  
  // Group backgrounds
  groupBackgrounds: Record<string, string | undefined>;
}

interface BackgroundActions {
  setVideoReady: (ready: boolean) => void;
  setVideoError: (error: string | null) => void;
  setExtraBgState: (characterId: string, state: Partial<BackgroundState['extraBgStates'][string]>) => void;
  setAutoImageState: (characterId: string, state: Partial<BackgroundState['autoImageStates'][string]>) => void;
  setGroupBackground: (groupId: string, background: string | undefined) => void;
  getBackgroundImage: (character: Character | null) => any;
  getGroupBackgroundImage: (selectedGroup: Group | null) => any;
}

const initialBackgroundState: BackgroundState = {
  isVideoReady: false,
  videoError: null,
  extraBgStates: {},
  autoImageStates: {},
  groupBackgrounds: {},
};

export const useBackgroundState = (): [BackgroundState, BackgroundActions] => {
  const [state, setState] = useState<BackgroundState>(initialBackgroundState);
  const videoRef = useRef<any>(null);

  const setVideoReady = useCallback((ready: boolean) => {
    setState(prev => ({ ...prev, isVideoReady: ready }));
  }, []);

  const setVideoError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, videoError: error }));
  }, []);

  const setExtraBgState = useCallback((characterId: string, newState: Partial<BackgroundState['extraBgStates'][string]>) => {
    setState(prev => ({
      ...prev,
      extraBgStates: {
        ...prev.extraBgStates,
        [characterId]: {
          ...prev.extraBgStates[characterId],
          ...newState,
        },
      },
    }));
  }, []);

  const setAutoImageState = useCallback((characterId: string, newState: Partial<BackgroundState['autoImageStates'][string]>) => {
    setState(prev => ({
      ...prev,
      autoImageStates: {
        ...prev.autoImageStates,
        [characterId]: {
          ...prev.autoImageStates[characterId],
          ...newState,
        },
      },
    }));
  }, []);

  const setGroupBackground = useCallback((groupId: string, background: string | undefined) => {
    setState(prev => ({
      ...prev,
      groupBackgrounds: {
        ...prev.groupBackgrounds,
        [groupId]: background,
      },
    }));
  }, []);

  // Get background image for character
  const getBackgroundImage = useCallback((character: Character | null) => {
    if (character?.id && state.extraBgStates[character.id]?.image) {
      return { uri: state.extraBgStates[character.id].image! };
    }
    if (
      character?.enableAutoExtraBackground &&
      character?.extrabackgroundimage
    ) {
      return { uri: character.extrabackgroundimage };
    }
    if (character?.backgroundImage) {
      if (
        typeof character.backgroundImage === 'object' &&
        character.backgroundImage.localAsset
      ) {
        return character.backgroundImage.localAsset;
      }
      if (typeof character.backgroundImage === 'string') {
        return { uri: character.backgroundImage };
      }
    }
    return require('@/assets/images/default-background.jpg');
  }, [state.extraBgStates]);

  // Get background image for group
  const getGroupBackgroundImage = useCallback((selectedGroup: Group | null) => {
    if (selectedGroup) {
      if (state.groupBackgrounds[selectedGroup.groupId]) {
        return { uri: state.groupBackgrounds[selectedGroup.groupId] };
      }
      if (selectedGroup.backgroundImage) {
        return { uri: selectedGroup.backgroundImage };
      }
    }
    return require('@/assets/images/group-chat-background.jpg');
  }, [state.groupBackgrounds]);

  const actions: BackgroundActions = {
    setVideoReady,
    setVideoError,
    setExtraBgState,
    setAutoImageState,
    setGroupBackground,
    getBackgroundImage,
    getGroupBackgroundImage,
  };

  return [state, actions];
};
