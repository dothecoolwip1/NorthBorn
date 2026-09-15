create index safety_credentials_uploaded_by_idx on public.safety_credentials(uploaded_by);
create index safety_credentials_verified_by_idx on public.safety_credentials(verified_by) where verified_by is not null;
create index safety_documents_created_by_idx on public.safety_documents(created_by);
create index safety_form_submissions_org_employee_idx on public.safety_form_submissions(organization_id, employee_id) where employee_id is not null;
create index safety_form_submissions_reviewed_by_idx on public.safety_form_submissions(reviewed_by) where reviewed_by is not null;
