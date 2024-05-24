import sqlite3
import shutil
import os

from datetime import datetime, timezone, timedelta
from typing import List

# HDC Paths

# problem: hard to delete the transformed files
DATA_LOGGER_NAME = 'data-logger.v1.4.5.db'
DATA_LOGGER_NAMES = [DATA_LOGGER_NAME, 'data-logger.v1.4.5.db-shm', 'data-logger.v1.4.5.db-wal']

def source_data_logger_path(testname: str, datalogger: str) -> str:
    return os.path.join('./tests', testname, 'reference/db/', datalogger)

def dest_data_logger_path(testname: str, datalogger: str) -> str:
    return os.path.join(transformed_file_directory(testname), 'db', datalogger)

def fake_image_path(testname: str) -> str:
    return os.path.join('./tests', testname, 'reference/image/72.jpg')

def recording_path(testname: str, imgname: str) -> str:
    return os.path.join(transformed_file_directory(testname), 'image', imgname)

def gps_latest_path(testname: str) -> str:
    return os.path.join(transformed_file_directory(testname), 'gps/latest.log')

def transformed_file_directory(testname: str) -> str:
    return os.path.join('./tests', testname, 'reference/transformed')

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

    # Transform the dates
    new_dates = transform_dates(new_base_date, old_date, date_objects)

    # Update the original database entries with the new dates
    for date_id, new_date in zip(ids, new_dates):
        cursor.execute(f"UPDATE {table} SET {time_field} = ? WHERE id = ?",
                       (new_date.strftime('%Y-%m-%d %H:%M:%S.%f'), date_id))

def fix_gnss_dates(new_base_date: datetime, cursor: sqlite3.Cursor) -> None:
    default_time = datetime(2020, 1, 1, 0, 0, 0, 0).strftime('%Y-%m-%d %H:%M:%S.%f')
    gnss_time = cursor.execute(
            f"SELECT time FROM gnss WHERE time > '{default_time}' ORDER BY id ASC LIMIT 1").fetchone()[0]
    gnss_time = transform_to_datetime(gnss_time)
    print('old gnss time:', gnss_time)

    # get all gnss times 
    rows = cursor.execute("SELECT id, time FROM gnss ORDER BY id ASC").fetchall()
    ids = [row[0] for row in rows]
    dates = [transform_to_datetime(row[1]) for row in rows]

    new_dates = transform_dates(new_base_date, gnss_time, dates)

    for date_id, new_date in zip(ids, new_dates):
        cursor.execute("UPDATE gnss SET time = ? WHERE id = ?",
                       (new_date.strftime('%Y-%m-%d %H:%M:%S.%f'), date_id))



# Generate images from the new dates
def generate_images_from_date(base_date: datetime, testname: str) -> None:
    # create 10 frames per second starting from the base date
    for i in range(0, 10000):
        new_date = base_date + timedelta(seconds=i/10)

        new_date_micros = int(new_date.timestamp() * 1_000_000)
        new_date_name = f'{str(new_date_micros)[:10]}_{
            str(new_date_micros)[10:]}.jpg'
        
        recording_path_str = recording_path(testname, new_date_name)
        os.makedirs(os.path.dirname(recording_path_str), exist_ok=True)
        shutil.copy(fake_image_path(testname),
                    recording_path_str)

def transform_to_datetime(date: str) -> datetime:
    try:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S.%f')
    except ValueError:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S')
    dateobj = dateobj.replace(tzinfo=timezone.utc)
    return dateobj

# Copy the db to DEST_DATA_LOGGER_PATH before making changes
def move_db_to_destination_directory(testname: str) -> None:
    for datalogger in DATA_LOGGER_NAMES:
        source_path = source_data_logger_path(testname, datalogger)
        destination_path = dest_data_logger_path(testname, datalogger)
        
        if os.path.exists(source_path):
            print('Copying', datalogger, 'to', destination_path)
            os.makedirs(os.path.dirname(destination_path), exist_ok=True)
            shutil.copy2(source_path, destination_path)
        else:
            print('Skipping copy of', datalogger, 'as it does not exist')
    

# delete the first 3415 entries in the gnss table
# TODO: remove this when we have a test DB that doesn't need this
def delete_first_gnss_entries(cursor: sqlite3.Cursor) -> None:
    cursor.execute("DELETE FROM gnss ORDER BY id ASC LIMIT 3415")


# Remove the old database entries
def cleanup_db(cursor: sqlite3.Cursor) -> None:
    cursor.execute("DELETE FROM frames")
    cursor.execute("DELETE FROM framekms")

    # insert or update key 'isEndToEndTestingEnabled' to 'true' in the config table
    cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('isEndToEndTestingEnabled', 'true')")

    # replace all session ids with '111111'
    # TODO: use a test DB that doesn't need this
    cursor.execute("UPDATE gnss set session = '111111'")
    cursor.execute("UPDATE imu set session = '111111'")

    delete_first_gnss_entries(cursor)

# create latest.log file
def generate_latest_log(base_date: datetime, testname: str) -> None:
    gps_latest_path_str = gps_latest_path(testname)
    os.makedirs(os.path.dirname(gps_latest_path_str), exist_ok=True)

    with open(gps_latest_path_str, 'w') as f:
        import json
        result = {
            'ttff': 4000,
            'timestamp': base_date.strftime('%Y-%m-%d %H:%M:%S.%fZ'),
            'time_resolved': 1,
            'latitude': 37.7749,
            'longitude': -122.4194,
            'fix': '3D',
            'dop': {
                'hdop': 1.0,
            },
            'eph': 5.0,
        }
        json.dump(result, f, indent=4)

def transform_db(testname: str) -> None:
    print('Transforming the db for test:', testname)

    # remove the old transformed files
    shutil.rmtree(transformed_file_directory(testname), ignore_errors=True)

    move_db_to_destination_directory(testname)

    database_path = dest_data_logger_path(testname, DATA_LOGGER_NAME)
    print(database_path)
    conn = sqlite3.connect(database_path)
    cursor = conn.cursor()

    cleanup_db(cursor)

    new_base_date = datetime.now(tz=timezone.utc)

    print('Setting base date to:', new_base_date)
    # Get the original date from the first entry in the gnss table
    old_base_date_str = cursor.execute(
        "SELECT time FROM gnss ORDER BY id ASC LIMIT 1").fetchone()[0]
    old_base_date = transform_to_datetime(old_base_date_str)

    old_system_date_str = cursor.execute(
        "SELECT system_time FROM gnss ORDER BY id ASC LIMIT 1").fetchone()[0]
    old_system_date = transform_to_datetime(old_system_date_str)
    print(old_system_date_str, old_system_date)

    # os.system(f'gdate +%s')
    # os.system(f'sudo gdate -s @{int(old_base_date.timestamp() * 1_000_000)}')
    # fix_system_dates(new_base_date, old_system_date, cursor, 'gnss')
    # fix_gnss_dates(new_base_date, cursor)
    print('Updated gnss base dates')
    # fix_system_dates(new_base_date, old_system_date, cursor, 'imu')
    print('Updated imu base dates')
    # generate_images_from_date(new_base_date,  testname)
    # generate_latest_log(new_base_date, testname)
    generate_images_from_date(old_system_date, testname)
    generate_latest_log(old_base_date, testname)
    print('Generated images')

    # Commit changes and close the connection
    conn.commit()
    conn.close()

def main() -> None:
    with open('tests.txt') as f:
        for testname in f:
            transform_db(testname.strip())
    


if __name__ == '__main__':
    main()
