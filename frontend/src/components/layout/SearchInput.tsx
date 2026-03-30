import { useState, useRef, useEffect } from 'react';
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
    }
  }

  function handleClear() {
    setValue('');
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 max-w-xl mx-auto relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search videos... (Ctrl+K)"
        className="w-full bg-background border border-border rounded-lg pl-10 pr-10 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-cta"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}
