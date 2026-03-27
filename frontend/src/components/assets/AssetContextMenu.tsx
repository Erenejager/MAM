import { useRef, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface AssetContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  onClose: () => void;
}

export function AssetContextMenu({ x, y, onDelete, onClose }: AssetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;
    if (x + rect.width > window.innerWidth) adjustedX = x - rect.width;
    if (y + rect.height > window.innerHeight) adjustedY = y - rect.height;
    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-panel border border-border rounded shadow-lg z-50 py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-background/50 cursor-pointer w-full transition-colors duration-150"
        onClick={onDelete}
      >
        <Trash2 className="w-4 h-4 text-status-failed" />
        Delete
      </button>
    </div>
  );
}
