-- No accounts, IP addresses, transcripts, phone numbers or voice conversation IDs.
CREATE TABLE tell_try_it_limits (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  expires_at timestamptz NOT NULL
);
CREATE TABLE tell_try_it_outcomes (
  play_id uuid PRIMARY KEY,
  balance integer NOT NULL,
  interview text NOT NULL CHECK (interview IN ('OPEN', 'BOOKED')),
  bank text NOT NULL CHECK (bank IN ('OPEN', 'RESOLVED', 'FAILED'))
);
