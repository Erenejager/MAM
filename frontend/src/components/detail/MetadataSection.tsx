import { Fragment } from 'react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';

interface MetadataSectionProps {
  asset: Asset;
}

export function MetadataSection({ asset }: MetadataSectionProps) {
  const fields = [
    { label: 'Title', value: asset.title || asset.originalFilename },
    { label: 'Duration', value: formatDuration(asset.durationSeconds) },
    { label: 'Codec', value: asset.codec ?? '\u2014' },
    { label: 'Resolution', value: asset.width && asset.height ? `${asset.width}\u00D7${asset.height}` : '\u2014' },
    { label: 'Frame Rate', value: asset.frameRate ? `${asset.frameRate} fps` : '\u2014' },
    { label: 'File Size', value: formatFileSize(asset.fileSize) },
    { label: 'Date Imported', value: formatDate(asset.createdAt) },
    { label: 'File Hash', value: asset.fileHash ? asset.fileHash.substring(0, 16) + '\u2026' : '\u2014' },
    { label: 'File Path', value: asset.filepath },
  ];

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {fields.map(({ label, value }) => (
        <Fragment key={label}>
          <span className="text-text-muted font-semibold">{label}</span>
          <span className="text-text font-mono text-xs break-all">{value}</span>
        </Fragment>
      ))}
    </div>
  );
}
