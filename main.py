from fastapi import FastAPI, Depends
from sqlmodel import Session, select

from database import init_db, get_session
from models import SensorReading, Sensor

app = FastAPI()


@app.on_event("startup")
def on_startup():
    init_db()


@app.post("/data")
def receive_data(reading: SensorReading, session: Session = Depends(get_session)):
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return {"status": "ok", "id": reading.id}


@app.get("/data")
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


@app.post("/sensors")
def create_sensor(sensor: Sensor, session: Session = Depends(get_session)):
    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


@app.get("/sensors")
def get_sensors(session: Session = Depends(get_session)):
    return session.exec(select(Sensor)).all()
