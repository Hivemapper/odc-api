import sqlite3
import argparse
import os

BACKUP_DB = '/data/recording/backup.db'

def create_backup(source_db):
    if os.path.exists(BACKUP_DB):
        os.remove(BACKUP_DB)
        print(f"From backup.py file: Existing backup file {BACKUP_DB} deleted.")

    source_conn = sqlite3.connect(source_db)
    backup_conn = sqlite3.connect(BACKUP_DB)

    with backup_conn:
        source_conn.backup(backup_conn, pages=1, progress=None)

    source_conn.close()
    backup_conn.close()

    print(f"From backup.py file: Backup completed successfully. The backup is stored in {BACKUP_DB}")

def main():
    parser = argparse.ArgumentParser(description="Backup a SQLite database.")
    parser.add_argument("source_db", help="The path to the source database file.")

    args = parser.parse_args()
    
    create_backup(args.source_db)

if __name__ == "__main__":
    main()
