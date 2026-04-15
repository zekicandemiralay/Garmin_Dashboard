import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager


def get_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "db"),
        port=os.getenv("POSTGRES_PORT", 5432),
        dbname=os.getenv("POSTGRES_DB", "garmin"),
        user=os.getenv("POSTGRES_USER", "garmin"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


@contextmanager
def cursor():
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
        conn.commit()
    finally:
        conn.close()
