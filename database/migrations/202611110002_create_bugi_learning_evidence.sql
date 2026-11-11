CREATE TABLE IF NOT EXISTS bugi_learning_evidence (
    message_id BIGINT NOT NULL REFERENCES bugi_messages(id) ON DELETE CASCADE,
    concept VARCHAR(64) NOT NULL CHECK (concept ~ '^[a-z][a-z0-9-]{0,63}$'),
    kind TEXT NOT NULL CHECK (kind IN ('interest', 'misconception', 'syntax', 'logic', 'confusion', 'failed-application', 'demonstrated', 'preference')),
    fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
    PRIMARY KEY (message_id, concept, kind)
);
