import { useEffect } from 'react';
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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-lg shadow-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text text-lg">Delete Asset</h2>
        <p className="text-text-muted text-sm mt-2">
          What would you like to do with &ldquo;{assetTitle}&rdquo;?
        </p>

        <div className="flex flex-col gap-3 mt-6">
          <button
            className="bg-background border border-border text-text px-4 py-2.5 rounded text-sm cursor-pointer hover:border-border-hover transition-colors duration-200 disabled:opacity-50"
            onClick={() => handleDelete(false)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Remove from library'}
          </button>
          <button
            className="bg-cta text-text px-4 py-2.5 rounded text-sm cursor-pointer hover:bg-cta-hover transition-colors duration-200 disabled:opacity-50"
            onClick={() => handleDelete(true)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete file + library'}
          </button>
        </div>

        <button
          className="text-text-muted text-xs cursor-pointer hover:text-text mt-3 w-full text-center transition-colors duration-150"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
