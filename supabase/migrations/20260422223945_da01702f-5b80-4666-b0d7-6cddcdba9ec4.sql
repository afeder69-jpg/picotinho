ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_realtime_messages_select" ON realtime.messages;
DROP POLICY IF EXISTS "deny_realtime_messages_insert" ON realtime.messages;

CREATE POLICY "deny_realtime_messages_select"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "deny_realtime_messages_insert"
  ON realtime.messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);