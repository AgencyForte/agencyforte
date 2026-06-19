import uuid
import psycopg2
import datetime

DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Get the user
    cursor.execute("SELECT id FROM users WHERE email = 'principal@agencyforte.com'")
    user_id = cursor.fetchone()[0]
    
    # Get 10 random producers
    cursor.execute("SELECT id, npn, first_name, last_name, current_agency_id FROM producers LIMIT 10")
    producers = cursor.fetchall()
    
    for p in producers:
        p_id = p[0]
        curr_agency = p[4]
        
        # Track the producer
        cursor.execute("""
            INSERT INTO tracked_producers (user_id, producer_id) 
            VALUES (%s, %s) 
            ON CONFLICT DO NOTHING
        """, (user_id, p_id))
        
        # Generate a mock defection movement
        # 1. We need a new random agency
        cursor.execute("SELECT id FROM agencies WHERE id != %s LIMIT 1", (curr_agency,))
        new_agency = cursor.fetchone()[0]
        
        mov_id = str(uuid.uuid4())
        mov_date = datetime.date.today() - datetime.timedelta(days=2)
        
        cursor.execute("""
            INSERT INTO producer_movements (id, producer_id, from_agency_id, to_agency_id, movement_date, movement_type, lines_affected)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (mov_id, p_id, curr_agency, new_agency, mov_date, 'EXITED', ['Commercial', 'Personal']))

        # Also update the producer's current agency to simulate the move
        cursor.execute("UPDATE producers SET current_agency_id = %s WHERE id = %s", (new_agency, p_id))
        
    print("Seeded 10 tracked producers with mock defection events.")

if __name__ == "__main__":
    main()
