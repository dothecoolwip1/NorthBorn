import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess } from './workspace-access'
import { getTestPersona, isTestMode } from './test-lab'
import { mobileNavigationForRole, type ShellRole } from './navigation-model'
import './mobile-app-navigation.css'

type ShellState={role:ShellRole;roleKeys:string[]}|null

function activePath(currentPath:string,currentHash:string,target:string){
  const [pathname,hash]=target.split('#')
  if(hash)return currentPath===pathname&&currentHash===`#${hash}`
  return currentPath===target&&!currentHash
}

export default function MobileAppNavigation(){
  const navigate=useNavigate()
  const location=useLocation()
  const localDemo=isTestMode()
  const [session,setSession]=useState<Session|null>(null)
  const [shell,setShell]=useState<ShellState>(()=>{
    if(!localDemo)return null
    const persona=getTestPersona()
    return persona==='client'?{role:'client',roleKeys:[]}:persona==='operator'?{role:'operator',roleKeys:['operator']}:{role:'manager',roleKeys:['owner']}
  })

  useEffect(()=>{
    if(localDemo)return
    let active=true
    const resolve=async(next:Session|null)=>{
      setSession(next)
      if(!next?.user.id){if(active)setShell(null);return}
      try{
        const access=await resolveWorkspaceAccess(next.user.id)
        if(!active)return
        if(access.kind==='client')setShell({role:'client',roleKeys:[]})
        else if(access.kind==='internal')setShell({role:access.roleKey==='operator'?'operator':'manager',roleKeys:access.roleKeys})
        else setShell(null)
      }catch{if(active)setShell(null)}
    }
    void supabase.auth.getSession().then(({data})=>void resolve(data.session))
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>void resolve(next))
    return()=>{active=false;listener.subscription.unsubscribe()}
  },[localDemo])

  useEffect(()=>{
    if(!localDemo)return
    const sync=()=>{
      const persona=getTestPersona()
      setShell(persona==='client'?{role:'client',roleKeys:[]}:persona==='operator'?{role:'operator',roleKeys:['operator']}:{role:'manager',roleKeys:['owner']})
    }
    window.addEventListener('northborn-test-persona-changed',sync)
    return()=>window.removeEventListener('northborn-test-persona-changed',sync)
  },[localDemo])

  const hidden=useMemo(()=>{
    const path=location.pathname.replace(/\/+$/,'')||'/'
    return ['/super-admin','/logout','/join','/client-join','/ticket-print','/timesheet-print','/client-ticket-print'].some(prefix=>path===prefix||path.startsWith(prefix+'/'))
  },[location.pathname])

  if(hidden||!shell)return null
  const items=mobileNavigationForRole(shell.role,shell.roleKeys)
  if(!items.length)return null

  const go=(path:string)=>{
    navigate(path)
    const hash=path.includes('#')?path.slice(path.indexOf('#')+1):''
    if(hash)window.setTimeout(()=>document.getElementById(hash)?.scrollIntoView({behavior:'smooth',block:'start'}),120)
  }

  return <nav className={`northborn-mobile-nav role-${shell.role}`} aria-label="Primary mobile navigation">
    <div className="northborn-mobile-nav-inner">
      {items.map(item=>{
        const Icon=item.icon,active=activePath(location.pathname,location.hash,item.path)
        return <button type="button" key={item.path} className={active?'active':''} aria-current={active?'page':undefined} onClick={()=>go(item.path)}>
          <Icon size={20}/><span>{item.label}</span>
        </button>
      })}
      <button type="button" className="northborn-mobile-more" aria-label="More Northborn options" onClick={()=>window.dispatchEvent(new Event('northborn-open-menu'))}>
        <Menu size={21}/><span>More</span>
      </button>
    </div>
  </nav>
}
