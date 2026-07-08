// Corona Runner — client-side port of the original pygame game.
// Faithfully reproduces the mechanics from main.py / lib.py on <canvas>.

const SCREEN_WIDTH = 1100;
const SCREEN_HEIGHT = 400;
const BASE_SPEED = 20;
const STEP_MS = 1000 / 60; // original game ran at 60 fps; speeds are px/frame

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---------------------------------------------------------------- asset loading
const IMAGE_FILES = {
  corona_run_1: "corona_run_1.png",
  corona_run_2: "corona_run_2.png",
  corona_jump: "corona_jump.png",
  corona_duck_1: "corona_duck_1.png",
  corona_duck_2: "corona_duck_2.png",
  corona_idle: "corona.png",
  corona_dead: "corona_dead.png",
  cloud: "cloud.png",
  track: "track.png",
  restart: "restart.png",
  small_human_1: "small_human_1.png",
  small_human_2: "small_human_2.png",
  small_human_3: "small_human_3.png",
  big_human_1: "big_human_1.png",
  big_human_2: "big_human_2.png",
  big_human_3: "big_human_3.png",
  vaccine_1: "vaccine_1.png",
  vaccine_2: "vaccine_2.png",
};

const images = {};
const sounds = {
  jump: new Audio("/assets/audios/jump.mp3"),
  hit: new Audio("/assets/audios/hit.mp3"),
  reach: new Audio("/assets/audios/reach.mp3"),
};

function playSound(name) {
  const src = sounds[name];
  if (!src) return;
  const s = src.cloneNode();
  s.play().catch(() => {}); // ignore autoplay rejection before first interaction
}

function loadImages() {
  const entries = Object.entries(IMAGE_FILES);
  return Promise.all(
    entries.map(
      ([key, file]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = "/assets/images/" + file;
          images[key] = img;
        })
    )
  );
}

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------------ game state
const State = { BEGINNING: -1, RUNNING: 0, GAME_OVER: 2 };
const CoronaState = { RUN: 0, JUMP: 1, DUCK: 2, IDLE: 3, DEAD: 4 };

const CORONA_X = 80;
const CORONA_Y = 240;
const CORONA_Y_DUCK = 268;
const JUMP_VEL = 8.5;

const game = {
  state: State.BEGINNING,
  speed: BASE_SPEED,
  score: 0,
  highscore: 0,
  obstacles: [],
};

const corona = {
  state: CoronaState.IDLE,
  x: CORONA_X,
  y: CORONA_Y,
  img: null,
  stepIndex: 0,
  jumpVel: JUMP_VEL,
};

const cloud = { x: 0, y: 0 };
let track = [{ x: 0 }, { x: 0 }]; // two tiles that scroll and wrap

// --------------------------------------------------------------------- helpers
function coronaImage() {
  return corona.img || images.corona_idle;
}

function coronaRect() {
  const img = coronaImage();
  // Slight inset approximates pygame's pixel-perfect mask collision.
  const inset = 10;
  return {
    x: corona.x + inset,
    y: corona.y + inset,
    w: img.width - inset * 2,
    h: img.height - inset * 2,
  };
}

function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function randomizeCloud() {
  cloud.x = SCREEN_WIDTH + rnd(0, 200);
  cloud.y = rnd(10, 200);
}

// ------------------------------------------------------------------- obstacles
function makeObstacle(kind) {
  if (kind === "small") {
    const img = choice([images.small_human_1, images.small_human_2, images.small_human_3]);
    return { kind, img, x: SCREEN_WIDTH, y: 255, stepIndex: 0, frames: null };
  }
  if (kind === "big") {
    const img = choice([images.big_human_1, images.big_human_2, images.big_human_3]);
    return { kind, img, x: SCREEN_WIDTH, y: 227, stepIndex: 0, frames: null };
  }
  // vaccine: animated + spawns at one of three heights
  return {
    kind,
    x: SCREEN_WIDTH,
    y: choice([120, 200, 263]),
    stepIndex: 0,
    frames: [images.vaccine_1, images.vaccine_2],
    img: images.vaccine_1,
  };
}

function updateObstacle(o) {
  o.x -= game.speed;
  if (o.frames) {
    if (o.stepIndex >= 10) o.stepIndex = 0;
    o.img = o.frames[Math.floor(o.stepIndex / 5)];
    o.stepIndex += 1;
  }
}

function obstacleRect(o) {
  return { x: o.x, y: o.y, w: o.img.width, h: o.img.height };
}

// --------------------------------------------------------------- corona states
function coronaRunning() {
  if (corona.stepIndex >= 10) corona.stepIndex = 0;
  corona.img = corona.stepIndex < 5 ? images.corona_run_1 : images.corona_run_2;
  corona.y = CORONA_Y;
  corona.stepIndex += 1;
}

function coronaJumping() {
  corona.img = images.corona_jump;
  corona.y -= corona.jumpVel * 4;
  corona.jumpVel -= 0.8;
  if (corona.y >= CORONA_Y) {
    corona.y = CORONA_Y;
    corona.state = CoronaState.RUN;
    corona.jumpVel = JUMP_VEL;
  }
}

function coronaDucking() {
  corona.state = CoronaState.RUN; // matches original quirk
  if (corona.stepIndex >= 10) corona.stepIndex = 0;
  corona.img = corona.stepIndex < 5 ? images.corona_duck_1 : images.corona_duck_2;
  corona.y = CORONA_Y_DUCK;
  corona.stepIndex += 1;
}

