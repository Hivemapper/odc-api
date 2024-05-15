import sqlite3
import shutil
import os

from datetime import datetime, timezone, timedelta
from typing import List

def transform_dates(base_date: datetime, old_base_date: datetime, date_objects: List[datetime]) -> List[datetime]:
    if not date_objects:
        return []

    new_dates: List[datetime] = []
    for i in range(len(date_objects)):
        time_diff = date_objects[i] - old_base_date
        new_date = base_date + time_diff
        new_dates.append(new_date)

    return new_dates


def fix_dates(base_date: datetime, old_date: datetime, cursor: sqlite3.Cursor, table: str) -> None:
    time_field = 'system_time' if table == 'gnss' else 'time'
    cursor.execute(f"SELECT id, {time_field} FROM {table} ORDER BY id ASC")
    rows = cursor.fetchall()

    # Convert fetched rows to a list of (id, datetime) tuples
    original_dates = [(row[0], transform_to_datetime(row[1])) for row in rows]

    # Extract just the datetime objects for transformation
    ids: List[str] = [date[0] for date in original_dates]
    date_objects: List[datetime] = [date[1] for date in original_dates]

    # Transform the dates
    new_dates = transform_dates(base_date, old_date, date_objects)

    # Update the original database entries with the new dates
    for date_id, new_date in zip(ids, new_dates):
        cursor.execute(f"UPDATE {table} SET {time_field} = ? WHERE id = ?",
                       (new_date.strftime('%Y-%m-%d %H:%M:%S.%f'), date_id))

# Generate images from the new dates
def generate_images_from_date(base_date: datetime) -> None:
    # Remove the old images
    shutil.rmtree('./compiled/tmp/recording/pic')
    os.makedirs('./compiled/tmp/recording/pic')

    # create 10 frames per second starting from the base date
    for i in range(0, 10000):
        new_date = base_date + timedelta(seconds=i/10)

        new_date_micros = int(new_date.timestamp() * 1_000_000)
        new_date_name = f'{str(new_date_micros)[:10]}_{
            str(new_date_micros)[10:]}.jpg'
        shutil.copy('./compiled/72.jpg',
                    f'./compiled/tmp/recording/pic/{new_date_name}')

def transform_to_datetime(date: str) -> datetime:
    try:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S.%f')
    except ValueError:
        dateobj = datetime.strptime(date, '%Y-%m-%d %H:%M:%S')
    return dateobj

def main() -> None:
    conn = sqlite3.connect('./compiled/mnt/data/data-logger.v1.4.5.db')
    cursor = conn.cursor()

    new_base_date = datetime.now(tz=timezone.utc)

    print('Setting base date to:', new_base_date)
    # Get the original date from the first entry in the gnss table
    old_base_date_str = cursor.execute(
        "SELECT system_time FROM gnss ORDER BY id ASC LIMIT 1").fetchone()[0]
    old_base_date = transform_to_datetime(old_base_date_str)
    fix_dates(new_base_date, old_base_date, cursor, 'gnss')
    fix_dates(new_base_date, old_base_date, cursor, 'imu')
    generate_images_from_date(new_base_date)

    # Commit changes and close the connection
    conn.commit()
    conn.close()


if __name__ == '__main__':
    main()
