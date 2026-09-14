import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, KeyRound, LogOut, UserPlus } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-access.css'

const db=supabase as any
const PRODUCTION_URL='https://northborn.vercel.app'
type Details={organization_name:string;customer_name:string;portal_role?:string;invite_status:string;invite_expires_at:string}
const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong')
const roleLabel=(role?:string)=>({admin:'Client Admin',operations:'Operations',billing:'Billing',viewer:'Viewer'}[role||'admin']||'Client Member')
function redirect(path:string){const base=window.location.hostname.endsWith('vercel.app')?PRODUCTION_URL:window.location.origin;return `${base}${path}`}

export default function ClientJoinPage(){
 const params=new URLSearchParams(window.location.search)
 const legacyToken=params.get('invite')||''
 const initialCode=(params.get('code')||'').trim().toUpperCase()
 const [codeInput,setCodeInput]=useState(initialCode),[activeCode,setActiveCode]=useState(initialCode)
 const [details,setDetails]=useState<Details|null>(null),[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(Boolean(initialCode||legacyToken)),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[mode,setMode]=useState<'signin'|'signup'>('signup'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false)
 const path=activeCode?`/client-join?code=${encodeURIComponent(activeCode)}`:`/client-join?invite=${encodeURIComponent(legacyToken)}`

 useEffect(()=>{let active=true;const load=async()=>{
   const s=await supabase.auth.getSession();if(!active)return;setSession(s.data.session)
   if(!activeCode&&!legacyToken){setLoading(false);return}
   setLoading(true);setMessage('');setDetails(null)
   const i=activeCode?await db.rpc('get_customer_portal_invite_by_code',{_code:activeCode}):await db.rpc('get_customer_portal_invite_details',{_token:legacyToken})
   if(!active)return
   if(i.error)setMessage(i.error.message);else if(i.data?.[0])setDetails({...i.data[0],portal_role:i.data[0].portal_role||'admin'});else setMessage('Access code not found.')
   setLoading(false)
 };void load();const {data:l}=supabase.auth.onAuthStateChange((_e,next)=>setSession(next));return()=>{active=false;l.subscription.unsubscribe()}},[activeCode,legacyToken])

 const lookup=(e:React.FormEvent)=>{e.preventDefault();const normalized=codeInput.trim().toUpperCase();if(!normalized){setMessage('Enter your Northborn client access code.');return}setActiveCode(normalized);window.history.replaceState({},'',`/client-join?code=${encodeURIComponent(normalized)}`)}
 const emailAuth=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setMessage('');try{const r=mode==='signin'?await supabase.auth.signInWithPassword({email:email.trim(),password}):await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirect(path)}});if(r.error)throw r.error;if(mode==='signup'&&!r.data.session)setMessage('Check your email to confirm your Northborn account, then return here with your client access code.')}catch(err){setMessage(readError(err))}finally{setBusy(false)}}
 const google=async()=>{setBusy(true);setMessage('');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect(path)}});if(error){setMessage(error.message);setBusy(false)}}
 const accept=async()=>{setBusy(true);setMessage('');try{const r=activeCode?await db.rpc('accept_customer_portal_invite_by_code',{_code:activeCode}):await db.rpc('accept_customer_portal_invite',{_token:legacyToken});if(r.error)throw r.error;window.location.href='/'}catch(err){setMessage(readError(err));setBusy(false)}}
 const signOut=async()=>{await supabase.auth.signOut();setSession(null);setMessage('')}
 const expired=details?new Date(details.invite_expires_at).getTime()<=Date.now():false;const inactive=details&&(details.invite_status!=='pending'||expired)

 if(loading)return <div className="team-page team-center">Checking client access code…</div>
 if(!activeCode&&!legacyToken)return <div className="team-page team-center join-page"><div className="team-card join-card"><div className="join-icon"><KeyRound size={30}/></div><div className="team-eyebrow">NORTHBORN CLIENT PORTAL</div><h1>Enter your access code</h1><p>Your Northborn service provider or Client Admin will give you a code such as <strong>NB-1A2B3C4D5E6F</strong>.</p>{message&&<div className="team-message">{message}</div>}<form className="team-form" onSubmit={lookup}><label>Client access code<input value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())} placeholder="NB-XXXXXXXXXXXX" autoCapitalize="characters" autoComplete="one-time-code" required/></label><button className="team-primary">Continue</button></form><a className="join-home" href="/">Return to Northborn</a></div></div>

 return <div className="team-page team-center join-page"><div className="team-card join-card"><div className="join-icon"><Building2 size={30}/></div><div className="team-eyebrow">NORTHBORN CLIENT PORTAL</div><h1>{details?.customer_name?`Access ${details.customer_name}`:'Client portal invitation'}</h1>{details&&<><p><strong>{details.organization_name}</strong> invited you as <strong>{roleLabel(details.portal_role)}</strong>.</p>{activeCode&&<div className="team-message"><strong>Access code:</strong> {activeCode}</div>}</>}{inactive&&<div className="team-error">This access code is {expired?'expired':details?.invite_status}.</div>}{message&&<div className="team-message">{message}</div>}{!details&&!message&&<div className="team-error">Access code not found.</div>}{details&&!inactive&&!session&&<><button className="google-join" disabled={busy} onClick={()=>void google()}><span>G</span>Continue with Google</button><div className="join-divider"><span>or</span></div><form className="team-form" onSubmit={emailAuth}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<div className="join-password"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==='signup'?8:1} required/><button type="button" onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></div></label><button className="team-primary" disabled={busy}>{busy?'Working…':mode==='signup'?'Create account':'Sign in'}</button></form><button className="join-switch" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('')}}>{mode==='signup'?'Already have an account? Sign in':'Need an account? Create one'}</button></>}{details&&!inactive&&session&&<div className="team-form accept-box"><UserPlus size={30}/><div><strong>Connect your client account</strong><p>Signed in as {session.user.email}. This account will only get access to {details.customer_name} with the {roleLabel(details.portal_role)} role.</p></div><button className="team-primary" disabled={busy} onClick={()=>void accept()}>{busy?'Connecting…':`Open ${details.customer_name} portal`}</button><button type="button" className="join-signout" onClick={()=>void signOut()}><LogOut size={16}/>Use a different account</button></div>}<button className="join-switch" onClick={()=>{setActiveCode('');setCodeInput('');setDetails(null);setMessage('');window.history.replaceState({},'', '/client-join')}}>Use a different access code</button><a className="join-home" href="/">Return to Northborn</a></div></div>
}
