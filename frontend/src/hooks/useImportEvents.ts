import { useEffect, useRef, useCallback } from 'react';
import { apiBase, fetchStreamTicket } from '@/api';

export type ImportStatusEvent = {
  type: 'import.status';
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  chapters_created: number;
  error?: string;
};

/**
 * useImportEvents connects to the gateway WebSocket and listens for import.status events.
 * Falls back gracefully if WS is unavailable — caller should still poll as backup.
 */
export function useImportEvents(
  token: string | null,
  onEvent: (event: ImportStatusEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!token) return;

    void (async () => {
      // Prefer a short-lived stream ticket over the raw access JWT in the URL
      // (proxy-log hygiene, from upstream 6c8b23925). Falls back to the access
      // token when the ticket endpoint is unavailable (e.g. dev without it).
      let streamToken: string;
      try {
        streamToken = await fetchStreamTicket(token);
      } catch (err) {
        if (import.meta.env.PROD) {
          console.error('stream-ticket failed in prod', err);
          return;
        }
        streamToken = token;
      }

      // WebSocket needs an ABSOLUTE url — a relative '' base (the default) won't do, so
      // fall back to the page origin (vite/nginx proxy /ws → gateway). Honors VITE_API_BASE
      // when set for custom setups.
      const base = apiBase() || window.location.origin;
      const wsUrl = base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(streamToken);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string);
            if (data.type === 'import.status') {
              onEventRef.current(data as ImportStatusEvent);
            }
          } catch {
            // ignore non-JSON messages
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        // WS not available — silent fallback to polling
      }
    })();
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
