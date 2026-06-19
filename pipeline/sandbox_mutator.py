import os
import csv

DAY_2_DIR = "../sandbox/day_2"

AGENCY_FILE = "Active_insurance_company_appointments_for_agencies_and_businesses.csv"
RELATIONSHIPS_FILE = "Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv"

def mutate_csv(file_path, mutation_type):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    if not rows:
        print(f"No rows to mutate in {file_path}")
        return

    if mutation_type == "relationships":
        # Force Defection: Remove the first row
        removed_row = rows.pop(0)
        print(f"Forced Defection: Removed producer NPN {removed_row[6]} from agency {removed_row[0]}")

        # Force Hire: Duplicate the new first row, change producer NPN to 9999999
        new_row = list(rows[0])
        new_row[6] = "9999999" # Licensee NPN
        new_row[5] = "JANE DOE FAKE HIRE" # Licensee name
        rows.append(new_row)
        print(f"Forced Hire: Added producer 9999999 to agency {new_row[0]}")

    elif mutation_type == "agencies":
        # Force Carrier Loss: Remove the first row
        removed_row = rows.pop(0)
        print(f"Forced Carrier Loss: Removed NAIC {removed_row[0]} ({removed_row[1]}) from agency {removed_row[6]}")

        # Force New Appt: Duplicate the new first row, change NAIC and name
        new_row = list(rows[0])
        new_row[0] = "88888" # NAIC ID
        new_row[1] = "MOCK CARRIER INC" # Insurance company name
        rows.append(new_row)
        print(f"Forced New Appointment: Added NAIC 88888 to agency {new_row[6]}")

    with open(file_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)
    print(f"Saved mutated {file_path}")

def main():
    print("Mutating Sandbox Day 2 Data...")
    
    rel_path = os.path.join(DAY_2_DIR, RELATIONSHIPS_FILE)
    mutate_csv(rel_path, "relationships")
    
    ag_path = os.path.join(DAY_2_DIR, AGENCY_FILE)
    mutate_csv(ag_path, "agencies")

    print("Mutation complete!")

if __name__ == "__main__":
    main()
