import os
import argparse
import polars as pl
from datetime import datetime, timezone
import json
import requests
import uuid

# Load credentials
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

AGENCY_FILE = "Active_insurance_company_appointments_for_agencies_and_businesses.csv"
RELATIONSHIPS_FILE = "Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv"

def get_supabase_data():
    print("Fetching active agencies and producers from Supabase...")
    ag_res = requests.get(f"{SUPABASE_URL}/rest/v1/agencies?select=id,tdi_license_number", headers=HEADERS)
    ag_data = ag_res.json() if ag_res.status_code == 200 else []
    agency_map = {str(row["tdi_license_number"]): row["id"] for row in ag_data if "tdi_license_number" in row}
    
    prod_res = requests.get(f"{SUPABASE_URL}/rest/v1/producers?select=id,npn", headers=HEADERS)
    p_data = prod_res.json() if prod_res.status_code == 200 else []
    producer_map = {str(row["npn"]): row["id"] for row in p_data if "npn" in row}
    
    car_res = requests.get(f"{SUPABASE_URL}/rest/v1/carriers?select=id,carrier_name", headers=HEADERS)
    c_data = car_res.json() if car_res.status_code == 200 else []
    carrier_map = {str(row["carrier_name"]): row["id"] for row in c_data if "carrier_name" in row}

    return agency_map, producer_map, carrier_map

def get_or_create_carrier(carrier_name, carrier_map):
    c_name = str(carrier_name).strip()[:255]
    if c_name in carrier_map:
        return carrier_map[c_name]
    
    # Create new
    c_id = str(uuid.uuid4())
    res = requests.post(f"{SUPABASE_URL}/rest/v1/carriers", json={"id": c_id, "carrier_name": c_name}, headers=HEADERS)
    if res.status_code in [200, 201]:
        carrier_map[c_name] = c_id
        return c_id
    else:
        print(f"Error creating carrier {c_name}: {res.text}")
        return None

