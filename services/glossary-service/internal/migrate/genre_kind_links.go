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
