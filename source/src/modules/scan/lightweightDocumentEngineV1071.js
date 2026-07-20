const clampV1071 = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value || 0)));

function sourceSizeV1071(source) {
  return {
    width:Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
    height:Number(source?.videoHeight || source?.naturalHeight || source?.height || 0),
  };
}

function scaledCanvasV1071(source, maxDimension = 1100) {
  const { width, height } = sourceSizeV1071(source);
  if (!width || !height) throw new Error('source_dimensions_missing');
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function percentileV1071(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * ratio)))];
}

function smoothMaskV1071(mask, width, height) {
  let current = mask;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            total += current[(ny * width) + nx];
            count += 1;
          }
        }
        next[(y * width) + x] = total >= Math.max(4, Math.ceil(count * .52)) ? 1 : 0;
      }
    }
    current = next;
  }
  return current;
}

function largestPaperComponentV1071(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  let best = null;
  for (let sy = 0; sy < height; sy += 1) {
    for (let sx = 0; sx < width; sx += 1) {
      const first = (sy * width) + sx;
      if (!mask[first] || visited[first]) continue;
      const queue = [[sx, sy]];
      visited[first] = 1;
      const points = [];
      let minX = sx;
      let maxX = sx;
      let minY = sy;
      let maxY = sy;
      for (let head = 0; head < queue.length; head += 1) {
        const [x, y] = queue[head];
        points.push({ x:x + .5, y:y + .5 });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const index = (ny * width) + nx;
            if (!mask[index] || visited[index]) continue;
            visited[index] = 1;
            queue.push([nx, ny]);
          }
        }
      }
      const area = points.length / (width * height);
      if (area < .04 || area > .92) continue;
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fill = points.length / Math.max(1, boxWidth * boxHeight);
      const centerX = (minX + maxX + 1) / (2 * width);
      const centerY = (minY + maxY + 1) / (2 * height);
      const center = 1 - Math.min(1, Math.hypot(centerX - .5, centerY - .5) / .72);
      const ratio = boxWidth / Math.max(1, boxHeight);
      const aspect = ratio >= .33 && ratio <= 2.6 ? 1 : .3;
      const touches = Number(minX <= 0) + Number(minY <= 0) + Number(maxX >= width - 1) + Number(maxY >= height - 1);
      const score = area * .48 + fill * .22 + center * .18 + aspect * .12 - touches * .12;
      if (!best || score > best.score) best = { points, score };
    }
  }
  return best;
}

function fitQuadV1071(points, width, height) {
  if (!points?.length) return null;
  let meanX = 0;
  let meanY = 0;
  points.forEach(point => { meanX += point.x; meanY += point.y; });
  meanX /= points.length;
  meanY /= points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  points.forEach(point => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  });
  const angle = .5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  const projected = points.map(point => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    return { u:dx * ux + dy * uy, v:dx * vx + dy * vy };
  });
  const us = projected.map(point => point.u);
  const vs = projected.map(point => point.v);
  const minV = percentileV1071(vs, .015);
  const maxV = percentileV1071(vs, .985);
  const band = Math.max(1, (maxV - minV) * .14);
  const top = projected.filter(point => point.v <= minV + band);
  const bottom = projected.filter(point => point.v >= maxV - band);
  const minU = percentileV1071(us, .015);
  const maxU = percentileV1071(us, .985);
  const fromUv = (u, v) => ({
    x:clampV1071((meanX + u * ux + v * vx) / width),
    y:clampV1071((meanY + u * uy + v * vy) / height),
  });
  return {
    topLeft:fromUv(top.length ? percentileV1071(top.map(point => point.u), .03) : minU, minV),
    topRight:fromUv(top.length ? percentileV1071(top.map(point => point.u), .97) : maxU, minV),
    bottomRight:fromUv(bottom.length ? percentileV1071(bottom.map(point => point.u), .97) : maxU, maxV),
    bottomLeft:fromUv(bottom.length ? percentileV1071(bottom.map(point => point.u), .03) : minU, maxV),
  };
}

export async function detectPageCornersLightweightV1071(source, options = {}) {
  options.onStatus?.('Finding paper…');
  const canvas = scaledCanvasV1071(source, options.maxDimension || 1100);
  const context = canvas.getContext('2d', { willReadFrequently:true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const maxCells = Math.max(72, Math.min(150, Number(options.gridMax || 112)));
  const cell = Math.max(3, Math.ceil(Math.max(canvas.width, canvas.height) / maxCells));
  const width = Math.ceil(canvas.width / cell);
  const height = Math.ceil(canvas.height / cell);
  const cells = new Array(width * height);
  const luminances = [];
  for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      let luminance = 0;
      let saturation = 0;
      let count = 0;
      const step = Math.max(1, Math.floor(cell / 4));
      for (let y = gy * cell; y < Math.min(canvas.height, (gy + 1) * cell); y += step) {
        for (let x = gx * cell; x < Math.min(canvas.width, (gx + 1) * cell); x += step) {
          const index = ((y * canvas.width) + x) * 4;
          const red = image.data[index];
          const green = image.data[index + 1];
          const blue = image.data[index + 2];
          luminance += red * .299 + green * .587 + blue * .114;
          saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
          count += 1;
        }
      }
      const value = count ? luminance / count : 0;
      cells[(gy * width) + gx] = { luminance:value, saturation:count ? saturation / count : 255 };
      luminances.push(value);
    }
  }
  const p20 = percentileV1071(luminances, .20);
  const p55 = percentileV1071(luminances, .55);
  const p82 = percentileV1071(luminances, .82);
  const p95 = percentileV1071(luminances, .95);
  const threshold = Math.min(242, Math.max(p55 + Math.max(10, (p95 - p20) * .16), p82 - 5));
  let mask = new Uint8Array(cells.length);
  cells.forEach((item, index) => { mask[index] = item.luminance >= threshold && item.saturation <= 82 ? 1 : 0; });
  mask = smoothMaskV1071(mask, width, height);
  const component = largestPaperComponentV1071(mask, width, height);
  return component ? fitQuadV1071(component.points, width, height) : null;
}

