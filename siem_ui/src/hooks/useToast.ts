import React, { useState, useCallback } from 'react';

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  duration?: number;
}

const toastQueue: ToastData[] = [];
const listeners = new Set<(toasts: ToastData[]) => void>();

let toastCount = 0;

/**
 * Add a new toast to the queue
 */
function addToast(toast: Omit<ToastData, 'id'>) {
  const id = (++toastCount).toString();
  const toastWithId = { ...toast, id };
  
  toastQueue.push(toastWithId);
  
  // Notify all listeners
  listeners.forEach(listener => listener([...toastQueue]));
  
  // Auto-remove after duration
  const duration = toast.duration ?? 5000;
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
  
  return id;
}

/**
 * Remove a toast by ID
 */
function removeToast(id: string) {
  const index = toastQueue.findIndex(t => t.id === id);
  if (index > -1) {
    toastQueue.splice(index, 1);
    listeners.forEach(listener => listener([...toastQueue]));
  }
}

/**
 * Hook for managing toast notifications
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([...toastQueue]);

  // Subscribe to toast updates with stable callback
  const stableSetToasts = useCallback((newToasts: ToastData[]) => {
    setToasts(newToasts);
  }, []);

  React.useEffect(() => {
    listeners.add(stableSetToasts);
    return () => {
      listeners.delete(stableSetToasts);
    };
  }, [stableSetToasts]);

  const toast = (props: Omit<ToastData, 'id'>) => {
    return addToast(props);
  };

  const dismiss = (id: string) => {
    removeToast(id);
  };

  const dismissAll = () => {
    toastQueue.length = 0;
    listeners.forEach(listener => listener([]));
  };

  return {
    toasts,
    toast,
    dismiss,
    dismissAll,
  };
}