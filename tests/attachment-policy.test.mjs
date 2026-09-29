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
