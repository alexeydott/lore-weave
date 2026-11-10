import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OutlineNode } from '@/features/composition/types';
import type { RosterOption } from '@/features/composition/hooks/useGlossaryRoster';
import { referenceShelfApi, type ReferenceAnswer } from '../referenceShelfApi';

export function useReferenceShelf(bookId: string, node: OutlineNode, roster: RosterOption[], token: string | null) {
  const baseScope = JSON.stringify([bookId, node.id, token]);
  const candidates = [...new Set([node.pov_entity_id, ...(node.present_entity_ids ?? []), ...roster.map(r => r.id)].filter((id): id is string => !!id))];
  const options = candidates.map(id => ({ id, label: roster.find(r => r.id === id)?.label ?? id }));
  const [selection, setSelection] = useState({ scope: baseScope, id: '' });
  const entityId = selection.scope === baseScope && candidates.includes(selection.id) ? selection.id : candidates[0] ?? '';
  const scope = JSON.stringify([baseScope, entityId]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [window, setWindow] = useState({ scope, limit: 20 });
  const limit = window.scope === scope ? window.limit : 20;
  const sources = useQuery({
    queryKey: ['plan-reference-shelf', bookId, node.id, entityId, token, limit],
    queryFn: () => referenceShelfApi.list(bookId, entityId, limit, token!),
    enabled: !!bookId && !!entityId && !!token,
    retry: false,
    staleTime: 0,
  });
  // Let the server resolve THIS book's canonical chat cascade; shared context can
  // briefly retain the previous book's effective model while its fetch settles.
  const [model, setModel] = useState({ scope: baseScope, id: '' });
  const modelRef = model.scope === baseScope ? model.id : '';
  const modelSource = 'user_model' as const;
  const [draft, setDraft] = useState({ scope, text: '' });
  const question = draft.scope === scope ? draft.text : '';
  const [result, setResult] = useState<{ scope: string; answer?: ReferenceAnswer; error?: boolean; busy?: boolean }>({ scope });
  const visible = result.scope === scope ? result : undefined;
  const request = useRef(0);
  // Synchronize ephemeral state to the authenticated selection; fence in-flight responses.
  useEffect(() => {
    setResult({ scope });
    setDraft({ scope, text: '' });
    setWindow({ scope, limit: 20 });
    request.current++;
    return () => { request.current++; };
  }, [scope]);
  const ask = async (locale: string) => {
    if (!token || !entityId || !question.trim() || visible?.busy) return;
    const captured = scope;
    const serial = ++request.current;
    setResult({ scope: captured, busy: true });
    try {
      const answer = await referenceShelfApi.ask(bookId, entityId, { question: question.trim(), locale, ...(modelRef ? { model_ref: modelRef, model_source: modelSource } : {}) }, token);
      if (scopeRef.current === captured && serial === request.current) setResult({ scope: captured, answer });
    } catch {
      if (scopeRef.current === captured && serial === request.current) setResult({ scope: captured, error: true });
    }
  };
  return {
    options, entityId, sources, limit, modelRef,
    question, answer: visible?.answer, assistantError: visible?.error, busy: !!visible?.busy,
    selectEntity: (id: string) => { request.current++; setSelection({ scope: baseScope, id }); setResult({ scope: '' }); setDraft({ scope: '', text: '' }); },
    setQuestion: (text: string) => setDraft({ scope, text }),
    setModel: (id: string | null) => { request.current++; setResult({ scope }); setModel({ scope: baseScope, id: id ?? '' }); },
    showMore: () => setWindow({ scope, limit: Math.min(100, limit + 20) }),
    ask,
  };
}
