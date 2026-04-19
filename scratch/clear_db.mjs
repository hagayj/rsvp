import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clear() {
  console.log('Clearing ALL tables completely...');
  
  // Clean jobs
  const { error: e1 } = await supabase.from('jobs').delete().neq('status', 'placeholder_status_that_does_not_exist');
  
  // Clean guests (phone is a string)
  const { error: e2 } = await supabase.from('guests').delete().neq('phone', 'placeholder_phone');
  
  // Clean logs (level is a string)
  const { error: e3 } = await supabase.from('system_logs').delete().neq('level', 'placeholder_level');
  
  if (e1 || e2 || e3) {
    console.error('Error clearing:', e1 || e2 || e3);
  } else {
    console.log('Success: Database completely formatted.');
  }
}
clear();
