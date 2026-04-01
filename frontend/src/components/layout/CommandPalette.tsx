import { useEffect, useState } from 'react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Video, Upload, Settings, Search } from 'lucide-react';
import { useAssets } from '../../hooks/useAssets';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAsset: (id: string) => void;
  onNavigate: (view: 'library' | 'import' | 'settings') => void;
  onSearch: (query: string) => void;
}

export function CommandPalette({ open, onOpenChange, onSelectAsset, onNavigate, onSearch }: CommandPaletteProps) {
  const { data: assets } = useAssets();
  const [query, setQuery] = useState('');

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search assets, tags, actions..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => { onNavigate('import'); onOpenChange(false); }}>
            <Upload size={14} className="mr-sm opacity-50" />
            Import new video
          </CommandItem>
          <CommandItem onSelect={() => { if (query) { onSearch(query); onOpenChange(false); } }}>
            <Search size={14} className="mr-sm opacity-50" />
            Search for &ldquo;{query || '...'}&rdquo;
          </CommandItem>
          <CommandItem onSelect={() => { onNavigate('settings'); onOpenChange(false); }}>
            <Settings size={14} className="mr-sm opacity-50" />
            Settings
          </CommandItem>
        </CommandGroup>
        {assets && assets.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.slice(0, 8).map((asset) => (
              <CommandItem key={asset.id} onSelect={() => { onSelectAsset(asset.id); onOpenChange(false); }}>
                <Video size={14} className="mr-sm opacity-50" />
                {asset.title || asset.originalFilename}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
