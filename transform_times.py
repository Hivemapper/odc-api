import sqlite3
import shutil
import os

from datetime import datetime, timezone, timedelta
from typing import List

# HDC Paths
SOURCE_DATA_LOGGER_PATHS = [
    './compiled/data-logger.v1.4.5.db', 
    './compiled/data-logger.v1.4.5.db-shm', 
    './compiled/data-logger.v1.4.5.db-wal'
]
DATA_PATH = './compiled/mnt/data'
METADATA_PATH = './compiled/mnt/data/metadata'
UNPROCESSED_FRAMEKM_PATH = './compiled/mnt/data/unprocessed_framekm'
FRAMEKM_PATH = './compiled/mnt/data/framekm'
DATA_LOGGER_PATH = './compiled/mnt/data/data-logger.v1.4.5.db'
RECORDING_PATH = './compiled/tmp/recording/pic'
FAKE_IMAGE_PATH = './compiled/72.jpg'

def transform_dates(new_base_date: datetime, old_base_date: datetime, date_objects: List[datetime]) -> List[datetime]:
    if not date_objects:
        return []

    new_dates: List[datetime] = []
    for i in range(len(date_objects)):
        time_diff = date_objects[i] - old_base_date
        new_date = new_base_date + time_diff
        new_dates.append(new_date)

    return new_dates


def fix_system_dates(new_base_date: datetime, old_date: datetime, cursor: sqlite3.Cursor, table: str) -> None:
    time_field = 'system_time' if table == 'gnss' else 'time'
    cursor.execute(f"SELECT id, {time_field} FROM {table} ORDER BY id ASC")
    rows = cursor.fetchall()

    # Convert fetched rows to a list of (id, datetime) tuples
    original_dates = [(row[0], transform_to_datetime(row[1])) for row in rows]
    # Separate the ids and the datetime objects
    ids: List[str] = [date[0] for date in original_dates]
    date_objects: List[datetime] = [date[1] for date in original_dates]
    print(new_base_date)
    print(old_date)
    print(date_objects[:10])

    # Transform the dates
    new_dates = transform_dates(new_base_date, old_date, date_objects)

    # Update the original database entries with the new dates
    for date_id, new_date in zip(ids, new_dates):
        cursor.execute(f"UPDATE {table} SET {time_field} = ? WHERE id = ?",
                       (new_date.strftime('%Y-%m-%d %H:%M:%S.%f'), date_id))

def fix_gnss_dates(new_base_date: datetime, cursor: sqlite3.Cursor) -> None:
    # find the first gnss entry with time_resolved = 1
    # gnss_time = cursor.execute(
    #         "SELECT id, time FROM gnss WHERE time_resolved = 1 ORDER BY id ASC LIMIT 1").fetchone()[1]
    # find the gnss entry with the smallest id
    default_time = datetime(2020, 1, 1, 0, 0, 0, 0).strftime('%Y-%m-%d %H:%M:%S.%f')
    gnss_time = cursor.execute(
            f"SELECT time FROM gnss WHERE time > {default_time} ORDER BY id ASC LIMIT 1").fetchone()[0]
    gnss_time = transform_to_datetime(gnss_time)
    print('old gnss time:', gnss_time)

    # get all gnss times 
    rows = cursor.execute("SELECT id, time FROM gnss ORDER BY id ASC").fetchall()
    ids = [row[0] for row in rows]
    dates = [transform_to_datetime(row[1]) for row in rows]
    print(dates[:10])

    new_dates = transform_dates(new_base_date, gnss_time, dates)

    for date_id, new_date in zip(ids, new_dates):
        cursor.execute("UPDATE gnss SET time = ? WHERE id = ?",
                       (new_date.strftime('%Y-%m-%d %H:%M:%S.%f'), date_id))



# Generate images from the new dates
def generate_images_from_date(base_date: datetime) -> None:
    # create 10 frames per second starting from the base date
    for i in range(0, 10000):
        new_date = base_date + timedelta(seconds=i/10)

        new_date_micros = int(new_date.timestamp() * 1_000_000)
        new_date_name = f'{str(new_date_micros)[:10]}_{
            str(new_date_micros)[10:]}.jpg'
        shutil.copy(FAKE_IMAGE_PATH,
                    os.path.join(RECORDING_PATH, new_date_name))

def transform_to_datetime(date: str) -> datetime:
    try:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S.%f')
    except ValueError:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S')
    return dateobj

# Create the necessary directories
def setup_dirs() -> None:
    shutil.rmtree(RECORDING_PATH, ignore_errors=True)
    shutil.rmtree(DATA_PATH, ignore_errors=True)

    os.makedirs(RECORDING_PATH, exist_ok=True)
    os.makedirs(METADATA_PATH, exist_ok=True)
    os.makedirs(UNPROCESSED_FRAMEKM_PATH, exist_ok=True)
    os.makedirs(FRAMEKM_PATH, exist_ok=True)

    for datalogger in SOURCE_DATA_LOGGER_PATHS:
        if os.path.exists(datalogger):
            print('Copying', datalogger, 'to', DATA_PATH)
            shutil.copy2(datalogger, DATA_PATH)
        else:
            print('Skipping copy of', datalogger, 'as it does not exist')
    
    os.system('ls -l ./compiled/mnt/data')


# Remove the old database entries
def cleanup_db(cursor: sqlite3.Cursor) -> None:
    cursor.execute("DELETE FROM frames")
    cursor.execute("DELETE FROM framekms")

    # insert or update key 'isEndToEndTestingEnabled' to 'true' in the config table
    cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('isEndToEndTestingEnabled', 'true')")


def main() -> None:
    setup_dirs()

    conn = sqlite3.connect(DATA_LOGGER_PATH)
    cursor = conn.cursor()

    cleanup_db(cursor)

    new_base_date = datetime.now(tz=timezone.utc)

    print('Setting base date to:', new_base_date)
    # Get the original date from the first entry in the gnss table
    old_base_date_str = cursor.execute(
        "SELECT system_time FROM gnss ORDER BY id ASC LIMIT 1").fetchone()[0]
    old_base_date = transform_to_datetime(old_base_date_str)
    fix_system_dates(new_base_date, old_base_date, cursor, 'gnss')
    fix_gnss_dates(new_base_date, cursor)
    print('Updated gnss base dates')
    fix_system_dates(new_base_date, old_base_date, cursor, 'imu')
    print('Updated imu base dates')
    generate_images_from_date(new_base_date)
    print('Generated images')

    # Commit changes and close the connection
    conn.commit()
    conn.close()


if __name__ == '__main__':
    main()
