import numpy as np
import os
import psutil
import soundfile as sf
import struct
import librosa
from fastapi import FastAPI, UploadFile, File, Response
from fastapi.staticfiles import StaticFiles as static
from datetime import datetime
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
  log("warmup started")
  y = np.zeros(22050)
  log("warmup running")
  librosa.cqt(y, sr=22050)
  log("warmup completed")
  log("Server is running on port 8080")
  yield
  log("Server shutting down")

app = FastAPI(lifespan=lifespan)

def log(msg): print(f"[{datetime.now().isoformat()}] {msg}")

@app.post("/cqt")
async def cqt(file: UploadFile = File(...)):
  log("Request received")
  y, sr = sf.read(
    file.file,
    dtype="float32"
  )
  hop_length = 1024
  fmin = librosa.note_to_hz("C1")
  max_bins = int(np.floor(np.log2(sr / 2 / fmin) * 24))
  if y.ndim > 1: y = y.mean(axis=1)
  log("File loaded")
  cqt = librosa.cqt(
    y,
    sr=sr,
    hop_length=hop_length,
    n_bins=np.min([216, max_bins]),
    filter_scale=1,
    fmin=fmin,
    bins_per_octave=24,
    dtype=np.complex64
  )
  log("CQT calculation completed")
  magnitude = np.abs(cqt).astype(">f4")
  log("Magnitude calculation completed")

  rows, cols = magnitude.shape
  header = struct.pack(">4i", rows, cols, sr, hop_length)
  return Response(content=header + magnitude.tobytes(), media_type="application/octet-stream")

@app.get("/status")
async def status():
  pid = os.getpid()
  process = psutil.Process(pid)
  return {
    "Process Memory Usage": f"{process.memory_info().rss / 1024 ** 2:.2f}MB",
    "Total Memory Usage": f"{psutil.virtual_memory().used / 1024 ** 3:.2f}GB",
    "Process CPU Usage": f"{process.cpu_percent()}%",
    "Total CPU Usage": f"{psutil.cpu_percent()}%"
  }

app.mount("/", static(directory="static", html=True), name="static")