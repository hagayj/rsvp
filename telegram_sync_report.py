"""
telegram_sync_report.py
=======================
מושך את כל אנשי הקשר מקבוצת הטלגרם ומציג 3 רשימות:
  1. ✅ כבר קיימים בDB  
  2. 🆕 חדשים (צריך להוסיף)
  3. ❓ שורות שלא הצלחנו להבין / לא מספר טלפון

הרצה:
  python telegram_sync_report.py            # תצוגה בלבד
  python telegram_sync_report.py --insert   # מוסיף את החדשים לDB
"""

import os
import sys
import asyncio
import hashlib
from datetime import datetime
from telethon import TelegramClient
from telethon.tl.types import (
    MessageMediaContact, MessageMediaDocument, MessageMediaPhoto,
    MessageMediaWebPage, MessageMediaGeo, MessageMediaVenue
)
from dotenv import load_dotenv

load_dotenv('.env.local')

API_ID       = os.environ.get('TELEGRAM_API_ID')
API_HASH     = os.environ.get('TELEGRAM_API_HASH')
GROUP_NAME   = os.environ.get('TELEGRAM_GROUP_NAME', 'רשימת מוזמנים לאירוע')
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
INSERT_TO_DB = '--insert' in sys.argv

# ── helpers ───────────────────────────────────────────────────────────────────

def normalize_phone(phone):
    if not phone: return ''
    p = ''.join(filter(str.isdigit, str(phone)))
    if p.startswith('05'): p = '972' + p[1:]
    if len(p) == 9 and p.startswith('5'): p = '972' + p
    return p

def make_code(name, phone):
    seed = f"{name}{phone}rsvp2024"
    return hashlib.md5(seed.encode()).hexdigest()[:8].upper()

def looks_like_phone_text(text):
    """
    האם הטקסט הוא הודעת טקסט שנראית כמו מספר טלפון / רשימה ועשויה להכיל פרטי קשר.
    מחזיר True אם כדאי להציג למשתמש לבדיקה.
    """
    if not text: return False
    text = text.strip()
    if len(text) > 200: return False          # סיפור ארוך – לא רלוונטי
    digits = sum(c.isdigit() for c in text)
    if digits < 7: return False               # פחות מ-7 ספרות – לא מספר
    # מסנן הודעות שהן רק קישור / URL
    if text.startswith('http'): return False
    return True

def media_type(message):
    if not message.media: return 'TEXT'
    if isinstance(message.media, MessageMediaContact):  return 'CONTACT'
    if isinstance(message.media, MessageMediaPhoto):    return 'PHOTO'
    if isinstance(message.media, MessageMediaDocument): return 'DOCUMENT'
    if isinstance(message.media, MessageMediaWebPage):  return 'WEBLINK'
    return type(message.media).__name__

# ── supabase ──────────────────────────────────────────────────────────────────

def get_sb():
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print('⚠️  supabase-py not installed – DB lookup disabled.')
        return None

def fetch_db_guests(sb):
    """מחזיר dict של phone -> {name, phone, status, unique_code}"""
    if not sb: return {}
    try:
        res = sb.table('guests').select('name, phone, status, unique_code').execute()
        return {str(r['phone']): r for r in res.data if r.get('phone')}
    except Exception as e:
        print(f'❌ Error fetching DB: {e}')
        return {}

def insert_contact(sb, contact, existing_phones):
    phone = contact['phone']
    if phone in existing_phones:
        return False
    try:
        sb.table('guests').insert({
            'name':        contact['name'],
            'phone':       phone,
            'status':      'pending',
            'unique_code': make_code(contact['name'], phone),
            'added_by':    contact.get('sender', 'Telegram Sync'),
            'is_approved': False
        }).execute()
        existing_phones.add(phone)
        return True
    except Exception as e:
        print(f'  ❌ Insert error for {phone}: {e}')
        return False

# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    if not API_ID or not API_HASH:
        print('❌ TELEGRAM_API_ID / TELEGRAM_API_HASH חסרים ב-.env.local')
        return

    sb = get_sb()
    print('🔍 טוען רשימת מוזמנים קיימת מה-DB...')
    db_guests = fetch_db_guests(sb)
    db_phones = set(db_guests.keys())
    print(f'📊 {len(db_phones)} מוזמנים קיימים ב-DB.\n')

    async with TelegramClient('rsvp_session', int(API_ID), API_HASH) as client:
        print(f'🔗 מחפש קבוצה: "{GROUP_NAME}"...')
        target = None
        try:
            target = await client.get_entity(GROUP_NAME)
        except Exception:
            async for d in client.iter_dialogs():
                if GROUP_NAME.lower() in d.name.lower():
                    target = d.entity
                    break

        if not target:
            print(f'❌ הקבוצה "{GROUP_NAME}" לא נמצאה!')
            print('\nקבוצות/שיחות קיימות (20 ראשונות):')
            async for d in client.iter_dialogs(limit=20):
                print(f'  · {d.name}')
            return

        title = getattr(target, 'title', GROUP_NAME)
        print(f'✅ נמצאה קבוצה: {title}')
        print('⏳ סורק הודעות (עד 10,000)...\n')

        already_in_db   = []  # קיים בDB
        new_contacts    = []  # חדש – צריך להוסיף
        ambiguous_rows  = []  # לא הצלחנו להבין
        seen_this_scan  = set()

        msg_count = 0
        async for msg in client.iter_messages(target, limit=10000):
            msg_count += 1
            sender = getattr(msg.sender, 'first_name', '') or 'אנונימי'

            # ── Contact card ───────────────────────────────────────────────
            if msg.media and isinstance(msg.media, MessageMediaContact):
                mc = msg.media
                name_parts = [mc.first_name or '', mc.last_name or '']
                name  = ' '.join(p for p in name_parts if p).strip() or f'איש קשר {mc.phone_number}'
                phone = normalize_phone(mc.phone_number)

                if not phone:
                    ambiguous_rows.append({
                        'sender': sender,
                        'raw':    f'{name} / {mc.phone_number}',
                        'reason': 'לא ניתן לנרמל מספר טלפון'
                    })
                    continue

                if phone in seen_this_scan:
                    continue  # דילוג על כפילויות מהסריקה הנוכחית
                seen_this_scan.add(phone)

                entry = {'sender': sender, 'name': name, 'phone': phone}
                if phone in db_phones:
                    db_info = db_guests[phone]
                    entry['db_name']   = db_info.get('name', '')
                    entry['db_status'] = db_info.get('status', '')
                    already_in_db.append(entry)
                else:
                    new_contacts.append(entry)

            # ── Text message – check if it looks like contact info ─────────
            elif msg.text and looks_like_phone_text(msg.text):
                ambiguous_rows.append({
                    'sender': sender,
                    'raw':    msg.text.strip(),
                    'reason': 'הודעת טקסט שנראית כמו מספר (לא כרטיס איש קשר)'
                })

        # ── Print results ──────────────────────────────────────────────────
        print(f'🏁 סריקה הסתיימה | {msg_count} הודעות סרוקות\n')
        print('=' * 70)

        # ─ Section 1: Already in DB ───────────────────────────────────────
        print(f'\n✅  כבר קיימים ב-DB  ({len(already_in_db)} רשומות)')
        print('-' * 70)
        if already_in_db:
            for i, c in enumerate(already_in_db, 1):
                db_match = '✓ שם זהה' if c['name'] == c.get('db_name','') else f'⚠ שם שונה בDB: {c.get("db_name","")}'
                print(f'  {i:3}. {c["name"]:<30} {c["phone"]:<16}  [{c.get("db_status","?")}] {db_match}')
        else:
            print('  (ריק)')

        # ─ Section 2: New contacts ────────────────────────────────────────
        print(f'\n🆕  חדשים – מוכנים להוסיף לDB  ({len(new_contacts)} רשומות)')
        print('-' * 70)
        if new_contacts:
            for i, c in enumerate(new_contacts, 1):
                print(f'  {i:3}. {c["name"]:<30} {c["phone"]:<16}  (נשלח ע"י: {c["sender"]})')
        else:
            print('  (ריק – אין חדשים)')

        # ─ Section 3: Ambiguous rows ──────────────────────────────────────
        print(f'\n❓  שורות לא ברורות – לא הצלחנו לזהות כמספר טלפון תקני  ({len(ambiguous_rows)} רשומות)')
        print('-' * 70)
        if ambiguous_rows:
            for i, r in enumerate(ambiguous_rows, 1):
                raw_display = r['raw'][:60] + ('...' if len(r['raw']) > 60 else '')
                print(f'  {i:3}. [{r["sender"]:<10}] {raw_display}')
                print(f'       ↳ {r["reason"]}')
        else:
            print('  (ריק – הכל ברור)')

        print('\n' + '=' * 70)
        print(f'📌 סיכום: {len(already_in_db)} קיימים | {len(new_contacts)} חדשים | {len(ambiguous_rows)} לא ברורים')

        # ─ Insert if requested ────────────────────────────────────────────
        if INSERT_TO_DB:
            if not sb:
                print('\n❌ לא ניתן להוסיף – אין חיבור ל-DB')
                return
            print(f'\n📥 מוסיף {len(new_contacts)} אנשי קשר חדשים לDB...')
            inserted = 0
            existing_phones_live = set(db_phones)
            for c in new_contacts:
                ok = insert_contact(sb, c, existing_phones_live)
                if ok:
                    inserted += 1
                    print(f'  ✅ נוסף: {c["name"]} ({c["phone"]})')
            print(f'\n🎉 הוכנסו {inserted} אנשי קשר חדשים!')
        else:
            print('\n💡 כדי להוסיף את החדשים לDB, הרץ עם --insert:')
            print('   python telegram_sync_report.py --insert')

if __name__ == '__main__':
    asyncio.run(main())
