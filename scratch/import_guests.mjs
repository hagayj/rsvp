import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function generateUniqueCode() {
  return Math.random().toString(36).substring(2, 10);
}

async function importFromMarkdown() {
  console.log('📖 Reading telegram_report.md...');
  const content = fs.readFileSync('telegram_report.md', 'utf8');
  const lines = content.split('\n');
  
  const guests = [];
  let tableStarted = false;

  for (const line of lines) {
    if (line.includes('| Name') || line.includes('| Name')) {
      console.log('Detected header:', line);
      tableStarted = true;
      continue;
    }
    if (tableStarted && line.includes('|') && !line.includes('----')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 5) {
        const name = parts[2];
        const phone = parts[3].replace(/\s/g, '');
        const status = parts[4];

        if (status === 'VALID' && name && phone) {
          guests.push({
            name,
            phone: phone.startsWith('+') ? phone : '+' + phone,
            unique_code: generateUniqueCode(),
            status: 'pending',
            added_by: 'Telegram Import'
          });
        }
      }
    }
  }

  console.log(`🔍 Found ${guests.length} valid guests to import.`);
  if (guests.length > 0) {
      console.log('First guest example:', guests[0]);
  }

  if (guests.length === 0) return;

  const batchSize = 50;
  for (let i = 0; i < guests.length; i += batchSize) {
    const batch = guests.slice(i, i + batchSize);
    console.log(`📥 Importing batch ${Math.floor(i / batchSize) + 1}...`);
    const { error } = await supabase.from('guests').upsert(batch, { onConflict: 'phone' });
    if (error) console.error('❌ Error:', error.message);
  }
  console.log('✅ Import completed successfully!');
}

importFromMarkdown();
