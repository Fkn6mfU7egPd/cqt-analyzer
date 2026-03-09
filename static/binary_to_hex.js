function encode(str){
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function decode(data){
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(data);
}

function format(arr){
  let result = [];
  for (let i = 0; i < arr.length; i++){
    let temp = arr[i];

    const isLast = i === arr.length - 1;

    if (!isLast){
      if (i % 16 === 15){
        temp += "\n";
      }else if (i % 4 === 3){
        temp += "  ";
      }else {
        temp += " ";
      }
    }
    result.push(temp);
  }
  return result.join("");
}

function deformat(str){
  const cleaned = str.replace(/\s+/g, " ").trim();
  return cleaned.split(" ");
}

export function convert_string(str){
  const encoded = encode(str);
  return convert_typed(encoded);
}

export function convert_typed(typed){
  const hex = Array.from(typed).map(byte => byte.toString(16).padStart(2, "0"));
  return format(hex);
}

export function deconvert(str){
  const deformated = deformat(str);
  if (deformated.length === 0) return "";
  const uint8 = Uint8Array.from(deformated.map(hex => parseInt(hex, 16)));
  return decode(uint8);
}