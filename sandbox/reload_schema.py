import psycopg2

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("NOTIFY pgrst, 'reload schema'")
    print("Reloaded PostgREST schema.")

if __name__ == "__main__":
    main()
