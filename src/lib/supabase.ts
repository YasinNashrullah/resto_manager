import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const globalObj = typeof window !== 'undefined' ? window : globalThis;

export const supabase = (globalObj as any).__supabase_client__ || ((globalObj as any).__supabase_client__ = createClient(supabaseUrl, supabaseAnonKey));
