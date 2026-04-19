import os
import sys
import argparse
from dotenv import load_dotenv
from supabase import create_client

# Load config from .env.local
load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
# Use Service Role Key for Admin Tasks
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def log_to_db(message, level='info'):
    print(f"[{level.upper()}] {message}")
    try:
        supabase.table('system_logs').insert({
            'message': message,
            'level': level
        }).execute()
    except Exception as e:
        print(f"⚠️ Failed to log to DB: {e}")

def delete_guest(guest_id):
    log_to_db(f"🚀 [SERVER] מתחיל מחיקת אורח (ID: {guest_id})...", 'info')
    
    try:
        # Check if guest exists
        res = supabase.table('guests').select('name').eq('id', guest_id).single().execute()
        if not res.data:
            log_to_db(f"⚠️ [SERVER] האורח עם מזהה {guest_id} לא נמצא במסד.", 'warning')
            return False
            
        guest_name = res.data.get('name', 'לא ידוע')
        log_to_db(f"⚡ [SERVER] מבצע מחיקה לצמיתות של {guest_name}...", 'info')
        
        # Execute delete
        del_res = supabase.table('guests').delete().eq('id', guest_id).execute()
        
        if del_res.data:
            log_to_db(f"✅ [SERVER] האורח {guest_name} נמחק בהצלחה מהמערכת.", 'success')
            return True
        else:
            log_to_db(f"❌ [SERVER] המחיקה נכשלה ללא הודעת שגיאה.", 'error')
            return False
            
    except Exception as e:
        log_to_db(f"❌ [SERVER] כשל במחיקה: {str(e)}", 'error')
        return False

def main():
    parser = argparse.ArgumentParser(description='RSVP Admin CLI Tool')
    parser.add_argument('--action', choices=['delete'], required=True)
    parser.add_argument('--id', help='Guest ID for deletion')
    
    args = parser.parse_args()
    
    if args.action == 'delete':
        if not args.id:
            print("❌ ERROR: --id is required for delete action")
            sys.exit(1)
        
        success = delete_guest(args.id)
        if not success:
            sys.exit(1)

if __name__ == "__main__":
    main()
