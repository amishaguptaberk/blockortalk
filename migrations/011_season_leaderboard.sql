-- Apply during deployment: repeat migration runs do not restart Season 1.
INSERT INTO seasons (id, name, starts_at, ends_at, prizes)
VALUES ('season-1', 'Season 1', now(), now() + interval '55 hours',
  '[{"place":1,"prize":"iPhone 18"},{"place":2,"prize":"A week of free data"},{"place":3,"prize":"$50 gift card"}]')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE season_claims (
  season_id text NOT NULL REFERENCES seasons(id),
  player_id uuid NOT NULL REFERENCES players(id),
  email text NOT NULL,
  adult boolean NOT NULL CHECK (adult),
  us_resident boolean NOT NULL CHECK (us_resident),
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

-- Enforce the deadline even for writers outside the Season routes.
-- A statement that runs after the deadline must not alter the final board.
CREATE FUNCTION guard_season_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_time timestamptz; end_time timestamptz; season_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.season_id, NEW.player_id) IS DISTINCT FROM (OLD.season_id, OLD.player_id) THEN
    RAISE EXCEPTION 'A Season score cannot change its Player or Season';
  END IF;
  IF TG_OP = 'DELETE' THEN season_key := OLD.season_id;
  ELSE season_key := NEW.season_id; END IF;
  SELECT starts_at, ends_at INTO start_time, end_time FROM seasons WHERE id = season_key FOR SHARE;
  IF start_time IS NULL OR clock_timestamp() < start_time OR clock_timestamp() >= end_time THEN
    RAISE EXCEPTION 'Scoring is closed for this Season';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER season_score_window BEFORE INSERT OR UPDATE OR DELETE ON season_scores
FOR EACH ROW EXECUTE FUNCTION guard_season_score();

-- Reject a transaction that wrote while live but commits after the deadline.
CREATE CONSTRAINT TRIGGER season_score_commit_window AFTER INSERT OR UPDATE OR DELETE ON season_scores
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_season_score();
