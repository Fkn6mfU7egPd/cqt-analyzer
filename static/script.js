import {convert_typed} from "./binary_to_hex.js";
import {load_response, to_decibel} from "./cqt_loader.js";

const file_input = document.getElementById("file_input");
const analyze_button = document.getElementById("analyze");
const loudness_indicator = document.getElementById("loudness");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

analyze_button.addEventListener("click", () => {
  const file = file_input.files[0];
  if (!file){
    alert("Please select a file to analyze.");
    return;
  }
  const formData = new FormData();
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
  .then(response => response.arrayBuffer())
  .then(buffer => new Uint8Array(buffer))
  .then(data => {
    console.log("First 1KB of response:\n" + convert_typed(data.slice(0, 1024)));
    return load_response(data);
  })
  .then(({rows, cols, sr, hop_length, data}) => ({rows, cols, sr, hop_length, data: to_decibel(data)}))
  .then(data => start_visualize(data))
  .catch(error => {
    console.error("Error analyzing file:", error);
    alert("An error occurred while analyzing the file.");
  })
  .finally(() => {
    file_input.disabled = false;
    analyze_button.disabled = false;
  });
});

function visualize(data, t, sr, hop_length){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for(let i = 0; i < data.rows; i++){
    const frame = Math.floor(t * sr / hop_length);
    const value = data.data[i * data.cols + frame];
    ctx.fillStyle = "black";
    ctx.fillRect(i * (canvas.width / data.rows), canvas.height, canvas.width / data.rows, -Math.min(canvas.height * 0.75, canvas.height * 0.75 * (value + 120) / 120));
    ctx.fillStyle = "red";
    ctx.fillRect(i * (canvas.width / data.rows), canvas.height * 0.25, canvas.width / data.rows, -Math.max(0, canvas.height * 0.75 * value / 120));
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

let audio = document.createElement("audio");
document.body.appendChild(audio);
let animation_frame_id = null;

async function start_visualize(data){
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(file_input.files[0]);
  audio.play();
  audio.addEventListener("loadedmetadata", () => {
    audio.play();
    if (animation_frame_id) cancelAnimationFrame(animation_frame_id);
    animation_frame_id = requestAnimationFrame(() => frame(data));
  }, {once: true});
}

function frame(data){
  const t = audio.currentTime;
  if (t < audio.duration){
    const frame_n = Math.floor(t * data.sr / data.hop_length);
    visualize(data, t, data.sr, data.hop_length);
    loudness_indicator.textContent = calculate_loudness(data, frame_n).toFixed(2);
    animation_frame_id = requestAnimationFrame(() => frame(data));
  }else{
    animation_frame_id = null;
  }
}