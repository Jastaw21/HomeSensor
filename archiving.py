import sqlite3


def archive_hourly():
    with sqlite3.connect("sensors.db") as conn:
        conn.execute("""
        INSERT INTO hourly_data (
        timestamp,
        temp_avg,temp_min,temp_max,
        humidity_avg,humidity_min,humidity_max
        )
        SELECT
            strftime('%Y-%m-%d %H:00:00', timestamp) as hourly_ts,
            AVG(temp),MIN(temp),MAX(temp),
            AVG(humidity),MIN(humidity),MAX(humidity)
            
        FROM sensorreading
        WHERE timestamp < datetime('now', '-1 day')
        GROUP BY hourly_ts
        ON CONFLICT(timestamp) DO NOTHING;
        """)
        conn.commit()


def archive_daily():
    with sqlite3.connect("sensors.db") as conn:
        conn.execute("""
        INSERT INTO daily_data (
        timestamp,
        temp_avg,temp_min,temp_max,
        humidity_avg,humidity_min,humidity_max
        )
        SELECT
            strftime('%Y-%m-%d 00:00:00', timestamp) as daily_ts,
            AVG(temp_avg),MIN(temp_min),MAX(temp_max),
            AVG(humidity_avg),MIN(humidity_min),MAX(humidity_max)
        FROM hourly_data
        WHERE timestamp < datetime('now', '-2 day')
        GROUP BY daily_ts
        ON CONFLICT(timestamp) DO NOTHING;
        """)
        conn.commit()
