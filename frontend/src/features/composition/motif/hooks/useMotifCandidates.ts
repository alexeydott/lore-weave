// D-MOTIF-FE-SWAP-NODE-GRANULARITY — the bind/swap candidate list for the per-scene
// binding surface: the user's VISIBLE motifs (system seeds + owned), mapped to the
// MotifCandidateOption shape SwapMotifPopover renders. Lets a FREE-FORM scene pick a
// motif (the new per-scene bind BE), not just swap an already-bound one. No JSX.
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motifApi } from '../api';
import type { MotifCandidateOption } from '../components/MotifBindingCard';

export function useMotifCandidates(token: string | null) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['composition', 'motif-candidates', token, i18n.language],
    queryFn: async (): Promise<MotifCandidateOption[]> => {
      const { motifs } = await motifApi.list({ scope: 'all', display_language: i18n.language, limit: 100 }, token!);
      return motifs.map((m) => ({ motif_id: m.id, motif_name: m.name, summary: m.summary, motif_code: m.code }));
    },
    enabled: !!token,
    staleTime: 5 * 60_000, // the library changes rarely; don't refetch per card render.
  });
}
