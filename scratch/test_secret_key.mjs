import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = 'sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing with hardcoded secret key...');
  try {
    const { data, error } = await supabase.from('guests').select('count');
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Success! Data:', data);
    }
  } catch (e) {
    console.error('Exception:', e);
  }
}

test();
