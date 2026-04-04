DELETE FROM campanhas_whatsapp
WHERE id IN (
  'a64bf808-9a00-4057-a972-cf524e897521',
  '7094ec57-54d3-4086-9ec1-c9ab48980cd7',
  '4840b5cc-e54e-49d8-99f5-fb69de23793e'
)
AND status = 'enviando';