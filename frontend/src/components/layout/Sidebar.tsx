import { Settings } from 'lucide-react';
import type { TagCount } from '../../types/asset';
import { cn } from '../../lib/cn';

interface SidebarProps {
  tags: TagCount[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  isLoading: boolean;
  onNavigate: (view: 'library' | 'settings') => void;
  activeView: 'library' | 'settings';
}

export function Sidebar({ tags, selectedTags, onToggleTag, isLoading, onNavigate, activeView }: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 shrink-0">
        <span className="font-semibold text-text-muted text-xs uppercase tracking-wider">
          Tags
        </span>
      </div>
      <div className="overflow-y-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-2 px-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 bg-background/50 rounded animate-pulse" />
            ))}
          </div>
        )}
        {!isLoading && tags.length === 0 && (
          <p className="px-4 text-sm text-text-muted italic">No tags yet</p>
        )}
        {!isLoading && tags.length > 0 && (
          <ul>
            {tags
              .slice()
              .sort((a, b) => a.tag.localeCompare(b.tag))
              .map((tagCount) => {
                const isSelected = selectedTags.includes(tagCount.tag);
                return (
                  <li key={tagCount.tag}>
                    <button
                      className={cn(
                        'w-full flex justify-between items-center px-4 py-1.5 text-sm cursor-pointer transition-colors duration-150',
                        isSelected
                          ? 'bg-cta text-text font-semibold rounded'
                          : 'text-text-muted hover:text-text hover:bg-background/50'
                      )}
                      onClick={() => onToggleTag(tagCount.tag)}
                    >
                      <span className="truncate">{tagCount.tag}</span>
                      <span
                        className={cn(
                          'text-xs ml-2 shrink-0',
                          isSelected ? 'text-text' : 'text-text-muted'
                        )}
                      >
                        ({tagCount.count})
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
      <div className="border-t border-border mt-auto">
        <button
          onClick={() => onNavigate(activeView === 'settings' ? 'library' : 'settings')}
          className={cn(
            'w-full flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors duration-150',
            activeView === 'settings'
              ? 'bg-background/50 text-cta'
              : 'text-text-muted hover:text-text hover:bg-background/50'
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
