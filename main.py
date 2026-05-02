import os

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
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
    func = "MAX" if high else "MIN"
    if temp:
        result = session.exec(
            text(
                f"SELECT temp, humidity, timestamp FROM sensorreading "
                f"WHERE temp = (SELECT {func}(temp) FROM sensorreading) "
                f"ORDER BY timestamp DESC LIMIT 1")
        ).first()
        if not result:
            return {}
        return {temp: result[0], "humidity": result[1], "date": result[2]}
    else:
        result = session.exec(text(
                f"SELECT temp, humidity, timestamp FROM sensorreading "
                f"WHERE humidity = (SELECT {func}(humidity) FROM sensorreading) "
                f"ORDER BY timestamp DESC LIMIT 1")

        ).first()
        if not result:
            return {}
        return {"temp": result[0], "humidity": result[1], "timestamp": result[2]}

@app.post("/sensors", dependencies=[Depends(verify_key)])
def create_sensor(sensor: Sensor, session: Session = Depends(get_session)):
    session.add(sensor)
    session.commit()
    session.refresh(sensor)
    return sensor


@app.get("/sensors", dependencies=[Depends(verify_key)])
def get_sensors(session: Session = Depends(get_session)):
    return session.exec(select(Sensor)).all()
