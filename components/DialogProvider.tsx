import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

interface BaseDialogOptions {
  title: string;
  message: string;
  icon?: string;
  destructive?: boolean;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
}

type DialogRequest = {
  kind: 'alert' | 'confirm';
  options: BaseDialogOptions;
  resolve: (value: any) => void;
};

interface DialogContextValue {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: BaseDialogOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);

  const processNext = useCallback(() => {
    if (isVisible || current) return;
    const next = queueRef.current.shift() || null;
    if (next) {
      setCurrent(next);
      setIsVisible(true);
    }
  }, [isVisible, current]);

  useEffect(() => {
    if (!isVisible) {
      // Try process next when dialog hidden
      const id = setTimeout(processNext, 0);
      return () => clearTimeout(id);
    }
  }, [isVisible, processNext]);

  const enqueue = useCallback((req: DialogRequest) => {
    queueRef.current.push(req);
    processNext();
  }, [processNext]);

  const alert = useCallback((options: BaseDialogOptions) => {
    return new Promise<void>((resolve) => {
      enqueue({ kind: 'alert', options, resolve });
    });
  }, [enqueue]);

  const confirm = useCallback((options: BaseDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      enqueue({ kind: 'confirm', options, resolve });
    });
  }, [enqueue]);

  const onConfirm = useCallback(() => {
    if (!current) return;
    const { kind, resolve } = current;
    if (kind === 'alert') {
      resolve(undefined);
    } else {
      resolve(true);
    }
    setIsVisible(false);
    setCurrent(null);
  }, [current]);

  const onCancel = useCallback(() => {
    if (!current) return;
    const { kind, resolve } = current;
    if (kind === 'alert') {
      resolve(undefined);
    } else {
      resolve(false);
    }
    setIsVisible(false);
    setCurrent(null);
  }, [current]);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  const opts = current?.options || ({} as BaseDialogOptions);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmDialog
        visible={isVisible}
        title={opts.title || ''}
        message={opts.message || ''}
        confirmText={opts.confirmText || (current?.kind === 'confirm' ? '确认' : '知道了')}
        cancelText={opts.cancelText || '取消'}
        confirmAction={onConfirm}
        cancelAction={onCancel}
        confirmColor={opts.confirmColor}
        icon={opts.icon}
        destructive={!!opts.destructive}
        showCancel={current?.kind === 'confirm'}
      />
    </DialogContext.Provider>
  );
}; 