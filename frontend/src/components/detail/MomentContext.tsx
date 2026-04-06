import { useState, useEffect, useRef } from 'react';
import {
  fetchMomentContext,
  fetchMomentAudioCurve,
  fetchMomentTranscript,
  getMomentFrameUrl,
} from '../../lib/api';

interface MomentContextProps {
  assetId: string;
  momentIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MomentContext({ assetId, momentIndex, isOpen, onClose }: MomentContextProps) {
  const [context, setContext] = useState<Awaited<ReturnType<typeof fetchMomentContext>> | null>(null);
  const [audioCurve, setAudioCurve] = useState<Awaited<ReturnType<typeof fetchMomentAudioCurve>> | null>(null);
  const [transcript, setTranscript] = useState<Awaited<ReturnType<typeof fetchMomentTranscript>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    Promise.all([
      fetchMomentContext(assetId, momentIndex).catch(() => null),
      fetchMomentAudioCurve(assetId, momentIndex).catch(() => null),
      fetchMomentTranscript(assetId, momentIndex).catch(() => null),
    ]).then(([ctx, audio, trans]) => {
      if (!ctx) {
        setError('No enrichment data available for this moment');
        return;
      }
      setContext(ctx);
      setAudioCurve(audio);
      setTranscript(trans);
    });
  }, [assetId, momentIndex, isOpen]);

  // Draw audio sparkline
  useEffect(() => {
    if (!audioCurve || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { energies, offset, peakTime } = audioCurve;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(0, 0, w, h);

    if (energies.length === 0) return;

    // Draw energy bars
    const barWidth = w / energies.length;
    for (let i = 0; i < energies.length; i++) {
      const energy = energies[i];
      const barHeight = energy * h;
      const x = i * barWidth;

      // Color: red near peak, slate elsewhere
      const timeSec = offset + i;
      const distFromPeak = Math.abs(timeSec - peakTime);
      ctx.fillStyle = distFromPeak < 5 ? '#E11D48' : '#94A3B8';

      ctx.fillRect(x, h - barHeight, barWidth - 0.5, barHeight);
    }

    // Peak marker line
    const peakIdx = Math.round(peakTime - offset);
    if (peakIdx >= 0 && peakIdx < energies.length) {
      const peakX = peakIdx * barWidth;
      ctx.strokeStyle = '#E11D48';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(peakX, 0);
      ctx.lineTo(peakX, h);
      ctx.stroke();
    }
  }, [audioCurve]);

  if (!isOpen) return null;

  // Compute frame filenames: ±30s@5s + ±5s@1s
  const frameNames: string[] = [];
  if (context) {
    const times = new Set<number>();
    for (let o = -30; o <= 30; o += 5) times.add(o);
    for (let o = -5; o <= 5; o++) times.add(o);
    const sorted = [...times].sort((a, b) => a - b);
    for (const o of sorted) {
      const sign = o >= 0 ? '+' : '-';
      frameNames.push(`frame_${sign}${String(Math.abs(o)).padStart(3, '0')}.jpg`);
    }
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4 mt-2 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-slate-50 font-semibold font-fira-code text-sm">
          Moment Context — {context?.label ?? `#${momentIndex}`}
        </h4>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-50 text-sm"
        >
          Close
        </button>
      </div>

      {error && (
        <p className="text-sm text-slate-400">{error}</p>
      )}

      {context && (
        <>
          {/* Score transition */}
          <div className="flex gap-4 text-sm">
            <span className="text-slate-400">Score:</span>
            {context.scoreBefore ? (
              <span className={context.scoreChanged ? 'text-cta' : 'text-slate-400'}>
                {context.scoreBefore} → {context.scoreAfter}
                {context.scoreChanged ? ' (changed)' : ' (unchanged)'}
              </span>
            ) : (
              <span className="text-slate-50">{context.score ?? 'N/A'}</span>
            )}
            {context.set_period && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-slate-50">{context.set_period}</span>
              </>
            )}
          </div>

          {/* Audio sparkline */}
          {audioCurve && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Audio Energy (±90s around peak)</p>
              <canvas
                ref={canvasRef}
                width={600}
                height={60}
                className="w-full h-[60px] rounded"
              />
            </div>
          )}

          {/* Frame strip */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Key Frames</p>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {frameNames.map((name) => (
                <img
                  key={name}
                  src={getMomentFrameUrl(assetId, momentIndex, name)}
                  alt={name}
                  className="h-16 rounded flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ))}
            </div>
          </div>

          {/* Transcript segments */}
          {transcript && transcript.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Commentary (±60s)</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {transcript.map((seg, i) => {
                  const distFromPeak = Math.abs(seg.start - (context.peakTime));
                  const isNearPeak = distFromPeak < 5;
                  return (
                    <div
                      key={i}
                      className={`text-xs ${isNearPeak ? 'text-slate-50 bg-cta/10 rounded px-1' : 'text-slate-400'}`}
                    >
                      <span className="font-fira-code text-slate-500 mr-2">
                        {Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, '0')}
                      </span>
                      {seg.text}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
