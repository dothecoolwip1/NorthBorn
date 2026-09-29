import type { LucideIcon } from 'lucide-react'
import { Activity, BriefcaseBusiness, Building2, CalendarDays, ClipboardCheck, ContactRound, FileClock, FileText, Gauge, ReceiptText, ShieldCheck, Truck, Users, Wrench } from 'lucide-react'
import { INTERNAL_ROLE_PATHS, primaryInternalRole } from './role-access'

export type ShellRole='manager'|'operator'|'client'
export type NavigationItem={label:string;path:string;icon:LucideIcon;description?:string}

export const MANAGER_NAVIGATION:NavigationItem[]=[
  {label:'Dashboard',path:'/',icon:Gauge},
  {label:'Calendar',path:'/calendar',icon:CalendarDays},
  {label:'Dispatch',path:'/dispatch',icon:CalendarDays},
  {label:'Jobs',path:'/jobs',icon:BriefcaseBusiness},
  {label:'Customers',path:'/customers',icon:ContactRound},
  {label:'Employees',path:'/employees',icon:Users},
  {label:'Fleet',path:'/fleet',icon:Truck},
  {label:'Maintenance',path:'/maintenance',icon:Wrench},
  {label:'Safety',path:'/safety',icon:ShieldCheck},
  {label:'Tickets',path:'/tickets',icon:ClipboardCheck},
  {label:'Timesheets',path:'/timesheets',icon:FileClock},
  {label:'Invoices',path:'/invoices',icon:ReceiptText},
  {label:'Billing queue',path:'/billing',icon:ReceiptText},
  {label:'Templates',path:'/templates',icon:FileText},
  {label:'Reports',path:'/reports',icon:Activity},
]

export const OPERATOR_NAVIGATION:NavigationItem[]=[
  {label:'Home',path:'/',icon:Gauge},
  {label:'My jobs',path:'/jobs',icon:BriefcaseBusiness},
  {label:'Tickets',path:'/tickets',icon:ClipboardCheck},
  {label:'Timesheets',path:'/timesheets',icon:FileClock},
  {label:'Safety',path:'/safety',icon:ShieldCheck},
  {label:'My unit',path:'/fleet',icon:Truck},
]

export const CLIENT_NAVIGATION:NavigationItem[]=[
  {label:'Portal home',path:'/',icon:Building2},
  {label:'Jobs',path:'/#client-jobs',icon:BriefcaseBusiness},
  {label:'Invoices',path:'/#client-invoices',icon:ReceiptText},
  {label:'Contacts',path:'/#client-contacts',icon:ContactRound},
  {label:'Company',path:'/#client-company',icon:Building2},
]

export function allowedManagerPaths(roleKeys:readonly string[]){
  return [...new Set(roleKeys.flatMap(role=>INTERNAL_ROLE_PATHS[role]||[]))]
}

export function fullNavigationForRole(role:ShellRole,roleKeys:readonly string[]=[]){
  if(role==='client')return CLIENT_NAVIGATION
  if(role==='operator')return OPERATOR_NAVIGATION
  const allowed=new Set(allowedManagerPaths(roleKeys))
  return MANAGER_NAVIGATION.filter(item=>allowed.has(item.path))
}

const MANAGER_PRIMARY:Record<string,string[]>={
  owner:['/','/calendar','/dispatch','/jobs'],
  admin:['/','/calendar','/dispatch','/jobs'],
  supervisor:['/','/calendar','/dispatch','/jobs'],
  dispatcher:['/','/calendar','/dispatch','/jobs'],
  safety:['/','/safety','/jobs','/fleet'],
  mechanic:['/','/jobs','/fleet','/maintenance'],
  accounting:['/','/customers','/invoices','/billing'],
}

export function mobileNavigationForRole(role:ShellRole,roleKeys:readonly string[]=[]):NavigationItem[]{
  if(role==='operator')return [
    {label:'Today',path:'/',icon:Gauge},
    {label:'Jobs',path:'/jobs',icon:BriefcaseBusiness},
    {label:'Time',path:'/timesheets',icon:FileClock},
    {label:'Safety',path:'/safety',icon:ShieldCheck},
  ]
  if(role==='client')return [
    {label:'Home',path:'/',icon:Building2},
    {label:'Jobs',path:'/#client-jobs',icon:BriefcaseBusiness},
    {label:'Invoices',path:'/#client-invoices',icon:ReceiptText},
  ]

  const full=fullNavigationForRole('manager',roleKeys)
  const byPath=new Map(full.map(item=>[item.path,item]))
  const primary=primaryInternalRole(roleKeys)
  const preferred=MANAGER_PRIMARY[primary]||['/','/jobs','/fleet','/timesheets']
  const result:NavigationItem[]=[]
  for(const path of preferred){
    const item=byPath.get(path)
    if(item&&!result.some(row=>row.path===item.path)){
      result.push(path==='/calendar'?{...item,label:'Schedule'}:item)
    }
  }
  for(const item of full){
    if(result.length>=4)break
    if(!result.some(row=>row.path===item.path))result.push(item)
  }
  return result.slice(0,4)
}
