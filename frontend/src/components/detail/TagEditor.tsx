import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useTags } from '../../hooks/useAssets';
import { cn } from '../../lib/cn';

interface TagEditorProps {
  tags: string[];
  onTagsChange: (newTags: string[]) => Promise<void>;
}

export function TagEditor({ tags, onTagsChange }: TagEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localTags, setLocalTags] = useState(tags);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync localTags when tags prop changes
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  // Click-outside dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setInputValue('');
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // 150ms debounce
  const [debouncedInput, setDebouncedInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(inputValue), 150);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data: tagCounts } = useTags();
  const existingTagNames = tagCounts?.map((tc) => tc.tag) ?? [];
  const filteredTags = debouncedInput
    ? existingTagNames.filter(
        (t) => t.toLowerCase().includes(debouncedInput.toLowerCase()) && !localTags.includes(t),
      )
    : existingTagNames.filter((t) => !localTags.includes(t));
  const showCreate =
    debouncedInput.trim() !== '' &&
    !existingTagNames.includes(debouncedInput.trim()) &&
    !localTags.includes(debouncedInput.trim());

  const handleSelectTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || localTags.includes(trimmed)) return;
    const newTags = [...localTags, trimmed];
    setLocalTags(newTags);
    setIsOpen(false);
    setInputValue('');
    setDebouncedInput('');
    setActiveIndex(-1);
    onTagsChange(newTags).catch(() => setLocalTags(tags));
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = localTags.filter((t) => t !== tag);
    setLocalTags(newTags);
    onTagsChange(newTags).catch(() => setLocalTags(tags));
  };

  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    const totalOptions = filteredTags.length + (showCreate ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, totalOptions - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredTags.length) {
        handleSelectTag(filteredTags[activeIndex]);
      } else if (activeIndex === filteredTags.length && showCreate) {
        handleSelectTag(debouncedInput);
      } else if (debouncedInput.trim()) {
        handleSelectTag(debouncedInput);
      }
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIsOpen(false);
      setInputValue('');
      setActiveIndex(-1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AnimatePresence mode="popLayout">
        {localTags.map((tag) => (
          <motion.span
            key={tag}
            layout
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15, type: 'spring', stiffness: 500, damping: 30 }}
            className="inline-flex items-center gap-[3px] bg-glass glass-blur-sm border border-glass-border text-text-muted px-[6px] py-[1px] rounded-lg text-[11px] font-sans cursor-default hover:border-cta/30 transition-colors duration-150"
          >
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="w-3.5 h-3.5 text-text-muted hover:text-cta cursor-pointer transition-colors duration-150 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Add tag"
          className="w-6 h-6 rounded-lg border border-dashed border-glass-border text-text-muted hover:border-cta hover:text-cta cursor-pointer transition-colors duration-150 flex items-center justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <AnimatePresence>
          {isOpen && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1 w-56 bg-[rgba(20,20,35,0.9)] glass-blur-xl border border-glass-border rounded-lg shadow-lg overflow-hidden"
            style={{ transformOrigin: 'top left' }}
          >
            <input
              ref={inputRef}
              autoFocus
              role="combobox"
              aria-label="Search tags"
              placeholder="Type to search..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleDropdownKeyDown}
              className="w-full bg-glass border-b border-glass-border px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none"
            />
            <div className="max-h-[228px] overflow-y-auto">
              {filteredTags.length === 0 && !showCreate && (
                <p className="px-3 py-2 text-sm text-text-muted italic">No matching tags</p>
              )}
              {filteredTags.map((tag, i) => (
                <button
                  key={tag}
                  role="option"
                  id={`tag-option-${i}`}
                  aria-selected={activeIndex === i}
                  onClick={() => handleSelectTag(tag)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm text-text cursor-pointer transition-colors duration-150',
                    activeIndex === i ? 'bg-glass-hover' : 'hover:bg-glass-hover',
                  )}
                >
                  {tag}
                </button>
              ))}
              {showCreate && (
                <button
                  role="option"
                  id="tag-option-create"
                  aria-selected={activeIndex === filteredTags.length}
                  onClick={() => handleSelectTag(debouncedInput)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm text-cta cursor-pointer transition-colors duration-150',
                    activeIndex === filteredTags.length ? 'bg-glass-hover' : 'hover:bg-glass-hover',
                  )}
                >
                  Create &quot;{debouncedInput}&quot;
                </button>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
