import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import packageInfo from '../package.json'
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
    if(!NOTES[VERSION]?.length)return
    if(localStorage.getItem(SEEN_KEY)==='1')return
    const timer=window.setTimeout(()=>setOpen(true),900)
    return()=>window.clearTimeout(timer)
  },[])
  if(!open)return null
  const close=()=>{localStorage.setItem(SEEN_KEY,'1');setOpen(false)}
  return <aside className="release-notes" aria-label={`Northborn ${VERSION} release notes`}>
    <div className="release-notes-head"><div><span>WHAT'S NEW</span><strong>Northborn {VERSION}</strong></div><button type="button" onClick={close} aria-label="Dismiss release notes"><X size={18}/></button></div>
    <div className="release-notes-list">{NOTES[VERSION].map(note=><div key={note}><CheckCircle2 size={16}/><span>{note}</span></div>)}</div>
    <button type="button" className="release-notes-done" onClick={close}>Got it</button>
  </aside>
}
