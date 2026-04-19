from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv('.env.local')
url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
sb = create_client(url, key)

jobs = sb.table("jobs").select("*").in_("type", ["delete_guest"]).order("created_at", desc=True).limit(5).execute()
print("=== RECENT DELETE JOBS ===")
for j in jobs.data:
    print(f"  [{j['status']}] {j['created_at'][:19]} - id: {j['id']} - payload: {j['payload']}")
