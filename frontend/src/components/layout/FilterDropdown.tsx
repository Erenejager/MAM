import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTags } from '../../hooks/useAssets';
import { cn } from '../../lib/cn';

interface FilterDropdownProps {
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClose: () => void;
}

export function FilterDropdown({
  selectedTags,
  onToggleTag,
  onClose,
}: FilterDropdownProps) {
  const { data: tags = [] } = useTags();
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const filtered = tags.filter((t) =>
    t.tag.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="absolute top-full right-0 mt-xs w-[220px] bg-panel border border-border rounded-lg shadow-lg overflow-hidden z-50"
      style={{ transformOrigin: 'top right' }}
    >
      <div className="p-sm border-b border-border">
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tags..."
          className="w-full bg-background/60 border border-border rounded px-sm py-xs text-xs text-text placeholder:text-text-dim focus:border-cta focus:outline-none"
        />
      </div>
      <div className="max-h-[240px] overflow-y-auto p-sm">
        {filtered.length === 0 && (
          <p className="text-xs text-text-dim text-center py-sm">No tags found</p>
        )}
        <div className="flex flex-wrap gap-xs">
          {filtered.map((t) => {
            const isActive = selectedTags.includes(t.tag);
            return (
              <button
                key={t.tag}
                onClick={() => onToggleTag(t.tag)}
                className={cn(
                  'text-[11px] px-sm py-0 rounded-lg border transition-colors',
                  isActive
                    ? 'bg-cta/20 border-cta/40 text-text'
                    : 'bg-background/40 border-border text-text-dim hover:border-border-hover hover:text-text-muted'
                )}
              >
                {t.tag}
                <span className="ml-xs text-text-dim">({t.count})</span>
                {isActive && <X size={10} className="ml-xs inline" />}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
