import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://clknahzbeozulgsklykb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_21S56eeW51qZ2ZUNjY_zKA_Ty_kzZbJ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
