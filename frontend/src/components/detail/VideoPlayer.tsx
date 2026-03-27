import type { Asset } from '../../types/asset';

interface VideoPlayerProps {
  asset: Asset;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function VideoPlayer({ asset, videoRef }: VideoPlayerProps) {
  const videoSrc = `/storage/${asset.filepath}`;
  const posterSrc = asset.thumbnailPath ? `/storage/${asset.id}/thumbnail.jpg` : undefined;

  return (
    <div className="w-full bg-black rounded overflow-hidden">
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc}
        controls
        preload="metadata"
        className="w-full aspect-video"
      />
    </div>
  );
}
