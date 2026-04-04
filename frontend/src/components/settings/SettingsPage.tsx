import { useState } from 'react';
import { X, Plus, Zap, Package, Columns, Settings, LayoutGrid, List } from 'lucide-react';
import { useCustomFields, useCreateCustomField, useDeleteCustomField, useAssets } from '../../hooks/useAssets';
import { useServiceStatus } from '../../hooks/useServiceStatus';
import { cn } from '../../lib/cn';
import { formatFileSize } from '../../lib/formatters';

interface SettingsPageProps {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function SettingsPage({ viewMode, onViewModeChange }: SettingsPageProps) {
  const { data: fields, isLoading } = useCustomFields();
  const { data: assets } = useAssets();
  const { data: serviceStatus } = useServiceStatus();
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

  const services = [
    {
      name: 'Groq',
      description: 'Whisper transcription',
      ok: serviceStatus?.groq.configured ?? false,
      label: serviceStatus ? (serviceStatus.groq.configured ? 'Connected' : 'Not configured') : 'Checking...',
    },
    {
      name: 'Gemini',
      description: 'OCR + key moments',
      ok: serviceStatus?.gemini.configured ?? false,
      label: serviceStatus ? (serviceStatus.gemini.configured ? 'Connected' : 'Not configured') : 'Checking...',
    },
    {
      name: 'OpenSearch',
      description: 'Full-text search',
      ok: serviceStatus?.opensearch.connected ?? false,
      label: serviceStatus ? (serviceStatus.opensearch.connected ? 'Connected' : 'Unavailable') : 'Checking...',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-xl">
      <h1 className="font-mono text-[14px] font-semibold text-text mb-lg">Settings</h1>

      <div className="grid grid-cols-2 gap-[12px]">
        {/* ── Service Status ── */}
        <section className="bg-[rgba(30,27,75,0.3)] border border-[rgba(45,42,94,0.6)] rounded-[10px] overflow-hidden" aria-label="Service status">
          <div className="px-[14px] py-[10px] border-b border-[rgba(45,42,94,0.4)] flex items-center gap-[6px]">
            <Zap size={13} className="text-text-muted" />
            <span className="font-mono text-[10px] font-semibold text-text">Service Status</span>
          </div>
          {services.map((svc, i) => (
            <div
              key={svc.name}
              className={`px-[14px] py-[8px] flex items-center justify-between ${
                i < services.length - 1 ? 'border-b border-[rgba(45,42,94,0.15)]' : ''
              }`}
            >
              <div>
                <div className="font-sans text-[11px] text-text">{svc.name}</div>
                <div className="font-sans text-[8px] text-text-muted mt-[1px]">{svc.description}</div>
              </div>
              <div className="flex items-center gap-[5px]">
                <div
                  className={`w-[6px] h-[6px] rounded-full ${svc.ok ? 'bg-[#10B981]' : 'bg-[#E11D48]'}`}
                  aria-label={`${svc.name}: ${svc.label}`}
                />
                <span className={`font-mono text-[9px] ${svc.ok ? 'text-[#10B981]' : 'text-[#E11D48]'}`}>
                  {svc.label}
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* ── Storage ── */}
        <section className="bg-[rgba(30,27,75,0.3)] border border-[rgba(45,42,94,0.6)] rounded-[10px] overflow-hidden" aria-label="Storage">
          <div className="px-[14px] py-[10px] border-b border-[rgba(45,42,94,0.4)] flex items-center gap-[6px]">
            <Package size={13} className="text-text-muted" />
            <span className="font-mono text-[10px] font-semibold text-text">Storage</span>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center border-b border-[rgba(45,42,94,0.15)]">
            <span className="font-sans text-[10px] text-text-muted">Root</span>
            <span className="font-mono text-[9px] text-text truncate max-w-[240px]">~/.mam/storage</span>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center border-b border-[rgba(45,42,94,0.15)]">
            <span className="font-sans text-[10px] text-text-muted">Assets</span>
            <span className="font-mono text-[9px] text-text">{assets?.length ?? 0} videos</span>
          </div>
          <div className="px-[14px] py-[8px] flex justify-between items-center">
            <span className="font-sans text-[10px] text-text-muted">Size</span>
            <span className="font-mono text-[9px] text-text">{formatFileSize(totalSize)}</span>
          </div>
        </section>

        {/* ── Custom Fields (full width) ── */}
        <section className="col-span-2 bg-[rgba(30,27,75,0.3)] border border-[rgba(45,42,94,0.6)] rounded-[10px] overflow-hidden" aria-label="Custom fields">
          <div className="px-[14px] py-[10px] border-b border-[rgba(45,42,94,0.4)] flex items-center justify-between">
            <div className="flex items-center gap-[6px]">
              <Columns size={13} className="text-text-muted" />
              <span className="font-mono text-[10px] font-semibold text-text">Custom Fields</span>
            </div>
            {fields && fields.length > 0 && (
              <span className="font-mono text-[9px] text-text-muted">
                {fields.length} field{fields.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="p-[14px] space-y-[6px]">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-[28px] bg-[rgba(45,42,94,0.3)] rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {/* Field rows */}
          {!isLoading && fields && fields.length > 0 && (
            <div>
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="px-[14px] py-[7px] flex items-center justify-between border-b border-[rgba(45,42,94,0.15)] hover:bg-[rgba(45,42,94,0.15)] transition-colors duration-150"
                >
                  <span className="font-sans text-[11px] text-text">{field.name}</span>
                  <div className="flex items-center gap-[8px]">
                    <span className="font-mono text-[8px] text-text-muted bg-[rgba(45,42,94,0.4)] border border-[rgba(45,42,94,0.6)] px-[6px] py-[2px] rounded-[3px]">
                      {field.fieldType}
                    </span>
                    <button
                      onClick={() => handleDeleteField(field.id)}
                      aria-label={`Delete field ${field.name}`}
                      className="text-text-muted hover:text-cta cursor-pointer transition-colors duration-150 p-[2px]"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && fields && fields.length === 0 && (
            <p className="font-sans text-[11px] text-text-muted italic py-[16px] text-center">
              No custom fields defined yet.
            </p>
          )}

          {/* Add field form */}
          <form onSubmit={handleAddField} className="px-[14px] py-[8px] flex items-center gap-[8px] border-t border-[rgba(45,42,94,0.4)]">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => { setNewFieldName(e.target.value); setCreateError(null); }}
              placeholder="New field name..."
              aria-label="New field name"
              className={cn(
                'flex-1 bg-[rgba(15,15,35,0.6)] border rounded-[6px] px-[10px] py-[6px] font-sans text-[10px] text-text placeholder:text-text-muted outline-none transition-colors duration-200',
                'focus:border-cta/40 focus:shadow-[0_0_0_3px_rgba(225,29,72,0.1)]',
                createError ? 'border-[#E11D48]' : 'border-[rgba(45,42,94,0.6)]'
              )}
            />
            <button
              type="submit"
              disabled={createField.isPending || !newFieldName.trim()}
              className="bg-cta hover:bg-cta-hover disabled:opacity-40 disabled:cursor-not-allowed text-white px-[14px] py-[6px] rounded-[6px] font-sans text-[10px] font-semibold cursor-pointer transition-colors duration-200 flex items-center gap-[4px]"
            >
              <Plus size={10} />
              {createField.isPending ? 'Adding...' : 'Add'}
            </button>
          </form>
          {createError && (
            <p className="font-sans text-[10px] text-[#E11D48] px-[14px] pb-[8px]" role="alert">{createError}</p>
          )}
        </section>

        {/* ── Preferences (full width, compact) ── */}
        <section className="col-span-2 bg-[rgba(30,27,75,0.3)] border border-[rgba(45,42,94,0.6)] rounded-[10px] overflow-hidden" aria-label="Preferences">
          <div className="px-[14px] py-[10px] flex items-center justify-between">
            <div className="flex items-center gap-[6px]">
              <Settings size={13} className="text-text-muted" />
              <span className="font-mono text-[10px] font-semibold text-text">Preferences</span>
            </div>
            <div className="flex items-center gap-[12px]">
              <span className="font-sans text-[11px] text-text-muted">Default view</span>
              <div
                role="radiogroup"
                aria-label="Default view mode"
                className="flex border border-[rgba(45,42,94,0.6)] rounded-[6px] overflow-hidden"
              >
                <button
                  role="radio"
                  aria-checked={viewMode === 'grid'}
                  onClick={() => onViewModeChange('grid')}
                  className={`flex items-center gap-[4px] px-[10px] py-[4px] font-mono text-[9px] font-semibold cursor-pointer transition-colors duration-150 ${
                    viewMode === 'grid'
                      ? 'bg-cta/10 text-cta'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <LayoutGrid size={12} />
                  Grid
                </button>
                <div className="w-[1px] bg-[rgba(45,42,94,0.6)]" />
                <button
                  role="radio"
                  aria-checked={viewMode === 'list'}
                  onClick={() => onViewModeChange('list')}
                  className={`flex items-center gap-[4px] px-[10px] py-[4px] font-mono text-[9px] font-semibold cursor-pointer transition-colors duration-150 ${
                    viewMode === 'list'
                      ? 'bg-cta/10 text-cta'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <List size={12} />
                  List
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
