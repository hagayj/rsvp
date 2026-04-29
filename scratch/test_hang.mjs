import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

async function test() {
  console.log('Testing connection...');
  console.log('supabaseServiceKey present:', !!supabaseServiceKey);
  
  try {
    console.log('Fetching guests...');
    const { data: guests, error } = await supabaseAdmin
      .from('guests')
      .select('*')
      .eq('status', 'pending')
      .neq('status', 'deleted');
      
    if (error) {
      console.error('Error fetching guests:', error);
    } else {
      console.log(`Found ${guests.length} guests.`);
    }
    
    console.log('Attempting to log...');
    const { error: logError } = await supabaseAdmin.from('system_logs').insert([{ message: 'TEST LOG FROM SCRATCH', level: 'info' }]);
    if (logError) {
      console.error('Error logging:', logError);
    } else {
      console.log('Log successful.');
    }
  } catch (e) {
    console.error('Caught error:', e);
  }
}

test();
