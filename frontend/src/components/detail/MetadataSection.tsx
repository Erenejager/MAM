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
    <div className="flex flex-col gap-sm">
      {/* Editable fields */}
      <section className="rounded-lg bg-glass border border-glass-border">
        {/* Title */}
        <div className="px-md py-sm border-b border-glass-border hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150 rounded-t-lg">
          <label className="text-text-dim text-[10px] uppercase tracking-widest font-sans block mb-[3px]">
            Title
          </label>
          <InlineEditText
            value={asset.title}
            onSave={handleSaveTitle}
            placeholder={asset.originalFilename}
            ariaLabel="Edit title"
          />
        </div>
        {/* Description */}
        <div className="px-md py-sm border-b border-glass-border hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150">
          <label className="text-text-dim text-[10px] uppercase tracking-widest font-sans block mb-[3px]">
            Description
          </label>
          <InlineEditTextarea
            value={asset.description}
            onSave={handleSaveDescription}
            placeholder="No description"
            ariaLabel="Edit description"
          />
        </div>
        {/* Tags */}
        <div className="px-md py-sm rounded-b-lg">
          <label className="text-text-dim text-[10px] uppercase tracking-widest font-sans block mb-[3px]">
            Tags
          </label>
          <TagEditor tags={parsedTags} onTagsChange={handleTagsChange} />
        </div>
      </section>

      {/* Technical metadata */}
      <section className="rounded-lg bg-glass border border-glass-border">
        <div className="px-md py-sm border-b border-glass-border">
          <h3 className="text-text-dim text-[10px] uppercase tracking-widest font-sans">
            File Details
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-0">
          {[
            { label: 'Duration', value: formatDuration(asset.durationSeconds) },
            { label: 'Codec', value: asset.codec ?? '\u2014' },
            { label: 'Resolution', value: asset.width && asset.height ? `${asset.width}\u00D7${asset.height}` : '\u2014' },
            { label: 'Frame Rate', value: asset.frameRate ? `${asset.frameRate} fps` : '\u2014' },
            { label: 'File Size', value: formatFileSize(asset.fileSize) },
            { label: 'Imported', value: formatDate(asset.createdAt) },
          ].map(({ label, value }, i) => (
            <div key={label} className={`bg-glass border border-glass-border rounded-lg p-sm m-[3px] ${i < 4 ? '' : ''}`}>
              <span className="text-text-dim text-[10px] block leading-none mb-[2px]">{label}</span>
              <span className="text-text font-mono text-xs leading-tight">{value}</span>
            </div>
          ))}
        </div>
        {/* Full-width rows */}
        <div className="border-t border-glass-border">
          <div className="px-md py-xs border-b border-glass-border">
            <span className="text-text-dim text-[10px] block leading-none mb-[2px]">File Hash</span>
            <span className="text-text font-mono text-[11px] break-all leading-tight">
              {asset.fileHash ? asset.fileHash.substring(0, 16) + '\u2026' : '\u2014'}
            </span>
          </div>
          <div className="px-md py-xs">
            <span className="text-text-dim text-[10px] block leading-none mb-[2px]">File Path</span>
            <span className="text-text font-mono text-[11px] break-all leading-tight">
              {asset.filepath}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
