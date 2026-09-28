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
  '0.9.8':[
    'Finished Pack 2 dispatch, calendar and jobs workflows with isolated end-to-end QA and automatic unit release after completed or cancelled jobs.',
    'Fixed assignment-history cleanup, functional test state reset, Fleet workflow selectors, signed-out verification, and test-only role-switcher overlap during final fleet-release QA.',
    'Preserved the full Pack 1 authentication, role isolation, navigation, mobile and production QA baseline.',
  ],
  '0.9.7':[
    'Finalized Pack 2 fleet-release verification with a case-insensitive availability assertion that matches the existing status display.',
    'Confirmed the completed-job lifecycle returns its assigned QA unit to available before cleanup.',
    'Preserved the complete dispatch, calendar, jobs, auth, role, mobile and data-consistency QA contract.',
  ],
  '0.9.6':[
    'Finalized Pack 2 signed-out browser verification so the intentional header and footer Sign in links are both handled correctly.',
    'Kept the full manager to operator to manager dispatch workflow under real browser validation without weakening authentication checks.',
    'Preserved all Pack 2 dispatch, calendar, jobs, fleet lifecycle and data consistency hardening.',
  ],
  '0.9.5':[
    'Finalized Pack 2 functional QA so temporary fleet units use their real Available default and status cleanup targets the actual select control.',
    'Preserved active Pack 2 QA state across manager sign-ins so the completed job remains available for final verification.',
    'Kept all Pack 2 dispatch, calendar, jobs, unit-release, delete-consistency and test-layout fixes intact.',
  ],
  '0.9.4':[
    'Moved manager Fleet actions clear of the functional TEST role control so QA can exercise real clicks without forced interactions.',
    'Kept the Pack 2 isolated unit workflow and completed-job fleet release checks intact.',
    'Preserved the finalized dispatch, calendar, jobs and data-lifecycle hardening from Pack 2.',
  ],
  '0.9.3':[
    'Fixed Pack 2 job deletion so assignment-history cleanup cannot write an event against a parent job that is already being removed.',
    'Kept assignment history intact for normal crew and unit changes while making cascade deletes safe and consistent.',
    'Cleaned stale Pack 2 QA artifacts from the isolated Northborn test workspace and reconciled its fleet availability.',
  ],
  '0.9.2':[
    'Finished Pack 2 release hardening with isolated end-to-end dispatch resources so failed QA runs cannot consume the shared test fleet.',
    'Automatically returns assigned units to Available when their completed or cancelled job closes and no other active job still needs the unit.',
    'Made functional test sign-in tolerant of a transient first redirect while still requiring the authenticated workspace to render before QA continues.',
  ],
  '0.9.1':[
    'Completed the Operations Workflow release with dispatch stages, multi-crew and multi-unit assignment, operator field progress, recurring work, and upgraded calendar and job views.',
    'Hardened the Pack 2 release test flow so account handoffs wait for confirmed sign-out before the next field persona signs in.',
    'Synced Pack 2 onto the finalized Pack 1 production baseline and retained the complete role, auth, navigation, mobile and production QA contract.',
  ],
  '0.8.46':[
    "Finalized the Pack 1 production baseline and restored Northborn's mandatory version discipline after the standalone Mallard migration cleanup.",
    'Kept the Pack 1 workspace, authentication, role-aware navigation and session hardening intact on the current Northborn mainline.',
    'Restored Production QA eligibility so the full browser suite can verify the current production release instead of stopping at the version gate.',
  ],
  '0.9.0':[
    'Rebuilt Dispatch as a field workflow board with crew, unit and stage tracking from unassigned through work completion.',
    'Added operator acknowledgement, en route, on site and work-start controls with job-specific dispatch and emergency contacts.',
    'Upgraded Jobs and Calendar with recurring work, duplication, search, week and month views, unscheduled work and durable operational history.',
  ],
  '0.8.45':[
    'Serialized role-mutating browser QA so concurrent CI and production checks cannot interfere with the shared functional test account.',
    'Kept the full internal-role, direct-route, navigation, sign-out and mobile assertions enabled without weakening access-control coverage.',
    'Preserved the Pack 1 workspace, authentication and session hardening while eliminating the final flaky integration failure.',
  ],
  '0.8.44':[
    'Hardened workspace and session resolution so temporary backend failures no longer look like disconnected accounts.',
    'Added self-healing functional test accounts and full internal role QA coverage.',
    'Expanded production browser checks for reloads, history navigation, sign-out, role isolation and notification routing.',
  ],
  '0.5.0':[
    'Replaced the manager home screen with a role-aware command centre focused on work that needs attention now.',
    'Updated the universal hamburger so accounting, safety, mechanic, dispatcher and supervisor accounts only see relevant modules.',
    'Added secure client access to approved field tickets through the existing client Tickets entry.',
    'Clients can search approved paperwork, review work and service details, and view captured customer signatures.',
    'Clients can print or save approved field tickets as clean PDF copies without seeing internal operator notes or pricing snapshots.',
  ],
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
