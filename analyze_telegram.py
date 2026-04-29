import os
import sys
import json
import asyncio
from telethon import TelegramClient
from telethon.tl.types import MessageMediaContact
from dotenv import load_dotenv
from tabulate import tabulate

# Load config
load_dotenv('.env.local')

API_ID   = os.environ.get('TELEGRAM_API_ID')
API_HASH = os.environ.get('TELEGRAM_API_HASH')
GROUP_NAME = os.environ.get('TELEGRAM_GROUP_NAME', 'הזמנות לחתונה')

def normalize_phone(phone):
    if not phone: return ""
    p = "".join(filter(str.isdigit, str(phone)))
    if p.startswith('05'): p = '972' + p[1:]
    if len(p) == 9 and p.startswith('5'): p = '972' + p
    return p

async def main():
    if not API_ID or not API_HASH:
        print("❌ ERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in .env.local")
        return

    print(f"🔍 Connecting to Telegram to scan: {GROUP_NAME}...")

    async with TelegramClient('rsvp_session', int(API_ID), API_HASH) as client:
        # Find the group
        target_group = None
        try:
            target_group = await client.get_entity(GROUP_NAME)
        except Exception:
            async for dialog in client.iter_dialogs():
                if GROUP_NAME.lower() in dialog.name.lower():
                    target_group = dialog.entity
                    break

        if not target_group:
            print(f"❌ Error: Group '{GROUP_NAME}' not found!")
            print("\nSearching for matches for 'הזמנות' or 'Wedding':")
            async for dialog in client.iter_dialogs():
                if any(k in dialog.name.lower() for k in ['הזמנות', 'wedding', 'מוזמנים', 'rsvp']):
                    print(f" ✨ Found potential match: {dialog.name} (ID: {dialog.id})")
                    target_group = dialog.entity
                    # Don't break yet, just list them
            
            if not target_group:
                print("No matches found. Listing top 10 dialogs instead:")
                async for dialog in client.iter_dialogs(limit=10):
                    print(f" - {dialog.name} (ID: {dialog.id})")
                return
            else:
                print(f"🚀 Using '{target_group.title}' for scan.")

        print(f"✅ Found Group: {getattr(target_group, 'title', GROUP_NAME)}")
        print("🔄 Scanning messages (limit 5000)...")

        seen_phones = set()
        table_data = []
        
        async for message in client.iter_messages(target_group, limit=5000):
            sender = getattr(message.sender, 'first_name', '') or 'Anonymous'
            
            row = {
                "sender": sender,
                "name": "-",
                "phone": "-",
                "status": "TEXT/OTHER",
                "reason": ""
            }

            if message.media and isinstance(message.media, MessageMediaContact):
                mc = message.media
                name_parts = [mc.first_name or '', mc.last_name or '']
                name = ' '.join(p for p in name_parts if p).strip()
                phone = normalize_phone(mc.phone_number)
                
                row["name"] = name
                row["phone"] = phone

                if not name:
                    row["status"] = "INVALID"
                    row["reason"] = "Missing Name"
                elif not phone:
                    row["status"] = "INVALID"
                    row["reason"] = "Invalid Phone"
                elif phone in seen_phones:
                    row["status"] = "DUPLICATE"
                    row["reason"] = f"Already seen {phone}"
                else:
                    row["status"] = "VALID"
                    seen_phones.add(phone)
            elif message.text:
                # Basic heuristic for phone numbers in text
                text = message.text.strip()
                if any(c.isdigit() for c in text) and len(text) > 8:
                    row["name"] = "Text Extraction?"
                    row["phone"] = text[:20] + ("..." if len(text) > 20 else "")
                    row["status"] = "INVALID"
                    row["reason"] = "Text message (not contact card)"

            # We only want to show rows that have some contact info or are suspicious
            if row["status"] != "TEXT/OTHER":
                table_data.append([
                    row["sender"],
                    row["name"],
                    row["phone"],
                    row["status"],
                    row["reason"]
                ])

        # Sorting: Valid first, then duplicates, then invalid
        status_order = {"VALID": 0, "DUPLICATE": 1, "INVALID": 2}
        table_data.sort(key=lambda x: status_order.get(x[3], 3))

        headers = ["Sender", "Name", "Phone", "Status", "Notes/Reason"]
        report_content = "# Telegram Contact Analysis Report\n\n"
        report_content += f"**Scanned Group:** {getattr(target_group, 'title', 'Unknown')}\n"
        report_content += f"**Valid:** {len([r for r in table_data if r[3] == 'VALID'])}\n"
        report_content += f"**Duplicates:** {len([r for r in table_data if r[3] == 'DUPLICATE'])}\n"
        report_content += f"**Invalid:** {len([r for r in table_data if r[3] == 'INVALID'])}\n\n"
        report_content += tabulate(table_data, headers=headers, tablefmt="github")

        with open('telegram_report.md', 'w', encoding='utf-8') as f:
            f.write(report_content)

        print("\n✅ Analysis complete. Report saved to telegram_report.md")
        print(f"📊 Summary: {len(table_data)} total rows analyzed.")

if __name__ == '__main__':
    asyncio.run(main())
