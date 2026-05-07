import sqlite3


def archive_hourly():
    with sqlite3.connect("sensors.db") as conn:
        conn.execute("""
        INSERT INTO hourly_data (
        timestamp,
        sensor_id,
        temp_avg,temp_min,temp_max,
        humidity_avg,humidity_min,humidity_max
        )
        SELECT
            strftime('%Y-%m-%d %H:00:00', timestamp) as hourly_ts,
            COALESCE(sensor_id, 1) as sensor_id,
            AVG(temp),MIN(temp),MAX(temp),
            AVG(humidity),MIN(humidity),MAX(humidity)          
            
        FROM sensorreading
        WHERE timestamp < strftime('%Y-%m-%d %H:00:00', 'now')
        GROUP BY hourly_ts, COALESCE(sensor_id, 1)
        ON CONFLICT(timestamp, sensor_id) DO NOTHING;
        """)

        conn.commit()


def archive_daily():
    with sqlite3.connect("sensors.db") as conn:
        conn.execute("""
        INSERT INTO daily_data (
        timestamp,
        sensor_id,
        temp_avg,temp_min,temp_max,
        humidity_avg,humidity_min,humidity_max
        )
        SELECT
            strftime('%Y-%m-%d 00:00:00', timestamp) as daily_ts,
            COALESCE(sensor_id, 1) as sensor_id,
            AVG(temp_avg),MIN(temp_min),MAX(temp_max),
            AVG(humidity_avg),MIN(humidity_min),MAX(humidity_max)
            
        FROM hourly_data
        WHERE timestamp < datetime('now', '-2 day')
        GROUP BY daily_ts, COALESCE(sensor_id, 1)
        ON CONFLICT(timestamp,sensor_id) DO NOTHING;
        """)
        conn.commit()
