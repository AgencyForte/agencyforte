import os
import polars as pl

DAY_1_DIR = "../day_1"
DAY_2_DIR = "../day_2"
SANDBOX_DAY_1 = "../sandbox/day_1"
SANDBOX_DAY_2 = "../sandbox/day_2"

AGENCY_FILE = "Active_insurance_company_appointments_for_agencies_and_businesses.csv"
RELATIONSHIPS_FILE = "Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv"
AGENT_FILE = "Active_insurance_company_appointments_for_agents_and_adjusters.csv"

def main():
    os.makedirs(SANDBOX_DAY_1, exist_ok=True)
    os.makedirs(SANDBOX_DAY_2, exist_ok=True)

    print("Loading Day 1 Business Relationships to find top 3 agencies...")
    rel_df = pl.read_csv(os.path.join(DAY_1_DIR, RELATIONSHIPS_FILE), infer_schema_length=0)
    
    # Filter out empty NPNs and find the top 3 agencies by producer count
    top_agencies = (
        rel_df.filter(pl.col("Associated licensee NPN").is_not_null() & (pl.col("Associated licensee NPN") != ""))
        .group_by("Associated licensee NPN")
        .agg(pl.count("Licensee NPN").alias("producer_count"))
        .sort("producer_count", descending=True)
        .head(3)
    )
    
    target_npns = top_agencies["Associated licensee NPN"].to_list()
    print(f"Target Agency NPNs: {target_npns}")

    for day_in, day_out in [(DAY_1_DIR, SANDBOX_DAY_1), (DAY_2_DIR, SANDBOX_DAY_2)]:
        print(f"\nProcessing {day_in}...")
        
        # 1. Agencies
        ag_path = os.path.join(day_in, AGENCY_FILE)
        if os.path.exists(ag_path):
            df = pl.read_csv(ag_path, infer_schema_length=0)
            df = df.filter(pl.col("Agency NPN").is_in(target_npns))
            df.write_csv(os.path.join(day_out, AGENCY_FILE))
            print(f" Saved {len(df)} rows for {AGENCY_FILE}")
            
        # 2. Relationships
        rel_path = os.path.join(day_in, RELATIONSHIPS_FILE)
        if os.path.exists(rel_path):
            df = pl.read_csv(rel_path, infer_schema_length=0)
            df = df.filter(pl.col("Associated licensee NPN").is_in(target_npns))
            df.write_csv(os.path.join(day_out, RELATIONSHIPS_FILE))
            print(f" Saved {len(df)} rows for {RELATIONSHIPS_FILE}")
            
            # 3. Agents (we only need agents who are in these relationships)
            target_producers = df["Licensee NPN"].unique().to_list()
            agent_path = os.path.join(day_in, AGENT_FILE)
            if os.path.exists(agent_path):
                print(" Filtering Agents (this is a large file, please wait)...")
                agent_df = pl.read_csv(agent_path, infer_schema_length=0)
                agent_df = agent_df.filter(pl.col("Agent NPN").is_in(target_producers))
                agent_df.write_csv(os.path.join(day_out, AGENT_FILE))
                print(f" Saved {len(agent_df)} rows for {AGENT_FILE}")

if __name__ == "__main__":
    main()
