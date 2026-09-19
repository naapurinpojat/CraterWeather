// spot3d.js — kokeellinen 3D-tuulinäkymä yhdelle spotille (popupin 3D-välilehti).
// Ladataan laiskasti index.html:stä (dynaaminen import), three.js tulee
// import mapin kautta CDN:stä. Pohjana samat MML-laatat kuin kartalla:
// EPSG:3067 on metrinen, joten laatat istuvat suoraan metreissä mitattuun tasoon.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TILE_URL =
  "https://tiles.kartat.kapsi.fi/peruskartta_3067/11/{x}/{y}.jpg";
const ORIGIN_E = -548576;
const ORIGIN_N = 8388608;
const RES = 4; // m / px tasolla 11
const TILE_M = 256 * RES; // 1024 m
const SIZE = 3000; // näkymän sivu (m), spotti keskellä
const PX = SIZE / RES; // 750 px
const ARROWS = 300;
const SPEED_SCALE = 12; // 1 m/s tuulta = 12 m/s näkymässä

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // laattapalvelin sallii CORSin -> tekstuuriksi
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Laatta ei latautunut: " + url));
    img.src = url;
  });
}

// Piirrä spotin ympäriltä SIZE×SIZE m alue laatoista yhdelle canvasille
async function groundCanvas(E, N) {
  const west = E - SIZE / 2;
  const north = N + SIZE / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const tx0 = Math.floor((west - ORIGIN_E) / TILE_M);
  const tx1 = Math.floor((west + SIZE - ORIGIN_E) / TILE_M);
  const ty0 = Math.floor((ORIGIN_N - north) / TILE_M);
  const ty1 = Math.floor((ORIGIN_N - (north - SIZE)) / TILE_M);
  const jobs = [];
  for (let x = tx0; x <= tx1; x++)
    for (let y = ty0; y <= ty1; y++)
      jobs.push(
        loadImage(TILE_URL.replace("{x}", x).replace("{y}", y)).then((img) =>
          ctx.drawImage(
            img,
            (ORIGIN_E + x * TILE_M - west) / RES,
            (north - (ORIGIN_N - y * TILE_M)) / RES,
          ),
        ),
      );
  await Promise.all(jobs);
  return canvas;
}

// ponytail: vesi tunnistetaan MML-peruskartan sinisestä väristä; jos
// pohjakartan paletti vaihtuu, heuristiikka pitää virittää uudelleen.
function waterMask(canvas) {
  const d = canvas.getContext("2d").getImageData(0, 0, PX, PX).data;
  const mask = new Uint8Array(PX * PX);
  const cells = [];
  for (let i = 0; i < PX * PX; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    // Vesi on syaania/sinistä (esim. 199,235,235): sekä G että B selvästi R:ää
    // suurempia. Maa (beige, valkoinen, harmaa) ja pellot (B matala) jäävät pois.
    if (g > r + 25 && b > r + 25 && b > 200) {
      mask[i] = 1;
      cells.push(i);
    }
  }
  // Ei juuri vettä näkyvissä (esim. laatat puuttuvat) -> sallitaan kaikki
  if (cells.length < PX * PX * 0.05) {
    mask.fill(1);
    return { mask, cells: null };
  }
  return { mask, cells };
}

