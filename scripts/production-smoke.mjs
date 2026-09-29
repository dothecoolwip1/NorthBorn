import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
const version=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version
const base=process.env.NORTHBORN_BASE_URL||'https://dothecoolwip1.github.io/NorthBorn/'
const appUrl=path=>new URL(String(path||'').replace(/^\/+/,''),base)
let release
for(let attempt=0;attempt<45;attempt++){
 const response=await fetch(appUrl('release.json?verify='+Date.now())).catch(()=>null)
 if(response?.ok){release=await response.json().catch(()=>null);if(release?.version===version)break}
 await new Promise(resolve=>setTimeout(resolve,10000))
}
if(release?.version!==version)throw new Error('Expected production version '+version+'; received '+release?.version)
const browser=await chromium.launch(process.env.NORTHBORN_CHROME?{executablePath:process.env.NORTHBORN_CHROME}:{})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 for(const path of ['/','/login']){
  const response=await page.goto(appUrl(path).toString(),{waitUntil:'networkidle'})
  if(path==='/'&&!response?.ok())throw new Error('Public route failed: '+path)
  await page.locator('h1').first().waitFor({state:'visible'})
  if(path==='/login')await page.locator('input[type=password]').first().waitFor({state:'visible'})
 }
 if(errors.length)throw new Error(errors.join('\n'))
 console.log('Production '+version+' release metadata and public routes passed; no account data mutated.')
}finally{await browser.close()}
