import { InlineEditText } from './InlineEditText';
import { useCustomFields, useCustomValues, usePatchCustomValue } from '../../hooks/useAssets';

interface CustomFieldsSectionProps {
  assetId: string;
}

export function CustomFieldsSection({ assetId }: CustomFieldsSectionProps) {
  const { data: fields } = useCustomFields();
  const { data: values } = useCustomValues(assetId);
  const patchCustomValue = usePatchCustomValue();

  // Hide section entirely when no custom fields defined
  if (!fields || fields.length === 0) return null;

  const getValueForField = (fieldId: string) =>
    values?.find(v => v.fieldId === fieldId)?.value ?? null;

  const handleSaveValue = async (fieldId: string, newValue: string) => {
    await patchCustomValue.mutateAsync({ assetId, fieldId, value: newValue });
  };

  return (
    <div>
      {fields.map((field, i) => (
        <div
          key={field.id}
          className={`px-md py-sm hover:border-border-hover hover:bg-glass-hover focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)] transition-all duration-150 ${i < fields.length - 1 ? 'border-b border-glass-border' : ''}`}
        >
          <span className="text-text-dim text-[10px] block leading-none mb-[3px]">{field.name}</span>
          <InlineEditText
            value={getValueForField(field.id)}
            onSave={(v) => handleSaveValue(field.id, v)}
            placeholder="\u2014"
            ariaLabel={`Edit ${field.name}`}
          />
        </div>
      ))}
    </div>
  );
}