// opts = { E, N, hours, sectors: [[a,b],...], hazards: [[[x,y],...],...], colors }
// Paikalliset koordinaatit: x itään, y pohjoiseen (metreinä spotista).
export async function mount(el, opts) {
  const { E, N, hours, sectors, hazards, colors } = opts;
  const canvas = await groundCanvas(E, N);
  const water = waterMask(canvas);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#cfe3ef");
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 2.5));

  const camera = new THREE.PerspectiveCamera(50, 1, 10, 20000);
  camera.position.set(0, 1400, 1600); // etelästä ~45° kulmassa pohjoiseen
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // ei maan alle
  controls.minDistance = 200;
  controls.maxDistance = 5000;
  controls.target.set(0, 0, 0);
  controls.update();

  // Kaikki litteät pinnat piirretään XY-tasoon ja käännetään maahan:
  // rotateX(-π/2) vie +Y:n pohjoiseen (-Z).
  const flat = new THREE.Group();
  flat.rotation.x = -Math.PI / 2;
  scene.add(flat);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  flat.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshBasicMaterial({ map: texture }),
    ),
  );

  // Parhaat tuulensuunnat: kompassiaste d -> kulma θ = 90° − d.
  // Sektori [a,b] kulkee myötäpäivään a:sta b:hen.
  const rad = (d) => (d * Math.PI) / 180;
  const sectorMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const [a, b] of sectors) {
    const len = (((b - a) % 360) + 360) % 360 || 360;
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(300, 32, rad(90 - b), rad(len)),
      sectorMat,
    );
    m.position.z = 1;
    flat.add(m);
  }

  const hazardMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const ring of hazards) {
    const shape = new THREE.Shape(
      ring.map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), hazardMat);
    m.position.z = 2;
    flat.add(m);
  }

  // Tuulinuolet: kartiot, kärki +Z-suuntaan (käännetään ajossa tuulen mukaan)
  const cone = new THREE.ConeGeometry(8, 40, 8);
  cone.rotateX(Math.PI / 2);
  const arrows = new THREE.InstancedMesh(
    cone,
    new THREE.MeshLambertMaterial(),
    ARROWS,
  );
  scene.add(arrows);

  const half = SIZE / 2;
  const isWater = (x, y) => {
    const px = Math.floor((x + half) / RES);
    const py = Math.floor((half - y) / RES);
    if (px < 0 || py < 0 || px >= PX || py >= PX) return false;
    return water.mask[py * PX + px] === 1;
  };
  const randomWater = () => {
    if (!water.cells)
      return [(Math.random() - 0.5) * SIZE, (Math.random() - 0.5) * SIZE];
    const i = water.cells[(Math.random() * water.cells.length) | 0];
    return [(i % PX) * RES - half, half - Math.floor(i / PX) * RES];
  };

  let hour = hours[0];
  const parts = Array.from({ length: ARROWS }, () => ({ x: 0, y: 0, s: 0 }));
  const color = new THREE.Color();
  const colorFor = (s) => {
    let c = 0;
    while (c + 1 < colors.length && s >= colors[c + 1][0]) c++;
    return colors[c][1];
  };
  // Jokaisella nuolella oma nopeus tuulen ja puuskan väliltä -> puuskaisuus näkyy
  function respawn(p) {
    [p.x, p.y] = randomWater();
    const g = hour.gust != null ? hour.gust : hour.wind;
    p.s = hour.wind + Math.random() * Math.max(0, g - hour.wind);
  }
  function recolor() {
    parts.forEach((p, i) => arrows.setColorAt(i, color.set(colorFor(p.s))));
    arrows.instanceColor.needsUpdate = true;
  }
  parts.forEach(respawn);
  recolor();

  // Ennustetut ajolinjat: windsurffari ajaa sivutuulessa (~90° tuulesta)
  // edestakaisin, joten piirretään molemmat halssit spotilta rantaan asti.
  // ponytail: suora sivutuulilinja; ei huomioi vaara-alueita eikä
  // luovia/myötäistä — lisää kulmia (esim. ±110°) jos tarvitaan.
  const laneMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const lanes = new THREE.Group();
  lanes.position.z = 3;
  flat.add(lanes);
  // Kulje suuntaan deg: spotti on usein rannalla, joten sallitaan ensin
  // ~300 m maata, sitten jatketaan vettä pitkin rantaan tai reunaan.
  function trace(deg) {
    const dx = Math.sin(rad(deg));
    const dy = Math.cos(rad(deg));
    let start = null;
    let end = null;
    let gap = 0;
    for (let d = 0; d <= half; d += 10) {
      const x = dx * d;
      const y = dy * d;
      if (isWater(x, y)) {
        if (!start) start = [x, y];
        end = [x, y];
        gap = 0;
      } else if (start) {
        // Kartan tekstit/syvyysluvut vedessä eivät ole sinisiä -> siedä
        // lyhyt katko, vasta pidempi "maa" on oikea ranta
        if ((gap += 10) > 60) break;
      } else if (d > 300) break;
    }
    if (!start || Math.hypot(end[0] - start[0], end[1] - start[1]) < 100)
      return null;
    return [start, end];
  }
  function drawLanes() {
    lanes.children.forEach((m) => m.geometry.dispose());
    lanes.clear();
    for (const side of [90, -90]) {
      const seg = trace(hour.dir + side);
      if (!seg) continue;
      const [[x0, y0], [x1, y1]] = seg;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.hypot(x1 - x0, y1 - y0), 30),
        laneMat,
      );
      bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      bar.rotation.z = ang;
      // Kolmio (3-kulmainen ympyrä) osoittaa +X:ään -> nuolenkärki linjan päähän
      const tip = new THREE.Mesh(new THREE.CircleGeometry(80, 3), laneMat);
      tip.position.set(x1, y1, 0);
      tip.rotation.z = ang;
      lanes.add(bar, tip);
    }
  }
  drawLanes();

  const dummy = new THREE.Object3D();
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    // hour.dir = mistä tuulee -> nuolet kulkevat vastakkaiseen suuntaan
    const to = rad(hour.dir + 180);
    const ux = Math.sin(to);
    const uy = Math.cos(to);
    let changed = false;
    parts.forEach((p, i) => {
      p.x += ux * p.s * SPEED_SCALE * dt;
      p.y += uy * p.s * SPEED_SCALE * dt;
      // Rannalle tai näkymän reunan yli -> uusi paikka vedestä
      if (!isWater(p.x, p.y)) {
        respawn(p);
        changed = true;
      }
      dummy.position.set(p.x, 12, -p.y);
      dummy.rotation.set(0, Math.atan2(ux, -uy), 0);
      dummy.updateMatrix();
      arrows.setMatrixAt(i, dummy.matrix);
    });
    arrows.instanceMatrix.needsUpdate = true;
    if (changed) recolor();
    controls.update();
    renderer.render(scene, camera);
  }

  const resize = () => {
    const w = el.clientWidth || 320;
    const h = el.clientHeight || 380;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  renderer.setAnimationLoop(tick);

  return {
    setHour(i) {
      hour = hours[Math.max(0, Math.min(hours.length - 1, i))];
      parts.forEach(respawn);
      recolor();
      drawLanes();
    },
    pause() {
      renderer.setAnimationLoop(null);
    },
    resume() {
      clock.getDelta();
      renderer.setAnimationLoop(tick);
    },
    // Selaimet sallivat vain ~16 WebGL-kontekstia -> siivoa aina popupin sulkeutuessa
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
