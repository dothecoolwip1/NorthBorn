import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const org='10000000-0000-0000-0000-000000000001'
const other='10000000-0000-0000-0000-000000000002'
const customer='20000000-0000-0000-0000-000000000001'
const user='30000000-0000-0000-0000-000000000001'
test('invoice transaction enforces permissions, tenant relationships, rollback and stale-edit protection',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`
 create schema auth; create schema private;
 create role anon; create role authenticated; create role service_role;
 create table auth.users(id uuid primary key);
 create table public.organizations(id uuid primary key);
 create table public.customers(id uuid primary key,organization_id uuid);
 create table public.jobs(id uuid primary key,organization_id uuid,customer_id uuid);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function private.has_org_permission(org uuid, permission text) returns boolean language sql stable as $$
 select org=nullif(current_setting('test.org',true),'')::uuid and current_setting('test.manage',true)='yes'$$;
 create function private.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
 create function private.write_audit_log() returns trigger language plpgsql as $$begin return coalesce(new,old);end$$;
 insert into auth.users values('${user}');
 insert into organizations values('${org}'),('${other}');
 insert into customers values('${customer}','${org}');
 grant usage on schema public,private,auth to authenticated;
 grant select on customers,jobs to authenticated;
 select set_config('test.user','${user}',false),set_config('test.org','${org}',false),set_config('test.manage','yes',false);
 `)
 const foundation=await fs.readFile(new URL('../supabase/migrations/20260914225243_invoice_management_foundation.sql',import.meta.url),'utf8')
 await db.exec(foundation.split('create or replace function public.get_my_customer_invoices')[0])
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20260929060749_billing_atomic_save.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 const payload={customer_id:customer,invoice_date:'2026-09-29',status:'issued',tax_rate:5,currency_code:'CAD',amount_paid:0}
 const lines=[{description:'Labour',quantity:2,rate:100,category:'labour',unit:'hour'}]
 const save=async(id=null,body=payload,items=lines,version=null)=>(await db.query('select public.save_invoice_with_lines($1,$2,$3,$4,$5) as invoice',[org,id,JSON.stringify(body),JSON.stringify(items),version])).rows[0].invoice
 let invoice=await save()
 assert.equal(Number(invoice.total),210)
 assert.equal(invoice.status,'issued')
 const original=invoice
 await assert.rejects(save(invoice.id,payload,[{...lines[0],category:'invalid'}],invoice.updated_at),/check constraint/)
 invoice=(await db.query('select * from public.invoices where id=$1',[invoice.id])).rows[0]
 assert.equal(Number(invoice.total),210)
 assert.equal(invoice.status,'issued')
 assert.equal((await db.query('select count(*) from invoice_line_items')).rows[0].count,1)
 await assert.rejects(save(invoice.id,payload,lines,'2020-01-01'),/changed since/)
 await assert.rejects(save(invoice.id,{...payload,amount_paid:211},lines,invoice.updated_at),/exceed/)
 await assert.rejects(save(null,{...payload,customer_id:other}),/same organization/)
 await db.exec("select set_config('test.manage','no',false)")
 await assert.rejects(save(),/permission required/)
 await db.exec("select set_config('test.manage','yes',false)")
 const paid=await save(original.id,{...payload,status:'paid',amount_paid:210},lines,original.updated_at)
 assert.equal(paid.status,'paid')
 assert.equal(Number(paid.balance_due),0)
 await db.exec('reset role')
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20260929114442_invoice_payment_credit_ledger.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 let invoice2=await save()
 const request='40000000-0000-0000-0000-000000000001'
 const settle=async(kind,amount,id=request,reverses=null)=>(await db.query('select public.record_invoice_settlement($1,$2,$3,$4,$5,$6,$7,$8,$9) as entry',[org,invoice2.id,kind,amount,'2026-01-01','TEST','Regression test',id,reverses])).rows[0].entry
 const payment=await settle('payment',50)
 await settle('payment',50)
 assert.equal((await db.query('select amount_paid from invoices where id=$1',[invoice2.id])).rows[0].amount_paid,'50.00')
 await assert.rejects(settle('payment',60),/different settlement/)
 await assert.rejects(settle('payment',200,'40000000-0000-0000-0000-000000000002'),/outstanding balance/)
 await settle('credit',10,'40000000-0000-0000-0000-000000000003')
 let balances=(await db.query('select amount_paid,credit_total,balance_due,status from invoices where id=$1',[invoice2.id])).rows[0]
 assert.deepEqual(balances,{amount_paid:'50.00',credit_total:'10.00',balance_due:'150.00',status:'partially_paid'})
 await settle('payment_reversal',50,'40000000-0000-0000-0000-000000000004',payment.id)
 await assert.rejects(settle('payment_reversal',50,'40000000-0000-0000-0000-000000000005',payment.id),/unique constraint/)
 balances=(await db.query('select amount_paid,balance_due from invoices where id=$1',[invoice2.id])).rows[0]
 assert.deepEqual(balances,{amount_paid:'0.00',balance_due:'200.00'})
 await assert.rejects(db.query('update invoices set amount_paid=99 where id=$1',[invoice2.id]),/settlement history/)
 await assert.rejects(db.query('delete from invoice_settlements where id=$1',[payment.id]),/permission denied/)
 await assert.rejects(db.query("update invoices set status='void' where id=$1",[invoice2.id]),/Reverse payments and credits/)
 const opening=(await db.query('select * from invoice_settlements where invoice_id=$1',[paid.id])).rows[0]
 assert.equal(opening.is_opening_balance,true)
 assert.equal(Number(opening.amount),210)
 await db.exec('reset role')
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20260929115101_invoice_approval_workflow.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 await assert.rejects(save(),/approved invoice/)
 const draft=await save(null,{...payload,status:'draft'})
 await assert.rejects(db.query("update invoices set status='issued' where id=$1",[draft.id]),/approved invoice/)
 await db.query("update invoices set approval_status='submitted' where id=$1",[draft.id])
 await assert.rejects(db.query("update invoices set approval_status='returned' where id=$1",[draft.id]),/Explain why/)
 await db.query("update invoices set approval_status='approved' where id=$1",[draft.id])
 await db.query("update invoice_line_items set description='Revised description' where invoice_id=$1",[draft.id])
 assert.deepEqual((await db.query('select approval_status,approved_by,approved_at from invoices where id=$1',[draft.id])).rows[0],{approval_status:'draft',approved_by:null,approved_at:null})
 await db.query("update invoices set approval_status='submitted' where id=$1",[draft.id])
 await db.query("update invoices set approval_status='approved' where id=$1",[draft.id])
 await db.query("update invoices set status='issued' where id=$1",[draft.id])
 await assert.rejects(db.query("update invoice_line_items set description='Changed' where invoice_id=$1",[draft.id]),/cannot be changed/)
 assert.equal((await db.query('select approved_by from invoices where id=$1',[draft.id])).rows[0].approved_by,user)
 await db.exec('reset role')
 await db.exec(`
 alter table organizations add column name text,add column settings jsonb default '{}';
 alter table customers add column name text,add column address text,add column billing_email text;
 alter table jobs add column title text,add column site_address text,add column site_name text;
 create table employees(id uuid primary key,organization_id uuid,user_id uuid,status text);
 create table fleet_vehicles(id uuid primary key,organization_id uuid);
 create table price_sheet_items(id uuid primary key,organization_id uuid,name text,category text,unit text,default_rate numeric,is_active boolean,sort_order integer);
 create table customer_price_overrides(organization_id uuid,customer_id uuid,price_item_id uuid,rate numeric);
 create function private.is_user_assigned_to_job(uuid,uuid) returns boolean language sql as 'select false';
 update customers set name='Customer';update organizations set name='Company';
 grant select on employees,fleet_vehicles,price_sheet_items,customer_price_overrides to authenticated;
 `)
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20260916070832_create_field_tickets.sql',import.meta.url),'utf8'))
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20260929115333_price_minimum_quantities.sql',import.meta.url),'utf8'))
 await db.exec(`
 grant select,insert,update,delete on field_tickets,field_ticket_items to authenticated;
 insert into price_sheet_items values('50000000-0000-0000-0000-000000000001','${org}','Labour','labour','hour',50,true,0,2);
 insert into customer_price_overrides values('${org}','${customer}','50000000-0000-0000-0000-000000000001',10);
 `)
 await db.exec('set role authenticated')
 const ticket=(await db.query("insert into field_tickets(organization_id,customer_id,status,created_by) values($1,$2,'approved',$3) returning id",[org,customer,user])).rows[0]
 await db.query("insert into field_ticket_items(organization_id,ticket_id,price_item_id,description,quantity,unit,category,created_by) values($1,$2,'50000000-0000-0000-0000-000000000001','Labour',1,'hour','labour',$3)",[org,ticket.id,user])
 const converted=(await db.query('select create_invoice_from_field_ticket($1,$2) as result',[org,ticket.id])).rows[0].result
 const duplicate=(await db.query('select create_invoice_from_field_ticket($1,$2) as result',[org,ticket.id])).rows[0].result
 assert.equal(converted.invoice_id,duplicate.invoice_id)
 assert.equal(duplicate.existing,true)
 const fromTicket=(await db.query('select total,status from invoices where id=$1',[converted.invoice_id])).rows[0]
 assert.equal(fromTicket.total,'21.00');assert.equal(fromTicket.status,'draft')
 } finally {await db.close()}
})

