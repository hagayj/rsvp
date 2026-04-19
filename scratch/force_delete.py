import os
from supabase import create_client

url = "https://bvlcfqoxlfmxbxpkuuhg.supabase.co"
key = "sb_secret_9QfRdUR3MoYPmyFOZ4r5KQ_eN2g7hfL"
supabase = create_client(url, key)

# Search for "חגי"
res = supabase.table("guests").select("id, name").ilike("name", "%חגי%").execute()
if res.data:
    for guest in res.data:
        print(f"Deleting guest: {guest['name']} ({guest['id']})")
        delete_res = supabase.table("guests").delete().eq("id", guest['id']).execute()
        print(f"Result: {delete_res.data}")
else:
    print("No guest found with name 'חגי'")
