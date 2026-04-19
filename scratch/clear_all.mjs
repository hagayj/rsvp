import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function clearAll() {
  console.log('Clearing ALL tables (guests, jobs, logs)...');
  await supabaseAdmin.from('jobs').delete().neq('status', 'placeholder');
  await supabaseAdmin.from('guests').delete().neq('phone', 'placeholder');
  await supabaseAdmin.from('system_logs').delete().neq('level', 'placeholder');
  console.log('Success: Database and Queue are completely empty.');
}

clearAll();
