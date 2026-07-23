-- Personal free-form text notes (MVP personal status until structured fields exist).
CREATE TABLE IF NOT EXISTS personal_note (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_note_user_updated
    ON personal_note (user_id, updated_at DESC);
