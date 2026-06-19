import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    print("Deleting orphaned producers...")
    cursor.execute("""
        DELETE FROM producers 
        WHERE current_agency_id IS NOT NULL 
        AND current_agency_id NOT IN (SELECT id FROM agencies)
    """)
    print("Deleted orphaned producers.")
    
    print("Re-adding foreign key constraint...")
    cursor.execute("""
        ALTER TABLE producers 
        ADD CONSTRAINT producers_current_agency_id_fkey 
        FOREIGN KEY (current_agency_id) REFERENCES agencies(id)
    """)
    print("Foreign key constraint restored.")

    print("Re-adding foreign key constraint for producer_movements...")
    # Delete orphan movements
    cursor.execute("""
        DELETE FROM producer_movements 
        WHERE from_agency_id IS NOT NULL 
        AND from_agency_id NOT IN (SELECT id FROM agencies)
    """)
    cursor.execute("""
        DELETE FROM producer_movements 
        WHERE to_agency_id IS NOT NULL 
        AND to_agency_id NOT IN (SELECT id FROM agencies)
    """)
    cursor.execute("""
        ALTER TABLE producer_movements 
        ADD CONSTRAINT producer_movements_from_agency_id_fkey 
        FOREIGN KEY (from_agency_id) REFERENCES agencies(id)
    """)
    cursor.execute("""
        ALTER TABLE producer_movements 
        ADD CONSTRAINT producer_movements_to_agency_id_fkey 
        FOREIGN KEY (to_agency_id) REFERENCES agencies(id)
    """)
    print("Foreign key constraints restored for producer_movements.")
    
    # Refresh postgREST schema cache
    cursor.execute("NOTIFY pgrst, 'reload schema'")

if __name__ == "__main__":
    main()
