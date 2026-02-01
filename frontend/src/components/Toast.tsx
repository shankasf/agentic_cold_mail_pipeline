'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  details?: string[];
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string, details?: string[]) => void;
  warning: (title: string, message?: string, details?: string[]) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto remove after duration (default 5s for success/info, 10s for errors/warnings)
    const duration = toast.duration ?? (toast.type === 'error' || toast.type === 'warning' ? 10000 : 5000);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string, details?: string[]) => {
    addToast({ type: 'error', title, message, details, duration: 15000 });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string, details?: string[]) => {
    addToast({ type: 'warning', title, message, details, duration: 8000 });
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: 'info', title, message });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const titleColors = {
    success: 'text-green-800',
    error: 'text-red-800',
    warning: 'text-amber-800',
    info: 'text-blue-800',
  };

  const messageColors = {
    success: 'text-green-700',
    error: 'text-red-700',
    warning: 'text-amber-700',
    info: 'text-blue-700',
  };

  return (
    <div
      className={`pointer-events-auto rounded-lg border p-4 shadow-lg ${bgColors[toast.type]} animate-slide-in-right`}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0">{icons[toast.type]}</div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${titleColors[toast.type]}`}>{toast.title}</p>
          {toast.message && (
            <p className={`mt-1 text-sm ${messageColors[toast.type]}`}>{toast.message}</p>
          )}
          {toast.details && toast.details.length > 0 && (
            <ul className={`mt-2 text-sm ${messageColors[toast.type]} list-disc list-inside space-y-1`}>
              {toast.details.slice(0, 5).map((detail, i) => (
                <li key={i} className="truncate">{detail}</li>
              ))}
              {toast.details.length > 5 && (
                <li className="text-xs opacity-75">...and {toast.details.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
        <button
          onClick={onClose}
          className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${messageColors[toast.type]}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
