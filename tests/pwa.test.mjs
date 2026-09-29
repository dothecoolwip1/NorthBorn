import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs/promises'
import { getPwaUpdateMode } from '../src/pwa.ts'
test('PWA updates default to notification so updates do not silently reload forms',()=>{
 const previous=globalThis.localStorage
 try{globalThis.localStorage={getItem:()=>null};assert.equal(getPwaUpdateMode(),'notify')}finally{globalThis.localStorage=previous}
})
test('service worker scopes its shell and preserves unrelated caches',async()=>{
 const version=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version
 const handlers={},deleted=[];let assets=[]
 const context={URL,self:{registration:{scope:'https://example.invalid/NorthBorn/'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({addAll:async values=>{assets=values}}),keys:async()=>['unrelated-cache','northborn-shell-v0.5.0',`northborn-shell-v${version}`],delete:async name=>deleted.push(name)}}
 vm.runInNewContext(await fs.readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context)
 let pending;handlers.install({waitUntil:value=>pending=value});await pending
 assert.deepEqual(Array.from(assets),['https://example.invalid/NorthBorn/','https://example.invalid/NorthBorn/manifest.webmanifest','https://example.invalid/NorthBorn/icons/northborn-icon.svg'])
 handlers.activate({waitUntil:value=>pending=value});await pending
 assert.deepEqual(deleted,['northborn-shell-v0.5.0'])
})
