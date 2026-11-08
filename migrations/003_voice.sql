-- Voice lane: post-call transcripts and live call events.
-- Transcripts are idempotent on conversation_id (ElevenLabs retries resend the same payload).
CREATE TABLE IF NOT EXISTS voice_transcripts (
  conversation_id text PRIMARY KEY,
  agent_id text NOT NULL,
  status text NOT NULL,
  duration_secs integer,
  turns jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Beats from the agents (code_requested, secret_heard, stop_drill, ...) and call_failed.
CREATE TABLE IF NOT EXISTS voice_events (
  id bigserial PRIMARY KEY,
  conversation_id text NOT NULL,
  kind text NOT NULL,
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_events_conversation_idx ON voice_events (conversation_id, id);
