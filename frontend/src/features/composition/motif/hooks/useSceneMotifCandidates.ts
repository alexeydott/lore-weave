import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motifApi } from '../api';
export function useSceneMotifCandidates(token: string | null, enabled: boolean) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['composition', 'motif-editor-candidates', token, i18n.language],
    queryFn: async () => {
      const rows = [];
      for (let offset = 0; ; offset += 100) {
        const page = await motifApi.list({ scope: 'all', display_language: i18n.language, limit: 100, offset }, token!);
        rows.push(...page.motifs);
        if (page.motifs.length < 100) return rows;
      }
    }, enabled: !!token && enabled,
  });
}
