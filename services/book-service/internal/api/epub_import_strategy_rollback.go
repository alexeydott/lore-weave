package api

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) rollbackEPUBImportStrategy(ctx context.Context, tx pgx.Tx, jobID, bookID uuid.UUID, conflicts *[]any) error {
	rows, err := tx.Query(ctx, `SELECT effect_key,before_json,applied_at FROM import_job_effects WHERE job_id=$1 AND effect_type='replace_all_chapter' AND rolled_back_at IS NULL FOR UPDATE`, jobID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var beforeJSON []byte
		var appliedAt interface{}
		if err := rows.Scan(&key, &beforeJSON, &appliedAt); err != nil {
			return err
		}
		chapterID, err := uuid.Parse(key)
		if err != nil {
			return err
		}
		var updatedAt interface{}
		if err := tx.QueryRow(ctx, `SELECT updated_at FROM chapters WHERE id=$1 AND book_id=$2`, chapterID, bookID).Scan(&updatedAt); err == pgx.ErrNoRows {
			if _, err := tx.Exec(ctx, `UPDATE import_job_effects SET rolled_back_at=now() WHERE job_id=$1 AND effect_type='replace_all_chapter' AND effect_key=$2`, jobID, key); err != nil {
				return err
			}
			continue
		} else if err != nil {
			return err
		}
		// The row is only restored if no user action happened after replace_all.
		// pgx's time values are compared in SQL to avoid lossy interface casts.
		var changed bool
		if err := tx.QueryRow(ctx, `SELECT updated_at > (SELECT applied_at FROM import_job_effects WHERE job_id=$1 AND effect_type='replace_all_chapter' AND effect_key=$2) FROM chapters WHERE id=$3`, jobID, key, chapterID).Scan(&changed); err != nil {
			return err
		}
		if changed {
			*conflicts = append(*conflicts, map[string]any{"chapter_id": chapterID, "code": "rollback_conflict_user_modified"})
			continue
		}
		var before struct {
			LifecycleState string `json:"lifecycle_state"`
			TrashedAt      string `json:"trashed_at"`
		}
		if err := json.Unmarshal(beforeJSON, &before); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE chapters SET lifecycle_state=$2,trashed_at=NULL,updated_at=now() WHERE id=$1`, chapterID, before.LifecycleState); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE import_job_effects SET rolled_back_at=now() WHERE job_id=$1 AND effect_type='replace_all_chapter' AND effect_key=$2`, jobID, key); err != nil {
			return err
		}
	}
	return rows.Err()
}
