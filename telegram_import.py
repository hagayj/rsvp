"""
telegram_import.py
------------------
Extracts contacts from a specific Telegram group.
Processes ALL messages and reports what was/wasn't parsed as a contact.

Usage:
  python3 telegram_import.py           → Preview only (no DB writes)
  python3 telegram_import.py --insert  → Insert into Supabase (skips duplicates by phone)
"""

import asyncio
import re
import sys
import json
from telethon import TelegramClient
from telethon.tl.types import (
    MessageMediaContact, MessageMediaPhoto, MessageMediaDocument,
    MessageMediaWebPage
)

# ─── Config ───────────────────────────────────────────────────────────────────
API_ID    = 23087482
API_HASH  = "f7a811f17dcd96fae7d6095766388e90"
GROUP_NAME = "https://t.me/+8w0T2s__ceVlOGJk"

SUPABASE_URL = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bGNmcW94bGZteGJ4cGt1dWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTE0NjMsImV4cCI6MjA5MTIyNzQ2M30.2TMk-UslCOFFWEpwKV4U1ZYIPJb_gH0qGdmzDBhQw_0"

INSERT_TO_DB = "--insert" in sys.argv

# ─── Helpers ──────────────────────────────────────────────────────────────────
import random, string

def make_code(name, phone):
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
    clean = re.sub(r'[^a-zA-Z\u05d0-\u05ea]', '', name)[:8].lower()
    return f"{clean}-{suffix}"

def normalize_phone(phone: str) -> str:
    """Returns phone in format +972XXXXXXXXX"""
    p = re.sub(r'[^\d+]', '', phone)
    if p.startswith('+972'):  return p
    if p.startswith('972'):   return '+' + p
    if p.startswith('0'):     return '+972' + p[1:]
    return p

def describe_message(message) -> str:
    """Returns a human-readable description of what a message contains."""
    if message.text:
        preview = message.text[:60].replace('\n', ' ')
        return f"TEXT: \"{preview}{'...' if len(message.text) > 60 else ''}\""
    if isinstance(message.media, MessageMediaPhoto):
        return "PHOTO"
    if isinstance(message.media, MessageMediaDocument):
        return "DOCUMENT/FILE"
    if isinstance(message.media, MessageMediaWebPage):
        return "WEB LINK"
    if message.media:
        return f"OTHER MEDIA: {type(message.media).__name__}"
    return "EMPTY/SERVICE MESSAGE"

# ─── DB Helpers ───────────────────────────────────────────────────────────────
def get_supabase():
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print("⚠️  supabase-py not installed. Run: pip3 install supabase")
        return None

async def is_duplicate_in_db(sb, phone):
    if not sb: return False
    existing = sb.table('guests').select('id').eq('phone', phone).execute()
    return len(existing.data) > 0

async def insert_to_supabase(contacts):
    sb = get_supabase()
    if not sb: return

    print("\n" + "="*60)
    print("INSERTING NEW CONTACTS INTO SUPABASE...")
    print("="*60)

    inserted = 0
    skipped  = 0

    for c in contacts:
        if not c.get('is_valid'):
            continue
            
        phone = c['phone']
        if await is_duplicate_in_db(sb, phone):
            print(f"  [SKIP]   {c['name']:<30} {phone}  → already in DB")
            skipped += 1
            continue

        sb.table('guests').insert({
            'name':        c['name'],
            'phone':       phone,
            'status':      'pending',
            'unique_code': make_code(c['name'], phone),
        }).execute()

        print(f"  [INSERT] {c['name']:<30} {phone}  → added ✅")
        inserted += 1

    print(f"\n{'='*60}")
    print(f"SUMMARY: {inserted} inserted, {skipped} skipped (duplicate phone)")
    print(f"{'='*60}")

