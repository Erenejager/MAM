import { Fragment } from 'react';
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
    <div className="flex flex-col gap-3">
      <span className="text-text-muted font-semibold text-xs uppercase tracking-wider">
        Custom Fields
      </span>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {fields.map(field => (
          <Fragment key={field.id}>
            <span className="text-text-muted font-semibold text-sm">{field.name}</span>
            <InlineEditText
              value={getValueForField(field.id)}
              onSave={(v) => handleSaveValue(field.id, v)}
              placeholder="\u2014"
              ariaLabel={`Edit ${field.name}`}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
