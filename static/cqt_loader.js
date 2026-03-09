export function load_response(uint8){
  const view = new DataView(uint8.buffer);
  const rows = view.getInt32(0, false);
  const cols = view.getInt32(4, false);
  const sr = view.getInt32(8, false);
  const hop_length = view.getInt32(12, false);
  const data = new Float32Array(rows * cols);
  for(let i = 0; i < rows * cols; i++) data[i] = view.getFloat32(16 + i * 4, false);
  return {rows, cols, sr, hop_length, data};
}

export function to_decibel(data){
  const decibel = new Float32Array(data.length);
  for(let i = 0; i < data.length; i++) decibel[i] = 20 * Math.log10(Math.max(data[i], 1e-6));
  return decibel;
}