def main():
    parser = argparse.ArgumentParser(description="AgencyForte Data Pipeline Engine")
    parser.add_argument("--day1", required=True, help="Path to the Day 1 (Yesterday) dataset folder")
    parser.add_argument("--day2", required=True, help="Path to the Day 2 (Today) dataset folder")
    args = parser.parse_args()

    print(f"[{datetime.now(timezone.utc).isoformat()}] STARTING AGENCYFORTE PIPELINE")
    
    agency_map, producer_map, carrier_map = get_supabase_data()
    active_agency_npns = list(agency_map.keys())
    
    if not active_agency_npns:
        print("Error: No active agencies found in Supabase. Run msa_ingestor.py first.")
        return

    print(f"Targeting {len(active_agency_npns)} active agencies in the MVP ecosystem.")

    today_str = datetime.now().strftime("%Y-%m-%d")

    # --- 1. Roster Diff ---
    print("\n[1/2] Executing Roster Diff...")
    d1_rel = pl.read_csv(os.path.join(args.day1, RELATIONSHIPS_FILE), infer_schema_length=0)
    d2_rel = pl.read_csv(os.path.join(args.day2, RELATIONSHIPS_FILE), infer_schema_length=0)

    d1_rel = d1_rel.filter(pl.col("Associated licensee NPN").is_in(active_agency_npns))
    d2_rel = d2_rel.filter(pl.col("Associated licensee NPN").is_in(active_agency_npns))

    d1_rel = d1_rel.filter(pl.col("Associated licensee NPN").is_not_null() & pl.col("Licensee NPN").is_not_null())
    d2_rel = d2_rel.filter(pl.col("Associated licensee NPN").is_not_null() & pl.col("Licensee NPN").is_not_null())

    defections = d1_rel.join(d2_rel, on=["Associated licensee NPN", "Licensee NPN"], how="anti")
    hires = d2_rel.join(d1_rel, on=["Associated licensee NPN", "Licensee NPN"], how="anti")

    active_producer_npns = list(producer_map.keys())
    defections = defections.filter(pl.col("Licensee NPN").is_in(active_producer_npns))
    hires = hires.filter(pl.col("Licensee NPN").is_in(active_producer_npns))

    # --- 2. Carrier Diff ---
    print("\n[2/2] Executing Carrier Diff (New Markets / Carrier Loss)...")
    d1_ag = pl.read_csv(os.path.join(args.day1, AGENCY_FILE), infer_schema_length=0)
    d2_ag = pl.read_csv(os.path.join(args.day2, AGENCY_FILE), infer_schema_length=0)

    d1_ag = d1_ag.filter(pl.col("Agency NPN").is_in(active_agency_npns))
    d2_ag = d2_ag.filter(pl.col("Agency NPN").is_in(active_agency_npns))

    d1_ag = d1_ag.filter(pl.col("Agency NPN").is_not_null() & pl.col("NAIC ID").is_not_null())
    d2_ag = d2_ag.filter(pl.col("Agency NPN").is_not_null() & pl.col("NAIC ID").is_not_null())

    losses = d1_ag.join(d2_ag, on=["Agency NPN", "NAIC ID"], how="anti")
    new_appts = d2_ag.join(d1_ag, on=["Agency NPN", "NAIC ID"], how="anti")

    # --- Output Results ---
    print("\n================ PIPELINE RESULTS ================")
    print(f"Defections:      {len(defections)}")
    print(f"Hires:           {len(hires)}")
    print(f"Carrier Losses:  {len(losses)}")
    print(f"New Markets:     {len(new_appts)}")
    print("==================================================\n")

    print("\n[3/3] Calculating Producers Affected by Carrier Events...")
    PRODUCERS_FILE = "Active_insurance_company_appointments_for_agents_and_adjusters.csv"
    
    # Load Day 1 agent appointments to see who lost what
    d1_prods = pl.read_csv(os.path.join(args.day1, PRODUCERS_FILE), infer_schema_length=0)
    if "Agent NPN" in d1_prods.columns:
        d1_prods = d1_prods.rename({"Agent NPN": "Licensee NPN"})
    d1_merged = d1_rel.join(d1_prods, on="Licensee NPN", how="inner")
    d1_impact = d1_merged.group_by(["Associated licensee NPN", "Insurance company name"]).agg(pl.count("Licensee NPN").alias("affected_count"))
    d1_impact_dict = {(str(row["Associated licensee NPN"]), str(row["Insurance company name"])): row["affected_count"] for row in d1_impact.to_dicts()}

    # Load Day 2 agent appointments to see who gained what
    d2_prods = pl.read_csv(os.path.join(args.day2, PRODUCERS_FILE), infer_schema_length=0)
    if "Agent NPN" in d2_prods.columns:
        d2_prods = d2_prods.rename({"Agent NPN": "Licensee NPN"})
    d2_merged = d2_rel.join(d2_prods, on="Licensee NPN", how="inner")
    d2_impact = d2_merged.group_by(["Associated licensee NPN", "Insurance company name"]).agg(pl.count("Licensee NPN").alias("affected_count"))
    d2_impact_dict = {(str(row["Associated licensee NPN"]), str(row["Insurance company name"])): row["affected_count"] for row in d2_impact.to_dicts()}

    movements_payload = []
    
    # Process Producers
    for row in defections.to_dicts():
        p_id = producer_map.get(str(row["Licensee NPN"]))
        from_ag = agency_map.get(str(row["Associated licensee NPN"]))
        if p_id and from_ag:
            movements_payload.append({"producer_id": p_id, "from_agency_id": from_ag, "movement_date": today_str, "movement_type": "EXITED"})

    for row in hires.to_dicts():
        p_id = producer_map.get(str(row["Licensee NPN"]))
        to_ag = agency_map.get(str(row["Associated licensee NPN"]))
        if p_id and to_ag:
            movements_payload.append({"producer_id": p_id, "to_agency_id": to_ag, "movement_date": today_str, "movement_type": "HIRED"})

    def chunked_post(url, data):
        for i in range(0, len(data), 500):
            res = requests.post(url, json=data[i:i+500], headers=HEADERS)
            if res.status_code not in [200, 201, 204]:
                print(f"Failed to push chunk to {url}: {res.text}")

    if movements_payload:
        print(f"Pushing {len(movements_payload)} movements...")
        chunked_post(f"{SUPABASE_URL}/rest/v1/producer_movements", movements_payload)

    events_payload = []
    
    # Process Carriers
    for row in losses.to_dicts():
        ag_npn = str(row["Agency NPN"])
        c_name = str(row["Insurance company name"])
        affected = d1_impact_dict.get((ag_npn, c_name), 0)
        ag_id = agency_map.get(ag_npn)
        if ag_id:
            c_id = get_or_create_carrier(c_name, carrier_map)
            if c_id:
                events_payload.append({
                    "agency_id": ag_id,
                    "carrier_id": c_id,
                    "event_type": "APPOINTMENT_LOST",
                    "event_date": today_str,
                    "producers_affected_count": affected
                })

    for row in new_appts.to_dicts():
        ag_npn = str(row["Agency NPN"])
        c_name = str(row["Insurance company name"])
        affected = d2_impact_dict.get((ag_npn, c_name), 0)
        ag_id = agency_map.get(ag_npn)
        if ag_id:
            c_id = get_or_create_carrier(c_name, carrier_map)
            if c_id:
                events_payload.append({
                    "agency_id": ag_id,
                    "carrier_id": c_id,
                    "event_type": "APPOINTMENT_GAINED",
                    "event_date": today_str,
                    "producers_affected_count": affected
                })

    if events_payload:
        print(f"Pushing {len(events_payload)} carrier events...")
        chunked_post(f"{SUPABASE_URL}/rest/v1/carrier_events", events_payload)

    print("Pipeline push complete.")

if __name__ == "__main__":
    main()
