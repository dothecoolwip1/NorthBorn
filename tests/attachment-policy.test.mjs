import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('authenticated storage policies can execute path parsers without anonymous grants',async()=>{
 const db=new PGlite()
 try{
  await db.exec('create schema private;create role authenticated;create role anon;create role service_role;grant usage on schema private to authenticated;')
  const files=['20260929053000_pack6_safety_management_completion.sql','20260929060000_pack7_templates_forms_tickets_timesheets.sql']
  for(const file of files){
   const sql=await fs.readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')
   for(const name of ['safety_storage_submission_id','form_attachment_org_id','form_attachment_record_id']){
    const start=sql.indexOf('create or replace function private.'+name+'(')
    if(start<0)continue
    const end=sql.indexOf('$$;',start)+3
    await db.exec(sql.slice(start,end))
    await db.exec(`revoke all on function private.${name}(text) from public,anon,authenticated,service_role`)
   }
  }
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260929124054_attachment_policy_helper_permissions.sql',import.meta.url),'utf8'))
  await db.exec(`create table objects(name text);alter table objects enable row level security;grant select on objects to authenticated;
   create policy scoped on objects for select to authenticated using(private.form_attachment_org_id(name)='10000000-0000-0000-0000-000000000001'::uuid);
   insert into objects values('10000000-0000-0000-0000-000000000001/tickets/20000000-0000-0000-0000-000000000001/photo.jpg'),('10000000-0000-0000-0000-000000000002/tickets/20000000-0000-0000-0000-000000000001/photo.jpg');
   set role authenticated;`)
  assert.equal((await db.query('select * from objects')).rows.length,1)
  assert.equal((await db.query("select private.safety_storage_submission_id('bad') as value")).rows[0].value,null)
  assert.equal((await db.query("select private.form_attachment_record_id('10000000-0000-0000-0000-000000000001/tickets/20000000-0000-0000-0000-000000000001/photo.jpg') as value")).rows[0].value,'20000000-0000-0000-0000-000000000001')
  assert.equal((await db.query("select has_function_privilege('anon','private.form_attachment_org_id(text)','EXECUTE') as allowed")).rows[0].allowed,false)
 }finally{await db.close()}
})

test('complete Pack 6 and Pack 7 migrations compile with tenant-scoped attachment policies',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`
   create schema private;create schema auth;create schema storage;
   create role anon;create role authenticated;create role service_role;
   create function auth.uid() returns uuid language sql stable as $$select '30000000-0000-0000-0000-000000000001'::uuid$$;
   create function private.has_org_permission(uuid,text) returns boolean language sql stable as $$select false$$;
   create function private.is_org_member(uuid) returns boolean language sql stable as $$select $1='10000000-0000-0000-0000-000000000001'::uuid$$;
   create function private.is_current_user_employee(uuid,uuid) returns boolean language sql stable as $$select false$$;
   create function private.safety_storage_org_id(text) returns uuid language sql stable as $$select null::uuid$$;
   create function private.safety_storage_employee_id(text) returns uuid language sql stable as $$select null::uuid$$;
   create table auth.users(id uuid primary key);
   create table organizations(id uuid primary key);
   create table employees(id uuid primary key,organization_id uuid,user_id uuid);
   create table safety_documents(id uuid primary key,organization_id uuid,status text);
   create table safety_form_submissions(id uuid primary key,organization_id uuid,submitted_by uuid,form_type text);
   create table document_templates(id uuid primary key,organization_id uuid,status text,document_type text);
   create table field_tickets(id uuid primary key,organization_id uuid,primary_employee_id uuid,created_by uuid,status text);
   create table timesheet_entries(id uuid primary key,organization_id uuid,employee_id uuid,status text);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   grant usage on schema private,auth,storage to authenticated;
   grant select on employees,field_tickets,timesheet_entries,safety_form_submissions to authenticated;
  `)
  for(const file of ['20260929053000_pack6_safety_management_completion.sql','20260929060000_pack7_templates_forms_tickets_timesheets.sql','20260929124054_attachment_policy_helper_permissions.sql'])await db.exec(await fs.readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
  await db.exec(`
   insert into auth.users values('30000000-0000-0000-0000-000000000001');
   insert into organizations values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
   insert into employees values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
   insert into timesheet_entries(id,organization_id,employee_id,status) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','draft');
   set role authenticated;
  `)
  const insert=org=>db.query("insert into timesheet_attachments(organization_id,timesheet_entry_id,file_name,storage_path,created_by) values($1,'40000000-0000-0000-0000-000000000001','file.pdf',$2,auth.uid())",[org,org+'/timesheets/40000000-0000-0000-0000-000000000001/file.pdf'])
  await insert('10000000-0000-0000-0000-000000000001')
  assert.equal((await db.query('select * from timesheet_attachments')).rows.length,1)
  await assert.rejects(insert('10000000-0000-0000-0000-000000000002'),/same organization/)
 }finally{await db.close()}
})
