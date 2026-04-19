import os
import dotenv
from supabase import create_client

dotenv.load_dotenv('.env.local')
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase = create_client(url, key)

res = supabase.table("guests").select("id, name, status").execute()
for g in res.data:
    print(f"{g['id']} | {g['name']} | {g['status']}")
