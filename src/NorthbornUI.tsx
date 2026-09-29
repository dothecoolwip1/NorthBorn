import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type ButtonVariant='primary'|'secondary'|'quiet'|'danger'
export function NorthbornButton({variant='secondary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:ButtonVariant}){
  return <button {...props} className={`nb-button nb-button-${variant} ${className}`.trim()}/>
}

export function NorthbornSurface({className='',children,...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}){
  return <div {...props} className={`nb-surface ${className}`.trim()}>{children}</div>
}

type StatusTone='neutral'|'success'|'warning'|'danger'|'info'
export function NorthbornStatus({tone='neutral',children,className=''}:{tone?:StatusTone;children:ReactNode;className?:string}){
  return <span className={`nb-status ${tone==='neutral'?'':`nb-status-${tone}`} ${className}`.trim()}>{children}</span>
}

export function NorthbornEmptyState({icon,title,description,action}:{icon?:ReactNode;title:string;description?:string;action?:ReactNode}){
  return <div className="nb-empty">{icon&&<div className="nb-empty-icon">{icon}</div>}<h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>
}

export function NorthbornSkeleton({width='100%',height=14,className=''}:{width?:string|number;height?:string|number;className?:string}){
  return <span aria-hidden="true" className={`nb-skeleton ${className}`.trim()} style={{width,height}}/>
}

export function NorthbornSheet({children,className=''}:{children:ReactNode;className?:string}){
  return <div className="nb-sheet-backdrop"><section className={`nb-sheet ${className}`.trim()}>{children}</section></div>
}
