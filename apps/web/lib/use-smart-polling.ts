'use client';

import { useEffect, useRef } from 'react';

const HIDDEN_TAB_MULTIPLIER = 3;

export function useSmartPolling(task: () => Promise<void>, intervalMs: number) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const nextDelay = isHidden ? intervalMs * HIDDEN_TAB_MULTIPLIER : intervalMs;
      timer = setTimeout(() => {
        void execute();
      }, nextDelay);
    };

    const execute = async () => {
      if (cancelled || running) {
        return;
      }
      running = true;
      try {
        await taskRef.current();
      } finally {
        running = false;
        scheduleNext();
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled || document.visibilityState !== 'visible') {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      void execute();
    };

    void execute();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
}
