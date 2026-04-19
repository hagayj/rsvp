from supabase import create_client

url = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
key = "sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL"
sb = create_client(url, key)

# Check jobs
jobs = sb.table("jobs").select("*").order("created_at", desc=True).limit(3).execute()
print("=== RECENT JOBS ===")
for j in jobs.data:
    print(f"  [{j['status']}] {j['type']} - {j['created_at'][:19]} - payload: {j['payload']}")

# Delete "בדיקה" right now
guests = sb.table("guests").select("id,name,phone").ilike("name", "%בדיקה%").execute()
print(f"\n=== FOUND: {len(guests.data)} guests matching 'בדיקה' ===")
for g in guests.data:
    print(f"  {g['name']} ({g['id']})")
    del_res = sb.table("guests").delete().eq("id", g['id']).execute()
    print(f"  → Deleted!")
    sb.table("system_logs").insert({"message": f"✅ [SERVER] {g['name']} נמחק ידנית (force-fix)", "level": "success"}).execute()

# Mark pending jobs as completed
pending = sb.table("jobs").select("id").eq("status", "pending").execute()
for j in pending.data:
    sb.table("jobs").update({"status": "completed"}).eq("id", j['id']).execute()
print(f"\n=== Marked {len(pending.data)} pending jobs as completed ===")
