import {convert_typed} from "./binary_to_hex.js";
import {load_response, to_decibel} from "./cqt_loader.js";

const file_input = document.getElementById("file_input");
const analyze_button = document.getElementById("analyze");
const loudness_indicator = document.getElementById("loudness");
const peak_indicator = document.getElementById("peak");
const peak_loudness_indicator = document.getElementById("peak_loudness");
const fps_indicator = document.getElementById("fps");
const frame_number_indicator = document.getElementById("frame_number");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const hovered_canvas = document.getElementById("hovered_canvas");
const hovered_ctx = hovered_canvas.getContext("2d");

analyze_button.addEventListener("click", () => {
  const file = file_input.files[0];

  if (!file){
    alert("Please select a file to analyze.");
    return;
  }
  if (!file.type.startsWith("audio/")){
    alert("Please select an audio file.");
    return;
  }

  const formData = new FormData();
  formData.append("config", JSON.stringify({
    resolution: document.getElementById("resolution_form").resolution.value,
    frequency_resolution: document.getElementById("frequency_resolution_form").frequency_resolution.value,
  }));
  formData.append("file", file);
  file_input.disabled = true;
  analyze_button.disabled = true;

  if (audio.src){
    clearInterval(animation_frame_id);
    URL.revokeObjectURL(audio.src);
    audio.pause();
  }

  fetch("/cqt", {
    method: "POST",
    body: formData
  })
  .then(async response => {
    if (response.status === 400){
      const error_message = await response.json();
      throw new Error("_internal_server:" + error_message.detail);
    }
    if (!response.ok) throw new Error("_internal_server:Network failed");
    return response;
  })
  .then(response => response.arrayBuffer())
  .then(buffer => new Uint8Array(buffer))
  .then(data => {
    console.log("First 1KB of response:\n" + convert_typed(data.slice(0, 1024)));
    return load_response(data);
  })
  .then(({rows, cols, sr, hop_length, n_bins, fmin, bins_per_octave, data}) => ({rows, cols, sr, hop_length, n_bins, fmin, bins_per_octave, data: to_decibel(data)}))
  .then(data => start_visualize(data))
  .catch(error => {
    if (error.message.startsWith("_internal_server:")){
      const user_message = error.message.slice(17);
      alert(user_message);
      return;
    }
    console.error("Error analyzing file:", error);
    alert("An error occurred while analyzing the file.");
  })
  .finally(() => {
    file_input.disabled = false;
    analyze_button.disabled = false;
  });
});

function find_peak(data, frame, cols){
  let peak = -1;
  for(let i = 0; i < data.rows; i++){
    const value = data.data[i * cols + frame];
    if (peak === -1 || value > data.data[peak * cols + frame]) peak = i;
  }
  return peak;
}

function visualize(data, t, sr, hop_length, focus_bar = []){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for(let i = 0; i < data.rows; i++){
    const frame = Math.floor(t * sr / hop_length);
    const value = data.data[i * data.cols + frame];
    ctx.fillStyle = focus_bar.includes(i) ? "dimgray" : "black";
    ctx.fillRect(Math.floor(i * (canvas.width / data.rows)), canvas.height, Math.ceil(canvas.width / data.rows), -Math.min(canvas.height * 0.75, canvas.height * 0.75 * (value + 120) / 120));
    ctx.fillStyle = focus_bar.includes(i) ? "darkorange" : "red";
    ctx.fillRect(Math.floor(i * (canvas.width / data.rows)), canvas.height * 0.25, Math.ceil(canvas.width / data.rows), -Math.max(0, canvas.height * 0.75 * value / 120));
  }
}

function calculate_loudness(data, frame){
  const rows = data.rows;
  const cols = data.cols;
  let sum = 0;
  for(let i = 0; i < rows; i++){
    const value = data.data[i * cols + frame];
    sum += 10 ** ((value ?? -120) / 10);
  }
  return Math.log10(sum) * 10;
}

