import os
import json
import requests
from datetime import datetime, timezone

# Load credentials
for env_path in ["../.env.local", ".env.local"]:
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.strip() and not line.startswith("#") and "=" in line:
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v.strip("'\"")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

def get_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def rpc_or_insert(table, data, match_col):
    val = data[match_col]
    res = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{match_col}=eq.{val}", headers=get_headers())
    res.raise_for_status()
    rows = res.json()
    if rows:
        return rows[0]["id"]
    
    post_res = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", json=data, headers=get_headers())
    post_res.raise_for_status()
    return post_res.json()[0]["id"]

def main():
    print("--- AGENCYFORTE SANDBOX PUSHER (WITH COMPETITORS) ---")
    
    if not SUPABASE_URL:
        print("Error: Missing Supabase credentials")
        return

    # 1. Upsert Base Agency 957388
    print("Upserting Base Sandbox Agency...")
    agency_data = {
        "tdi_license_number": "957388",
        "npn": "957388",
        "agency_name": "AEGIS GENERAL INSURANCE AGENCY INC",
        "category": "COMMERCIAL",
        "total_producers_count": 15
    }
    
    try:
        agency_id = rpc_or_insert("agencies", agency_data, "tdi_license_number")
    except Exception as e:
        del agency_data["npn"]
        agency_id = rpc_or_insert("agencies", agency_data, "tdi_license_number")

    # 2. Upsert Competitor Agencies
    print("Upserting Competitor Agencies...")
    comp1_id = rpc_or_insert("agencies", {
        "tdi_license_number": "19770370",
        "agency_name": "HOUSTON INTERNATIONAL INSURANCE GROUP",
        "total_producers_count": 42
    }, "tdi_license_number")

    comp2_id = rpc_or_insert("agencies", {
        "tdi_license_number": "7550202",
        "agency_name": "TEXAS MUTUAL INSURANCE COMPANY",
        "total_producers_count": 120
    }, "tdi_license_number")

    # 3. Link Competitors
    print("Linking Competitors...")
    # Delete existing relationships for base agency to avoid duplicates
    requests.delete(f"{SUPABASE_URL}/rest/v1/competitor_relationships?base_agency_id=eq.{agency_id}", headers=get_headers())
    
    requests.post(f"{SUPABASE_URL}/rest/v1/competitor_relationships", json=[
        {
            "base_agency_id": agency_id,
            "competitor_agency_id": comp1_id,
            "competition_score": 95,
            "overlap_carriers_count": 4,
            "distance_miles": 5.2
        },
        {
            "base_agency_id": agency_id,
            "competitor_agency_id": comp2_id,
            "competition_score": 88,
            "overlap_carriers_count": 2,
            "distance_miles": 12.4
        }
    ], headers=get_headers())

    print("ALL SANDBOX EVENTS PUSHED SUCCESSFULLY.")
    print("You may now test NPN 957388 in the Onboarding UI to see competitors!")

if __name__ == "__main__":
    main()
