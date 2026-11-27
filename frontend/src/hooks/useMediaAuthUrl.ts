import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/api';

/** Resolve private `/media/object` URLs with a cached stream ticket.
 *  Public (MinIO) URLs pass through untouched, so default deployments
 *  render exactly as before (from upstream 6c8b23925). */
export function useMediaAuthUrl(
  url: string | null | undefined,
  accessToken: string | null | undefined,
): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(url ?? undefined);

  useEffect(() => {
    if (!url) {
      setResolved(undefined);
      return;
    }
    if (!accessToken || !url.includes('/media/object')) {
      setResolved(url);
      return;
    }
    let cancelled = false;
    void resolveMediaUrl(url, accessToken).then((u) => {
      if (!cancelled) setResolved(u);
    });
    return () => {
      cancelled = true;
    };
  }, [url, accessToken]);

  return resolved;
}
