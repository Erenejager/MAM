import { useState } from 'react';
import { X } from 'lucide-react';
import { useCustomFields, useCreateCustomField, useDeleteCustomField } from '../../hooks/useAssets';
import { cn } from '../../lib/cn';

export function SettingsPage() {
  const { data: fields, isLoading } = useCustomFields();
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

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl">
        <h1 className="text-xl font-mono font-semibold text-text mb-8">Settings</h1>

        <section>
          <h2 className="text-text-muted font-semibold text-xs uppercase tracking-wider mb-3">
            Custom Fields
          </h2>

          {/* Add field form */}
          <form onSubmit={handleAddField} className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newFieldName}
              onChange={e => { setNewFieldName(e.target.value); setCreateError(null); }}
              placeholder="Field name"
              className={cn(
                'flex-1 bg-background border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none transition-colors duration-200',
                'focus:border-cta focus:shadow-[0_0_0_3px_rgba(225,29,72,0.15)]',
                createError ? 'border-status-failed' : 'border-border'
              )}
            />
            <button
              type="submit"
              disabled={createField.isPending || !newFieldName.trim()}
              className="bg-cta hover:opacity-90 disabled:opacity-50 text-text px-4 py-2 rounded text-sm font-semibold cursor-pointer transition-opacity duration-200"
            >
              {createField.isPending ? 'Adding\u2026' : 'Add Field'}
            </button>
          </form>
          {createError && (
            <p className="text-xs text-status-failed mb-4">{createError}</p>
          )}

          {isLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-panel rounded animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && fields && fields.length === 0 && (
            <p className="text-sm text-text-muted italic py-6">
              No custom fields defined. Add one above.
            </p>
          )}

          {!isLoading && fields && fields.length > 0 && (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {fields.map(field => (
                <div key={field.id} className="flex items-center justify-between py-3 px-4 bg-panel">
                  <span className="text-sm text-text">{field.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-muted bg-background px-2 py-0.5 rounded">
                      {field.fieldType}
                    </span>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      aria-label={`Delete field ${field.name}`}
                      className="text-text-muted hover:text-cta cursor-pointer transition-colors duration-150 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
