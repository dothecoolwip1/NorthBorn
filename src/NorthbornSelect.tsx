import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, LockKeyhole } from 'lucide-react'
import './northborn-select.css'

export type NorthbornSelectOption = {
  value: string
  label: string
  detail?: string
  disabled?: boolean
}

export default function NorthbornSelect({
  value,
  options,
  onChange,
  placeholder='Select',
  ariaLabel,
  className='',
}:{
  value:string
  options:NorthbornSelectOption[]
  onChange:(value:string)=>void
  placeholder?:string
  ariaLabel:string
  className?:string
}){
  const [open,setOpen]=useState(false)
  const [activeIndex,setActiveIndex]=useState(-1)
  const rootRef=useRef<HTMLDivElement|null>(null)
  const selected=useMemo(()=>options.find(option=>option.value===value)||null,[options,value])

  useEffect(()=>{
    const onPointer=(event:PointerEvent)=>{
      if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false)
    }
    window.addEventListener('pointerdown',onPointer)
    return()=>window.removeEventListener('pointerdown',onPointer)
  },[])

  const enabledIndexes=options.map((option,index)=>option.disabled?-1:index).filter(index=>index>=0)
  const move=(direction:1|-1)=>{
    if(!enabledIndexes.length)return
    const current=enabledIndexes.indexOf(activeIndex)
    const next=current<0?(direction===1?0:enabledIndexes.length-1):(current+direction+enabledIndexes.length)%enabledIndexes.length
    setActiveIndex(enabledIndexes[next])
  }
  const choose=(option:NorthbornSelectOption)=>{
    if(option.disabled)return
    onChange(option.value)
    setOpen(false)
  }

  return <div ref={rootRef} className={'northborn-select '+className}>
    <button
      type="button"
      className={open?'northborn-select-trigger open':'northborn-select-trigger'}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={()=>setOpen(current=>!current)}
      onKeyDown={event=>{
        if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);move(1)}
        else if(event.key==='ArrowUp'){event.preventDefault();setOpen(true);move(-1)}
        else if(event.key==='Escape'){setOpen(false)}
        else if(event.key==='Enter'&&open&&activeIndex>=0){event.preventDefault();choose(options[activeIndex])}
      }}
    >
      <span className={selected?'':'placeholder'}>{selected?.label||placeholder}</span>
      <ChevronDown size={16}/>
    </button>
    {open&&<div className="northborn-select-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option,index)=><button
        type="button"
        role="option"
        aria-selected={option.value===value}
        aria-disabled={option.disabled||undefined}
        disabled={option.disabled}
        className={(option.value===value?'selected ':'')+(index===activeIndex?'active ':'')+(option.disabled?'disabled':'')}
        key={option.value||'__blank__'+index}
        onMouseEnter={()=>!option.disabled&&setActiveIndex(index)}
        onClick={()=>choose(option)}
      >
        <span><strong>{option.label}</strong>{option.detail&&<small>{option.detail}</small>}</span>
        {option.disabled?<LockKeyhole size={14}/>:option.value===value?<Check size={14}/>:null}
      </button>)}
    </div>}
  </div>
}
