import os
from supabase import create_client

url = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
key = "sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL"
supabase = create_client(url, key)

# Check heartbeat
res = supabase.table("system_settings").select("*").eq("key", "worker_heartbeat").execute()
print(f"Heartbeat: {res.data}")

# Check for latest logs
res_logs = supabase.table("system_logs").select("*").order("created_at", desc=True).limit(5).execute()
print("\n--- RECENT LOGS ---")
for log in res_logs.data:
    print(f"Time: {log['created_at']} | Message: {log['message']}")
