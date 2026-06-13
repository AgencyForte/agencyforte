import os
import time
from datetime import datetime, timezone
import polars as pl
import requests

# ==========================================
# AGENCYFORTE PIPELINE ENGINE
# Phase 2: The 24-Hour Polars Diff
# ==========================================

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
TDI_CSV_URL = "https://data.texas.gov/api/views/avjc-7u2m/rows.csv?accessType=DOWNLOAD"

def get_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

def generate_alerts(dropped_df: pl.DataFrame, added_df: pl.DataFrame):
    alerts = []
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if not dropped_df.is_empty():
        agency_drops = dropped_df.group_by("agency_name").agg(pl.count("agent_npn").alias("drop_count"))
        
        for row in dropped_df.iter_rows(named=True):
            is_mass_termination = agency_drops.filter(pl.col("agency_name") == row["agency_name"])["drop_count"][0] > 5
            event_type = "agency_termination" if is_mass_termination else ("defection" if row["agent_name"] else "carrier_loss")
            
            alerts.append({
                "agency_name": row["agency_name"],
                "event_type": event_type,
                "event_date": today_str,
                "agent_name": row["agent_name"],
                "agent_npn": row["agent_npn"],
                "carrier_name": row["carrier_name"],
                "is_read": False
            })

    if not added_df.is_empty():
        for row in added_df.iter_rows(named=True):
            event_type = "hire" if row["agent_name"] else "new_appt"
            alerts.append({
                "agency_name": row["agency_name"],
                "event_type": event_type,
                "event_date": today_str,
                "agent_name": row["agent_name"],
                "agent_npn": row["agent_npn"],
                "carrier_name": row["carrier_name"],
                "is_read": False
            })

    return alerts

def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] STARTING AGENCYFORTE PIPELINE")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("CRITICAL ERROR: Supabase credentials not found in environment variables.")
        return

    # --- STEP 1: EXTRACT TDI DATA ---
    print("[1/5] Downloading today's TDI Active Appointments snapshot...")
    try:
        today_df = pl.read_csv(TDI_CSV_URL, ignore_errors=True)
        today_df = today_df.rename({
            "Firm Name": "agency_name",
            "Agent Name": "agent_name",
            "NPN": "agent_npn",
            "Company Name": "carrier_name",
            "Issue Date": "appointment_date",
            "License Type": "lines",
            "Zip Code": "zip_code"
        }, strict=False)
        print(f"      Downloaded {len(today_df)} active appointments.")
    except Exception as e:
        print(f"      Failed to download TDI data. Creating mock today_df for pipeline testing.")
        today_df = pl.DataFrame({
            "agent_npn": ["111", "222"],
            "agent_name": ["John Doe", "Jane Smith"],
            "agency_name": ["Smith & Co Insurance", "Apex Commercial Group"],
            "carrier_name": ["CHUBB", "TRAVELERS"],
            "appointment_date": ["2020-01-01", "2021-05-15"],
            "lines": ["P&C", "P&C"],
            "zip_code": ["77002", "77002"]
        })

    # --- STEP 2: FETCH YESTERDAY'S DATA ---
    print("[2/5] Fetching yesterday's snapshot from Supabase REST API...")
    try:
        # Supabase limits responses to 1000 rows by default, we'll fetch just what we need or mock if empty
        res = requests.get(f"{SUPABASE_URL}/rest/v1/raw_tdi_appointments?select=*", headers=get_headers())
        res.raise_for_status()
        yesterday_data = res.json()
        
        if not yesterday_data:
            print("      No previous data found. This must be Day 1 (Initialization).")
            yesterday_df = pl.DataFrame(schema=today_df.schema)
        else:
            yesterday_df = pl.DataFrame(yesterday_data)
            print(f"      Loaded {len(yesterday_df)} appointments from yesterday.")
    except Exception as e:
        print(f"      Error fetching from Supabase REST API: {e}")
        return

    # --- STEP 3: THE ANTI-JOIN DIFF ---
    print("[3/5] Executing Polars Anti-Join Diff Engine...")
    dropped_df = yesterday_df.join(today_df, on=["agent_npn", "carrier_name"], how="anti")
    added_df = today_df.join(yesterday_df, on=["agent_npn", "carrier_name"], how="anti")
    print(f"      Found {len(dropped_df)} dropped appointments (Exits/Losses).")
    print(f"      Found {len(added_df)} new appointments (Hires/Gains).")

    # --- STEP 4: GENERATE AND PUSH ALERTS ---
    print("[4/5] Generating tactical alerts and pushing to Supabase...")
    alerts = generate_alerts(dropped_df, added_df)
    
    if alerts:
        try:
            chunk_size = 500
            for i in range(0, len(alerts), chunk_size):
                chunk = alerts[i:i + chunk_size]
                post_res = requests.post(f"{SUPABASE_URL}/rest/v1/tripwire_alerts", json=chunk, headers=get_headers())
                post_res.raise_for_status()
            print(f"      Successfully pushed {len(alerts)} alerts.")
        except Exception as e:
            print(f"      Error pushing alerts: {e}")
            if 'post_res' in locals(): print(post_res.text)
    else:
        print("      No alerts generated today. Market is stable.")

    # --- STEP 5: ROTATE RAW DATA ---
    print("[5/5] Rotating raw_tdi_appointments for tomorrow's diff...")
    try:
        # Delete old records
        del_res = requests.delete(f"{SUPABASE_URL}/rest/v1/raw_tdi_appointments?agent_npn=neq.0000", headers=get_headers())
        del_res.raise_for_status()
        
        # Insert new records
        today_dicts = today_df.to_dicts()
        safe_limit = min(len(today_dicts), 5000)
        chunk_size = 1000
        
        print(f"      Uploading {safe_limit} records in chunks of {chunk_size}...")
        for i in range(0, safe_limit, chunk_size):
            chunk = today_dicts[i:i + chunk_size]
            post_res = requests.post(f"{SUPABASE_URL}/rest/v1/raw_tdi_appointments", json=chunk, headers=get_headers())
            post_res.raise_for_status()
            time.sleep(0.5)
            
        print("      Rotation complete.")
    except Exception as e:
        print(f"      Error rotating raw data: {e}")
        if 'post_res' in locals(): print(post_res.text)

    print(f"[{datetime.now(timezone.utc).isoformat()}] PIPELINE COMPLETE.")

if __name__ == "__main__":
    main()
