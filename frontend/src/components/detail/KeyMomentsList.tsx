import { useState, useEffect } from 'react';
import { Clock, Trophy, Users } from 'lucide-react';
import type { Asset } from '../../types/asset';

interface KeyMoment {
  timestamp: number;
  label: string;
  score: string | null;
  set_period: string | null;
  game_time: string | null;
  transcript: string;
  audio_energy: number;
}

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
              <div className="text-xs text-text font-semibold truncate">
                {moment.label}
              </div>
              <div className="flex items-center gap-sm text-[10px] text-text-muted">
                {moment.score && <span>{moment.score}</span>}
                {moment.set_period && <span>· {moment.set_period}</span>}
                {moment.game_time && (
                  <span className="flex items-center gap-[2px]">
                    <Clock size={9} className="opacity-50" />
                    {moment.game_time}
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
