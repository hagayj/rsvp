# RSVP Automation Project

Welcome to the RSVP and WhatsApp Automation System. This project automates guest importing from Telegram and manual/bulk invitation sending via WhatsApp.

## 🚀 Quick Navigation

- **[System Architecture](file:///Users/hagay/approvel/rsvp-app/ARCHITECTURE.md)**: How the components talk to each other.
- **[Tools & Usage Guide](file:///Users/hagay/approvel/rsvp-app/TOOLS_GUIDE.md)**: How to use the Telegram scraper and WhatsApp worker.
- **[Admin Dashboard](https://rsvp-app-sage.vercel.app/admin)**: Manage guests and send invitations (Password: `amir2026`).

---

## 🛠️ Main Workflows

### 1. Adding New Guests from Telegram
To fetch the latest contacts from the Telegram group:
```bash
# Preview first
python3 telegram_import.py

# Import to DB
python3 telegram_import.py --insert
```

### 2. Starting the WhatsApp Worker (at the Office)
The worker should start automatically on reboot via PM2. 
To check if it's healthy:
1. SSH into the office machine: `ssh hagay@192.168.0.240`.
2. Run `pm2 status`.
3. If it shows `rsvp-worker` is `online`, you are good to go.

---

## 📂 Project Structure

- `src/`: Next.js web application (Frontend & API).
- `telegram_import.py`: Python script for Telegram guest extraction.
- `remote_worker.mjs`: Node.js script for WhatsApp automation (run on remote server).
- `contacts_import.json`: Audit log of the last Telegram scan.

---

## 🔑 Key Credentials
- **Supabase**: Managed through the `.env.local` file.
- **Telegram API**: Configured inside `telegram_import.py`.
- **Remote Server**: `192.168.0.240` (User: `hagay`, Password: `12322123`).
