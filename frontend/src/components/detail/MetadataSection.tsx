import { Fragment } from 'react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';
import { InlineEditText } from './InlineEditText';
import { InlineEditTextarea } from './InlineEditTextarea';
import { TagEditor } from './TagEditor';
import { usePatchAsset, usePatchTags } from '../../hooks/useAssets';

interface MetadataSectionProps {
  asset: Asset;
}

export function MetadataSection({ asset }: MetadataSectionProps) {
  const patchAsset = usePatchAsset();
  const patchTags = usePatchTags();

  const parsedTags = JSON.parse(asset.tags ?? '[]') as string[];

  const handleSaveTitle = async (newValue: string) => {
    await patchAsset.mutateAsync({ id: asset.id, data: { title: newValue || undefined } });
  };

  const handleSaveDescription = async (newValue: string) => {
    await patchAsset.mutateAsync({ id: asset.id, data: { description: newValue || undefined } });
  };

  const handleTagsChange = async (newTags: string[]) => {
    await patchTags.mutateAsync({ id: asset.id, tags: newTags });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Editable fields */}
      <div className="flex flex-col gap-3">
        {/* Title row */}
        <div>
          <span className="text-text-muted font-semibold text-sm block mb-1">Title</span>
          <InlineEditText
            value={asset.title}
            onSave={handleSaveTitle}
            placeholder={asset.originalFilename}
            ariaLabel="Edit title"
          />
        </div>
        {/* Description row */}
        <div>
          <span className="text-text-muted font-semibold text-sm block mb-1">Description</span>
          <InlineEditTextarea
            value={asset.description}
            onSave={handleSaveDescription}
            placeholder="No description"
            ariaLabel="Edit description"
          />
        </div>
        {/* Tags row */}
        <div>
          <span className="text-text-muted font-semibold text-sm block mb-1">Tags</span>
          <TagEditor tags={parsedTags} onTagsChange={handleTagsChange} />
        </div>
      </div>

      {/* Divider */}
      <hr className="border-border" />

      {/* Read-only technical metadata grid */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {[
          { label: 'Duration', value: formatDuration(asset.durationSeconds) },
          { label: 'Codec', value: asset.codec ?? '\u2014' },
          { label: 'Resolution', value: asset.width && asset.height ? `${asset.width}\u00D7${asset.height}` : '\u2014' },
          { label: 'Frame Rate', value: asset.frameRate ? `${asset.frameRate} fps` : '\u2014' },
          { label: 'File Size', value: formatFileSize(asset.fileSize) },
          { label: 'Date Imported', value: formatDate(asset.createdAt) },
          { label: 'File Hash', value: asset.fileHash ? asset.fileHash.substring(0, 16) + '\u2026' : '\u2014' },
          { label: 'File Path', value: asset.filepath },
        ].map(({ label, value }) => (
          <Fragment key={label}>
            <span className="text-text-muted font-semibold">{label}</span>
            <span className="text-text font-mono text-xs break-all">{value}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
