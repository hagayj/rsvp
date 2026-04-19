import os
from supabase import create_client

url = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
key = "sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL"
supabase = create_client(url, key)

# Check jobs
res = supabase.table("jobs").select("*").order("created_at", desc=True).limit(5).execute()
print("--- RECENT JOBS ---")
for job in res.data:
    print(f"Time: {job['created_at']} | Type: {job['type']} | Status: {job['status']} | Payload: {job['payload']}")

# Check logs for "SERVER"
res_logs = supabase.table("system_logs").select("*").ilike("message", "%SERVER%").order("created_at", desc=True).limit(10).execute()
print("\n--- SERVER LOGS ---")
for log in res_logs.data:
    print(f"Time: {log['created_at']} | Message: {log['message']}")
