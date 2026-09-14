import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'
import './northborn-datetime-picker.css'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  disabled?: boolean
}

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

function pad(value:number){ return String(value).padStart(2,'0') }
function toLocalValue(date:Date){ return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` }
function parseValue(value:string){
  if(!value) return null
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if(!match) return null
  const [,y,m,d,h,min]=match
  const date=new Date(Number(y),Number(m)-1,Number(d),Number(h),Number(min),0,0)
  return Number.isNaN(date.getTime())?null:date
}
function roundNow(){ const d=new Date(); d.setSeconds(0,0); d.setMinutes(Math.ceil(d.getMinutes()/5)*5); return d }
function formatButton(value:string){
  const date=parseValue(value)
  if(!date) return ''
  return new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date)
}
function monthTitle(date:Date){ return new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric'}).format(date) }
function sameDay(a:Date,b:Date){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate() }

export default function NorthbornDateTimePicker({value,onChange,placeholder='Select date & time',min,disabled}:Props){
  const [open,setOpen]=useState(false)
  const initial=parseValue(value)||roundNow()
  const [draft,setDraft]=useState(initial)
  const [viewMonth,setViewMonth]=useState(new Date(initial.getFullYear(),initial.getMonth(),1))
  const ref=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    if(!open) return
    const next=parseValue(value)||roundNow()
    setDraft(next)
    setViewMonth(new Date(next.getFullYear(),next.getMonth(),1))
  },[open,value])

  useEffect(()=>{
    if(!open) return
    const close=(event:MouseEvent)=>{ if(ref.current&&!ref.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown',close)
    return()=>document.removeEventListener('mousedown',close)
  },[open])

  const days=useMemo(()=>{
    const first=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1)
    const start=new Date(first); start.setDate(first.getDate()-first.getDay())
    return Array.from({length:42},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d })
  },[viewMonth])

  const hour24=draft.getHours()
  const hour12=hour24%12||12
  const period=hour24>=12?'PM':'AM'
  const minute=Math.round(draft.getMinutes()/5)*5%60
  const minDate=min?parseValue(min):null
  const isDisabledDay=(date:Date)=>{
    if(!minDate) return false
    const end=new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59,999)
    return end<minDate
  }
  const chooseDay=(date:Date)=>{
    if(isDisabledDay(date)) return
    const next=new Date(draft)
    next.setFullYear(date.getFullYear(),date.getMonth(),date.getDate())
    if(minDate&&next<minDate) next.setHours(minDate.getHours(),minDate.getMinutes(),0,0)
    setDraft(next)
  }
  const changeHour=(nextHour12:number)=>{
    const next=new Date(draft)
    let hour=nextHour12%12
    if(period==='PM') hour+=12
    next.setHours(hour)
    setDraft(next)
  }
  const changePeriod=(nextPeriod:'AM'|'PM')=>{
    const next=new Date(draft)
    let h=next.getHours()
    if(nextPeriod==='AM'&&h>=12) h-=12
    if(nextPeriod==='PM'&&h<12) h+=12
    next.setHours(h)
    setDraft(next)
  }
  const apply=()=>{ onChange(toLocalValue(draft)); setOpen(false) }
  const chooseToday=()=>{ const now=roundNow(); setDraft(now); setViewMonth(new Date(now.getFullYear(),now.getMonth(),1)) }

  return <div className="nb-datetime" ref={ref}>
    <button type="button" className={value?'nb-datetime-trigger has-value':'nb-datetime-trigger'} onClick={()=>!disabled&&setOpen(v=>!v)} disabled={disabled}>
      <CalendarDays size={17}/><span>{formatButton(value)||placeholder}</span><Clock3 size={15}/>
    </button>
    {open&&<div className="nb-datetime-popover" role="dialog" aria-label="Choose date and time">
      <div className="nb-datetime-top"><strong>Date & time</strong><button type="button" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button></div>
      <div className="nb-calendar-head"><button type="button" onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1))}><ChevronLeft size={18}/></button><strong>{monthTitle(viewMonth)}</strong><button type="button" onClick={()=>setViewMonth(new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1))}><ChevronRight size={18}/></button></div>
      <div className="nb-calendar-grid nb-weekdays">{WEEKDAYS.map(day=><span key={day}>{day}</span>)}</div>
      <div className="nb-calendar-grid">{days.map((day,i)=>{const outside=day.getMonth()!==viewMonth.getMonth();const selected=sameDay(day,draft);const today=sameDay(day,new Date());const unavailable=isDisabledDay(day);return <button type="button" key={`${day.toISOString()}-${i}`} disabled={unavailable} className={`${outside?'outside ':''}${selected?'selected ':''}${today?'today ':''}`} onClick={()=>chooseDay(day)}>{day.getDate()}</button>})}</div>
      <div className="nb-time-row"><Clock3 size={18}/><span>Time</span><select value={hour12} onChange={e=>changeHour(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(h=><option key={h} value={h}>{h}</option>)}</select><span className="colon">:</span><select value={minute} onChange={e=>{const next=new Date(draft);next.setMinutes(Number(e.target.value));setDraft(next)}}>{MINUTES.map(m=><option key={m} value={m}>{pad(m)}</option>)}</select><div className="nb-period"><button type="button" className={period==='AM'?'active':''} onClick={()=>changePeriod('AM')}>AM</button><button type="button" className={period==='PM'?'active':''} onClick={()=>changePeriod('PM')}>PM</button></div></div>
      <div className="nb-datetime-preview"><span>Selected</span><strong>{formatButton(toLocalValue(draft))}</strong></div>
      <div className="nb-datetime-actions"><button type="button" className="secondary" onClick={chooseToday}>Today</button>{value&&<button type="button" className="secondary" onClick={()=>{onChange('');setOpen(false)}}>Clear</button>}<button type="button" className="primary" onClick={apply}>Done</button></div>
    </div>}
  </div>
}