function updateCorona() {
  switch (corona.state) {
    case CoronaState.RUN: coronaRunning(); break;
    case CoronaState.JUMP: coronaJumping(); break;
    case CoronaState.DUCK: coronaDucking(); break;
    case CoronaState.IDLE: corona.img = images.corona_idle; corona.y = CORONA_Y; break;
    case CoronaState.DEAD: corona.img = images.corona_dead; break;
  }
}

function coronaJump() {
  playSound("jump");
  if (corona.state === CoronaState.RUN) corona.state = CoronaState.JUMP;
}

function coronaDuck() {
  if (corona.state === CoronaState.RUN) corona.state = CoronaState.DUCK;
}

// ------------------------------------------------------------------ core loops
function resetGame() {
  game.speed = BASE_SPEED;
  game.score = 0;
  game.obstacles = [];
  corona.state = CoronaState.IDLE;
  corona.stepIndex = 0;
  corona.jumpVel = JUMP_VEL;
  corona.y = CORONA_Y;
  corona.img = images.corona_idle;
  randomizeCloud();
  track = [{ x: 0 }, { x: images.track.width }];
}

function step() {
  updateCorona();
  if (game.state !== State.RUNNING) return;

  // cloud (moves at half speed)
  cloud.x -= game.speed / 2;
  if (cloud.x <= -images.cloud.width) randomizeCloud();

  // track scroll + wrap
  const tw = images.track.width;
  for (const t of track) {
    t.x -= game.speed;
    if (t.x - game.speed <= -tw) t.x = tw;
  }

  // spawn (replicates the original triple-roll logic)
  if (game.obstacles.length === 0) {
    if (rnd(0, 2) === 0) game.obstacles.push(makeObstacle("small"));
    else if (rnd(0, 2) === 1) game.obstacles.push(makeObstacle("big"));
    else if (rnd(0, 2) === 2) game.obstacles.push(makeObstacle("vaccine"));
  }

  for (const o of game.obstacles) updateObstacle(o);
  game.obstacles = game.obstacles.filter((o) => o.x >= -o.img.width);

  // collision
  const cr = coronaRect();
  for (const o of game.obstacles) {
    if (intersects(cr, obstacleRect(o))) {
      playSound("hit");
      corona.state = CoronaState.DEAD;
      updateCorona();
      game.state = State.GAME_OVER;
    }
  }

  // scoring + difficulty ramp
  game.score += 1;
  if (game.score > game.highscore) {
    game.highscore = game.score;
    saveHighscore(game.highscore);
  }
  if (game.score % 200 === 0) {
    game.speed += 1;
    playSound("reach");
  }
}

// ---------------------------------------------------------------------- render
function drawImage(img, x, y) {
  if (img) ctx.drawImage(img, Math.round(x), Math.round(y));
}

function drawText(text, x, y, size, color, centered) {
  ctx.fillStyle = color;
  ctx.font = `${size}px Jersey10, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = centered ? "center" : "left";
  ctx.fillText(text, x, y);
}

function render() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  drawImage(images.cloud, cloud.x, cloud.y);
  for (const t of track) drawImage(images.track, t.x, 300);
  drawImage(coronaImage(), corona.x, corona.y);
  for (const o of game.obstacles) drawImage(o.img, o.x, o.y);

  drawText(`Score:  ${game.score}`, 200, 10, 20, "#476032", false);
  drawText(`Highest Scores:  ${game.highscore}`, 10, 10, 20, "#476032", false);

  if (game.state === State.GAME_OVER) {
    drawText("Game Over", SCREEN_WIDTH / 2, 80, 64, "#68ad3e", true);
    const btn = images.restart;
    drawImage(btn, SCREEN_WIDTH / 2 - btn.width / 2, SCREEN_HEIGHT / 2 - btn.height / 2);
  }
}

// ------------------------------------------------------------------- main clock
let acc = 0;
let last = null;
const held = { down: false, up: false };

function frame(now) {
  if (last === null) last = now;
  acc += now - last;
  last = now;
  // Fixed 60 Hz update so movement matches the original regardless of display.
  let guard = 0;
  while (acc >= STEP_MS && guard < 5) {
    // held-key behaviour mirrors the original on_key_press handler
    if (game.state === State.RUNNING) {
      if (held.down) coronaDuck();
      else if (held.up) coronaJump();
    }
    step();
    acc -= STEP_MS;
    guard += 1;
  }
  if (acc > STEP_MS * 5) acc = 0;
  render();
  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------------- input
function primaryAction() {
  if (game.state === State.BEGINNING) {
    game.state = State.RUNNING;
    corona.state = CoronaState.RUN;
  } else if (game.state === State.RUNNING) {
    coronaJump();
  } else if (game.state === State.GAME_OVER) {
    game.state = State.BEGINNING;
    resetGame();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    held.up = true;
    primaryAction();
  }
  if (e.code === "ArrowDown") {
    e.preventDefault();
    held.down = true;
    coronaDuck();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") held.up = false;
  if (e.code === "ArrowDown") held.down = false;
});

// touch / click support for mobile
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  primaryAction();
});

// --------------------------------------------------------------- highscore api
async function loadHighscore() {
  try {
    const r = await fetch("/api/highscore");
    const d = await r.json();
    game.highscore = d.highscore || 0;
  } catch (_) {}
}

let saveTimer = null;
function saveHighscore(score) {
  // Debounce so we don't POST every single frame.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch("/api/highscore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    }).catch(() => {});
  }, 400);
}

// --------------------------------------------------------------------- startup
loadImages().then(async () => {
  await loadHighscore();
  resetGame();
  requestAnimationFrame(frame);
});
