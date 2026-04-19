import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
    
  console.log('--- RECENT SYSTEM LOGS ---');
  data.forEach(l => {
    console.log(`[${new Date(l.created_at).toLocaleTimeString('he-IL')}] [${l.level}] ${l.message}`);
  });
}
checkLogs();
