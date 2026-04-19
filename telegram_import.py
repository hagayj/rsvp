import os
import sys
import json
import asyncio
from datetime import datetime
from telethon import TelegramClient
from telethon.tl.types import MessageMediaContact, MessageMediaDocument, MessageMediaPhoto, MessageMediaGeo, MessageMediaWebPage, MessageMediaVenue
from dotenv import load_dotenv

# Load config
load_dotenv('.env.local')

API_ID   = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
GROUP_NAME = "הפנינג בר מצווה חגי" # Change this to your group name
INSERT_TO_DB = "--insert" in sys.argv

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

# ─── Progress Logging ────────────────────────────────────────────────────────
def log_to_db(message, level='info'):
    print(f"[{level.upper()}] {message}")
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table('system_logs').insert({
            'message': message,
            'level': level
        }).execute()
    except Exception as e:
        print(f"Failed to log to DB: {e}")

# ─── Helpers ──────────────────────────────────────────────────────────────────
def normalize_phone(phone):
    if not phone: return ""
    p = "".join(filter(str.isdigit, str(phone)))
    if p.startswith('05'): p = '972' + p[1:]
    if len(p) == 9 and p.startswith('5'): p = '972' + p
    return p

def make_code(name, phone):
    import hashlib
    seed = f"{name}{phone}rsvp2024"
    return hashlib.md5(seed.encode()).hexdigest()[:8].upper()

def describe_message(message):
    if not message.media: return "TEXT MESSAGE"
    if isinstance(message.media, MessageMediaContact): return "CONTACT CARD"
    if isinstance(message.media, MessageMediaPhoto): return "PHOTO"
    if isinstance(message.media, MessageMediaDocument): return "DOCUMENT/FILE"
    if isinstance(message.media, MessageMediaWebPage): return "WEB LINK"
    return f"MEDIA: {type(message.media).__name__}"

# ─── DB Helpers ───────────────────────────────────────────────────────────────
def get_supabase():
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print("⚠️  supabase-py not installed.")
        return None

async def get_existing_phones(sb):
    """Fetch all existing phones in ONE query."""
    if not sb: return set()
    try:
        res = sb.table('guests').select('phone').execute()
        return {str(r['phone']) for r in res.data if r.get('phone')}
    except Exception as e:
        log_to_db(f"Error fetching existing phones: {e}", "error")
        return set()

async def insert_to_supabase(contacts, sb):
    if not sb: return

    log_to_db("📥 מתחיל הכנסת אנשי קשר חדשים למסד הנתונים...", "info")

    inserted = 0
    skipped  = 0
    
    # Re-fetch just in case something changed during scan
    existing_phones = await get_existing_phones(sb)

    for c in contacts:
        if not c.get('is_valid'):
            continue
            
        phone = c['phone']
        if phone in existing_phones:
            skipped += 1
            continue

        try:
            sb.table('guests').insert({
                'name':        c['name'],
                'phone':       phone,
                'status':      'pending',
                'unique_code': make_code(c['name'], phone),
                'added_by':    c.get('sender', 'Telegram Import'),
                'is_approved': False
            }).execute()
            inserted += 1
            existing_phones.add(phone)
        except Exception as e:
            print(f"Error inserting {phone}: {e}")

    summary = f"✅ סנכרון הושלם: {inserted} נוספו, {skipped} דולגו (כבר קיימים)."
    log_to_db(summary, "success")

# ─── Main ─────────────────────────────────────────────────────────────────────
async def main():
    if not API_ID or not API_HASH:
        log_to_db("ERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing!", "error")
        return

    log_to_db("🔵 מתחיל סריקה בטלגרם...")

    sb = get_supabase()
    if not sb:
        log_to_db("ERROR: Could not connect to Supabase", "error")
        return

    # STEP 1: Fetch existing phones once
    log_to_db("🔍 טוען רשימת מוזמנים קיימת מהמסד...")
    existing_phones = await get_existing_phones(sb)
    log_to_db(f"📊 נמצאו {len(existing_phones)} מוזמנים קיימים.")

    async with TelegramClient('rsvp_session', int(API_ID), API_HASH) as client:
        log_to_db("🟢 מחובר לטלגרם!")

        # ─── Find the group ───────────────────────────────────────────────────
        target_group = None
        try:
            target_group = await client.get_entity(GROUP_NAME)
        except Exception:
            async for dialog in client.iter_dialogs():
                if GROUP_NAME.lower() in dialog.name.lower():
                    target_group = dialog.entity
                    break

        if not target_group:
            log_to_db(f"❌ שגיאה: הקבוצה '{GROUP_NAME}' לא נמצאה!", "error")
            return

        log_to_db(f"📍 מצאתי את הקבוצה: {getattr(target_group, 'title', GROUP_NAME)}")

        # ─── Scan all messages ────────────────────────────────────────────────
        log_to_db(f"🔄 סורק הודעות (עד 10,000)...")

        results = []
        seen_phones_session = set()
        msg_num = 0
        valid_found = 0

        async for message in client.iter_messages(target_group, limit=10000):
            msg_num += 1
            
            # Progress reporting every 1000 msgs
            if msg_num % 1000 == 0:
                log_to_db(f"⏳ סורק... (בוצע: {msg_num}/10000, נמצאו: {valid_found})")

            sender = getattr(message.sender, 'first_name', '') or 'אנונימי'
            
            entry = {
                "msg_num": msg_num,
                "sender": sender,
                "is_valid": False,
                "name": "",
                "phone": ""
            }

            if message.media and isinstance(message.media, MessageMediaContact):
                mc = message.media
                name_parts = [mc.first_name or '', mc.last_name or '']
                name = ' '.join(p for p in name_parts if p).strip() or f"איש קשר {mc.phone_number}"
                phone = normalize_phone(mc.phone_number)
                
                # Check for duplicates using the PRE-FETCHED set
                if phone in seen_phones_session or phone in existing_phones:
                    # Skip duplicates
                    pass
                else:
                    entry["is_valid"] = True
                    entry["name"] = name
                    entry["phone"] = phone
                    seen_phones_session.add(phone)
                    valid_found += 1
            
            results.append(entry)

        log_to_db(f"🏁 הסריקה הסתיימה. נסרקו {msg_num} הודעות.")
        
        # ─── DB Insert ────────────────────────────────────────────────────────
        if INSERT_TO_DB:
            await insert_to_supabase(results, sb)
        else:
            log_to_db(f"⚠️ מצב תצוגה מקדימה: נמצאו {valid_found} חדשים (לא הוכנסו למסד)")


if __name__ == '__main__':
    asyncio.run(main())
