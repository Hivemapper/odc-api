import sqlite3
import os
import sys

if len(sys.argv) != 2:
    print("Usage: python backup_script.py <source_db>")
    sys.exit(1)
source_db = sys.argv[1]
backup_db = '/data/recording/backup.db'

if os.path.exists(backup_db):
    os.remove(backup_db)
    print(f"From backup.py file: Existing backup file {backup_db} deleted.")

source_conn = sqlite3.connect(source_db)

backup_conn = sqlite3.connect(backup_db)

with backup_conn:
    source_conn.backup(backup_conn, pages=1, progress=None)

source_conn.close()
backup_conn.close()

print(f"From backup.py file: Backup completed successfully. The backup is stored in {backup_db}")
