CREATE TABLE IF NOT EXISTS bugi_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
    topics TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) <= 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bugi_messages_user_id
    ON bugi_messages (user_id, id DESC);
