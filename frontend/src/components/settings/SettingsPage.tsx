import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useCustomFields, useCreateCustomField, useDeleteCustomField, useAssets } from '../../hooks/useAssets';
import { cn } from '../../lib/cn';
import { formatFileSize } from '../../lib/formatters';

export function SettingsPage() {
  const { data: fields, isLoading } = useCustomFields();
  const { data: assets } = useAssets();
  const createField = useCreateCustomField();
  const deleteField = useDeleteCustomField();
  const [newFieldName, setNewFieldName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    setCreateError(null);
    try {
      await createField.mutateAsync(newFieldName.trim());
      setNewFieldName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create field');
    }
  };

  const handleDeleteField = (id: string) => {
    deleteField.mutate(id);
  };

  const totalSize = assets?.reduce((sum, a) => sum + (a.fileSize ?? 0), 0) ?? 0;
  const storageRoot = '/home/clawdbot/.mam/storage';

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-lg font-mono font-semibold text-text mb-6">Settings</h1>

        {/* Custom Fields Section */}
        <section className="rounded-[10px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] overflow-hidden mb-4">
          {/* Section header */}
          <div className="px-[14px] py-[10px] border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center">
            <div>
              <h2 className="text-[11px] font-semibold text-[#e4e4e7]">Custom Fields</h2>
              <p className="text-[9px] text-[#52525b] mt-[2px]">Define metadata fields for all assets</p>
            </div>
            {fields && fields.length > 0 && (
              <span className="text-[9px] font-mono text-[#71717a]">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="p-[10px] space-y-[6px]">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-[32px] bg-glass rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {/* Field rows */}
          {!isLoading && fields && fields.length > 0 && (
            <div>
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="px-[14px] py-[8px] flex items-center justify-between border-b border-[rgba(255,255,255,0.03)] hover:bg-glass-hover transition-colors"
                >
                  <span className="text-[11px] text-[#a1a1aa]">{field.name}</span>
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[8px] font-mono text-[#52525b] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] px-[6px] py-[1px] rounded">
                      {field.fieldType}
                    </span>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      aria-label={`Delete field ${field.name}`}
                      className="text-[#52525b] hover:text-cta cursor-pointer transition-colors p-[2px]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && fields && fields.length === 0 && (
            <p className="text-[11px] text-[#52525b] italic py-[16px] text-center">
              No custom fields defined yet.
            </p>
          )}

          {/* Add field form */}
          <form onSubmit={handleAddField} className="px-[10px] py-[8px] flex items-center gap-[6px] border-t border-[rgba(255,255,255,0.05)]">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => { setNewFieldName(e.target.value); setCreateError(null); }}
              placeholder="Add new field..."
              className={cn(
                'flex-1 bg-[rgba(255,255,255,0.03)] border rounded-[6px] px-[10px] py-[5px] text-[10px] text-text placeholder:text-[#52525b] outline-none transition-colors duration-200',
                'focus:border-cta/40 focus:shadow-[0_0_0_3px_rgba(225,29,72,0.1)]',
                createError ? 'border-status-failed' : 'border-[rgba(255,255,255,0.07)]'
              )}
            />
            <button
              type="submit"
              disabled={createField.isPending || !newFieldName.trim()}
              className="bg-cta hover:bg-cta-hover disabled:opacity-40 text-white px-[12px] py-[5px] rounded-[6px] text-[10px] font-semibold cursor-pointer transition-colors duration-200 flex items-center gap-[4px]"
            >
              <Plus size={10} />
              {createField.isPending ? 'Adding...' : 'Add'}
            </button>
          </form>
          {createError && (
            <p className="text-[10px] text-status-failed px-[14px] pb-[8px]">{createError}</p>
          )}
        </section>

        {/* Storage Section */}
        <section className="rounded-[10px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] overflow-hidden">
          <div className="px-[14px] py-[10px] border-b border-[rgba(255,255,255,0.05)]">
            <h2 className="text-[11px] font-semibold text-[#e4e4e7]">Storage</h2>
            <p className="text-[9px] text-[#52525b] mt-[2px]">Video storage location and usage</p>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center border-b border-[rgba(255,255,255,0.03)]">
            <span className="text-[10px] text-[#71717a]">Storage root</span>
            <span className="text-[10px] text-[#a1a1aa] font-mono truncate max-w-[240px]">{storageRoot}</span>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center border-b border-[rgba(255,255,255,0.03)]">
            <span className="text-[10px] text-[#71717a]">Total assets</span>
            <span className="text-[10px] text-[#a1a1aa] font-mono">{assets?.length ?? 0} videos</span>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center">
            <span className="text-[10px] text-[#71717a]">Total size</span>
            <span className="text-[10px] text-[#a1a1aa] font-mono">{formatFileSize(totalSize)}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
