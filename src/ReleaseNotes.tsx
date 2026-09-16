import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import packageInfo from '../package.json'
import { supabase } from './lib/supabase'
import './release-notes.css'

const VERSION=packageInfo.version
const SEEN_KEY=`northborn_release_seen_${VERSION}`

const NOTES:Record<string,string[]>={
  '0.2.2':[
    'Added a live manager Reports dashboard for jobs, revenue, fleet, staffing and safety.',
    'Cleaned up navigation so unfinished field modules no longer lead to dead-end screens.',
    'Refreshed the installable app cache so this release is detected by installed copies.',
  ],
}

export default function ReleaseNotes(){
  const [open,setOpen]=useState(false)
  useEffect(()=>{
    let active=true
    let timer:number|undefined
    const consider=(signedIn:boolean)=>{
      if(!active||!signedIn||!NOTES[VERSION]?.length||localStorage.getItem(SEEN_KEY)==='1')return
      if(timer)window.clearTimeout(timer)
      timer=window.setTimeout(()=>{if(active)setOpen(true)},900)
    }
    void supabase.auth.getSession().then(({data})=>consider(Boolean(data.session)))
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>consider(Boolean(session)))
    return()=>{active=false;if(timer)window.clearTimeout(timer);listener.subscription.unsubscribe()}
  },[])
  if(!open)return null
  const close=()=>{localStorage.setItem(SEEN_KEY,'1');setOpen(false)}
  return <aside className="release-notes" aria-label={`Northborn ${VERSION} release notes`}>
    <div className="release-notes-head"><div><span>WHAT'S NEW</span><strong>Northborn {VERSION}</strong></div><button type="button" onClick={close} aria-label="Dismiss release notes"><X size={18}/></button></div>
    <div className="release-notes-list">{NOTES[VERSION].map(note=><div key={note}><CheckCircle2 size={16}/><span>{note}</span></div>)}</div>
    <button type="button" className="release-notes-done" onClick={close}>Got it</button>
  </aside>
}
