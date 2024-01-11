import sqlite3
import json
from datetime import datetime

db_name = '/data/recording/data-logger.v1.4.1.db'

class SQLite:
    def __init__(self):
        self.db_name = db_name
        self.ensure_wal_mode()

    def get_connection(self):
        return sqlite3.connect(self.db_name)

    def ensure_wal_mode(self):
        with self.get_connection() as conn:
            current_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            if current_mode.lower() != 'wal':
                conn.execute("PRAGMA journal_mode=WAL;")
                print("Database set to WAL mode.")
            else:
                print("Database already in WAL mode.")

    def get_frames_for_ml(self, limit=10):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM config WHERE key = "isDashcamMLEnabled"')
            is_enabled = cursor.fetchone()
            if not is_enabled or is_enabled[0] == 'false':
                return []
            cursor.execute('SELECT image_name, image_path, speed FROM framekms WHERE ml_model_hash is NULL ORDER BY time LIMIT ?', (limit,))
            return cursor.fetchall()

    def set_frame_ml(self, image_name, ml_model_hash, ml_detections, metrics = {}):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            now = int(datetime.utcnow().timestamp() * 1000)
            ml_detections_json = json.dumps(ml_detections)

            read_time = metrics.get('read_time', 0)
            inference_time = metrics.get('inference_time', 0)
            blur_time = metrics.get('blur_time', 0)
            write_time = metrics.get('write_time', 0)

            cursor.execute('UPDATE framekms SET ml_model_hash=?, ml_detections=?, ml_processed_at=?, ml_inference_time=?, ml_read_time=?, ml_blur_time=?, ml_write_time=? WHERE image_name=?', (ml_model_hash, ml_detections_json, now, inference_time, read_time, blur_time, write_time, image_name))
            conn.commit()

    def log_error(self, error):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now()
            cursor.execute('INSERT INTO error_logs (message, service_name, system_time) VALUES (?, ?)', (str(error), "object-detection", now.strftime("%Y-%m-%d %H:%M:%S.00000")))
            conn.commit()

