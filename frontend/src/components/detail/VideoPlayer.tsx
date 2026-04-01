import { forwardRef } from 'react';
import type { Asset } from '../../types/asset';

interface VideoPlayerProps {
  asset: Asset;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ asset }, ref) {
    const posterUrl = asset.thumbnailPath
      ? `/storage/${asset.id}/thumbnail.jpg`
      : undefined;

    return (
      <div className="w-full h-full border border-glass-border rounded-sm overflow-hidden">
        <video
          ref={ref}
          src={`/storage/${asset.filepath}`}
          poster={posterUrl}
          controls
          className="w-full h-full object-contain"
        />
      </div>
    );
  }
);
