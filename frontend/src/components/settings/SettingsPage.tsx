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
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-xl font-mono font-semibold text-text mb-8">Settings</h1>

        <section className="bg-glass border border-glass-border rounded-xl p-md">
          <h2 className="text-text-muted font-semibold text-xs uppercase tracking-wider mb-4">
            Custom Fields
          </h2>

          {/* Add field form */}
          <form onSubmit={handleAddField} className="flex items-center gap-2 mb-5">
            <input
              type="text"
              value={newFieldName}
              onChange={e => { setNewFieldName(e.target.value); setCreateError(null); }}
              placeholder="Field name"
              className={cn(
                'flex-1 bg-glass glass-blur border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none transition-colors duration-200',
                'focus:border-cta/40 focus:shadow-[0_0_0_3px_rgba(225,29,72,0.1)]',
                createError ? 'border-status-failed' : 'border-glass-border'
              )}
            />
            <button
              type="submit"
              disabled={createField.isPending || !newFieldName.trim()}
              className="bg-cta hover:bg-cta-hover glow-cta-sm disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors duration-200"
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
                <div key={i} className="h-10 bg-glass rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && fields && fields.length === 0 && (
            <p className="text-sm text-text-muted italic py-6 text-center">
              No custom fields defined. Add one above.
            </p>
          )}

          {!isLoading && fields && fields.length > 0 && (
            <div className="divide-y divide-glass-border border border-glass-border rounded-lg overflow-hidden">
              {fields.map(field => (
                <div key={field.id} className="flex items-center justify-between py-3 px-4 bg-glass glass-blur hover:bg-glass-hover transition-colors">
                  <span className="text-sm text-text">{field.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-muted bg-glass border border-glass-border px-2 py-0.5 rounded">
                      {field.fieldType}
                    </span>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      aria-label={`Delete field ${field.name}`}
                      className="text-text-dim hover:text-cta cursor-pointer transition-colors p-1"
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
