import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE producer_movements DROP CONSTRAINT IF EXISTS producer_movements_from_agency_id_fkey;")
    cursor.execute("ALTER TABLE producer_movements DROP CONSTRAINT IF EXISTS producer_movements_to_agency_id_fkey;")
    print("Constraints dropped.")

if __name__ == "__main__":
    main()
