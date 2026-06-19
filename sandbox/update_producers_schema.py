import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("""
        ALTER TABLE producers 
        ADD COLUMN IF NOT EXISTS lob VARCHAR(50),
        ADD COLUMN IF NOT EXISTS specialty VARCHAR(100),
        ADD COLUMN IF NOT EXISTS estimated_premium VARCHAR(50);
    """)
    print("Added lob, specialty, and estimated_premium to producers table.")

if __name__ == "__main__":
    main()
