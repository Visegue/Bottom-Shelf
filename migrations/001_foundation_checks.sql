CREATE TABLE IF NOT EXISTS foundation_checks (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  nonce uuid NOT NULL,
  image_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
