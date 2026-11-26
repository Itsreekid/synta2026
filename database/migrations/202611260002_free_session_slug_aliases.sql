-- HELD: local execution requires owner approval; never promote automatically.
-- Requires the existing free-session campaign schema (original or compatible replacement).
CREATE TABLE free_session_slug_aliases (
  slug TEXT PRIMARY KEY CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60
    AND slug NOT IN ('admin','api','login','verify','status','questions','submit','register')
  ),
  free_session_id UUID NOT NULL REFERENCES free_sessions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_free_session_slug_aliases_campaign ON free_session_slug_aliases(free_session_id);
INSERT INTO free_session_slug_aliases(slug,free_session_id) SELECT slug,id FROM free_sessions;

CREATE FUNCTION reserve_free_session_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO free_session_slug_aliases(slug,free_session_id) VALUES(NEW.slug,NEW.id)
    ON CONFLICT(slug) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM free_session_slug_aliases WHERE slug=NEW.slug AND free_session_id=NEW.id) THEN
    RAISE EXCEPTION 'Public campaign link already reserved' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reserve_free_session_slug AFTER INSERT OR UPDATE OF slug ON free_sessions
  FOR EACH ROW EXECUTE FUNCTION reserve_free_session_slug();

CREATE FUNCTION preserve_free_session_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Shared campaign links are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER preserve_free_session_slug BEFORE UPDATE OR DELETE ON free_session_slug_aliases
  FOR EACH ROW EXECUTE FUNCTION preserve_free_session_slug();
