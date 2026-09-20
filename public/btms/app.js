import * as React from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactRouterDOM from 'react-router-dom';
import {modules1} from './modules-1.js';
import {modules2} from './modules-2.js';
import {modules3} from './modules-3.js';
const __external={'react':React,'react/jsx-runtime':JSXRuntime,'react-dom/client':ReactDOMClient,'react-router-dom':ReactRouterDOM,'@supabase/supabase-js':{createClient(){throw new Error('Supabase is disabled in the GitHub Pages demo build.')}}};
const __modules={...modules1,...modules2,...modules3}; const __cache={};
function __normalize(request,from){if(!request.startsWith('.'))return request;const base=from.includes('/')?from.slice(0,from.lastIndexOf('/')):'';const parts=(base?base+'/'+request:request).split('/');const out=[];for(const part of parts){if(!part||part==='.')continue;if(part==='..')out.pop();else out.push(part)}return out.join('/').replace(/\.(js|ts|tsx)$/,'')}
function __require(request,from=''){const id=__normalize(request,from);if(__external[id])return __external[id];if(__cache[id])return __cache[id].exports;const factory=__modules[id];if(!factory)throw new Error('BTMS demo module not found: '+id+' requested by '+from);const module={exports:{}};__cache[id]=module;factory(module,module.exports,req=>__require(req,id));return module.exports}
__require('main');