let audio = document.querySelector("audio");
audio.loop = true;
let animation_frame_id = null;
// let hovered_bar = null;
window.hovered_bar = null;
let bars = null;
let frame_duration = null;

async function start_visualize(data){
  bars = data.rows;
  frame_duration = data.hop_length / data.sr;
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(file_input.files[0]);
  audio.play();
  audio.addEventListener("loadedmetadata", () => {
    audio.play();
    if (animation_frame_id) cancelAnimationFrame(animation_frame_id);
    animation_frame_id = requestAnimationFrame(() => frame(data));
  }, {once: true});
}

function render_hovered_bar(data, bar_index){
  hovered_ctx.clearRect(0, 0, hovered_canvas.width, hovered_canvas.height);
  if (bar_index === null) return;
  console.log(data,bar_index);
  const bar_width = hovered_canvas.width / bars;
  const freq = data.fmin * 2 ** (bar_index / data.bins_per_octave);
  hovered_ctx.fillStyle = "black";
  hovered_ctx.font = "12px Consolas, monospace";
  hovered_ctx.textBaseline = "bottom";
  hovered_ctx.textAlign = "center";
  hovered_ctx.beginPath();
  hovered_ctx.moveTo(bar_index * bar_width + bar_width * 0.5, 0);
  hovered_ctx.lineTo(bar_index * bar_width + bar_width * 0.5 + 4, 5);
  hovered_ctx.lineTo(bar_index * bar_width + bar_width * 0.5 - 4, 5);
  hovered_ctx.closePath();
  hovered_ctx.fill();
  render_text(freq.toFixed(0) + "Hz", bar_index * bar_width, 20);
  const frame_n = Math.floor(audio.currentTime * data.sr / data.hop_length);
  render_text(data.data[bar_index * data.cols + frame_n].toFixed(0) + "dB", bar_index * bar_width, 32);
}

function render_text(text, x, y){
  const text_width = hovered_ctx.measureText(text).width;
  hovered_ctx.fillText(text, Math.min(hovered_canvas.width - text_width / 2, Math.max(text_width / 2, x)), y);
}

function frame(data){
  const t = audio.currentTime;
  const frame_n = Math.floor(t * data.sr / data.hop_length);
  const peak = find_peak(data, frame_n, data.cols);
  visualize(data, t, data.sr, data.hop_length, [hovered_bar]);
  render_hovered_bar(data, hovered_bar);
  loudness_indicator.textContent = calculate_loudness(data, frame_n).toFixed(2);
  peak_indicator.textContent = (data.fmin * 2 ** (peak / data.bins_per_octave)).toFixed(0);
  peak_loudness_indicator.textContent = data.data[peak * data.cols + frame_n].toFixed(2);
  fps_indicator.textContent = (audio.playbackRate * data.sr / data.hop_length).toFixed(0);
  frame_number_indicator.textContent = frame_n;
  animation_frame_id = requestAnimationFrame(() => frame(data));
}

function get_hovered_bar(clientX){
  if (!bars) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const bar_width = canvas.width / bars;
  return Math.floor(x / bar_width);
}

canvas.addEventListener("mousemove", (event) => {
  hovered_bar = get_hovered_bar(event.clientX);
});

canvas.addEventListener("mousemove", (event) => {
  hovered_bar = get_hovered_bar(event.clientX);
});

canvas.addEventListener("mouseleave", () => {
  hovered_bar = null;
});

document.getElementById("prev").addEventListener("click", () => {
  if (!frame_duration) return;
  audio.currentTime -= frame_duration;
});

document.getElementById("next").addEventListener("click", () => {
  if (!frame_duration) return;
  audio.currentTime += frame_duration;
});

document.addEventListener("keydown", (event) => {
  if (!frame_duration) return;
  if (event.target.tagName === "INPUT") return;
  if (event.key === " "){
    event.preventDefault();
    if (audio.paused) audio.play()
    else audio.pause();
  }
});