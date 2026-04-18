import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log('סרוק את הקוד כדי להתחבר לוואטסאפ:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('הבוט מוכן! מתחיל בתהליך השליחה ההמונית...');

    // 1. Fetch only guests who haven't responded yet (status = 'pending')
    const { data: guests, error } = await supabase
        .from('guests')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('שגיאה במשיכת נתונים:', error);
        process.exit(1);
    }

    if (!guests || guests.length === 0) {
        console.log('אין מוזמנים שטרם ענו. הכל מעודכן! ✅');
        process.exit(0);
    }

    console.log(`נמצאו ${guests.length} מוזמנים שטרם ענו. מתחיל בשליחה...`);

    for (const guest of guests) {
        try {
            const number = guest.phone.replace('+', '').replace('-', '') + '@c.us';
            const message = `היי ${guest.name} 🤩, רצינו לוודא שראית את ההזמנה ושתבואו לחגוג איתנו! אפשר לאשר הגעה בקישור האישי שלך כאן:\nhttps://rsvp-app-sage.vercel.app?id=${guest.unique_code}`;

            await client.sendMessage(number, message);
            console.log(`✅ נשלחה הודעה ל: ${guest.name} (${guest.phone})`);

            // Update last_reminder_at in DB
            await supabase
                .from('guests')
                .update({ last_reminder_at: new Date().toISOString() })
                .eq('id', guest.id);

            // Wait a few seconds to avoid WhatsApp spam detection
            const delay = Math.floor(Math.random() * 5000) + 3000;
            console.log(`ממתין ${delay/1000} שניות לפני ההודעה הבאה...`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (err) {
            console.error(`❌ שגיאה בשליחה ל-${guest.name}:`, err);
        }
    }

    console.log('סיימנו! כל ההודעות נשלחו בהצלחה. 🎉');
    process.exit(0);
});

client.initialize();
