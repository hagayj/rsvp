import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Log to both console and Supabase ─────────────────────────────────────────
async function log(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString('he-IL');
  console.log(`[${timestamp}] ${message}`);
  await supabase.from('system_logs').insert([{ message, level }]);
}

// ─── Update heartbeat in system_settings ──────────────────────────────────────
async function updateHeartbeat(status = 'online') {
  await supabase.from('system_settings').upsert([
    {
      key: 'worker_heartbeat',
      value: { status, last_seen: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }
  ], { onConflict: 'key' });
}

// ─── WhatsApp Client ───────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

client.on('qr', (qr) => {
  console.log('⚡ QR received! Scan with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  await log('✅ WhatsApp Worker מחובר ומוכן לפקודות!', 'success');
  await updateHeartbeat('online');
});

client.on('auth_failure', async (msg) => {
  await log('❌ שגיאת אימות WhatsApp: ' + msg, 'error');
});

client.on('disconnected', async (reason) => {
  await log('🔌 WhatsApp התנתק: ' + reason, 'error');
  await updateHeartbeat('offline');
});

// ─── Process a bulk_send job ───────────────────────────────────────────────────
async function processBulkSend(job) {
  const targetStatus = job.payload?.targetStatus || 'pending';
  await log(`🚀 פקודת שליחה התקבלה! יעד: ${targetStatus}`, 'success');

  await supabase.from('jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    const { data: guests, error } = await supabase
      .from('guests')
      .select('*')
      .eq('status', targetStatus);

    if (error) throw error;

    await log(`📦 נמצאו ${guests.length} אורחים לשליחה (${targetStatus}).`, 'info');

    let successCount = 0;
    let failCount = 0;

    for (const guest of guests) {
      let message;
      if (targetStatus === 'attending') {
        message = `היי, כיף שאתם מגיעים! רצינו להזכיר – האירוע מתקרב!\nמוזיאון הטרקטור, עין ורד\nלפרטים ולניווט: https://rsvp-app-sage.vercel.app?id=${guest.unique_code}`;
      } else if (targetStatus === 'declined') {
        message = `היי, לא נוכל בלעדיכם! אם שינית דעתך ותרצה להגיע, הקישור שלך:\nhttps://rsvp-app-sage.vercel.app?id=${guest.unique_code}`;
      } else {
        message = `היי, נשמח מאוד לראותכם בחגיגת יום ההולדת ה-80 של עמיר! אפשר לראות את ההזמנה ולאשר הגעה בקישור האישי כאן:\nhttps://rsvp-app-sage.vercel.app?id=${guest.unique_code}`;
      }

      const phone = guest.phone.replace(/[^0-9]/g, '');
      // Convert Israeli local number (0509...) to international format (972509...)
      const intlPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone;
      const chatId = `${intlPhone}@c.us`;

      await log(`✉️ שולח ל-${guest.name} (${intlPhone})...`, 'info');

      try {
        await client.sendMessage(chatId, message);

        const now = new Date().toISOString();
        await supabase.from('guests').update({ last_reminder_at: now }).eq('id', guest.id);

        await log(`✅ נשלח בהצלחה ל-${guest.name}!`, 'success');
        successCount++;
      } catch (sendError) {
        await log(`❌ שגיאה בשליחה ל-${guest.name}: ${sendError.message}`, 'error');
        failCount++;
      }

      // Wait 5-10 seconds between messages to avoid spam detection
      const delay = Math.floor(Math.random() * 5000) + 5000;
      await log(`⏳ ממתין ${Math.round(delay / 1000)} שניות לפני ההודעה הבאה...`, 'info');
      await new Promise(r => setTimeout(r, delay));
    }

    await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id);
    await log(`🏁 השליחה הסתיימה! הצלחות: ${successCount}, כשלונות: ${failCount}`, 'success');

  } catch (error) {
    await log(`❌ שגיאה כללית בביצוע המשימה: ${error.message}`, 'error');
    await supabase.from('jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

// ─── Process a telegram_sync job ──────────────────────────────────────────────
async function processTelegramSync(job) {
  await log(`🔄 מתחיל סנכרון מטלגרם...`, 'info');
  await supabase.from('jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    // Run the script using the local virtual environment
    const { stdout, stderr } = await execAsync('./venv/bin/python3 telegram_import.py --insert');
    
    if (stderr) {
       await log(`⚠️ התראת מערכת בסנכרון: ${stderr}`, 'info');
    }
    
    await log(`✅ סנכרון טלגרם הסתיים בהצלחה!`, 'success');
    await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id);
    
  } catch (error) {
    await log(`❌ שגיאה בסנכרון טלגרם: ${error.message}`, 'error');
    await supabase.from('jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

// ─── Realtime Job Listener ─────────────────────────────────────────────────────
function subscribeToJobs() {
  supabase
    .channel('jobs-listener')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'jobs',
      },
      async (payload) => {
        const job = payload.new;
        if (job.status === 'pending') {
          if (job.type === 'bulk_send') {
            await processBulkSend(job);
          } else if (job.type === 'telegram_sync') {
            await processTelegramSync(job);
          }
        }
      }
    )
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await log('📡 מחובר לערוץ הפקודות. מחכה לפקודות מהאתר...', 'info');
      } else {
        await log(`🔔 סטטוס חיבור Realtime: ${status}`, 'info');
        if (status === 'TIMED_OUT' || status === 'CLOSED') {
          await log('🔄 מנסה להתחבר מחדש ל-Realtime בעוד 10 שניות...', 'info');
          setTimeout(subscribeToJobs, 10000);
        }
      }
    });
}

subscribeToJobs();

// ─── Heartbeat every 30 seconds ───────────────────────────────────────────────
setInterval(() => updateHeartbeat('online'), 30000);

// ─── Fallback: Poll for missed pending jobs every 60 seconds ──────────────────
setInterval(async () => {
  const { data: pendingJobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending');

  if (pendingJobs && pendingJobs.length > 0) {
    console.log(`🔍 נמצאו ${pendingJobs.length} פקודות שלא טופלו, מעבד...`);
    for (const job of pendingJobs) {
      if (job.type === 'bulk_send') {
        await processBulkSend(job);
      } else if (job.type === 'telegram_sync') {
        await processTelegramSync(job);
      }
    }
  }
}, 60000);

// ─── Start WhatsApp ────────────────────────────────────────────────────────────
async function startClient() {
  try {
    console.log('⏳ מאתחל חיבור WhatsApp...');
    await client.initialize();
  } catch (err) {
    console.error('❌ שגיאה באתחול:', err.message);
    console.log('🔄 מנסה שוב בעוד 5 שניות...');
    setTimeout(startClient, 5000);
  }
}

process.on('unhandledRejection', async (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
  await updateHeartbeat('error');
});

startClient();
