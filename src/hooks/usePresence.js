import { useState, useEffect } from 'react';

/**
 * Custom hook to delay unmounting an element so exit animations can play.
 * @param {boolean} open Whether the element should be open/visible
 * @param {number} exitMs Duration in ms to remain mounted while playing exit animation
 * @returns {{ mounted: boolean, state: 'enter' | 'exit' }}
 */
export function usePresence(open, exitMs = 140) {
  const [isMounted, setIsMounted] = useState(open);

  if (open && !isMounted) {
    setIsMounted(true);
  }

  useEffect(() => {
    if (!open && isMounted) {
      const prefersReducedMotion = typeof window !== 'undefined' && 
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const effectiveExitMs = prefersReducedMotion ? 0 : exitMs;

      const timer = setTimeout(() => {
        setIsMounted(false);
      }, effectiveExitMs);

      return () => clearTimeout(timer);
    }
  }, [open, exitMs, isMounted]);

  return {
    mounted: isMounted,
    state: !open && isMounted ? 'exit' : 'enter',
  };
}

export default usePresence;
