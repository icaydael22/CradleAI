import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EventRegister } from 'react-native-event-listeners';

export interface PerformanceState {
  isPageVisible: boolean;
  appState: string;
  transientError: string | null;
}

interface PerformanceActions {
  setTransientError: (error: string | null) => void;
  showTransientError: (errorMessage: string) => void;
  createSafeTimeout: (callback: () => void, delay: number) => any;
  createSafeInterval: (callback: () => void, delay: number) => any;
  clearAllTimers: () => void;
  throttle: <T extends (...args: any[]) => void>(func: T, delay: number) => T;
  debounce: <T extends (...args: any[]) => void>(func: T, delay: number) => T;
}

export const usePerformanceManager = (): [PerformanceState, PerformanceActions] => {
  const [state, setState] = useState<PerformanceState>({
    isPageVisible: true,
    appState: AppState.currentState,
    transientError: null,
  });

  // Timer and listener management
  const timersRef = useRef<Set<any>>(new Set());
  const intervalsRef = useRef<Set<any>>(new Set());
  const eventListenersRef = useRef<Set<any>>(new Set());

  const setTransientError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, transientError: error }));
  }, []);

  const createSafeTimeout = useCallback((callback: () => void, delay: number) => {
    if (!state.isPageVisible) return null;
    
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      if (state.isPageVisible) {
        callback();
      }
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, [state.isPageVisible]);

  const createSafeInterval = useCallback((callback: () => void, delay: number) => {
    if (!state.isPageVisible) return null;
    
    const interval = setInterval(() => {
      if (state.isPageVisible) {
        callback();
      }
    }, delay);
    intervalsRef.current.add(interval);
    return interval;
  }, [state.isPageVisible]);

  const clearAllTimers = useCallback(() => {
    console.log(`[Performance] Clearing timers: ${timersRef.current.size} timeouts, ${intervalsRef.current.size} intervals, ${eventListenersRef.current.size} listeners`);
    
    timersRef.current.forEach(timer => {
      if (timer) clearTimeout(timer);
    });
    intervalsRef.current.forEach(interval => {
      if (interval) clearInterval(interval);
    });
    eventListenersRef.current.forEach(listener => {
      if (listener && typeof listener === 'string') {
        EventRegister.removeEventListener(listener);
      }
    });
    
    timersRef.current.clear();
    intervalsRef.current.clear();
    eventListenersRef.current.clear();
  }, []);

  const throttle = useCallback(<T extends (...args: any[]) => void>(func: T, delay: number): T => {
    let timeoutId: any;
    let lastExecTime = 0;
    return ((...args: any[]) => {
      const currentTime = Date.now();
      
      if (currentTime - lastExecTime > delay) {
        func(...args);
        lastExecTime = currentTime;
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func(...args);
          lastExecTime = Date.now();
        }, delay - (currentTime - lastExecTime));
      }
    }) as T;
  }, []);

  const debounce = useCallback(<T extends (...args: any[]) => void>(func: T, delay: number): T => {
    let timeoutId: any;
    return ((...args: any[]) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    }) as T;
  }, []);

  const showTransientError = useCallback(throttle((errorMessage: string) => {
    if (!state.isPageVisible) return;
    
    setTransientError(errorMessage);
    const timer = createSafeTimeout(() => {
      setTransientError(null);
    }, 5000);
    
    if (timer) {
      timersRef.current.add(timer);
    }
  }, 1000), [createSafeTimeout, state.isPageVisible, throttle, setTransientError]);

  // Page visibility management
  useFocusEffect(
    useCallback(() => {
      console.log('[Performance] Page focused');
      setState(prev => ({ ...prev, isPageVisible: true }));
      
      return () => {
        console.log('[Performance] Page unfocused - cleaning up');
        setState(prev => ({ ...prev, isPageVisible: false }));
        clearAllTimers();
        
        if (global.gc) {
          global.gc();
        }
      };
    }, [clearAllTimers])
  );

  // App state management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: any) => {
      console.log(`[Performance] App state changed: ${state.appState} -> ${nextAppState}`);
      setState(prev => ({ ...prev, appState: nextAppState }));
      
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[Performance] App backgrounded - cleaning up');
        setState(prev => ({ ...prev, isPageVisible: false }));
        clearAllTimers();
        
        if (global.gc) {
          global.gc();
        }
      } else if (nextAppState === 'active') {
        console.log('[Performance] App activated');
        setState(prev => ({ ...prev, isPageVisible: true }));
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription?.remove();
    };
  }, [state.appState, clearAllTimers]);

  const actions: PerformanceActions = {
    setTransientError,
    showTransientError,
    createSafeTimeout,
    createSafeInterval,
    clearAllTimers,
    throttle,
    debounce,
  };

  return [state, actions];
};
