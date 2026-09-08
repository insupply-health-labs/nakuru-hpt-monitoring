CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
ix_password_reset_tokens_user_id
ON password_reset_tokens (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS
ix_password_reset_tokens_token_hash
ON password_reset_tokens (token_hash);
