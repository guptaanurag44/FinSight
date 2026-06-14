import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    conn = psycopg2.connect(
        os.getenv("DATABASE_URL"),
        sslmode="require" ,       
        cursor_factory=RealDictCursor
    )
    return conn
