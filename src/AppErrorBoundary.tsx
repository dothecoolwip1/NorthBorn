import React from 'react'
import { isTestMode, resetTestLabData } from './test-lab'

type State = { error: Error | null }

function reloadLatest() {
  const url = new URL(window.location.href)
  url.searchParams.set('_northborn', Date.now().toString())
  window.location.replace(url.toString())
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Northborn render error', error, info)
  }

  private resetTestWorkspace = () => {
    if (!isTestMode()) return
    resetTestLabData()
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('northborn_test_table_v1_') || key.startsWith('northborn_test_client_')) localStorage.removeItem(key)
    }
    reloadLatest()
  }

  render() {
    if (!this.state.error) return this.props.children

    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#081019',color:'#eef2f7',fontFamily:'Inter,system-ui,sans-serif'}}>
      <section style={{width:'min(520px,100%)',padding:28,borderRadius:20,border:'1px solid #26364b',background:'#101923',boxShadow:'0 30px 80px rgba(0,0,0,.45)'}}>
        <div style={{width:48,height:48,borderRadius:14,display:'grid',placeItems:'center',background:'#d58a34',color:'#17120b',fontWeight:900,fontSize:24}}>N</div>
        <h1 style={{margin:'18px 0 8px'}}>Northborn hit a loading problem</h1>
        <p style={{margin:'0 0 18px',color:'#96a3b5',lineHeight:1.55}}>Your browser may still be holding part of an older test build. You should not need to delete the site data anymore.</p>
        <button onClick={reloadLatest} style={{width:'100%',padding:'12px 16px',border:0,borderRadius:12,background:'#d58a34',color:'#17120b',fontWeight:800}}>Load latest version</button>
        {isTestMode() && <button onClick={this.resetTestWorkspace} style={{width:'100%',marginTop:10,padding:'12px 16px',border:'1px solid #34455b',borderRadius:12,background:'#14202e',color:'#dce6f2',fontWeight:800}}>Reset test workspace only</button>}
        <details style={{marginTop:16,color:'#75859a',fontSize:12}}><summary>Technical details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{this.state.error.message}</pre></details>
      </section>
    </div>
  }
}
