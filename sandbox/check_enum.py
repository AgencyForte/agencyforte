import psycopg2
conn = psycopg2.connect('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
cursor = conn.cursor()
cursor.execute("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'movement_type';")
print(cursor.fetchall())
