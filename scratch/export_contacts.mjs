import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exportContacts() {
  const { data, error } = await supabase
    .from('guests')
    .select('name, phone')
    .neq('status', 'deleted');

  if (error) {
    console.error('Error fetching guests:', error);
    return;
  }

  const csvRows = ['Name,Phone'];
  for (const guest of data) {
    // Escape quotes in names
    const escapedName = guest.name.replace(/"/g, '""');
    csvRows.push(`"${escapedName}",${guest.phone}`);
  }

  const csvContent = csvRows.join('\n');
  fs.writeFileSync('guests_contacts.csv', csvContent);
  console.log(`Successfully exported ${data.length} contacts to guests_contacts.csv`);
}

exportContacts();
