import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracked_producers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL,
            producer_id uuid NOT NULL REFERENCES producers(id) ON DELETE CASCADE,
            tracked_at timestamp with time zone DEFAULT now(),
            UNIQUE(user_id, producer_id)
        );
    """)
    print("Table tracked_producers created successfully.")

if __name__ == "__main__":
    main()
