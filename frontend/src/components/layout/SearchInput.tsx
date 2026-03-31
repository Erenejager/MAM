import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  initialValue?: string;
}

export function SearchInput({ onSearch, onClear, initialValue = '' }: SearchInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSearch(trimmed);
    } else {
      onClear();
    }
  }

  function handleClear() {
    setValue('');
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <Search
        size={14}
        className="absolute left-sm top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search assets..."
        className="w-full bg-background/60 border border-border rounded py-xs pl-xl pr-xl text-sm text-text placeholder:text-text-dim focus:border-cta focus:outline-none transition-colors"
        aria-label="Search assets"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-sm top-1/2 -translate-y-1/2 text-text-dim hover:text-text transition-colors"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </form>
  );
}
