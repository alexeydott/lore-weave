import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { aiModelsApi, getUserModelMeta, type UserModel } from '@/features/ai-models/api';

/**
 * THE consolidated user-models fetch (W5) — every model picker goes through
 * here instead of hand-rolling its own aiModelsApi/providerApi effect.
 *
 * Default fetch shape: active-only (`include_inactive: false`) + the passed
 * capability — the server treats undeclared `{}` local models as chat-capable
 * for `capability="chat"`, and returns favorites first.
 *
 * A short-TTL module cache dedupes concurrent fetches when several pickers of
 * the same capability mount in one view (e.g. campaigns' per-role pickers).
 */
export type UseUserModelsOptions = {
  capability?: string;
  includeInactive?: boolean;
  /** Skip fetching (e.g. dialog not open yet). */
  enabled?: boolean;
};

export type UseUserModelsResult = {
  /** null = not loaded yet (loading or disabled); [] = genuinely zero. */
  models: UserModel[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Local mutation (e.g. optimistic favorite toggle) — does not refetch. */
  mutate: (fn: (models: UserModel[]) => UserModel[]) => void;
};

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { ts: number; promise: Promise<{ items: UserModel[] }> }>();

// Cross-screen reactivity: the cache is module-level, so a write on one screen
// (settings/providers add-edit-delete-activate, favorite toggle, model order)
// must BOTH clear the TTL cache AND reach every ALREADY-MOUNTED picker — a
// mounted picker holds its list in local state and never refetches on its own,
// which is exactly the "changed here, stale everywhere else" defect class.
// The event is the live fan-out; `generation` below is the per-hook listener.
const INVALIDATION_EVENT = 'loreweave:user-models-invalidated';

function fetchModels(token: string, capability?: string, includeInactive?: boolean) {
  const key = `${token}|${capability ?? ''}|${includeInactive ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.promise;
  const promise = aiModelsApi.listUserModels(token, {
    include_inactive: includeInactive ?? false,
    ...(capability ? { capability } : {}),
  }).then(async (response) => {
    // Fallback for legacy registries that do not classify embedding models.
    if (capability !== 'embedding' || response.items.length > 0) return response;
    const all = await aiModelsApi.listUserModels(token, { include_inactive: includeInactive ?? false });
    const embedding = all.items.filter((model) => {
      const meta = getUserModelMeta(model);
      if (meta.capabilities.includes('embedding')) return true;
      return /(?:embedding|embed|bge[-_]?m3|bge[-_]|e5[-_]|gte[-_]|jina[-_]embeddings)/i.test(model.provider_model_name);
    });
    return { items: embedding };
  });
  cache.set(key, { ts: Date.now(), promise });
  // A failed fetch must not poison the cache window.
  promise.catch(() => cache.delete(key));
  return promise;
}

/** Test seam / explicit invalidation (favorite toggles change server order). */
export function invalidateUserModelsCache(): void {
  cache.clear();
  // Live fan-out to mounted pickers (see INVALIDATION_EVENT above).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(INVALIDATION_EVENT));
  }
}

export function useUserModels(options: UseUserModelsOptions = {}): UseUserModelsResult {
  const { capability, includeInactive, enabled = true } = options;
  const { accessToken } = useAuth();
  const [models, setModels] = useState<UserModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  // Cross-screen fan-out listener: any write path calling invalidateUserModelsCache()
  // (any screen) bumps generation → this picker refetches immediately.
  useEffect(() => {
    const onInvalidate = () => setGeneration((g) => g + 1);
    window.addEventListener(INVALIDATION_EVENT, onInvalidate);
    return () => window.removeEventListener(INVALIDATION_EVENT, onInvalidate);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!accessToken) {
      setModels([]);
      return;
    }
    let cancelled = false;
    setError(null);
    fetchModels(accessToken, capability, includeInactive)
      .then((res) => {
        if (!cancelled) setModels(res.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, capability, includeInactive, enabled, generation]);

  const refresh = useCallback(() => {
    invalidateUserModelsCache();
    setGeneration((g) => g + 1);
  }, []);

  const mutate = useCallback((fn: (models: UserModel[]) => UserModel[]) => {
    setModels((prev) => (prev === null ? prev : fn(prev)));
  }, []);

  return { models, loading: enabled && models === null && !error, error, refresh, mutate };
}
