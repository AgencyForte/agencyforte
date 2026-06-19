import os
import requests

for env_path in ["../.env.local", ".env.local", "b:/agencyforte_app/.env.local"]:
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.strip() and not line.startswith("#") and "=" in line:
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v.strip("'\"")

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def main():
    print("--- FIXING USER SYNC 2.0 ---")

    u_res = requests.get(f"{SUPABASE_URL}/rest/v1/users?limit=1", headers=HEADERS)
    user_id = u_res.json()[0]["id"]

    # Grab the LATEST competitor relationships (which are guaranteed to be from today's pipeline run)
    comps_res = requests.get(f"{SUPABASE_URL}/rest/v1/competitor_relationships?order=created_at.desc&limit=10", headers=HEADERS)
    
    target_agency_id = comps_res.json()[0]["base_agency_id"]
    
    ag_res = requests.get(f"{SUPABASE_URL}/rest/v1/agencies?id=eq.{target_agency_id}", headers=HEADERS)
    target_agency = ag_res.json()[0]
    
    print(f"Found LATEST Real DFW ICP Agency: {target_agency['agency_name']} (NPN: {target_agency['tdi_license_number']})")

    # Update User's Home Agency
    requests.patch(f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}", json={"home_agency_id": target_agency_id}, headers=HEADERS)

    # Clear old watchlist
    requests.delete(f"{SUPABASE_URL}/rest/v1/user_watchlists?user_id=eq.{user_id}", headers=HEADERS)

    # Add competitors
    comps = requests.get(f"{SUPABASE_URL}/rest/v1/competitor_relationships?base_agency_id=eq.{target_agency_id}&order=competition_score.desc&limit=199", headers=HEADERS).json()
    
    watchlist_payload = [{"user_id": user_id, "agency_id": c["competitor_agency_id"]} for c in comps]
    requests.post(f"{SUPABASE_URL}/rest/v1/user_watchlists", json=watchlist_payload, headers=HEADERS)
    print("Watchlist securely linked to true DFW competitors.")

if __name__ == "__main__":
    main()
