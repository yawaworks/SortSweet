import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gctgdutipmsljtdflvzy.supabase.co';
const supabaseAnonKey = 'sb_publishable_cMW5x0r7L-3H50dE1AjXKA_AyCXZpEV';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);