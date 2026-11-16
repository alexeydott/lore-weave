import { apiJson } from '@/api';

export const referenceSources = ['outline_pov', 'outline_present', 'scene_pov', 'scene_present', 'structure_roster', 'motif_application', 'canon_rule', 'narrative_thread'] as const;
export type ReferenceSource = typeof referenceSources[number];
export interface EntityReference {
  source: ReferenceSource;
  node_ref: { kind: string; id: string; title: string | null };
  detail: string;
}
export type ReferenceGroup = { count: number; refs: EntityReference[]; has_more: boolean } | { error: string };
export interface EntityReferences {
  book_id: string;
  entity_id: string;
  sources: Partial<Record<ReferenceSource, ReferenceGroup>>;
  _meta: { note: string };
}
export interface ReferenceAnswer {
  answer: string;
  citations: (EntityReference & { citation_id: string })[];
  references: EntityReferences;
}
const path = (bookId: string, entityId: string) => `/v1/composition/books/${encodeURIComponent(bookId)}/entities/${encodeURIComponent(entityId)}/references`;
export const referenceShelfApi = {
  list: (bookId: string, entityId: string, limit: number, token: string) =>
    apiJson<EntityReferences>(`${path(bookId, entityId)}?limit=${Math.max(1, Math.min(100, limit))}`, { token }),
  ask: (bookId: string, entityId: string, body: { question: string; locale: string; model_ref?: string; model_source?: 'user_model' | 'platform_model' }, token: string) =>
    apiJson<ReferenceAnswer>(`${path(bookId, entityId)}/assistant`, { method: 'POST', body: JSON.stringify(body), token }),
};
