import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSuggestions, type Suggestion } from '../lib/api';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export function useSuggest(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();

    // Below minimum — clear and bail
    if (trimmed.length < MIN_CHARS) {
      clearPending();
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // Cache hit — return instantly
    const cached = cacheRef.current.get(trimmed);
    if (cached) {
      clearPending();
      setSuggestions(cached);
      setIsLoading(false);
      return;
    }

    // Debounce the API call
    clearPending();
    setIsLoading(true);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const results = await fetchSuggestions(trimmed, controller.signal);
        cacheRef.current.set(trimmed, results);
        setSuggestions(results);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return clearPending;
  }, [query, clearPending]);

  return { suggestions, isLoading };
}
