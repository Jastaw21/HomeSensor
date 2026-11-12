from datetime import datetime, timedelta
import os

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlmodel import Session, select

import archiving
from database import init_db, get_session
from models import SensorReading, Sensor, HourlyReading, DailyReading

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

API_KEY = os.environ.get("API_KEY")
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)


def verify_key(key: str = Depends(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


scheduler = BackgroundScheduler()
scheduler_started = False


@app.post("/admin/test-archive")
def test_archive():
    archiving.archive_hourly()
    archiving.archive_daily()
    return {"status": "ran"}


@app.on_event("startup")
def on_startup():
    global scheduler_started
    init_db()

    if not scheduler_started:
        archiving.archive_hourly()
        archiving.archive_daily()
        scheduler.add_job(archiving.archive_hourly, "interval", minutes=60)
        scheduler.add_job(archiving.archive_daily, "interval", hours=24)
        scheduler.start()
        scheduler_started = True


@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()


@app.get("/")
def dashboard(request: Request):
    key = request.query_params.get("key")
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return FileResponse("static/index.html")


@app.post("/data", dependencies=[Depends(verify_key)])
def receive_data(reading: SensorReading, session: Session = Depends(get_session)):
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return {"status": "ok", "id": reading.id}


@app.get("/data/hourly")
def get_hourly_readings(session: Session = Depends(get_session)):
    row_number = int(14 * 24)
    readings = session.exec(
        select(HourlyReading)
        .order_by(HourlyReading.timestamp.desc())
        .limit(int(row_number))
    ).all()
    results = []
    for r in readings:
        sensor = session.get(Sensor, r.sensor_id) if r.sensor_id else None
        results.append({
            "timestamp": r.timestamp,
            "temp_avg": r.temp_avg,
            "temp_min": r.temp_min,
            "temp_max": r.temp_max,
            "humidity_avg": r.humidity_avg,
            "humidity_min": r.humidity_min,
            "humidity_max": r.humidity_max,
            "sensor": sensor if sensor else None
        })

    return results


@app.get("/data/daily")
def get_daily_readings(session: Session = Depends(get_session)):
    row_number = int(364)
    readings = session.exec(
        select(DailyReading)
        .order_by(DailyReading.timestamp.desc())  # type: ignore
        .limit(int(row_number))
    ).all()
    results = []
    for r in readings:
        sensor = session.get(Sensor, r.sensor_id) if r.sensor_id else None
        results.append({
            "timestamp": r.timestamp,
            "temp_avg": r.temp_avg,
            "temp_min": r.temp_min,
            "temp_max": r.temp_max,
            "humidity_avg": r.humidity_avg,
            "humidity_min": r.humidity_min,
            "humidity_max": r.humidity_max,
            "sensor": sensor if sensor else None
        })

    return results


@app.get("/debug/jobs")
def get_jobs():
    jobs = scheduler.get_jobs()
    return [{"id": j.id, "next_run": str(j.next_run_time)} for j in jobs]


@app.get("/data/granular")
def get_granular_readings(session: Session = Depends(get_session)):
    # get the last 14 days of data
    row_number = int(14 * 24 * (60 / 5))  # assuming 5 minute readings
    readings = session.exec(
        select(SensorReading)
        .order_by(SensorReading.timestamp.desc())  # type: ignore
        .limit(int(row_number))
    ).all()
    result = []
    for r in readings:
        sensor = session.get(Sensor, r.sensor_id) if r.sensor_id else None
        result.append({
            "id": r.id,
            "temp": r.temp,
            "humidity": r.humidity,
            "timestamp": r.timestamp,
            "sensor_id": r.sensor_id,
            "sensor": sensor.name if sensor else None
        })
    return result


# lookup dict for hours ago, to granularity of data to retrieve
HISTORY_DATA_STEPS = [
    {24: "full"},
    {24 * 7: "hourly"}
]


@app.get("/data/consol")
def get_scaled_data(hours: int, session: Session = Depends(get_session)):
    granular_hours_to_retrieve = min(24, hours)
    remaining_hourly_hours_to_retrieve = hours - granular_hours_to_retrieve

    full_granular_readings = session.exec(
        text(
            f"SELECT * "
            f"FROM sensorreading "
            f"WHERE timestamp >= datetime('now', '-{granular_hours_to_retrieve} hour') "
            f"ORDER BY timestamp DESC "
        )  # type: ignore
    )  # type: ignore

    hourly_readings = session.exec(
        text(
            f"SELECT temp_avg as temp, "
            f"humidity_avg as humidity, "
            f"timestamp, "
            f"sensor_id "
            f"FROM hourly_data "
            f"WHERE timestamp < datetime('now', '-{granular_hours_to_retrieve} hour') "
            f"AND timestamp >= datetime('now', '-{granular_hours_to_retrieve + remaining_hourly_hours_to_retrieve} hour') "
            f"ORDER BY timestamp desc"

        )  # type: ignore
    )

    results = []
    for reading in hourly_readings:
        sensor = session.get(Sensor, reading.sensor_id) if reading.sensor_id else None
        results.append({
            "temp": reading.temp,
            "humidity": reading.humidity,
            "timestamp": reading.timestamp,
            "sensor_id": reading.sensor_id,
            "sensor": sensor if sensor else None
        })

    for reading in full_granular_readings:
        sensor = session.get(Sensor, reading.sensor_id) if reading.sensor_id else None
        results.append({
            "temp": reading.temp,
            "humidity": reading.humidity,
            "timestamp": reading.timestamp,
            "sensor_id": reading.sensor_id,
            "sensor": sensor if sensor else None
        }
        )

    results.sort(key=lambda x: x["timestamp"], reverse=True)

    return results


@app.get("/data/record")
def get_record(temp: bool, high: bool, session: Session = Depends(get_session)):
    record_value: float = 0
    record_date: str = ""
    func = "MAX" if high else "MIN"
    if temp:
        result = session.exec(
            text(
                f"SELECT temp, humidity, timestamp FROM sensorreading "
                f"WHERE temp = (SELECT {func}(temp) FROM sensorreading) "
                f"ORDER BY timestamp DESC LIMIT 1")  # type: ignore
        ).first()  # type: ignore
        if not result:
            return {}
        return {temp: result[0], "humidity": result[1], "date": result[2]}
    else:
        result = session.exec(text(
            f"SELECT temp, humidity, timestamp FROM sensorreading "
            f"WHERE humidity = (SELECT {func}(humidity) FROM sensorreading) "
            f"ORDER BY timestamp DESC LIMIT 1")  # type: ignore

        ).first()  # type: ignore
        if not result:
            return {}
        return {"temp": result[0], "humidity": result[1], "timestamp": result[2]}


@app.post("/sensors", dependencies=[Depends(verify_key)])
def create_sensor(sensor: Sensor, session: Session = Depends(get_session)):
    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


@app.get("/records")
def get_records(session: Session = Depends(get_session)):
    high_temp_record = session.exec(text(
        f"SELECT temp, timestamp FROM sensorreading ORDER BY temp DESC LIMIT 1")  # type: ignore
    ).first()  # type: ignore
    low_temp_record = session.exec(text(
        f"SELECT temp, timestamp FROM sensorreading ORDER BY temp ASC LIMIT 1")  # type: ignore
    ).first()  # type: ignore
    high_humidity_record = session.exec(text(
        f"SELECT humidity, timestamp FROM sensorreading ORDER BY humidity DESC LIMIT 1")  # type: ignore
    ).first()  # type: ignore
    low_humidity_record = session.exec(text(
        f"SELECT humidity, timestamp FROM sensorreading ORDER BY humidity ASC LIMIT 1")  # type: ignore
    ).first()  # type: ignore

    return [
        {
            "value": high_temp_record[0],
            "timestamp": high_temp_record[1],
            "type": "high_temp"
        },
        {
            "value": low_temp_record[0],
            "timestamp": low_temp_record[1],
            "type": "low_temp"
        },
        {
            "value": high_humidity_record[0],
            "timestamp": high_humidity_record[1],
            "type": "high_humidity"
        },
        {
            "value": low_humidity_record[0],
            "timestamp": low_humidity_record[1],
            "type": "low_humidity"
        }
    ]


@app.get("/sensors", dependencies=[Depends(verify_key)])
def get_sensors(session: Session = Depends(get_session)):
    return session.exec(select(Sensor)).all()
