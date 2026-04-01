import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Asset } from '../../types/asset';
import { formatDuration, formatFileSize, formatDate } from '../../lib/formatters';
import { InlineEditText } from './InlineEditText';
import { InlineEditTextarea } from './InlineEditTextarea';
import { TagEditor } from './TagEditor';
import { CustomFieldsSection } from './CustomFieldsSection';
import { usePatchAsset, usePatchTags } from '../../hooks/useAssets';
import { toast } from 'sonner';

interface MetadataSectionProps {
  asset: Asset;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  collapsedSummary,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  collapsedSummary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-[6px] px-md py-[6px] cursor-pointer bg-[rgba(255,255,255,0.03)] hover:bg-glass-hover transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={12} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-muted shrink-0" />
        )}
        <span className="text-[9px] uppercase tracking-[1px] text-[#e4e4e7] font-semibold">
          {title}
        </span>
        {!open && collapsedSummary && (
          <span className="text-[8px] font-mono text-[#71717a] ml-auto truncate">
            {collapsedSummary}
          </span>
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: open ? 1000 : 0,
          opacity: open ? 1 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MetadataSection({ asset }: MetadataSectionProps) {
  const patchAsset = usePatchAsset();
  const patchTags = usePatchTags();

  const parsedTags = JSON.parse(asset.tags ?? '[]') as string[];

  const handleSaveTitle = async (newValue: string) => {
    try {
      await patchAsset.mutateAsync({ id: asset.id, data: { title: newValue || undefined } });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleSaveDescription = async (newValue: string) => {
    try {
      await patchAsset.mutateAsync({ id: asset.id, data: { description: newValue || undefined } });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleTagsChange = async (newTags: string[]) => {
    try {
      await patchTags.mutateAsync({ id: asset.id, tags: newTags });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  // Build collapsed summary for file details
  const resolution = asset.width && asset.height ? `${asset.height}p` : null;
  const codec = asset.codec ?? null;
  const size = formatFileSize(asset.fileSize);
  const fileDetailsSummary = [resolution, codec, size].filter(Boolean).join(' \u00B7 ');

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden flex flex-col gap-[6px]">
      {/* Section 1: Metadata (default open) */}
      <CollapsibleSection title="Metadata" defaultOpen>
        <div>
          {/* Title */}
          <div className="px-md py-sm border-b border-[rgba(255,255,255,0.04)] hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
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
          <div className="px-md py-sm border-b border-[rgba(255,255,255,0.04)] hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
              Description
            </label>
            <InlineEditTextarea
              value={asset.description}
              onSave={handleSaveDescription}
              placeholder="Click to add description..."
              ariaLabel="Edit description"
            />
          </div>
          {/* Tags */}
          <div className="px-md py-sm">
            <label className="text-[#71717a] text-[8px] uppercase tracking-[0.8px] font-sans block mb-[3px]">
              Tags
            </label>
            <TagEditor tags={parsedTags} onTagsChange={handleTagsChange} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: File Details (default closed) */}
      <CollapsibleSection title="File Details" collapsedSummary={fileDetailsSummary}>
        <div>
          <div className="grid grid-cols-2 gap-0">
            {[
              { label: 'Duration', value: formatDuration(asset.durationSeconds) },
              { label: 'Codec', value: asset.codec ?? '\u2014' },
              { label: 'Resolution', value: asset.width && asset.height ? `${asset.width}\u00D7${asset.height}` : '\u2014' },
              { label: 'Frame Rate', value: asset.frameRate ? `${asset.frameRate} fps` : '\u2014' },
              { label: 'File Size', value: formatFileSize(asset.fileSize) },
              { label: 'Imported', value: formatDate(asset.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded m-[3px] p-sm">
                <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">{label}</span>
                <span className="text-[#e4e4e7] font-mono text-[10px] leading-tight">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-glass-border">
            <div className="px-md py-xs border-b border-glass-border">
              <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">File Hash</span>
              <span className="text-[#e4e4e7] font-mono text-[11px] break-all leading-tight">
                {asset.fileHash ? asset.fileHash.substring(0, 16) + '\u2026' : '\u2014'}
              </span>
            </div>
            <div className="px-md py-xs">
              <span className="text-[#71717a] text-[7px] block leading-none mb-[2px]">File Path</span>
              <span className="text-[#e4e4e7] font-mono text-[11px] break-all leading-tight">
                {asset.filepath}
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Custom Fields (default closed) */}
      <CollapsibleSection title="Custom Fields">
        <CustomFieldsSection assetId={asset.id} />
      </CollapsibleSection>
    </div>
  );
}
