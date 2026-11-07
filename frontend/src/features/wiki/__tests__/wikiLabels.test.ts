import { describe, it, expect } from 'vitest';
import { localizedKindLabel, localizedAttrLabel, localizedWikiHeading } from '../wikiLabels';

describe('wiki ontology label overlay (#user-report: System standards rendered in English)', () => {
  it('localizes every System-standard kind code', () => {
    for (const code of ['character', 'colleague', 'decision', 'event', 'item', 'jargon',
      'location', 'meeting', 'org', 'organization', 'plot_arc', 'power_system', 'project',
      'relationship', 'social_setting', 'species', 'task', 'technique', 'terminology',
      'trope', 'unknown']) {
      expect(localizedKindLabel('ru', { code, name: 'English Name' })).not.toBe('English Name');
    }
  });

  it('localizes every System-standard attribute code', () => {
    for (const code of ['abilities', 'affiliation', 'aliases', 'appearance', 'arc_type',
      'atmosphere', 'capabilities', 'category', 'chapters_span', 'class_hierarchy', 'culture',
      'date_in_story', 'definition', 'description', 'dynamic', 'effects', 'emotional_beats',
      'emotional_impact', 'emotional_wound', 'entry_requirement', 'era', 'gender', 'habitat',
      'headquarters', 'how_manifested', 'key_conflict', 'leader', 'location', 'love_language',
      'members', 'name', 'occupation', 'outcome', 'owner', 'parent_location', 'participants',
      'parties', 'personality', 'rank', 'related_characters', 'relationship_type',
      'relationships', 'resolution', 'role', 'romance_obstacles', 'rules_norms', 'significance',
      'social_class', 'stakes', 'status', 'subverted', 'symbolic_meaning', 'term', 'tiers',
      'traits', 'trigger', 'tropes', 'turning_points', 'type', 'usage_note', 'user']) {
      expect(localizedAttrLabel('ru', { code, name: 'English Label' })).not.toBe('English Label');
    }
  });

  it('falls back to the stored name for custom ontology rows', () => {
    expect(localizedKindLabel('ru', { code: 'my_custom_kind', name: 'Мой вид' })).toBe('Мой вид');
    expect(localizedAttrLabel('ru', { code: 'custom_attr', name: 'Авторское' })).toBe('Авторское');
  });

  it('is base-code tolerant', () => {
    expect(localizedKindLabel('ru-RU', { code: 'character', name: 'Character' })).toBe('Персонаж');
  });

  it('localizes the baked references heading (the legacy Chinese one too)', () => {
    expect(localizedWikiHeading('ru', '引用来源 · References')).toBe('Источники');
    expect(localizedWikiHeading('ru', 'References')).toBe('Источники');
    // non-ru UIs: the Chinese legacy heading still normalizes to English
    expect(localizedWikiHeading('en', '引用来源 · References')).toBe('References');
    expect(localizedWikiHeading('ru', 'Внутренний надзор')).toBe('Внутренний надзор');
  });
});
