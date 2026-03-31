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
      <video
        ref={ref}
        src={`/storage/${asset.filepath}`}
        poster={posterUrl}
        controls
        className="max-w-full max-h-full"
      />
    );
  }
);
