import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bvlcfqoxlfmxbxpkuuhg.supabase.co';
const supabaseKey = 'sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('jobs').select('*').eq('type', 'telegram_sync').order('created_at', { ascending: false }).limit(3);
  console.log('--- LATEST TELEGRAM JOBS ---');
  console.log(data);

  const { data: heartbeat } = await supabase.from('system_settings').select('*').eq('key', 'worker_heartbeat');
  console.log('--- WORKER HEARTBEAT ---');
  console.log(heartbeat);
}
check();
