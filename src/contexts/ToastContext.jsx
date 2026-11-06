import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    if (!msg) return;
    const toastObj = typeof msg === 'object' && msg.message
      ? { message: msg.message, type: msg.type || type }
      : { message: String(msg), type: type || 'success' };
    
    setToast(toastObj);
    const timer = setTimeout(() => {
      setToast(null);
    }, 3800);

    return () => clearTimeout(timer);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, toast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background: toast.type === 'error'
              ? '#8f3339'
              : (toast.type === 'warning'
                ? '#8a5b19'
                : (toast.type === 'info'
                  ? '#245b7a'
                  : '#287a68')),
            color: 'white',
            padding: '0.85rem 1.25rem',
            borderRadius: '3px',
            boxShadow: '0 8px 18px rgba(23, 33, 43, 0.18)',
            border: '1px solid rgba(255, 255, 255, 0.20)',
            zIndex: 9999,
            fontWeight: '600',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '420px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
          ) : toast.type === 'warning' ? (
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          ) : toast.type === 'info' ? (
            <Info size={18} style={{ flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          )}
          <span style={{ flex: 1, lineHeight: 1.35 }}>{toast.message}</span>
          <button
            onClick={hideToast}
            aria-label="Close notification"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if invoked outside provider
    return {
      showToast: (msg) => console.log('[Toast fallback]:', msg),
      hideToast: () => {},
      toast: null
    };
  }
  return ctx;
}
