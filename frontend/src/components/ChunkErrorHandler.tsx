'use client';

import { useEffect } from 'react';

export default function ChunkErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message || '';
      const error = event.error;

      // Check for chunk load errors
      if (
        message.includes('ChunkLoadError') ||
        message.includes('Loading chunk') ||
        error?.name === 'ChunkLoadError'
      ) {
        // Reload the page to get fresh chunks
        window.location.reload();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;

      // Check for chunk load errors in unhandled promise rejections
      if (
        reason?.name === 'ChunkLoadError' ||
        reason?.message?.includes('Loading chunk')
      ) {
        window.location.reload();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
