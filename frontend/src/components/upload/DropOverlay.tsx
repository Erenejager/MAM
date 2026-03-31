import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';

interface DropOverlayProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
}

export function DropOverlay({ onFileDrop, disabled }: DropOverlayProps) {
  const [visible, setVisible] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCountRef.current++;
      if (dragCountRef.current === 1) setVisible(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setVisible(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setVisible(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFileDrop(file);
    },
    [onFileDrop]
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-4 p-12 rounded-xl border-2 border-dashed border-cta bg-panel/80">
        <Upload className="w-16 h-16 text-cta" />
        <p className="text-text font-sans text-lg font-semibold">
          Drop video to import
        </p>
        <p className="text-text-muted font-sans text-sm">
          Release anywhere to start upload
        </p>
      </div>
    </div>
  );
}
