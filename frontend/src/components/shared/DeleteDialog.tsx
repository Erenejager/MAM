import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDeleteAsset } from '../../hooks/useAssets';

interface DeleteDialogProps {
  assetId: string;
  assetTitle: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteDialog({ assetId, assetTitle, onClose, onDeleted }: DeleteDialogProps) {
  const deleteMutation = useDeleteAsset();
  const isDeleting = deleteMutation.isPending;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save and restore focus
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  // Auto-focus first button on mount
  useEffect(() => {
    const firstButton = dialogRef.current?.querySelector('button');
    firstButton?.focus();
  }, []);

  // Focus trap + Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDelete = (deleteFile: boolean) => {
    deleteMutation.mutate(
      { id: assetId, deleteFile },
      {
        onSuccess: () => {
          onDeleted();
          onClose();
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 glass-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Delete asset"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[360px] rounded-[14px] overflow-hidden"
        style={{
          background: 'rgba(15,15,30,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div className="flex items-center gap-[10px] mb-[16px]">
          <div
            className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(225,29,72,0.1)',
              border: '1px solid rgba(225,29,72,0.2)',
            }}
          >
            <AlertTriangle size={16} className="text-cta" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-[#e4e4e7]">Delete Asset</h2>
            <p className="text-[10px] text-[#71717a] truncate mt-[1px]">{assetTitle}</p>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-[8px] mb-[12px]">
          <button
            onClick={() => handleDelete(false)}
            disabled={isDeleting}
            className="w-full text-left cursor-pointer disabled:opacity-50 rounded-[8px] px-[12px] py-[10px] transition-colors duration-150 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] hover:bg-glass-hover"
          >
            <div className="text-[11px] font-medium text-[#e4e4e7]">
              {isDeleting ? 'Removing...' : 'Remove from library'}
            </div>
            <div className="text-[9px] text-[#52525b] mt-[2px]">
              Removes the database entry. Video file stays on disk.
            </div>
          </button>

          <button
            onClick={() => handleDelete(true)}
            disabled={isDeleting}
            className="w-full text-left cursor-pointer disabled:opacity-50 rounded-[8px] px-[12px] py-[10px] transition-colors duration-150 hover:bg-cta/10"
            style={{
              background: 'rgba(225,29,72,0.06)',
              border: '1px solid rgba(225,29,72,0.15)',
            }}
          >
            <div className="text-[11px] font-medium text-cta">
              {isDeleting ? 'Deleting...' : 'Delete everything'}
            </div>
            <div className="text-[9px] text-[#71717a] mt-[2px]">
              Permanently removes the video, thumbnail, transcript, and library entry.
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full text-center py-[6px] text-[10px] text-[#71717a] hover:text-[#a1a1aa] cursor-pointer bg-transparent border border-[rgba(255,255,255,0.05)] rounded-[6px] transition-colors duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
