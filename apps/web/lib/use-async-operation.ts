import { useCallback, useState } from 'react';

/**
 * Use for any async operation that needs loading + error + result tracking.
 * Replaces the duplicated pattern of:
 *   const [busy, setBusy] = useState(false);
 *   const [error, setError] = useState<string|null>(null);
 *   const [result, setResult] = useState<string|null>(null);
 */

export type AsyncOperationState<T = string> = {
  /** Whether the async operation is currently running */
  busy: boolean;
  /** Error message from the last failed operation */
  error: string | null;
  /** Success message or result from the last successful operation */
  result: T | null;
};

export function useAsyncOperation<T = string>() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const run = useCallback(
    async <R extends T>(fn: () => Promise<R>): Promise<R | null> => {
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const outcome = await fn();
        setResult(outcome);
        return outcome;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định.';
        setError(message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setResult(null);
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { busy, error, result, run, reset, clearMessages, setError, setResult } as const;
}
