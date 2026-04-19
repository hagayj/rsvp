import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
# Clear all guests by deleting everything
try:
    res = sb.table('guests').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
    # Also clear system logs to have a fresh start
    sb.table('system_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
    print("Success: Database cleared.")
except Exception as e:
    print(f"Error clearing database: {e}")
