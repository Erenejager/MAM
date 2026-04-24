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
      className="fixed z-50 min-w-[160px] rounded-[10px] p-[4px]"
      style={{
        left: position.x,
        top: position.y,
        background: 'rgba(15, 15, 30, 0.97)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
    >
      <button
        className="flex items-center gap-[10px] w-full px-[12px] py-[8px] rounded-[6px] text-[13px] text-cta cursor-pointer transition-colors duration-150 hover:bg-[rgba(225,29,72,0.08)]"
        onClick={onDelete}
      >
        <Trash2 className="w-[14px] h-[14px] opacity-80" />
        Delete
      </button>
    </div>
  );
}
