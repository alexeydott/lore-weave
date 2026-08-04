package migrate

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/loreweave/glossary-service/internal/domain"
)

// SeedGenreKindLinks applies curated system genre-kind defaults to the system catalogue and existing books.
func SeedGenreKindLinks(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("seed genre-kind links: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, k := range domain.DefaultKinds {
		for _, genre := range k.GenreTags {
			if _, err := tx.Exec(ctx, "INSERT INTO system_kind_genres (kind_id, genre_id) SELECT sk.kind_id, sg.genre_id FROM system_kinds sk JOIN system_genres sg ON sg.code = $2 WHERE sk.code = $1 ON CONFLICT DO NOTHING", k.Code, genre); err != nil {
				return fmt.Errorf("seed system link %s/%s: %w", k.Code, genre, err)
			}
		}
	}
	if _, err := tx.Exec(ctx, "INSERT INTO book_kind_genres (book_id, kind_id, genre_id) SELECT bk.book_id, bk.book_kind_id, bg.genre_id FROM system_kind_genres skg JOIN system_kinds sk ON sk.kind_id = skg.kind_id AND sk.is_default JOIN system_genres sg ON sg.genre_id = skg.genre_id AND sg.is_default JOIN book_kinds bk ON bk.code = sk.code JOIN book_genres bg ON bg.book_id = bk.book_id AND bg.code = sg.code ON CONFLICT DO NOTHING"); err != nil {
		return fmt.Errorf("seed book genre-kind links: %w", err)
	}
	return tx.Commit(ctx)
}

// SeedGenreKindAttributes copies the universal attribute definitions to every
// system kind/genre link, then repairs already-adopted book ontologies.
func SeedGenreKindAttributes(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("seed genre-kind attributes: begin: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "INSERT INTO system_attributes (kind_id, genre_id, code, name, description, field_type, is_required, sort_order, options, auto_fill_prompt, translation_hint, content_hash) SELECT a.kind_id, kg.genre_id, a.code, a.name, a.description, a.field_type, a.is_required, a.sort_order, a.options, a.auto_fill_prompt, a.translation_hint, a.content_hash FROM system_attributes a JOIN system_genres universal ON universal.genre_id = a.genre_id AND universal.code = 'universal' JOIN system_kind_genres kg ON kg.kind_id = a.kind_id JOIN system_genres genre ON genre.genre_id = kg.genre_id AND genre.code <> 'universal' ON CONFLICT (kind_id, genre_id, code) DO NOTHING"); err != nil {
		return fmt.Errorf("seed system genre attributes: %w", err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO book_attributes (book_id, kind_id, genre_id, code, name, description, field_type, is_required, sort_order, options, auto_fill_prompt, translation_hint, source_ref, source_hash, merge_strategy) SELECT bk.book_id, bk.book_kind_id, bg.genre_id, sa.code, sa.name, sa.description, sa.field_type, sa.is_required, sa.sort_order, sa.options, sa.auto_fill_prompt, sa.translation_hint, 'system:' || sa.attr_id::text, sa.content_hash, sa.merge_strategy FROM system_attributes sa JOIN system_kinds sk ON sk.kind_id = sa.kind_id AND sk.is_default JOIN system_genres sg ON sg.genre_id = sa.genre_id AND sg.is_default JOIN book_kinds bk ON bk.code = sk.code JOIN book_genres bg ON bg.book_id = bk.book_id AND bg.code = sg.code WHERE sa.genre_id <> (SELECT genre_id FROM system_genres WHERE code = 'universal') AND NOT EXISTS (SELECT 1 FROM book_attributes ba WHERE ba.book_id = bk.book_id AND ba.kind_id = bk.book_kind_id AND ba.genre_id = bg.genre_id AND ba.code = sa.code)"); err != nil {
		return fmt.Errorf("seed book genre attributes: %w", err)
	}
	return tx.Commit(ctx)
}
