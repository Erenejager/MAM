// frontend/src/components/import/ImportCompletionToast.tsx
import { toast } from 'sonner';
import { storageUrl } from '../../lib/api';

interface CompletionToastData {
  assetId: string;
  title: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
  fileSize: number | null;
  transcriptionFailed: boolean;
  onView: (assetId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function CompletionToastContent({ data, toastId }: { data: CompletionToastData; toastId: string | number }) {
  const duration = formatDuration(data.durationSeconds);
  const size = formatSize(data.fileSize);
  const parts = ['Import complete', duration, size].filter(Boolean);
  const subtitle = data.transcriptionFailed
    ? 'Import complete \u00B7 transcription failed'
    : parts.join(' \u00B7 ');

  return (
    <div className="flex gap-[12px] items-start">
      {/* Thumbnail */}
      <div
        className="w-[48px] h-[48px] rounded-[6px] bg-[rgba(255,255,255,0.05)] shrink-0 overflow-hidden flex items-center justify-center"
      >
        {data.thumbnailPath ? (
          <img
            src={storageUrl(data.thumbnailPath)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <svg className="w-5 h-5 text-[#52525b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#e4e4e7] font-semibold truncate">
          {data.title}
        </div>
        <div className={`text-[10px] mt-[2px] ${data.transcriptionFailed ? 'text-[#F59E0B]' : 'text-[#71717a]'}`}>
          {subtitle}
        </div>
        <button
          className="text-[10px] text-cta underline mt-[6px] cursor-pointer bg-transparent border-none p-0"
          onClick={() => {
            data.onView(data.assetId);
            toast.dismiss(toastId);
          }}
        >
          View asset
        </button>
      </div>
    </div>
  );
}

export function showCompletionToast(data: CompletionToastData) {
  toast.custom(
    (id) => <CompletionToastContent data={data} toastId={id} />,
    {
      duration: 8000,
      style: {
        background: 'rgba(15,15,30,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      },
    }
  );
}
