import { X } from 'lucide-react';

interface FilterBarProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function FilterBar({
  selectedTags,
  onToggleTag,
  onClearTags,
}: FilterBarProps) {
  if (selectedTags.length === 0) return null;

  return (
    <div className="flex items-center gap-sm px-lg py-xs bg-panel-light/30 border-b border-border">
      <span className="text-[10px] uppercase tracking-wider text-text-dim shrink-0">
        Filtered by
      </span>
      <div className="flex items-center gap-xs flex-wrap">
        {selectedTags.map((tag) => (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className="flex items-center gap-xs text-[11px] px-sm py-0 rounded-lg bg-cta/15 border border-cta/30 text-text hover:bg-cta/25 transition-colors"
          >
            {tag}
            <X size={10} className="text-text-muted" />
          </button>
        ))}
      </div>
      <button
        onClick={onClearTags}
        className="text-[10px] text-text-dim hover:text-text-muted transition-colors ml-auto shrink-0"
      >
        Clear all
      </button>
    </div>
  );
}
