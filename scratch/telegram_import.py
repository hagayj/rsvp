import os
import sys
import json
import asyncio
from datetime import datetime
from telethon import TelegramClient
from telethon.tl.types import MessageMediaContact
from dotenv import load_dotenv

load_dotenv('.env.local')

API_ID   = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
GROUP_NAME = os.environ.get('TELEGRAM_GROUP_NAME', 'רשימת מוזמנים לאירוע')
INSERT_TO_DB = "--insert" in sys.argv

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

def log_to_db(message, level='info'):
    print(f"[{level.upper()}] {message}")
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        sb.table('system_logs').insert({'message': message, 'level': level}).execute()
    except Exception as e:
        print(f"Failed to log to DB: {e}")

def normalize_phone(phone):
    if not phone: return ""
    p = "".join(filter(str.isdigit, str(phone)))
    if p.startswith('05'): p = '972' + p[1:]
    if p.startswith('5'): p = '972' + p
    return p

def make_code(name, phone):
    import hashlib
    return hashlib.md5(f"{name}{phone}rsvp2024".encode()).hexdigest()[:8].upper()

async def get_existing_data(sb):
    try:
        res = sb.table('guests').select('phone', 'unique_code').execute()
        phones = {str(r['phone']) for r in res.data if r.get('phone')}
        codes = {str(r['unique_code']) for r in res.data if r.get('unique_code')}
        return phones, codes
    except:
        return set(), set()

async def main():
    if not API_ID or not API_HASH:
        log_to_db("ERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing!", "error")
        return
    log_to_db("🔵 מתחיל סריקה בטלגרם...")
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    existing_phones, existing_codes = await get_existing_data(sb)
    
    async with TelegramClient('rsvp_session', int(API_ID), API_HASH) as client:
        log_to_db("🟢 מחובר לטלגרם!")
        target_group = None
        async for dialog in client.iter_dialogs():
            if GROUP_NAME.lower() in dialog.name.lower():
                target_group = dialog.entity
                break
        
        if not target_group:
            log_to_db(f"❌ שגיאה: הקבוצה '{GROUP_NAME}' לא נמצאה!", "error")
            return
            
        log_to_db(f"📍 מצאתי את הקבוצה: {getattr(target_group, 'title', GROUP_NAME)}")
        
        results = []
        seen_phones = set(existing_phones)
        seen_codes = set(existing_codes)
        
        # We need a cache for senders to avoid multiple requests for the same sender
        senders_cache = {}

        async for message in client.iter_messages(target_group, limit=2000):
            if message.media and isinstance(message.media, MessageMediaContact):
                phone = normalize_phone(message.media.phone_number)
                name = f"{message.media.first_name or ''} {message.media.last_name or ''}".strip()
                code = make_code(name, phone)
                
                # Filter duplicates (by phone OR by unique code)
                if phone and phone not in seen_phones and code not in seen_codes:
                    # Get sender info
                    sender_id = message.from_id
                    if sender_id not in senders_cache:
                        sender = await message.get_sender()
                        # Some messages might not have a public sender
                        s_name = "לא ידוע"
                        if sender:
                            s_first = getattr(sender, 'first_name', '') or ''
                            s_last = getattr(sender, 'last_name', '') or ''
                            s_name = f"{s_first} {s_last}".strip() or "Telegram User"
                        senders_cache[sender_id] = s_name
                    
                    added_by = senders_cache[sender_id]
                    
                    seen_phones.add(phone)
                    seen_codes.add(code)
                    results.append({
                        'name': name, 
                        'phone': phone, 
                        'status': 'pending', 
                        'unique_code': code, 
                        'is_approved': False,
                        'added_by': added_by
                    })

        if INSERT_TO_DB and results:
            log_to_db(f"📥 מוסיף {len(results)} אורחים חדשים למערכת...", "info")
            count = 0
            for guest in results:
                try:
                    sb.table('guests').insert(guest).execute()
                    count += 1
                except Exception as e:
                    print(f"Skipping duplicate/error: {e}")
            log_to_db(f"✅ סנכרון הושלם: {count} אורחים חדשים נוספו.", "success")
        else:
            log_to_db("🏁 סריקה הסתיימה. לא נמצאו אורחים חדשים להוספה.", "info")

if __name__ == '__main__':
    asyncio.run(main())
