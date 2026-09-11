import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://oztfcnrwrovzasftsdwa.supabase.co'

const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_1uzd-K3ByM0NfjoEERmPWg_36YM8Dvg'

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
