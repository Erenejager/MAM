import { useState, useEffect, useMemo } from 'react';
import type { TranscriptSegment } from '../types/asset';

export interface UseTranscriptSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  matches: Array<{ segmentIndex: number; matchIndex: number }>;
  currentMatchIdx: number;
  goToNext: () => void;
  goToPrev: () => void;
  totalMatches: number;
}

export function useTranscriptSearch(segments: TranscriptSegment[]): UseTranscriptSearchReturn {
  const [query, setQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  const matches = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const lowerQuery = trimmed.toLowerCase();
    const result: Array<{ segmentIndex: number; matchIndex: number }> = [];

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const text = segments[segIdx].text.toLowerCase();
      let matchInSeg = 0;
      let pos = text.indexOf(lowerQuery);
      while (pos !== -1) {
        result.push({ segmentIndex: segIdx, matchIndex: matchInSeg });
        matchInSeg++;
        pos = text.indexOf(lowerQuery, pos + 1);
      }
    }

    return result;
  }, [segments, query]);

  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [query]);

  const goToNext = () => {
    if (matches.length === 0) return;
    setCurrentMatchIdx(i => (i + 1) % matches.length);
  };

  const goToPrev = () => {
    if (matches.length === 0) return;
    setCurrentMatchIdx(i => (i - 1 + matches.length) % matches.length);
  };

  return {
    query,
    setQuery,
    matches,
    currentMatchIdx,
    goToNext,
    goToPrev,
    totalMatches: matches.length,
  };
}
