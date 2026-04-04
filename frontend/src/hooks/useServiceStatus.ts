import { useQuery } from '@tanstack/react-query';

interface ServiceStatus {
  groq: { configured: boolean };
  gemini: { configured: boolean };
  opensearch: { connected: boolean };
}

export function useServiceStatus() {
  return useQuery<ServiceStatus>({
    queryKey: ['service-status'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/settings/status`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ServiceStatus>;
    },
    staleTime: 60_000, // Cache for 1 minute
  });
}
