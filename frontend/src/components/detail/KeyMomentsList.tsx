import { useState, useEffect } from 'react';
import { Trophy, Users } from 'lucide-react';
import type { Asset } from '../../types/asset';

interface KeyMoment {
  timestamp: number;
  label: string;
  score_display: string | null;
  sets: [number, number][] | null;
  game_score: string | null;
  serving: string | null;
  moment_type: string | null;
  score_source: 'visible' | 'interpolated' | null;
  score_confidence: 'high' | 'low' | 'none';
  score_changed: boolean | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}

const MOMENT_TYPE_LABELS: Record<string, { label: string; critical: boolean }> = {
  match_won: { label: 'MATCH WON', critical: true },
  set_won: { label: 'SET WON', critical: true },
  match_point: { label: 'MATCH PT', critical: true },
  break_of_serve: { label: 'BREAK', critical: true },
  break_point: { label: 'BREAK PT', critical: false },
  break_point_saved: { label: 'BP SAVED', critical: false },
  ace: { label: 'ACE', critical: false },
  double_fault: { label: 'DBL FAULT', critical: false },
  tiebreak: { label: 'TIEBREAK', critical: true },
  rally: { label: 'RALLY', critical: false },
  hold: { label: 'HOLD', critical: false },
  deuce: { label: 'DEUCE', critical: false },
  challenge: { label: 'CHALLENGE', critical: false },
  injury_timeout: { label: 'TIMEOUT', critical: false },
};

interface KeyMomentsListProps {
  asset: Asset;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function KeyMomentsList({ asset, videoRef }: KeyMomentsListProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const moments: KeyMoment[] = asset.ocrKeyMoments
    ? JSON.parse(asset.ocrKeyMoments)
    : [];
  const players: string[] = asset.ocrPlayers
    ? JSON.parse(asset.ocrPlayers)
    : [];

  useEffect(() => {
    const video = videoRef.current;
    if (!video || moments.length === 0) return;
    const handler = () => {
      const t = video.currentTime;
      let idx = -1;
      for (let i = moments.length - 1; i >= 0; i--) {
        if (t >= moments[i].timestamp) {
          idx = i;
          break;
        }
      }
      setActiveIndex(idx);
    };
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, [moments, videoRef]);

  const handleSeek = (timestamp: number, index: number) => {
    setActiveIndex(index);
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
    }
  };

  const formatTimecode = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (asset.ocrStatus === 'processing') {
    return (
      <div className="flex items-center justify-center gap-sm py-xl text-text-dim text-xs">
        <div className="w-3 h-3 border-2 border-cta border-t-transparent rounded-full animate-spin" />
        Analyzing content...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {(asset.ocrSport || asset.ocrCompetition || players.length > 0) && (
        <div className="px-md py-sm border-b border-glass-border space-y-xs">
          {asset.ocrSport && (
            <div className="flex items-center gap-xs text-xs">
              <Trophy size={11} className="text-cta" />
              <span className="text-text font-semibold">{asset.ocrSport}</span>
              {asset.ocrCompetition && (
                <span className="text-text-muted">— {asset.ocrCompetition}</span>
              )}
            </div>
          )}
          {players.length > 0 && (
            <div className="flex items-center gap-xs text-xs text-text-muted">
              <Users size={11} className="opacity-50" />
              {players.join(' vs ')}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-sm py-sm space-y-[2px]">
        {moments.map((moment, i) => (
          <button
            key={`${moment.timestamp}-${i}`}
            onClick={() => handleSeek(moment.timestamp, i)}
            className={`w-full flex items-start gap-sm px-sm py-xs rounded-md text-left transition-colors cursor-pointer ${
              i === activeIndex
                ? 'bg-glass-hover'
                : 'hover:bg-glass-hover/50'
            }`}
          >
            <span className="font-mono text-[10px] text-cta shrink-0 pt-[2px] min-w-[40px]">
              {formatTimecode(moment.timestamp)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-sm">
                <span className="text-xs text-text font-semibold truncate flex-1">
                  {moment.label}
                </span>
                {moment.moment_type && MOMENT_TYPE_LABELS[moment.moment_type] && (
                  <span className={`shrink-0 text-[9px] font-semibold px-[5px] py-[1px] rounded ${
                    MOMENT_TYPE_LABELS[moment.moment_type].critical
                      ? 'bg-cta/20 text-cta'
                      : 'bg-glass-hover text-text-muted'
                  }`}>
                    {MOMENT_TYPE_LABELS[moment.moment_type].label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-sm text-[10px] text-text-muted">
                {moment.set_period && <span>{moment.set_period}</span>}
                {moment.score_display && moment.score_confidence === 'high' && (
                  <span className="flex items-center gap-[2px]">
                    <span className="text-cta opacity-60" title="Score read from screen">●</span>
                    {moment.score_display}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
