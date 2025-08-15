import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast as toastManager } from '@/lib/toast';

export function ToastContainer() {
  const [toasts, setToasts] = React.useState<any[]>([]);

  React.useEffect(() => {
    return toastManager.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[300px] max-w-[500px] animate-in slide-in-from-bottom-2",
            {
              'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200': toast.type === 'success',
              'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200': toast.type === 'error',
              'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200': toast.type === 'info',
              'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200': toast.type === 'warning',
            }
          )}
        >
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          
          <button
            onClick={() => toastManager.dismiss(toast.id)}
            className="text-current opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
