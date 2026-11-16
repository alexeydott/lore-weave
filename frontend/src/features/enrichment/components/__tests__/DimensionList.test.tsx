import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionList } from '../DimensionList';
import type { Proposal } from '../../types';

const t = vi.fn((key: string, options?: { defaultValue?: string; count?: number }) => {
  const ru: Record<string, string> = {
    'gaps.dims.origin': 'Происхождение', 'gaps.dims.powers': 'Силы',
    'gaps.dims.abilities': 'Способности', 'gaps.dims.appearance': 'Внешность',
    'gaps.dims.owner': 'Владелец', 'gaps.dims.significance': 'Значимость',
    'gaps.dims.history': 'История', 'gaps.dims.geography': 'География',
    'gaps.dims.culture': 'Культура',
  };
  return (ru[key] ?? options?.defaultValue ?? key).replace('{{count}}', String(options?.count ?? ''));
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));

const P = (over: Partial<Proposal> = {}): Proposal =>
  ({
    proposal_id: 'p-1',
    project_id: 'proj-9',
    entity_kind: 'location',
    origin: 'enrichment',
    technique: 'retrieval',
    content: 'raw summary content',
    confidence: 0.4,
    provenance_json: {},
    source_refs_json: [],
    review_status: 'proposed',
    ...over,
  } as Proposal);

describe('DimensionList', () => {
  it('with no dimensions, falls back to the raw content in a <pre>', () => {
    const { container } = render(<DimensionList proposal={P({ content: 'raw summary content', provenance_json: {} })} />);
    expect(screen.queryByTestId('enrichment-dimensions')).toBeNull();
    expect(container.querySelector('pre')).toHaveTextContent('raw summary content');
  });

  it('treats an empty dimensions map the same as absent', () => {
    const { container } = render(<DimensionList proposal={P({ provenance_json: { dimensions: {} } })} />);
    expect(screen.queryByTestId('enrichment-dimensions')).toBeNull();
    expect(container.querySelector('pre')).not.toBeNull();
  });

  it('localizes legacy Chinese dimension labels but preserves saved content', () => {
    const dimensions = {
      历史: '商周交替的背景',
      地理: '朝歌城外的山水',
    };
    render(<DimensionList proposal={P({ provenance_json: { dimensions } })} />);
    expect(screen.getByTestId('enrichment-dimensions')).toBeInTheDocument();
    expect(screen.getByText('detail.dimensions')).toBeInTheDocument();
    expect(screen.getByText('История')).toBeInTheDocument();
    expect(screen.getByText('商周交替的背景')).toBeInTheDocument();
    expect(screen.getByText('География')).toBeInTheDocument();
    expect(screen.getByText('朝歌城外的山水')).toBeInTheDocument();
    expect(document.querySelector('pre')).toBeNull();
  });

  it('uses entity kind to disambiguate the legacy 能力 label', () => {
    const character = P({ entity_kind: 'character', provenance_json: { dimensions: { 能力: 'Русский навык' } } });
    const item = P({ entity_kind: 'item', provenance_json: { dimensions: { 能力: 'Русское свойство' } } });

    const { rerender } = render(<DimensionList proposal={character} />);
    expect(screen.getByText('Способности')).toBeInTheDocument();
    expect(screen.getByText('Русский навык')).toBeInTheDocument();
    expect(screen.queryByText('能力')).toBeNull();

    rerender(<DimensionList proposal={item} />);
    expect(screen.getByText('Силы')).toBeInTheDocument();
    expect(screen.getByText('Русское свойство')).toBeInTheDocument();
  });

  it('localizes stable IDs and leaves unknown/custom dimensions visible', () => {
    const proposal = P({ provenance_json: { dimensions: {
      origin: 'Телефон найден у героя.', powers: 'Служит средством связи.', custom_fact: 'Неизвестное значение.',
    } } });
    render(<DimensionList proposal={proposal} />);
    expect(screen.getByText('Происхождение')).toBeInTheDocument();
    expect(screen.getByText('Силы')).toBeInTheDocument();
    expect(screen.getByText('custom_fact')).toBeInTheDocument();
    expect(screen.getByText('Телефон найден у героя.')).toBeInTheDocument();
    expect(screen.getByText('Служит средством связи.')).toBeInTheDocument();
    expect(screen.getByText('Неизвестное значение.')).toBeInTheDocument();
    expect(screen.queryByText('origin')).toBeNull();
  });

  it('collapses dimensions beyond 3 behind a toggle; expanding reveals the rest', () => {
    const dimensions = { 历史: 'h', 地理: 'g', 文化: 'c', features: 'f', inhabitants: 'i' };
    render(<DimensionList proposal={P({ provenance_json: { dimensions } })} />);
    expect(screen.getByText('История')).toBeInTheDocument();
    expect(screen.getByText('Культура')).toBeInTheDocument();
    expect(screen.queryByText('features')).toBeNull();
    expect(screen.queryByText('inhabitants')).toBeNull();
    const toggle = screen.getByTestId('enrichment-dimensions-toggle');
    expect(toggle).toHaveTextContent('detail.show_more');
    fireEvent.click(toggle);
    expect(screen.getByText('features')).toBeInTheDocument();
    expect(screen.getByText('inhabitants')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('detail.show_less');
  });

  it('renders no toggle when there are 3 or fewer dimensions', () => {
    const dimensions = { 历史: 'h', 地理: 'g', 文化: 'c' };
    render(<DimensionList proposal={P({ provenance_json: { dimensions } })} />);
    expect(screen.queryByTestId('enrichment-dimensions-toggle')).toBeNull();
  });
});
