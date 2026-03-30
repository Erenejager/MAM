import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/cn';

interface InlineEditTextareaProps {
  value: string | null;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function InlineEditTextarea({ value, onSave, placeholder, ariaLabel, className }: InlineEditTextareaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [flashState, setFlashState] = useState<'idle' | 'success' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      adjustHeight(textareaRef.current);
    }
  }, [isEditing, adjustHeight]);

  const handleSave = async () => {
    if (draft === (value ?? '')) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    setIsEditing(false);
    try {
      await onSave(draft);
      setFlashState('success');
    } catch {
      setDraft(value ?? '');
      setFlashState('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setFlashState('idle'), 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      return; // allow default newline
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(value ?? '');
      setIsEditing(false);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    adjustHeight(e.currentTarget);
  };

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onInput={handleInput}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        aria-label={ariaLabel ?? 'Edit'}
        className={cn(
          'w-full bg-background rounded px-2 py-1 text-sm text-text font-sans',
          'border outline-none transition-colors duration-200 resize-none overflow-hidden',
          'motion-reduce:transition-none',
          'focus:shadow-[0_0_0_3px_rgba(225,29,72,0.15)]',
          isSaving && 'opacity-70',
          flashState === 'idle' && 'border-border focus:border-cta',
          flashState === 'success' && 'border-status-complete',
          flashState === 'error' && 'border-status-failed',
        )}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? 'Edit'}
      onClick={() => {
        setDraft(value ?? '');
        setIsEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDraft(value ?? '');
          setIsEditing(true);
        }
      }}
      className={cn(
        'cursor-pointer text-sm text-text hover:underline decoration-dashed decoration-text-muted underline-offset-2',
        !value && 'text-text-muted italic',
        flashState === 'success' && 'outline outline-1 outline-status-complete rounded',
        flashState === 'error' && 'outline outline-1 outline-status-failed rounded',
        className,
      )}
    >
      {value || placeholder || 'No description'}
    </span>
  );
}
