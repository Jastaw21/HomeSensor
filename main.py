import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import APIKeyHeader
from sqlmodel import Session, select

from database import init_db, get_session
from models import SensorReading, Sensor

app = FastAPI()
API_KEY = os.environ.get("API_KEY")
api_key_header = APIKeyHeader(name="X-API-KEY")


def verify_key(key: str = Depends(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.on_event("startup")
def on_startup():
    init_db()


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
        result.append({"id": r.id,
                       "temp": r.temp,
                       "humidity": r.humidity,
                       "timestamp": r.timestamp,
                       "sensor": sensor.name if sensor else None})
    return result


@app.post("/sensors", dependencies=[Depends(verify_key)])
def create_sensor(sensor: Sensor, session: Session = Depends(get_session)):
    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


@app.get("/sensors", dependencies=[Depends(verify_key)])
def get_sensors(session: Session = Depends(get_session)):
    return session.exec(select(Sensor)).all()
