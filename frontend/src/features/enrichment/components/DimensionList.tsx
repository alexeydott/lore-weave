import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Proposal } from '../types';

/** Below this count the dimensions collapse behind a "show more" expander, so a
 *  5-dimension draft doesn't dominate the detail pane (LE-066). */
const COLLAPSE_AT = 3;

// Legacy proposals stored the zh-native display labels as dimension-map keys.
// New proposals use stable dimension IDs (localized when generated); normalize
// only for display, never rewrite the persisted proposal/audit data.
const LEGACY_DIMENSION_IDS: Record<string, string> = {
  '历史': 'history', '地理': 'geography', '文化': 'culture', '外貌': 'appearance',
  '性格': 'personality', '关系': 'relationships', '经历': 'background',
  '来历': 'origin', '外形': 'appearance', '持有': 'owner', '意义': 'significance',
  '宗旨': 'goals', '组织': 'structure', '成员': 'members', '起因': 'cause',
  '经过': 'timeline', '结果': 'outcome', '参与': 'participants', '概述': 'description', '细节': 'details',
};

// The old zh label 能力 represented character abilities and item powers.
const LEGACY_DIMENSION_IDS_BY_KIND: Record<string, Record<string, string>> = {
  character: { '能力': 'abilities' },
  item: { '能力': 'powers' },
};

export function displayDimensionLabel(label: string, entityKind: string, t: TFunction): string {
  const id = LEGACY_DIMENSION_IDS_BY_KIND[entityKind]?.[label] ?? LEGACY_DIMENSION_IDS[label] ?? label;
  return t(`gaps.dims.${id}`, { defaultValue: label });
}

/** The per-dimension generated lore (历史 / 地理 / 文化 / …) rendered as cards. The
 *  structured map lives in provenance_json.dimensions; falls back to the raw content
 *  summary if absent. */
export function DimensionList({ proposal }: { proposal: Proposal }) {
  const { t } = useTranslation('enrichment');
  const [expanded, setExpanded] = useState(false);
  const dims = proposal.provenance_json?.dimensions ?? {};
  const entries = Object.entries(dims);

  if (entries.length === 0) {
    return (
      <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
        {proposal.content}
      </pre>
    );
  }

  const collapsible = entries.length > COLLAPSE_AT;
  const shown = collapsible && !expanded ? entries.slice(0, COLLAPSE_AT) : entries;
  const hidden = entries.length - COLLAPSE_AT;

  return (
    <div className="space-y-2" data-testid="enrichment-dimensions">
      <p className="text-[11px] text-muted-foreground">
        {t('detail.dimensions', { count: entries.length })}
      </p>
      {shown.map(([dim, text]) => (
        <div key={dim} className="rounded-lg border bg-card px-3 py-2">
          {/* Stored dimensions may use legacy Chinese labels; localize only at the
              view boundary so persisted proposal/audit identifiers stay untouched. */}
          <div className="mb-0.5 text-[11px] font-medium text-primary">
            {displayDimensionLabel(dim, proposal.entity_kind, t)}
          </div>
          <p className="font-serif text-sm leading-relaxed text-foreground">{text}</p>
        </div>
      ))}
      {collapsible && (
        <button
          onClick={() => setExpanded((v) => !v)}
          data-testid="enrichment-dimensions-toggle"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> {t('detail.show_less')}
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> {t('detail.show_more', { count: hidden })}
            </>
          )}
        </button>
      )}
    </div>
  );
}
