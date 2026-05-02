import os

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from database import init_db, get_session
from models import SensorReading, Sensor

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

API_KEY = os.environ.get("API_KEY")
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)


def verify_key(key: str = Depends(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.on_event("startup")
def on_startup():
    init_db()


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


@app.get("/data", dependencies=[Depends(verify_key)])
def get_readings(session: Session = Depends(get_session)):
    readings = session.exec(select(SensorReading)).all()
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


@app.get("/data/record")
def get_record(temp: bool, high: bool, session: Session = Depends(get_session)):
    record_value: float = 0
    record_date: str = ""
    if temp:
        if high:
            highest_temp = session.exec(
                "SELECT MAX(temp) FROM sensor_reading"
            )
            # we might get multiple versions of the highest temp, so we need to get the most recent one
            highest_temp_date = session.exec(
                "SELECT timestamp FROM sensor_reading WHERE temp = (SELECT MAX(temp) FROM sensor_reading) order by "
                "timestamp desc limit 1")

            record_value = highest_temp[0][0]
            record_date = highest_temp_date[0][0]
        else:
            lowest_temp = session.exec(
                "SELECT MIN(temp) FROM sensor_reading"
            )
            # we might get multiple versions of the highest temp, so we need to get the most recent one
            lowest_temp_date = session.exec(
                "SELECT timestamp FROM sensor_reading WHERE temp = (SELECT MIN(temp) FROM sensor_reading) order by "
                "timestamp desc limit 1")
            record_value = lowest_temp[0][0]
            record_date = lowest_temp_date[0][0]
    else:
        if high:
            highest_humidity = session.exec(
                "SELECT MAX(humidity) FROM sensor_reading"
            )

            highest_humidity_date = session.exec(
                "SELECT timestamp FROM sensor_reading WHERE humidity = (SELECT MAX(humidity) FROM sensor_reading) "
                "order by timestamp desc limit 1")

            record_value = highest_humidity[0][0]
            record_date = highest_humidity_date[0][0]

        else:
            lowest_humidity = session.exec(
                "SELECT MIN(humidity) FROM sensor_reading"
            )
            lowest_humidity_date = session.exec(
                "SELECT timestamp FROM sensor_reading WHERE humidity = (SELECT MIN(humidity) FROM sensor_reading) "
                "order by timestamp desc limit 1")

            record_value = lowest_humidity[0][0]
            record_date = lowest_humidity_date[0][0]
    return {"value": record_value, "date": record_date}


@app.post("/sensors", dependencies=[Depends(verify_key)])
def create_sensor(sensor: Sensor, session: Session = Depends(get_session)):
    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


@app.get("/sensors", dependencies=[Depends(verify_key)])
def get_sensors(session: Session = Depends(get_session)):
    return session.exec(select(Sensor)).all()
