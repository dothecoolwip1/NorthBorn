import { useEffect } from 'react'
import { supabase } from './lib/supabase'

const TEST_MODE_KEY = 'northborn_test_mode'

export default function LogoutPage() {
  useEffect(() => {
    let active = true
    const finish = async () => {
      localStorage.removeItem(TEST_MODE_KEY)
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.auth.signOut()
      if (!active) return
      window.dispatchEvent(new Event('northborn-auth-changed'))
      const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      window.location.replace(home)
    }
    void finish()
    return () => { active = false }
  }, [])

  return <div className="center-screen">Signing out of Northborn…</div>
}
