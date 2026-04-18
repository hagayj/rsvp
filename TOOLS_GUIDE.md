# Tools Guide: RSVP Automation Scripts

This guide provides detailed instructions on how to use the individual scripts in this repository.

---

## 1. Telegram Importer (`telegram_import.py`)

This Python script is used to pull guest data from Telegram and sync it with our database.

### How it works
1. **Scans** the specified Telegram group (configured via `GROUP_NAME`).
2. **Filters**: It only looks for "Contact Cards". Plain text messages are captured for audit but skipped for auto-import.
3. **Deduplication**: 
    - It skips duplicate phone numbers found within the same scan.
    - It checks the Supabase `guests` table to avoid importing people who are already in the system.
4. **Output**: Generates a Detailed `contacts_import.json` file.

### Commands
```bash
# Preview Mode: Scans and generates contacts_import.json WITHOUT writing to DB
python3 telegram_import.py

# Insert Mode: Scans and adds new valid guests to the database
python3 telegram_import.py --insert
```

### JSON Fields Explained
- `is_valid`: `True` if the contact is a new, unique card ready for import.
- `reason`: Explains why a message was skipped (e.g., "כפילות", "לא איש קשר").
- `sent_at`: Timestamp of the message in Telegram.

---

## 2. WhatsApp Worker (`remote_worker.mjs`)

This Node.js script runs on the office server (`192.168.0.240`) and handles the actual sending of WhatsApp messages.

### Logic Flow
1. **Initialization**: Launches a Chromium browser via `puppeteer` and `whatsapp-web.js`.
2. **Realtime Listener**: Connects to Supabase and waits for a "job" record.
3. **Message Sending**:
    - Fetches the guest list.
    - Uses a 5-10 second delay between messages to avoid WhatsApp spam detection.
    - Updates logs in Supabase for every sent message.

### Maintenance Commands (Run on Server)
The script is managed by **PM2** for auto-restart on reboot.
```bash
# Check status
pm2 status

# View live logs
pm2 logs rsvp-worker

# Manual Restart
pm2 restart rsvp-worker
```

### Troubleshooting: "Browser already running"
If the script fails to start, it's usually because Chromium didn't close properly.
**Fix**: `pkill -9 chromium` or use the provided `fix_chromium_lock.exp` script.

---

## 3. Web Admin Dashboard

The frontend management interface.

- **URL**: [https://rsvp-app-sage.vercel.app/admin](https://rsvp-app-sage.vercel.app/admin)
- **Password**: `amir2026`
- **Features**:
    - **Bulk Send**: Triggers the `remote_worker` via a database job.
    - **Guest Management**: View invite links and attendance status.
    - **Live Logs**: Watch the worker send messages in real-time.

---

## Important Configuration File
### `.env.local`
This file on the Mac and the Server contains the Supabase secrets.
- `NEXT_PUBLIC_SUPABASE_URL`: DB URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public API key.