function solveV1071(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error('homography_singular');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let item = column; item <= size; item += 1) rows[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let item = column; item <= size; item += 1) rows[row][item] -= factor * rows[column][item];
    }
  }
  return rows.map(row => row[size]);
}

export function homographyFromUnitSquareV1071(corners = {}) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  if (points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('homography_corners_invalid');
  const uv = [[0,0],[1,0],[1,1],[0,1]];
  const matrix = [];
  const vector = [];
  points.forEach((point, index) => {
    const [u, v] = uv[index];
    matrix.push([u,v,1,0,0,0,-u*point.x,-v*point.x]); vector.push(point.x);
    matrix.push([0,0,0,u,v,1,-u*point.y,-v*point.y]); vector.push(point.y);
  });
  return solveV1071(matrix, vector);
}

function outputSizeV1071(image, corners) {
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  const pixel = point => ({ x:point.x * width, y:point.y * height });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const tl = pixel(corners.topLeft);
  const tr = pixel(corners.topRight);
  const br = pixel(corners.bottomRight);
  const bl = pixel(corners.bottomLeft);
  const rawWidth = Math.max(distance(tl, tr), distance(bl, br), 1);
  const rawHeight = Math.max(distance(tl, bl), distance(tr, br), 1);
  const scale = Math.min(1.7, 2800 / Math.max(rawWidth, rawHeight));
  return { width:Math.max(640, Math.round(rawWidth * scale)), height:Math.max(800, Math.round(rawHeight * scale)) };
}

function shaderV1071(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader_compile_failed');
  return shader;
}

export async function warpPerspectiveWebGLV1071(image, corners) {
  const size = outputSizeV1071(image, corners);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const gl = canvas.getContext('webgl', { alpha:false, antialias:false, preserveDrawingBuffer:true, premultipliedAlpha:false });
  if (!gl) throw new Error('webgl_unavailable');
  const vertex = shaderV1071(gl, gl.VERTEX_SHADER, 'attribute vec2 p;attribute vec2 t;varying vec2 uv;void main(){gl_Position=vec4(p,0.,1.);uv=t;}');
  const fragment = shaderV1071(gl, gl.FRAGMENT_SHADER, 'precision highp float;varying vec2 uv;uniform sampler2D image;uniform mat3 h;void main(){vec3 m=h*vec3(uv,1.);vec2 s=m.xy/m.z;gl_FragColor=(s.x<0.||s.y<0.||s.x>1.||s.y>1.)?vec4(1.):texture2D(image,vec2(s.x,1.-s.y));}');
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program_link_failed');
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,0,0, 1,1,1,0, -1,-1,0,1, 1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  const texturePosition = gl.getAttribLocation(program, 't');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texturePosition);
  gl.vertexAttribPointer(texturePosition, 2, gl.FLOAT, false, 16, 8);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  const h = homographyFromUnitSquareV1071(corners);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'h'), false, new Float32Array([h[0],h[3],h[6], h[1],h[4],h[7], h[2],h[5],1]));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1,1,1,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.finish();
  return canvas;
}

function illuminationV1071(canvas) {
  const small = document.createElement('canvas');
  small.width = Math.max(18, Math.round(canvas.width / 38));
  small.height = Math.max(18, Math.round(canvas.height / 38));
  const smallContext = small.getContext('2d', { alpha:false });
  smallContext.imageSmoothingEnabled = true;
  smallContext.drawImage(canvas, 0, 0, small.width, small.height);
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d', { alpha:false, willReadFrequently:true });
  context.imageSmoothingEnabled = true;
  context.filter = 'blur(10px)';
  context.drawImage(small, 0, 0, output.width, output.height);
  context.filter = 'none';
  return output;
}

export async function enhanceDocumentCanvasLightweightV1071(sourceCanvas, mode = 'color') {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2600 / Math.max(sourceCanvas.width, sourceCanvas.height));
  canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  const background = illuminationV1071(canvas).getContext('2d', { willReadFrequently:true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = red * .299 + green * .587 + blue * .114;
    const backgroundLuminance = Math.max(42, background[index] * .299 + background[index + 1] * .587 + background[index + 2] * .114);
    let normalized = clampV1071((luminance / backgroundLuminance) * 244, 0, 255);
    normalized = clampV1071((normalized - 128) * 1.14 + 132, 0, 255);
    if (mode === 'bw') {
      const value = luminance < clampV1071(backgroundLuminance * .84 - 4, 105, 218) ? 0 : 255;
      data[index] = value; data[index + 1] = value; data[index + 2] = value;
    } else if (mode === 'gray') {
      data[index] = normalized; data[index + 1] = normalized; data[index + 2] = normalized;
    } else {
      const factor = luminance > 2 ? normalized / luminance : 1;
      const keepColor = Math.max(red, green, blue) - Math.min(red, green, blue) > 26 ? 1 : .72;
      data[index] = clampV1071(red * factor * keepColor + normalized * (1 - keepColor), 0, 255);
      data[index + 1] = clampV1071(green * factor * keepColor + normalized * (1 - keepColor), 0, 255);
      data[index + 2] = clampV1071(blue * factor * keepColor + normalized * (1 - keepColor), 0, 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
