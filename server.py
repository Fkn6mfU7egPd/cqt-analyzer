import numpy as np
import os
import psutil
import soundfile as sf
import struct
import json
import librosa
from fastapi import FastAPI, UploadFile, File, Response, HTTPException, Body
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

async def cqt(file: UploadFile = File(...), hop_length: int = 1024, bins_per_octave: int = 24):
  log("Request received")
  y, sr = sf.read(
    file.file,
    dtype="float32"
  )
  file.file.close()
  fmin = librosa.note_to_hz("C1")
  max_bins = int(np.floor(np.log2(sr / 2 / fmin) * bins_per_octave))
  n_bins = np.min([bins_per_octave * 9, max_bins])
  if y.ndim > 1: y = y.mean(axis=1)
  log("File loaded")
  cqt = librosa.cqt(
    y,
    sr=sr,
    hop_length=hop_length,
    n_bins=n_bins,
    filter_scale=1,
    fmin=fmin,
    bins_per_octave=bins_per_octave,
    dtype=np.complex64
  )
  log("CQT calculation completed")
  magnitude = np.abs(cqt).astype(">f4")
  log("Magnitude calculation completed")

  rows, cols = magnitude.shape
  header = struct.pack(">5ifi", rows, cols, sr, hop_length, n_bins, fmin, bins_per_octave)
  return Response(content=header + magnitude.tobytes(), media_type="application/octet-stream")

res_map = {
  "low": 2048,
  "medium": 1024,
  "high": 256,
  "higher": 128,
}

freq_res_map = {
  "low": 12,
  "medium": 24,
  "high": 48,
  "higher": 96,
}

@app.post("/cqt")
async def cqt_api(file: UploadFile = File(...), config: str = Body(...)):
  config_dict = json.loads(config)
  resolution = config_dict.get("resolution")
  bins_per_octave = config_dict.get("frequency_resolution")
  filter_scale = config_dict.get("filter_scale")
  if resolution not in res_map:
    raise HTTPException(400, "invalid resolution")
  if bins_per_octave not in freq_res_map:
    raise HTTPException(400, "invalid frequency resolution")
  print(res_map[resolution] / freq_res_map[bins_per_octave])
  if res_map[resolution] / freq_res_map[bins_per_octave] < 10:
    raise HTTPException(400, f"{resolution}-{bins_per_octave} combination is too computationally expensive")
  return await cqt(file, res_map[resolution], freq_res_map[bins_per_octave])

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