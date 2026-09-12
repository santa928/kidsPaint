import type { StampId } from '../types';

type Paint = string | CanvasGradient;

interface StampPalette {
  body: Paint;
  outline: string;
  face: string;
}

const INK = '#543D35';
const CREAM = '#FFF2D9';
const BLUSH = '#FFAFAB';
const GOLD = '#F6C563';
const TAU = Math.PI * 2;

/** Paint the new picture-book stamps inside a centered size-by-size square. */
export function drawStampV2(
  ctx: CanvasRenderingContext2D,
  stampId: StampId,
  x: number,
  y: number,
  size: number,
  color: string,
  useRainbowGradient: boolean,
): void {
  if (!Number.isFinite(size) || size <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const darkBody = !useRainbowGradient && isDarkColor(color);
  const palette: StampPalette = {
    body: useRainbowGradient ? rainbow(ctx) : color,
    outline: darkBody ? '#B69173' : INK,
    face: darkBody ? CREAM : INK,
  };

  switch (stampId) {
    case 'circle':
    case 'cross':
    case 'square':
    case 'triangle':
      drawShape(ctx, stampId, palette);
      break;
    case 'rabbit':
      drawRabbit(ctx, palette);
      break;
    case 'bird':
      drawBird(ctx, palette);
      break;
    case 'train':
      drawTrain(ctx, palette);
      break;
  }
  ctx.restore();
}

/** Keep the face legible on every supported hex color, including black and blue. */
function isDarkColor(color: string): boolean {
  const hex = color.replace('#', '');
  const expanded = hex.length === 3 ? [...hex].map(value => value + value).join('') : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) return false;
  const channels = [0, 2, 4].map(offset => parseInt(expanded.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 0.14;
}

/** Use the same warm rainbow across every part of one stamp's main silhouette. */
function rainbow(ctx: CanvasRenderingContext2D): CanvasGradient {
  const gradient = ctx.createLinearGradient(-38, -35, 38, 38);
  ['#FF777E', '#FFB759', '#FFE478', '#80CF9E', '#79BDEC', '#A494DD', '#E2A0D0']
    .forEach((color, index, colors) => gradient.addColorStop(index / (colors.length - 1), color));
  return gradient;
}

/** Finish an already defined silhouette with a rounded, gently contrasting contour. */
function paint(ctx: CanvasRenderingContext2D, fill: Paint, outline = INK, width = 3.2): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Add one filled ellipse without carrying an old path into the next detail. */
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: Paint): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Define a rounded rectangle using curves supported by both tablet browser engines. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Give the four familiar shapes one small smile, leaving their silhouettes dominant. */
function drawShape(ctx: CanvasRenderingContext2D, stampId: 'circle' | 'cross' | 'square' | 'triangle', palette: StampPalette): void {
  ctx.beginPath();
  switch (stampId) {
    case 'circle':
      ctx.arc(0, 0, 40, 0, TAU);
      break;
    case 'cross':
      ctx.moveTo(-34, -41);
      ctx.quadraticCurveTo(-30, -45, -26, -41);
      ctx.lineTo(0, -15);
      ctx.lineTo(26, -41);
      ctx.quadraticCurveTo(30, -45, 34, -41);
      ctx.lineTo(41, -34);
      ctx.quadraticCurveTo(45, -30, 41, -26);
      ctx.lineTo(15, 0);
      ctx.lineTo(41, 26);
      ctx.quadraticCurveTo(45, 30, 41, 34);
      ctx.lineTo(34, 41);
      ctx.quadraticCurveTo(30, 45, 26, 41);
      ctx.lineTo(0, 15);
      ctx.lineTo(-26, 41);
      ctx.quadraticCurveTo(-30, 45, -34, 41);
      ctx.lineTo(-41, 34);
      ctx.quadraticCurveTo(-45, 30, -41, 26);
      ctx.lineTo(-15, 0);
      ctx.lineTo(-41, -26);
      ctx.quadraticCurveTo(-45, -30, -41, -34);
      ctx.closePath();
      break;
    case 'square':
      roundedRect(ctx, -37, -37, 74, 74, 11);
      break;
    case 'triangle':
      ctx.moveTo(-4.5, -38);
      ctx.quadraticCurveTo(0, -46, 4.5, -38);
      ctx.lineTo(39, 27);
      ctx.quadraticCurveTo(44, 36, 34, 36);
      ctx.lineTo(-34, 36);
      ctx.quadraticCurveTo(-44, 36, -39, 27);
      ctx.closePath();
      break;
  }
  paint(ctx, palette.body, palette.outline);

  // A single soft mark suggests a painted wooden toy without busy texture.
  ctx.beginPath();
  if (stampId === 'circle') {
    ctx.moveTo(-28, -11);
    ctx.quadraticCurveTo(-24, -25, -12, -29);
  } else if (stampId === 'cross') {
    ctx.moveTo(-31, -31);
    ctx.lineTo(-20, -20);
  } else if (stampId === 'square') {
    ctx.moveTo(-27, -17);
    ctx.lineTo(-27, -22);
    ctx.quadraticCurveTo(-27, -27, -22, -27);
    ctx.lineTo(-16, -27);
  } else {
    ctx.moveTo(-21, 14);
    ctx.lineTo(-6, -15);
  }
  ctx.strokeStyle = '#FFFFFF85';
  ctx.lineWidth = 3.6;
  ctx.stroke();

  const compact = stampId === 'cross';
  const eyeY = stampId === 'triangle' ? 12 : compact ? -2 : 1;
  const eyeX = compact ? 7 : 10;
  oval(ctx, -eyeX, eyeY, compact ? 2.5 : 3, compact ? 2.8 : 3.5, palette.face);
  oval(ctx, eyeX, eyeY, compact ? 2.5 : 3, compact ? 2.8 : 3.5, palette.face);
  if (!compact) {
    oval(ctx, -20, eyeY + 10, 5, 3.5, BLUSH);
    oval(ctx, 20, eyeY + 10, 5, 3.5, BLUSH);
  }
  ctx.beginPath();
  ctx.moveTo(compact ? -4.5 : -6, eyeY + 9);
  ctx.quadraticCurveTo(0, eyeY + (compact ? 14 : 16), compact ? 4.5 : 6, eyeY + 9);
  ctx.strokeStyle = palette.face;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** Draw connected ears and a plump head, with a cream muzzle and big pink cheeks. */
function drawRabbit(ctx: CanvasRenderingContext2D, palette: StampPalette): void {
  ctx.beginPath();
  ctx.moveTo(-26, -8);
  ctx.bezierCurveTo(-34, -30, -34, -42, -26, -45);
  ctx.bezierCurveTo(-16, -49, -10, -27, -8, -17);
  ctx.quadraticCurveTo(0, -20, 7, -17);
  ctx.bezierCurveTo(9, -31, 15, -48, 24, -45);
  ctx.bezierCurveTo(34, -42, 29, -20, 25, -8);
  ctx.bezierCurveTo(35, -1, 40, 11, 38, 23);
  ctx.bezierCurveTo(36, 38, 20, 45, 0, 45);
  ctx.bezierCurveTo(-20, 45, -36, 38, -38, 23);
  ctx.bezierCurveTo(-40, 11, -35, -1, -26, -8);
  ctx.closePath();
  paint(ctx, palette.body, palette.outline);

  ctx.beginPath();
  ctx.moveTo(-23, -14);
  ctx.bezierCurveTo(-28, -27, -29, -38, -25, -39);
  ctx.bezierCurveTo(-21, -40, -16, -25, -15, -15);
  ctx.quadraticCurveTo(-18, -12, -23, -14);
  ctx.closePath();
  ctx.fillStyle = BLUSH;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -15);
  ctx.bezierCurveTo(16, -27, 21, -40, 24, -38);
  ctx.bezierCurveTo(28, -35, 23, -20, 21, -14);
  ctx.quadraticCurveTo(17, -12, 14, -15);
  ctx.closePath();
  ctx.fill();

  oval(ctx, -12, 7, 3.1, 3.8, palette.face);
  oval(ctx, 12, 7, 3.1, 3.8, palette.face);
  oval(ctx, -25, 19, 6.5, 4.5, BLUSH);
  oval(ctx, 25, 19, 6.5, 4.5, BLUSH);
  oval(ctx, -6, 25, 10, 8, CREAM);
  oval(ctx, 6, 25, 10, 8, CREAM);

  ctx.beginPath();
  ctx.moveTo(-4.5, 18);
  ctx.quadraticCurveTo(0, 15, 4.5, 18);
  ctx.quadraticCurveTo(3, 22, 0, 23);
  ctx.quadraticCurveTo(-3, 22, -4.5, 18);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(0, 25);
  ctx.quadraticCurveTo(-3, 29, -7, 26);
  ctx.moveTo(0, 25);
  ctx.quadraticCurveTo(3, 29, 7, 26);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Draw a side-facing baby bird with a single body silhouette, little wing and feet. */
function drawBird(ctx: CanvasRenderingContext2D, palette: StampPalette): void {
  for (const x of [-15, 9]) {
    ctx.beginPath();
    ctx.moveTo(x - 2, 28);
    ctx.quadraticCurveTo(x + 3, 27, x + 3, 31);
    ctx.lineTo(x + 3, 39);
    ctx.lineTo(x + 7, 39);
    ctx.quadraticCurveTo(x + 12, 41, x + 8, 44);
    ctx.lineTo(x - 6, 44);
    ctx.quadraticCurveTo(x - 10, 42, x - 6, 40);
    ctx.lineTo(x - 3, 38);
    ctx.closePath();
    paint(ctx, GOLD, INK, 2.8);
  }

  ctx.beginPath();
  ctx.moveTo(28, -6);
  ctx.quadraticCurveTo(37, -7, 44, 0);
  ctx.quadraticCurveTo(48, 3, 44, 5);
  ctx.lineTo(29, 12);
  ctx.closePath();
  paint(ctx, GOLD, INK, 2.8);

  ctx.beginPath();
  ctx.moveTo(-18, -27);
  ctx.bezierCurveTo(-20, -34, -18, -40, -13, -42);
  ctx.quadraticCurveTo(-8, -45, -8, -39);
  ctx.lineTo(-8, -33);
  ctx.bezierCurveTo(-5, -41, 0, -44, 3, -39);
  ctx.quadraticCurveTo(7, -34, 1, -29);
  ctx.bezierCurveTo(21, -29, 35, -13, 33, 5);
  ctx.bezierCurveTo(31, 25, 16, 36, -4, 36);
  ctx.bezierCurveTo(-23, 36, -35, 27, -37, 10);
  ctx.bezierCurveTo(-44, 10, -46, 3, -44, -3);
  ctx.bezierCurveTo(-43, -7, -37, -4, -33, -7);
  ctx.quadraticCurveTo(-32, -20, -18, -27);
  ctx.closePath();
  paint(ctx, palette.body, palette.outline);

  ctx.beginPath();
  ctx.moveTo(-24, 3);
  ctx.bezierCurveTo(-14, -3, -2, 2, -2, 11);
  ctx.bezierCurveTo(-2, 22, -20, 22, -24, 12);
  ctx.quadraticCurveTo(-27, 7, -24, 3);
  ctx.closePath();
  paint(ctx, '#FFF2D9CC', palette.outline, 2.2);
  oval(ctx, 14, -9, 3.4, 4, palette.face);
  oval(ctx, 20, 4, 5.5, 4.3, BLUSH);
}

/** Draw a rounded toy engine with a roomy window, brass details and two large wheels. */
function drawTrain(ctx: CanvasRenderingContext2D, palette: StampPalette): void {
  // Steam is one soft cloud plus a small puff, with all contours inside the stamp.
  ctx.beginPath();
  ctx.moveTo(17, -33);
  ctx.bezierCurveTo(11, -34, 12, -42, 18, -42);
  ctx.bezierCurveTo(20, -49, 30, -47, 31, -41);
  ctx.bezierCurveTo(38, -42, 41, -33, 34, -31);
  ctx.quadraticCurveTo(25, -29, 17, -33);
  ctx.closePath();
  paint(ctx, CREAM, INK, 2.4);
  oval(ctx, 7, -43, 3.5, 3.5, CREAM);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, 20, -24, 11, 24, 3);
  paint(ctx, palette.body, palette.outline, 2.8);
  roundedRect(ctx, 17, -27, 17, 7, 2.5);
  paint(ctx, GOLD, INK, 2.6);
  roundedRect(ctx, -39, -25, 34, 52, 5);
  paint(ctx, palette.body, palette.outline);
  roundedRect(ctx, -43, -29, 42, 8, 4);
  paint(ctx, GOLD, INK, 2.8);
  roundedRect(ctx, -31, -15, 18, 21, 4);
  paint(ctx, '#D5EFF0', INK, 2.6);
  ctx.beginPath();
  ctx.moveTo(-25, -9);
  ctx.lineTo(-20, -9);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.stroke();

  roundedRect(ctx, -9, -3, 47, 30, 8);
  paint(ctx, palette.body, palette.outline);
  roundedRect(ctx, -3, 15, 32, 5, 2.5);
  ctx.fillStyle = GOLD;
  ctx.fill();
  oval(ctx, 30, 6, 4, 5, CREAM);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, -43, 25, 85, 8, 3);
  paint(ctx, GOLD, INK, 2.8);
  roundedRect(ctx, 39, 23, 8, 8, 3);
  paint(ctx, BLUSH, INK, 2.4);
  for (const [x, radius] of [[-23, 12], [22, 10.5]]) {
    ctx.beginPath();
    ctx.arc(x, 32, radius, 0, TAU);
    paint(ctx, '#6A8889', INK, 3);
    oval(ctx, x, 32, radius * 0.49, radius * 0.49, CREAM);
    oval(ctx, x, 32, 2.2, 2.2, INK);
  }
}
