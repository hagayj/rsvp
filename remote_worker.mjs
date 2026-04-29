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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

// Track if WhatsApp is actually ready
let isClientReady = false;

// ─── Log to both console and Supabase ─────────────────────────────────────────
async function log(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString('he-IL');
  const logMsg = `[${timestamp}] ${message}`;
  console.log(logMsg);
  
  try {
    // Use admin client for logging to bypass RLS
    const { error } = await supabaseAdmin.from('system_logs').insert([{ message, level }]);
    if (error) console.error(`⚠️ Failed to push log to Supabase: ${error.message}`);
  } catch (err) {
    console.error(`⚠️ Exception during Supabase logging: ${err.message}`);
  }
}

// ─── Update heartbeat in system_settings ──────────────────────────────────────
async function updateHeartbeat(status = 'online') {
  try {
    await supabaseAdmin.from('system_settings').upsert([
      {
        key: 'worker_heartbeat',
        value: { status, last_seen: new Date().toISOString(), whatsapp_ready: isClientReady },
        updated_at: new Date().toISOString()
      }
    ], { onConflict: 'key' });
  } catch (err) {
    console.error(`⚠️ Failed to update heartbeat: ${err.message}`);
  }
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
  isClientReady = true;
  await log('✅ WhatsApp Worker מחובר ומוכן לפקודות!', 'success');
  await updateHeartbeat('online');
});

client.on('auth_failure', async (msg) => {
  isClientReady = false;
  await log('❌ שגיאת אימות WhatsApp: ' + msg, 'error');
});

client.on('disconnected', async (reason) => {
  isClientReady = false;
  await log('🔌 WhatsApp התנתק: ' + reason, 'error');
  await updateHeartbeat('offline');
});

// ─── Process a bulk_send job ───────────────────────────────────────────────────
async function processBulkSend(job) {
  const targetStatus = job.payload?.targetStatus || 'pending';
  await log(`🚀 פקודת שליחה התקבלה! יעד: ${targetStatus}`, 'success');

  if (!isClientReady) {
    await log(`⚠️ WhatsApp עדיין לא מוכן. המשימה תמתין עד להתחברות.`, 'warning');
    // We don't mark as failed, we just let it stay in pending or processing?
    // Actually, let's wait a bit or throw error to let the fallback catch it.
    throw new Error('WhatsApp client not ready');
  }

  await supabaseAdmin.from('jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    const { data: guests, error } = await supabaseAdmin
      .from('guests')
      .select('*')
      .eq('status', targetStatus)
      .neq('status', 'deleted');

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
      const intlPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone;
      const chatId = `${intlPhone}@c.us`;

      await log(`✉️ שולח ל-${guest.name} (${intlPhone})...`, 'info');

      try {
        await client.sendMessage(chatId, message);

        const now = new Date().toISOString();
        await supabaseAdmin.from('guests').update({ last_reminder_at: now }).eq('id', guest.id);

        await log(`✅ נשלח בהצלחה ל-${guest.name}!`, 'success');
        successCount++;
      } catch (sendError) {
        await log(`❌ שגיאה בשליחה ל-${guest.name}: ${sendError.message}`, 'error');
        failCount++;
      }

      const delay = Math.floor(Math.random() * 5000) + 5000;
      await log(`⏳ ממתין ${Math.round(delay / 1000)} שניות לפני ההודעה הבאה...`, 'info');
      await new Promise(r => setTimeout(r, delay));
    }

    await supabaseAdmin.from('jobs').update({ status: 'completed' }).eq('id', job.id);
    await log(`🏁 השליחה הסתיימה! הצלחות: ${successCount}, כשלונות: ${failCount}`, 'success');

  } catch (error) {
    await log(`❌ שגיאה כללית בביצוע המשימה: ${error.message}`, 'error');
    await supabaseAdmin.from('jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

// ─── Process a telegram_sync job ──────────────────────────────────────────────
async function processTelegramSync(job) {
  await log(`🔄 מתחיל סנכרון מטלגרם...`, 'info');
  await supabaseAdmin.from('jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    const { stdout, stderr } = await execAsync('./venv/bin/python3 telegram_import.py --insert');
    
    if (stderr) {
       await log(`⚠️ התראת מערכת בסנכרון: ${stderr}`, 'info');
    }
    
    await log(`✅ סנכרון טלגרם הסתיים בהצלחה!`, 'success');
    await supabaseAdmin.from('jobs').update({ status: 'completed' }).eq('id', job.id);
    
  } catch (error) {
    await log(`❌ שגיאה בסנכרון טלגרם: ${error.message}`, 'error');
    await supabaseAdmin.from('jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

// ─── Process a delete_guest job ────────────────────────────────────────────────
async function processDeleteGuest(job) {
  const { id: guestId, name: guestName } = job.payload || {};

  await log(`🚀 [SERVER] פקודת מחיקה התקבלה עבור: ${guestName || 'לא ידוע'}`, 'info');
  await supabaseAdmin.from('jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    if (!guestId) throw new Error('מזהה ה-ID של האורח חסר!');

    await log(`⚡ [SERVER] מבצע מחיקה לצמיתות מהמסד...`, 'info');

    const { data, error } = await supabaseAdmin
      .from('guests')
      .delete()
      .eq('id', guestId)
      .select();

    if (error) throw new Error(`PostgreSQL error: ${error.message}`);

    if (!data || data.length === 0) {
      await log(`⚠️ [SERVER] האורח לא נמצא – כנראה נמחק כבר.`, 'info');
    } else {
      await log(`✅ [SERVER] ${guestName || data[0]?.name || 'האורח'} נמחק בהצלחה!`, 'success');
    }

    await supabaseAdmin.from('jobs').update({ status: 'completed' }).eq('id', job.id);
  } catch (err) {
    await log(`❌ [SERVER] כשל במחיקה: ${err.message}`, 'error');
    await supabaseAdmin.from('jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

// ─── Realtime Job Listener ─────────────────────────────────────────────────────
function subscribeToJobs() {
  supabaseAdmin
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
          try {
            if (job.type === 'bulk_send') {
              await processBulkSend(job);
            } else if (job.type === 'telegram_sync') {
              await processTelegramSync(job);
            } else if (job.type === 'delete_guest') {
              await processDeleteGuest(job);
            }
          } catch (err) {
            console.error('Job processing error:', err.message);
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
  try {
    const { data: pendingJobs } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('status', 'pending');

    if (pendingJobs && pendingJobs.length > 0) {
      console.log(`🔍 נמצאו ${pendingJobs.length} פקודות שלא טופלו, מעבד...`);
      for (const job of pendingJobs) {
        try {
          if (job.type === 'bulk_send') {
            await processBulkSend(job);
          } else if (job.type === 'telegram_sync') {
            await processTelegramSync(job);
          } else if (job.type === 'delete_guest') {
            await processDeleteGuest(job);
          }
        } catch (err) {
          console.error(`Error processing polled job ${job.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error polling jobs:', err.message);
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
