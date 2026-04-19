import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function fixHagay() {
  const { error } = await supabaseAdmin.from('guests').update({ unique_code: 'test5555' }).like('name', '%חגי%');
  if (error) console.error('Error:', error);
  else console.log('Successfully fixed Hagay code in DB');
}
fixHagay();
