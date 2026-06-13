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

def determine_region(zip_code):
    if not zip_code or not isinstance(zip_code, str):
        return "Unknown"
    
    prefix = zip_code[:3]
    if prefix in ["750", "751", "752", "753", "754", "760", "761", "762", "764", "765", "766"]:
        return "Dallas-Fort Worth"
    elif prefix in ["770", "772", "773", "774", "775", "778"]:
        return "Greater Houston"
    elif prefix in ["786", "787", "789", "765"]:
        return "Austin / Central Texas"
    elif prefix in ["780", "781", "782"]:
        return "San Antonio"
    elif prefix in ["783", "784", "785"]:
        return "South Texas"
    elif prefix in ["797", "798", "799", "768", "769"]:
        return "West Texas"
    elif prefix in ["790", "791", "792", "793", "794", "795", "796"]:
        return "Panhandle"
    elif prefix in ["755", "756", "757", "758", "759"]:
        return "East Texas"
    else:
        return "Other Texas"

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
                "is_read": False,
                "zip_code": row.get("zip_code", ""),
                "region": determine_region(row.get("zip_code", ""))
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
                "is_read": False,
                "zip_code": row.get("zip_code", ""),
                "region": determine_region(row.get("zip_code", ""))
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

    # --- STEP 2: LOAD YESTERDAY'S CSV ---
    print("[2/5] Loading yesterday's snapshot from local cache...")
    if not os.path.exists("yesterday_tdi.csv"):
        print("      No previous data found (Day 1). Creating empty dataframe.")
        yesterday_df = pl.DataFrame(schema=today_df.schema)
    else:
        try:
            yesterday_df = pl.read_csv("yesterday_tdi.csv", ignore_errors=True)
            # Ensure schema matches
            for col in today_df.columns:
                if col not in yesterday_df.columns:
                    yesterday_df = yesterday_df.with_columns(pl.lit("").alias(col))
            print(f"      Loaded {len(yesterday_df)} appointments from yesterday.")
        except Exception as e:
            print(f"      Failed to load yesterday's data: {e}. Falling back to empty.")
            yesterday_df = pl.DataFrame(schema=today_df.schema)

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

    # --- STEP 5: COMPUTE AND PUSH AGENCY DIRECTORY ---
    print("[5/5] Aggregating Market Directory and saving state...")
    try:
        # Create regions for all rows using the fast map functionality
        today_df = today_df.with_columns(
            pl.col("zip_code").map_elements(determine_region, return_dtype=pl.Utf8).alias("region")
        )
        
        # Aggregate directory
        dir_df = today_df.group_by(["agency_name", "region"]).agg(pl.n_unique("agent_npn").alias("total_producers"))
        
        # Drop agencies with NULL/blank names
        dir_df = dir_df.filter(pl.col("agency_name").is_not_null() & (pl.col("agency_name") != ""))
        
        # Delete old directory in Supabase
        del_res = requests.delete(f"{SUPABASE_URL}/rest/v1/agency_directory?agency_name=neq.0000", headers=get_headers())
        del_res.raise_for_status()

        # Push new directory in chunks
        dir_dicts = dir_df.to_dicts()
        chunk_size = 1000
        for i in range(0, len(dir_dicts), chunk_size):
            chunk = dir_dicts[i:i + chunk_size]
            post_res = requests.post(f"{SUPABASE_URL}/rest/v1/agency_directory", json=chunk, headers=get_headers())
            post_res.raise_for_status()
            time.sleep(0.5)
            
        print(f"      Successfully pushed {len(dir_dicts)} unique agencies to directory.")

        # Save today's CSV for tomorrow
        today_df.write_csv("yesterday_tdi.csv")
        print("      Saved yesterday_tdi.csv for tomorrow's diff.")

    except Exception as e:
        print(f"      Error in step 5: {e}")
        if 'post_res' in locals() and hasattr(post_res, 'text'): print(post_res.text)

    print(f"[{datetime.now(timezone.utc).isoformat()}] PIPELINE COMPLETE.")

if __name__ == "__main__":
    main()
