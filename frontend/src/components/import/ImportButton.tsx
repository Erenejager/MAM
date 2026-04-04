import { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface ImportButtonProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function ImportButton({ onFileSelected, disabled }: ImportButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.relatedTarget === null) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }, [onFileSelected, disabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  }, [onFileSelected]);

  return (
    <div className="flex justify-center py-md">
      <button
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        className={`inline-flex items-center gap-[6px] px-[22px] py-[9px] rounded-[8px] border cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'bg-cta/15 border-cta/40 shadow-[0_0_12px_rgba(225,29,72,0.2)]'
            : 'bg-cta/8 border-cta/20 hover:bg-cta/12 hover:border-cta/30'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Import video — drag and drop or click to browse"
      >
        <Upload size={14} className="text-cta opacity-70" />
        <span className="font-sans text-[12px] text-cta font-semibold">Import Video</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
