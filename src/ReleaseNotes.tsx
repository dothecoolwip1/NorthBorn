import { useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, X } from 'lucide-react'
import packageInfo from '../package.json'
import { applyNorthbornUpdate } from './pwa'
import { supabase } from './lib/supabase'
import './release-notes.css'

const VERSION=packageInfo.version
const SEEN_KEY=`northborn_release_seen_${VERSION}`

type ReleaseInfo={version:string;title?:string;notes:string[]}
type NoticeKind='updated'|'available'

const FALLBACK_NOTES:Record<string,string[]>={
  '0.4.0':[
    'Added Billing Queue for owner, admin and accounting roles so approved field tickets are easy to hand off to invoicing.',
    'Approved field tickets can now create invoice drafts without retyping customer, job, PO/AFE, work description or service quantities.',
    'Customer-specific and standard price-sheet matches are used when Northborn can identify a ticket service item.',
    'Added printable field ticket customer copies with work details, hours, service items, disposal details and captured signatures.',
    'Printable ticket copies can be printed or saved as PDF directly from the billing workflow.',
  ],
  '0.3.0':[
    'Added Timesheets with weekly hours, draft and submit workflows, and manager approval or return.',
    'Added Field Tickets with job and unit links, service items, disposal details, customer signatures, and manager review.',
    'Added a public Northborn homepage explaining the platform, its field-first origin, and the industries it is built for.',
    'Hardened sensitive Supabase RPC access so signed-out users cannot execute operational or billing functions.',
    'Improved update delivery so installed copies receive this new application shell.',
  ],
  '0.2.3':[
    'Update notifications now show the patch notes before you choose to install a new version.',
    'Automatic updates still apply in the background and show what changed after the new version loads.',
    'Kept the latest navigation, Reports dashboard and editable employee records from the 0.2.2 polish pass.',
  ],
  '0.2.2':[
    'Added a live manager Reports dashboard for jobs, revenue, fleet, staffing and safety.',
    'Cleaned up navigation so unfinished field modules no longer lead to dead-end screens.',
    'Refreshed the installable app cache so this release is detected by installed copies.',
  ],
}

const currentRelease=():ReleaseInfo=>({version:VERSION,title:`Northborn ${VERSION}`,notes:FALLBACK_NOTES[VERSION]||[]})

async function fetchLatestRelease():Promise<ReleaseInfo|null>{
  try{
    const base=new URL(import.meta.env.BASE_URL,window.location.origin)
    const url=new URL('release.json',base)
    url.searchParams.set('_northborn',Date.now().toString())
    const response=await fetch(url,{cache:'no-store'})
    if(!response.ok)return null
    const data=await response.json() as Partial<ReleaseInfo>
    if(!data.version||!Array.isArray(data.notes))return null
    return {version:String(data.version),title:data.title?String(data.title):undefined,notes:data.notes.map(note=>String(note)).filter(Boolean)}
  }catch{return null}
}

export default function ReleaseNotes(){
  const [open,setOpen]=useState(false)
  const [kind,setKind]=useState<NoticeKind>('updated')
  const [release,setRelease]=useState<ReleaseInfo>(currentRelease())
  const [signedIn,setSignedIn]=useState(false)

  useEffect(()=>{
    let active=true
    let timer:number|undefined
    const consider=(hasSession:boolean)=>{
      if(!active)return
      setSignedIn(hasSession)
      if(!hasSession||!FALLBACK_NOTES[VERSION]?.length||localStorage.getItem(SEEN_KEY)==='1')return
      if(timer)window.clearTimeout(timer)
      timer=window.setTimeout(()=>{
        if(!active)return
        setKind('updated')
        setRelease(currentRelease())
        setOpen(true)
      },900)
    }
    void supabase.auth.getSession().then(({data})=>consider(Boolean(data.session)))
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>consider(Boolean(session)))
    return()=>{active=false;if(timer)window.clearTimeout(timer);listener.subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    let active=true
    const onUpdate=()=>{
      if(!signedIn)return
      void fetchLatestRelease().then(info=>{
        if(!active||!info||info.version===VERSION)return
        setKind('available')
        setRelease(info)
        setOpen(true)
      })
    }
    window.addEventListener('northborn-update-available',onUpdate)
    return()=>{active=false;window.removeEventListener('northborn-update-available',onUpdate)}
  },[signedIn])

  if(!open)return null

  const close=()=>{
    if(kind==='updated'&&release.version===VERSION)localStorage.setItem(SEEN_KEY,'1')
    setOpen(false)
  }
  const updateNow=()=>{
    setOpen(false)
    applyNorthbornUpdate()
  }

  return <aside className={`release-notes ${kind==='available'?'update-ready':''}`} aria-label={kind==='available'?`Northborn ${release.version} update ready`:`Northborn ${VERSION} release notes`}>
    <div className="release-notes-head"><div><span>{kind==='available'?'UPDATE READY':"WHAT'S NEW"}</span><strong>{release.title||`Northborn ${release.version}`}</strong>{kind==='available'&&<small>Currently running {VERSION}</small>}</div><button type="button" onClick={close} aria-label="Dismiss release notes"><X size={18}/></button></div>
    <div className="release-notes-list">{release.notes.map(note=><div key={note}><CheckCircle2 size={16}/><span>{note}</span></div>)}</div>
    {kind==='available'?<button type="button" className="release-notes-done" onClick={updateNow}><RefreshCw size={16}/>Update Northborn now</button>:<button type="button" className="release-notes-done" onClick={close}>Got it</button>}
  </aside>
}
