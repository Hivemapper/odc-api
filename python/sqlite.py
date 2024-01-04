import sqlite3
import json
from datetime import datetime
db_name = '/data/recording/data-logger.v1.4.0.db'

class SQLite:
  def __init__(self):
    self.db_name = db_name
    self.conn = sqlite3.connect(self.db_name)

  def get_cursor(self):
    if (self.conn):
      return self.conn.cursor()
    else:
      self.conn = sqlite3.connect(self.db_name)
      return self.conn.cursor()

  def __exit__(self):
    self.conn.close()

sqlite = SQLite()

def get_cursor():
  return sqlite.get_cursor()

def get_frames_for_ml(limit=1):
  cursor = get_cursor()
  cursor.execute('SELECT * FROM framekms WHERE ml_model_hash is NULL ORDER BY time LIMIT ?', (limit,))
  return cursor.fetchall()

def set_frame_ml(image_name, ml_model_hash, ml_detections, inference_time):
  cursor = get_cursor()
  now = datetime.utcnow().timestamp()
  ml_detections_json = json.dumps(ml_detections)

  cursor.execute('UPDATE framekms SET ml_model_hash=?, ml_detections=?, inference_time=?, processed_at=? WHERE image_name=?', (ml_model_hash, ml_detections_json, inference_time, now, image_name))
  sqlite.conn.commit()