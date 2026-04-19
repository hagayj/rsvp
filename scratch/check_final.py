import os
from supabase import create_client

url = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
key = "sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL"
supabase = create_client(url, key)

# Check for processing/completed jobs
res = supabase.table("jobs").select("*").in_("status", ["processing", "completed", "failed"]).order("created_at", desc=True).limit(5).execute()
print("--- PROCESSED JOBS ---")
for job in res.data:
    print(f"Time: {job['created_at']} | Type: {job['type']} | Status: {job['status']} | Payload: {job['payload']}")

# Check system_logs for TODAY
from datetime import datetime
today = datetime.now().strftime("%Y-%m-%d")
res_logs = supabase.table("system_logs").select("*").filter("created_at", "gte", today).order("created_at", desc=True).limit(20).execute()
print("\n--- TODAY'S LOGS ---")
for log in res_logs.data:
    print(f"Time: {log['created_at']} | Message: {log['message']}")
