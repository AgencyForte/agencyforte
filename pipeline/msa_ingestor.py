import os
import argparse
import polars as pl
import requests
import uuid
import time
import math

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

def determine_region(zip_code):
    if not zip_code or not isinstance(zip_code, str):
        return "Unknown"
    prefix = str(zip_code)[:3]
    if prefix in ["750", "751", "752", "753", "754", "760", "761", "762", "764", "765", "766"]:
        return "Dallas-Fort Worth"
    return "Other Texas"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--day2", required=True, help="Path to Day 2 dataset")
    args = parser.parse_args()

    print("--- MSA INGESTOR (DFW ECOSYSTEM) ---")
    
    ag_file = "Active_insurance_company_appointments_for_agencies_and_businesses.csv"
    rel_file = "Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv"
    agts_file = "Active_insurance_company_appointments_for_agents_and_adjusters.csv"
    
    print("Loading data...")
    # 1. Agencies
    agencies_df = pl.read_csv(os.path.join(args.day2, ag_file), infer_schema_length=0)
    # Extract unique agencies with their carriers
    agencies_grouped = agencies_df.group_by("Agency NPN").agg([
        pl.col("Agency name").first().alias("name"),
        pl.col("City").first().alias("city"),
        pl.col("State").first().alias("state"),
        pl.col("Postal code").first().alias("zip_code"),
        pl.col("Insurance company name").unique().alias("carriers")
    ])
    
    # 2. Relationships (Producers)
    rels_df = pl.read_csv(os.path.join(args.day2, rel_file), infer_schema_length=0)
    producer_counts = rels_df.group_by("Associated licensee NPN").agg(pl.count("Licensee NPN").alias("producer_count"))
    
    # Merge
    print("Filtering and Tagging...")
    agencies_full = agencies_grouped.join(producer_counts, left_on="Agency NPN", right_on="Associated licensee NPN", how="left").with_columns(
        pl.col("producer_count").fill_null(0).cast(pl.Int32)
    )
    
    # Filter DFW
    dfw_agencies = agencies_full.filter(
        pl.col("zip_code").map_elements(determine_region, return_dtype=pl.String) == "Dallas-Fort Worth"
    )

    # Tagging
    dfw_agencies = dfw_agencies.with_columns([
        (pl.col("name").str.to_uppercase().str.contains("STATE FARM|ALLSTATE|FARMERS|GOOSEHEAD|SIAA|SMART CHOICE")).alias("is_captive"),
        (pl.col("producer_count") < 5).alias("is_micro"),
        ((pl.col("producer_count") >= 5) & (pl.col("producer_count") <= 30)).alias("is_icp"),
        (pl.col("producer_count") > 30).alias("is_enterprise")
    ])

    # Removed testing limit for full ingestion

    print(f"Generated {dfw_agencies.height} DFW ecosystem agencies.")
    
    dfw_agencies_pd = dfw_agencies.to_pandas()
    
    agencies_payload = []
    locations_payload = []
    agency_npn_to_uuid = {}
    carrier_lists = {}
    
    for _, row in dfw_agencies_pd.iterrows():
        loc_id = str(uuid.uuid4())
        ag_id = str(uuid.uuid4())
        npn = str(row["Agency NPN"])
        agency_npn_to_uuid[npn] = ag_id
        carrier_lists[ag_id] = set(row["carriers"])
        
        locations_payload.append({
            "id": loc_id,
            "address_line_1": "",
            "city": str(row.get("city", ""))[:100],
            "state": str(row.get("state", ""))[:50],
            "zip_code": str(row.get("zip_code", ""))[:20],
            "msa": "Dallas-Fort Worth"
        })
        
        agencies_payload.append({
            "id": ag_id,
            "tdi_license_number": npn,
            "agency_name": str(row["name"])[:255],
            "total_producers_count": int(row["producer_count"]),
            "location_id": loc_id,
            "is_micro": bool(row["is_micro"]),
            "is_icp": bool(row["is_icp"] and not row["is_captive"]),
            "is_enterprise": bool(row["is_enterprise"]),
            "is_captive": bool(row["is_captive"]),
            "category": "COMMERCIAL"
        })

    def chunked_post(url, data):
        for i in range(0, len(data), 500):
            res = requests.post(url, json=data[i:i+500], headers=HEADERS)
            if res.status_code not in [200, 201, 204]:
                print(f"Error {url}: {res.text}")

    print("Upserting to Local Supabase...")
    chunked_post(f"{SUPABASE_URL}/rest/v1/locations", locations_payload)
    chunked_post(f"{SUPABASE_URL}/rest/v1/agencies", agencies_payload)

    # Agents
    print("Preparing Producers...")
    dfw_npns = list(agency_npn_to_uuid.keys())
    dfw_rels = rels_df.filter(pl.col("Associated licensee NPN").is_in(dfw_npns))
    dfw_rels = dfw_rels.unique(subset=["Licensee NPN"])
    dfw_rels_pd = dfw_rels.to_pandas()
    
    producers_payload = []
    
    for _, row in dfw_rels_pd.iterrows():
        p_id = str(uuid.uuid4())
        raw_name = str(row.get("Licensee name", ""))
        
        if "," in raw_name:
            parts = raw_name.split(",")
            if len(parts) >= 2:
                formatted_name = f"{parts[1].strip()} {parts[0].strip()}"
            else:
                formatted_name = raw_name
        else:
            formatted_name = raw_name
            
        producers_payload.append({
            "id": p_id,
            "npn": str(row["Licensee NPN"]),
            "first_name": formatted_name[:100],
            "last_name": "",
            "current_agency_id": agency_npn_to_uuid.get(str(row["Associated licensee NPN"])),
            "original_license_date": "2015-01-01" 
        })
        
    chunked_post(f"{SUPABASE_URL}/rest/v1/producers", producers_payload)

    print("Computing Top 250 Competitors Matrix...")
    comps_payload = []
    icp_agencies = [a for a in agencies_payload if a["is_icp"]]
    
    for icp in icp_agencies:
        icp_id = icp["id"]
        icp_cars = carrier_lists[icp_id]
        
        scores = []
        for comp in agencies_payload:
            comp_id = comp["id"]
            if icp_id == comp_id: continue
            
            comp_cars = carrier_lists[comp_id]
            overlap = len(icp_cars.intersection(comp_cars))
            if overlap > 0:
                scores.append({
                    "base_agency_id": icp_id,
                    "competitor_agency_id": comp_id,
                    "competition_score": overlap * 10,
                    "overlap_carriers_count": overlap,
                    "distance_miles": 10.5
                })
                
        # Sort and take top 250
        scores.sort(key=lambda x: x["competition_score"], reverse=True)
        comps_payload.extend(scores[:250])
            
    print(f"Upserting {len(comps_payload)} Competitor Relationships...")
    chunked_post(f"{SUPABASE_URL}/rest/v1/competitor_relationships", comps_payload)

    print("MSA Ingestion Complete.")

if __name__ == "__main__":
    main()