# ─── Main ─────────────────────────────────────────────────────────────────────
async def main():
    if not API_ID or not API_HASH:
        print("ERROR: Please fill API_ID and API_HASH in the script.")
        return

    print(f"Connecting to Telegram...")

    async with TelegramClient('rsvp_session', API_ID, API_HASH) as client:
        print("Connected! ✅")

        # If no GROUP_NAME, list all chats and exit
        if not GROUP_NAME:
            print("\nAvailable chats:")
            async for dialog in client.iter_dialogs():
                print(f"  - {dialog.name}")
            print("\nFill GROUP_NAME and run again.")
            return

        # ─── Find the group ───────────────────────────────────────────────────
        print(f"\nLooking for group: '{GROUP_NAME}'...")
        target_group = None

        try:
            target_group = await client.get_entity(GROUP_NAME)
            print(f"  Group found: {getattr(target_group, 'title', GROUP_NAME)} ✅")
        except Exception:
            async for dialog in client.iter_dialogs():
                if GROUP_NAME.lower() in dialog.name.lower():
                    target_group = dialog.entity
                    print(f"  Group found: {dialog.name} ✅")
                    break

        if not target_group:
            print(f"  ERROR: Group not found: '{GROUP_NAME}'")
            return

        # ─── Scan all messages ────────────────────────────────────────────────
        print(f"\nScanning ALL messages (up to 10,000)...")
        print("="*60)

        results = []
        seen_phones_session = set()
        sb = get_supabase()
        msg_num = 0

        async for message in client.iter_messages(target_group, limit=10000):
            msg_num += 1
            date_str = message.date.strftime('%Y-%m-%d %H:%M') if message.date else ''
            sender = getattr(message.sender, 'first_name', '') or ''
            
            entry = {
                "msg_num": msg_num,
                "sent_at": date_str,
                "sender": sender,
                "is_valid": False,
                "reason": "",
                "name": "",
                "phone": ""
            }

            if message.media and isinstance(message.media, MessageMediaContact):
                mc = message.media
                name_parts = [mc.first_name or '', mc.last_name or '']
                name = ' '.join(p for p in name_parts if p).strip() or f"Contact {mc.phone_number}"
                phone = normalize_phone(mc.phone_number)
                
                entry["name"] = name
                entry["phone"] = phone

                # Check for duplicates
                if phone in seen_phones_session:
                    entry["reason"] = f"כפילות (כבר הופיע בסריקה הזו)"
                    print(f"  [MSG #{msg_num:3}] {date_str} | ❌ {name} {phone} (Session Duplicate)")
                elif await is_duplicate_in_db(sb, phone):
                    entry["reason"] = f"כפילות (כבר קיים במסד הנתונים)"
                    seen_phones_session.add(phone) # Mark as seen to avoid re-checking DB
                    print(f"  [MSG #{msg_num:3}] {date_str} | ❌ {name} {phone} (DB Duplicate)")
                else:
                    entry["is_valid"] = True
                    entry["reason"] = "תקין"
                    seen_phones_session.add(phone)
                    print(f"  [MSG #{msg_num:3}] {date_str} | ✅ {name:<28} {phone}")
            else:
                desc = describe_message(message)
                entry["reason"] = f"לא איש קשר ({desc})"
                print(f"  [MSG #{msg_num:3}] {date_str} | ⚠️  {desc}")
            
            results.append(entry)

        # ─── Summary ──────────────────────────────────────────────────────────
        valid_contacts = [r for r in results if r['is_valid']]
        print(f"\n{'='*60}")
        print(f"SCAN COMPLETE")
        print(f"  Total messages scanned : {msg_num}")
        print(f"  Valid new contacts     : {len(valid_contacts)}")
        print(f"  Duplicates/Non-contact : {msg_num - len(valid_contacts)}")
        print(f"{'='*60}")

        print(f"\nTOP 20 SCAN RESULTS (See full JSON for all):")
        print(f"{'='*60}")
        print(f"{'#':<4} | {'Time':<16} | {'Valid?':<6} | {'Reason/Name'}")
        print(f"-"*60)
        for r in results[:20]:
            status_char = "✅" if r['is_valid'] else "❌"
            content = r['name'] if r['is_valid'] else r['reason']
            print(f"{r['msg_num']:<4} | {r['sent_at']:<16} | {status_char:<6} | {content}")
        print(f"{'='*60}")

        # Save to JSON
        with open('contacts_import.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nSaved to: contacts_import.json")

        # ─── DB Insert ────────────────────────────────────────────────────────
        if INSERT_TO_DB:
            await insert_to_supabase(results)
        else:
            print(f"\nPREVIEW MODE - nothing was written to DB.")
            print(f"To insert into Supabase, run:")
            print(f"  python3 telegram_import.py --insert")


if __name__ == '__main__':
    asyncio.run(main())
