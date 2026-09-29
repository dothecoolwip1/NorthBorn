-- RLS expressions run as the caller and need EXECUTE on their pure path parsers.
-- These helpers read no tables and return only UUIDs parsed from the supplied path.
grant usage on schema private to authenticated;
grant execute on function private.safety_storage_submission_id(text) to authenticated;
grant execute on function private.form_attachment_org_id(text) to authenticated;
grant execute on function private.form_attachment_record_id(text) to authenticated;
