// Full sketch.js — complete p5.js WEBGL sketch
// - Smooth Perlin motion for molecules
// - Precise sphere-wall bounce (reflect velocity across wall normal using penetration depth)
// - Pairwise molecule collision resolution
// - Optional small internal "micro" lights moving inside atoms
// - Dropdown-controlled single-region display (H2, Cl2, HCl, NaCl, He, Ne)
// - Labels removed (no text drawing), font still loaded safely in preload()

// ---------- Global configuration ----------
let canvas, canvasContainer;
let regions = [];
let activeIndex = 0;
let zoomFactor = 1.0;

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const REGION_SIZE = 220;

// Atom colors
const COLOR_H = [220, 40, 40];
const COLOR_CL = [40, 180, 40];
const COLOR_NA = [245, 210, 60];
const COLOR_HE = [80, 170, 255];
const COLOR_NE = [170, 80, 255];
const COLOR_BOND = [200, 200, 200, 200];

const EXTRA_LOWER_NACL = 14.0;
const NACL_SCREEN_SHIFT = 120.0;

// Physics tuning
const RESTITUTION = 0.78;
const WALL_BOUNCE_IMPULSE = 0.6;
const WALL_EPSILON = 0.0001;
const MIN_VEL_UNSTUCK = 0.03;
const UNSTICK_IMPULSE = 0.08;
const MAX_SPEED = 6.0;

// Lighting tuning (balanced, not glaring)
const AMBIENT_LEVEL = 72;
const CAMERA_POINTLIGHT = 140;
const DIR_LIGHT_INTENSITY = 140;
const RIM_LIGHT_INTENSITY = 42;

// Micro-light (internal glow) tuning
const ENABLE_MICRO_LIGHTS = true;
const MICRO_LIGHT_COLOR_FACTOR = 0.28;
const MICRO_LIGHT_NOISE_SPEED = 0.6;
const MICRO_LIGHT_OFFSET_SCALE = 0.35;
const MAX_MICRO_LIGHTS = 160;

let uiFont = null;

// System drag state (Ctrl + left mouse to move whole system)
let systemDrag = false;
let lastMouseX = 0;
let lastMouseY = 0;

// ---------- p5 lifecycle ----------

function preload() {
  // Load a font so if text is used anywhere there's no WEBGL warning.
  // If CORS blocks this you can replace with a local font path.
  uiFont = loadFont('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf');
}

function setup() {
  canvasContainer = document.getElementById('canvasContainer');
  canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  if (canvasContainer) canvas.parent('canvasContainer');

  if (uiFont) textFont(uiFont);
  else textFont('sans-serif');

  textStyle(NORMAL);
  if (typeof sphereDetail === 'function') sphereDetail(48);

  // Create regions (all centered initially)
  const center = createVector(0, 0, 0);
  regions.push(new Region('H2', center, REGION_SIZE, () => Molecule.createDiatomic('H', 'H', color(...COLOR_H), color(...COLOR_H)), 5));
  regions.push(new Region('Cl2', center, REGION_SIZE, () => Molecule.createDiatomic('Cl', 'Cl', color(...COLOR_CL), color(...COLOR_CL)), 5));
  regions.push(new Region('HCl', center, REGION_SIZE, () => Molecule.createDiatomic('H', 'Cl', color(...COLOR_H), color(...COLOR_CL)), 5));
  regions.push(new Region('NaCl', center, REGION_SIZE, () => Molecule.createNaClCrystal(4, 22, COLOR_NA, COLOR_CL), 1, true));
  regions.push(new Region('He', center, REGION_SIZE, () => Molecule.createMonoAtomic('He', color(...COLOR_HE)), 5));
  regions.push(new Region('Ne', center, REGION_SIZE, () => Molecule.createMonoAtomic('Ne', color(...COLOR_NE)), 5));

  for (let r of regions) r.resolveCollisionsInitial();

  // Wire up UI select if present
  const sel = document.getElementById('substanceSelect');
  if (sel) {
    sel.addEventListener('change', (ev) => {
      const idx = parseInt(ev.target.value, 10) || 0;
      selectSubstance(idx);
    });
    sel.value = String(activeIndex);
  }

  selectSubstance(activeIndex);
  fitSceneToView();

  setAttributes('antialias', true);
  smooth();
  resetCameraToDefault();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fitSceneToView();
  resetCameraToDefault();
}

function draw() {
  background(0);

  // Core lights: ambient + camera point + directional key + rim + subtle moving fill
  ambientLight(AMBIENT_LEVEL, AMBIENT_LEVEL, AMBIENT_LEVEL);
  pointLight(CAMERA_POINTLIGHT, CAMERA_POINTLIGHT - 20, CAMERA_POINTLIGHT - 40, 0, 0, 520);
  directionalLight(DIR_LIGHT_INTENSITY, DIR_LIGHT_INTENSITY - 6, DIR_LIGHT_INTENSITY - 14, -0.45, -0.55, -0.42);
  directionalLight(RIM_LIGHT_INTENSITY, RIM_LIGHT_INTENSITY + 4, RIM_LIGHT_INTENSITY + 14, 0.6, 0.28, 0.68);
  pointLight(32, 42, 72, 420 * cos(millis() * 0.0009), 90 * sin(millis() * 0.0014), 420 * sin(millis() * 0.0009));

  // Micro-lights (optional): placed before drawing spheres so they affect shading
  if (ENABLE_MICRO_LIGHTS) {
    let countLights = 0;
    const t = millis() * 0.001;
    for (let r of regions) {
      if (!r.visible) continue;
      for (let m of r.molecules) {
        for (let a of m.atoms) {
          if (countLights >= MAX_MICRO_LIGHTS) break;
          const atomLocalRot = rotateVec3(a.pos, m.rotation);
          const worldPos = p5.Vector.add(p5.Vector.add(r.center, m.position), atomLocalRot);
          // Per-atom phase exists as a property set in Atom constructor
          const phase = a.lightPhase + t * MICRO_LIGHT_NOISE_SPEED;
          const ox = (noise(phase + 12.34) - 0.5) * 2;
          const oy = (noise(phase + 45.67) - 0.5) * 2;
          const oz = (noise(phase + 78.9) - 0.5) * 2;
          const offsetMag = a.size * MICRO_LIGHT_OFFSET_SCALE;
          const offset = createVector(ox, oy, oz).mult(offsetMag);
          const lightPos = p5.Vector.add(worldPos, offset);

          const mf = MICRO_LIGHT_COLOR_FACTOR;
          const lr = constrain(red(a.col) * mf, 0, 255);
          const lg = constrain(green(a.col) * mf, 0, 255);
          const lb = constrain(blue(a.col) * mf, 0, 255);

          pointLight(lr, lg, lb, lightPos.x, lightPos.y, lightPos.z);
          countLights++;
        }
        if (countLights >= MAX_MICRO_LIGHTS) break;
      }
      if (countLights >= MAX_MICRO_LIGHTS) break;
    }
  }

  // Orbit control unless the user is dragging the whole system
  if (!systemDrag) {
    orbitControl(1.1, 1.1, 0.5);
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'default';
  } else {
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'grabbing';
  }

  push();
  scale(zoomFactor);

  for (let r of regions) {
    if (!r.visible) continue;
    push();
    translate(r.center.x, r.center.y, r.center.z);

    // Draw wireframe box if region doesn't contain crystal (NaCl)
    let hasCrystal = false;
    for (let mm of r.molecules) {
      if (mm && mm.isCrystal) { hasCrystal = true; break; }
    }
    if (!hasCrystal) {
      push();
      stroke(190, 210, 255, 160);
      strokeWeight(3);
      noFill();
      drawBoxWireframe(r.size, r.size, r.size);
      pop();
    }

    r.updateAndDraw();
    pop();
  }

  pop();

  // No atom labels (per request)
}

// ---------- Input handlers ----------
function mousePressed(event) {
  const isLeft = (typeof event.button !== 'undefined' ? event.button === 0 : mouseButton === LEFT);
  const ctrlDown = keyIsDown(17);
  if (isLeft && ctrlDown) {
    systemDrag = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'grabbing';
  }
}

function mouseDragged(event) {
  if (!systemDrag) return;
  const dx = mouseX - lastMouseX;
  const dy = mouseY - lastMouseY;
  lastMouseX = mouseX;
  lastMouseY = mouseY;
  const dxWorld = dx / zoomFactor;
  const dyWorld = dy / zoomFactor;
  for (let r of regions) {
    if (r.visible) {
      r.center.x += dxWorld;
      r.center.y += dyWorld;
    }
  }
}

function mouseReleased(event) {
  if (systemDrag) {
    systemDrag = false;
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'default';
  }
}

// ---------- Helpers ----------
function drawBoxWireframe(w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const corners = [
    createVector(-hw, -hh, -hd),
    createVector(hw, -hh, -hd),
    createVector(hw, hh, -hd),
    createVector(-hw, hh, -hd),
    createVector(-hw, -hh, hd),
    createVector(hw, -hh, hd),
    createVector(hw, hh, hd),
    createVector(-hw, hh, hd)
  ];
  lineP(corners[0], corners[1]);
  lineP(corners[1], corners[2]);
  lineP(corners[2], corners[3]);
  lineP(corners[3], corners[0]);
  lineP(corners[4], corners[5]);
  lineP(corners[5], corners[6]);
  lineP(corners[6], corners[7]);
  lineP(corners[7], corners[4]);
  for (let i = 0; i < 4; i++) lineP(corners[i], corners[i + 4]);
}
function lineP(a, b) { line(a.x, a.y, a.z, b.x, b.y, b.z); }

function rotateVec3(v, rot) {
  let x = v.x, y = v.y, z = v.z;
  let cx = cos(rot.x), sx = sin(rot.x);
  let y1 = y * cx - z * sx;
  let z1 = y * sx + z * cx;
  y = y1; z = z1;
  let cy = cos(rot.y), sy = sin(rot.y);
  let z2 = z * cy - x * sy;
  let x2 = z * sy + x * cy;
  x = x2; z = z2;
  let cz = cos(rot.z), sz = sin(rot.z);
  let x3 = x * cz - y * sz;
  let y3 = x * sz + y * cz;
  x = x3; y = y3;
  return createVector(x, y, z);
}

function fitSceneToView() {
  const visibleRegions = regions.filter(r => r.visible);
  if (!visibleRegions || visibleRegions.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let r of visibleRegions) {
    const half = r.size / 2;
    minX = Math.min(minX, r.center.x - half);
    maxX = Math.max(maxX, r.center.x + half);
    minY = Math.min(minY, r.center.y - half);
    maxY = Math.max(maxY, r.center.y + half);
  }
  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  const margin = 240;
  if (worldWidth <= 0 || worldHeight <= 0) return;
  const scaleX = (windowWidth - margin) / worldWidth;
  const scaleY = (windowHeight - margin) / worldHeight;
  zoomFactor = constrain(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM);
  resetCameraToDefault();
}

function resetCameraToDefault() {
  const fov = PI / 3.0;
  const cameraZ = (height / 2.0) / tan(fov / 2.0);
  camera(0, 0, cameraZ, 0, 0, 0, 0, 1, 0);
}

// ---------- Motion & collision (updated bounce behavior) ----------

function randomBrownianMotion(molecule, scale = 0.7) {
  // Perlin noise for smooth motion; smaller acceleration so no sudden penetration
  molecule.noisePhase.add(0.0042, 0.0042, 0.0042);
  const nx = (noise(molecule.noisePhase.x) - 0.5) * 2;
  const ny = (noise(molecule.noisePhase.y) - 0.5) * 2;
  const nz = (noise(molecule.noisePhase.z) - 0.5) * 2;
  molecule.velocity.add(createVector(nx, ny, nz).mult(scale * 0.08));
  if (molecule.velocity.mag() > MAX_SPEED) molecule.velocity.setMag(MAX_SPEED);

  molecule.angularVel.add(p5.Vector.random3D().mult(0.00025));
  molecule.angularVel.mult(0.995);

  if (molecule.velocity.mag() < MIN_VEL_UNSTUCK) {
    molecule.velocity.add(p5.Vector.random3D().mult(UNSTICK_IMPULSE * 0.35));
  }
}

function resolveMoleculeCollisions(region) {
  const minGap = 1.5;

  // Pairwise collisions (unchanged logic, earlier in code)
  for (let i = 0; i < region.molecules.length; i++) {
    for (let j = i + 1; j < region.molecules.length; j++) {
      const a = region.molecules[i];
      const b = region.molecules[j];
      const dir = p5.Vector.sub(b.position, a.position);
      let d = dir.mag();
      const minDist = a.boundRadius + b.boundRadius + minGap;
      if (d < minDist && d > 0.0001) {
        const overlap = minDist - d;
        const push = dir.copy().normalize().mult(overlap * 0.55);
        a.position.sub(push.copy().mult(0.5));
        b.position.add(push.copy().mult(0.5));
        a.velocity.mult(0.95);
        b.velocity.mult(0.95);
      } else if (d <= 0.0001) {
        const nudge = p5.Vector.random3D().mult(1.0);
        b.position.add(nudge);
        b.velocity.add(nudge.mult(0.02));
      }
    }
  }

  // Sphere-wall collisions: reflect using wall normal and penetration depth
  for (let m of region.molecules) {
    const limit = region.size * 0.45 - m.boundRadius;

    // Helper to handle axis collision with correct vector math
    const handleAxis = (axisIdx) => {
      // axisIdx: 0 -> x, 1 -> y, 2 -> z
      const pos = (axisIdx === 0) ? m.position.x : (axisIdx === 1) ? m.position.y : m.position.z;
      if (pos > limit) {
        const penetration = pos - limit;
        // push out along negative axis
        if (axisIdx === 0) m.position.x = limit - WALL_EPSILON;
        else if (axisIdx === 1) m.position.y = limit - WALL_EPSILON;
        else m.position.z = limit - WALL_EPSILON;

        const n = (axisIdx === 0) ? createVector(1, 0, 0) : (axisIdx === 1) ? createVector(0, 1, 0) : createVector(0, 0, 1);
        // project velocity onto normal
        const vn = p5.Vector.dot(m.velocity, n);
        if (vn > 0) {
          // reflect normal component: v' = v - (1 + e) * vn * n
          const refl = n.copy().mult((1 + RESTITUTION) * vn);
          m.velocity.sub(refl);
        }
        // small tangential jitter
        const tangentJitter = p5.Vector.random3D().mult(0.06);
        // remove component along n to make it tangential-biased
        const tangential = tangentJitter.sub(n.copy().mult(p5.Vector.dot(tangentJitter, n)));
        m.velocity.add(tangential);
        // unstick outward if velocity along normal too small
        if (abs(p5.Vector.dot(m.velocity, n)) < MIN_VEL_UNSTUCK) {
          m.velocity.add(n.copy().mult(-UNSTICK_IMPULSE * (0.6 + random() * 0.8)));
        }
      } else if (pos < -limit) {
        const penetration = -limit - pos;
        if (axisIdx === 0) m.position.x = -limit + WALL_EPSILON;
        else if (axisIdx === 1) m.position.y = -limit + WALL_EPSILON;
        else m.position.z = -limit + WALL_EPSILON;

        const n = (axisIdx === 0) ? createVector(-1, 0, 0) : (axisIdx === 1) ? createVector(0, -1, 0) : createVector(0, 0, -1);
        const vn = p5.Vector.dot(m.velocity, n);
        if (vn > 0) {
          const refl = n.copy().mult((1 + RESTITUTION) * vn);
          m.velocity.sub(refl);
        }
        const tangentJitter = p5.Vector.random3D().mult(0.06);
        const tangential = tangentJitter.sub(n.copy().mult(p5.Vector.dot(tangentJitter, n)));
        m.velocity.add(tangential);
        if (abs(p5.Vector.dot(m.velocity, n)) < MIN_VEL_UNSTUCK) {
          m.velocity.add(n.copy().mult(UNSTICK_IMPULSE * (0.6 + random() * 0.8)));
        }
      }
    };

    // handle the three axes
    handleAxis(0);
    handleAxis(1);
    handleAxis(2);

    // global damping
    m.velocity.mult(0.987);
  }
}

// ---------- Classes ----------
class Region {
  constructor(name, center, size, moleculeFactory, count = 1, isStatic = false) {
    this.name = name;
    this.center = center.copy();
    this.size = size;
    this.moleculeFactory = moleculeFactory;
    this.count = count;
    this.isStatic = isStatic;
    this.molecules = [];
    this.visible = true;
    for (let i = 0; i < count; i++) {
      let m = moleculeFactory();
      m.computeBoundRadius();
      const centerLimit = this.size * 0.5 - m.boundRadius;
      if (m.isCrystal) {
        let minAtomLocal = Infinity;
        for (let a of m.atoms) minAtomLocal = min(minAtomLocal, a.pos.y - a.size);
        const innerBottomWorld = -this.size * 0.5;
        let posY = innerBottomWorld - minAtomLocal;
        posY = posY - EXTRA_LOWER_NACL;
        let posX = 0, posZ = 0;
        posX = constrain(posX, -centerLimit, centerLimit);
        posZ = constrain(posZ, -centerLimit, centerLimit);
        m.position = createVector(posX, posY, posZ);
        if (this.isStatic) {
          m.velocity = createVector(0, 0, 0);
          m.angularVel = createVector(0, 0, 0);
          m.rotation = createVector(0, 0, 0);
        } else {
          m.velocity = createVector(0, 0, 0);
          m.angularVel = p5.Vector.random3D().mult(random(0.002, 0.008));
        }
      } else {
        m.position = p5.Vector.random3D().mult(random(0, max(0, centerLimit)));
        m.velocity = p5.Vector.random3D().mult(random(1.2, 2.6));
        m.angularVel = p5.Vector.random3D().mult(random(0.003, 0.01));
        m.noisePhase = createVector(random(1000), random(1000), random(1000));
      }
      this.molecules.push(m);
    }
  }

  resolveCollisionsInitial() {
    const maxIter = 300;
    const minGap = 4;
    for (let iter = 0; iter < maxIter; iter++) {
      let moved = false;
      for (let i = 0; i < this.molecules.length; i++) {
        for (let j = i + 1; j < this.molecules.length; j++) {
          const a = this.molecules[i];
          const b = this.molecules[j];
          const dir = p5.Vector.sub(b.position, a.position);
          let d = dir.mag();
          const minDist = a.boundRadius + b.boundRadius + minGap;
          if (d < 0.001) {
            const nudge = p5.Vector.random3D().mult(1.5);
            b.position.add(nudge);
            d = nudge.mag();
            moved = true;
            continue;
          }
          if (d < minDist) {
            const overlap = (minDist - d);
            const push = dir.copy().normalize().mult(overlap * 0.52);
            b.position.add(push);
            a.position.sub(push);
            moved = true;
          }
        }
        const limit = this.size * 0.45 - this.molecules[i].boundRadius;
        if (!this.molecules[i].isCrystal) {
          this.molecules[i].position.x = constrain(this.molecules[i].position.x, -limit, limit);
          this.molecules[i].position.y = constrain(this.molecules[i].position.y, -limit, limit);
          this.molecules[i].position.z = constrain(this.molecules[i].position.z, -limit, limit);
        }
      }
      if (!moved) break;
    }
  }

  updateAndDraw() {
    if (!this.isStatic) {
      for (let m of this.molecules) {
        randomBrownianMotion(m, 0.7);
        m.velocity.mult(0.987);
        m.rotation.add(m.angularVel);
        m.update();
      }
      resolveMoleculeCollisions(this);
    }
    for (let m of this.molecules) m.draw();
  }
}

class Molecule {
  constructor() {
    this.atoms = [];
    this.position = createVector(0, 0, 0);
    this.velocity = createVector(0, 0, 0);
    this.rotation = createVector(random(TWO_PI), random(TWO_PI), random(TWO_PI));
    this.angularVel = createVector(0, 0, 0);
    this.isCrystal = false;
    this.bondPairs = [];
    this.boundRadius = 0;
    this.noisePhase = createVector(random(1000), random(1000), random(1000));
  }

  static createDiatomic(labelA, labelB, colA, colB) {
    let m = new Molecule();
    const sizeA = 12, sizeB = 12, overlapFactor = 0.72;
    const dist = (sizeA + sizeB) * overlapFactor;
    m.atoms.push(new Atom(createVector(-dist * 0.5, 0, 0), colA, labelA, sizeA));
    m.atoms.push(new Atom(createVector(dist * 0.5, 0, 0), colB, labelB, sizeB));
    m.bondPairs = [];
    m.computeBoundRadius();
    return m;
  }

  static createMonoAtomic(label, col) {
    let m = new Molecule();
    const size = 14;
    m.atoms.push(new Atom(createVector(0, 0, 0), col, label, size));
    m.bondPairs = [];
    m.computeBoundRadius();
    return m;
  }

  static createNaClCrystal(cellsPerEdge = 4, spacing = 18, naColor = COLOR_NA, clColor = COLOR_CL) {
    let m = new Molecule();
    m.isCrystal = true;
    m.atoms = [];
    m.bondPairs = [];
    const N = cellsPerEdge;
    const half = (N - 1) / 2 * spacing;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          const parity = (x + y + z) % 2;
          let col = parity === 0 ? color(...naColor) : color(...clColor);
          let pos = createVector((x * spacing) - half, (y * spacing) - half, (z * spacing) - half);
          let atom = new Atom(pos, col, parity === 0 ? 'Na' : 'Cl', 9);
          atom.type = (parity === 0 ? 'Na' : 'Cl');
          m.atoms.push(atom);
        }
      }
    }
    const idx = (x, y, z) => x * N * N + y * N + z;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          let i = idx(x, y, z);
          let atomA = m.atoms[i];
          const neighbors = [[x + 1, y, z], [x, y + 1, z], [x, y, z + 1]];
          for (let nb of neighbors) {
            let nx = nb[0], ny = nb[1], nz = nb[2];
            if (nx < N && ny < N && nz < N) {
              let j = idx(nx, ny, nz);
              let atomB = m.atoms[j];
              if ((atomA.type === 'Na' && atomB.type === 'Cl') ||
                (atomA.type === 'Cl' && atomB.type === 'Na')) {
                m.bondPairs.push({ a: i, b: j });
              }
            }
          }
        }
      }
    }
    m.computeBoundRadius();
    return m;
  }

  computeBoundRadius() {
    let maxDist = 0;
    for (let a of this.atoms) {
      const d = a.pos.mag() + a.size;
      if (d > maxDist) maxDist = d;
    }
    this.boundRadius = maxDist;
  }

  update() {
    this.position.add(this.velocity);
  }

  draw() {
    push();
    translate(this.position.x, this.position.y, this.position.z);
    rotateX(this.rotation.x);
    rotateY(this.rotation.y);
    rotateZ(this.rotation.z);

    // Draw bonds (crystal only)
    for (let bp of this.bondPairs) {
      let a = this.atoms[bp.a];
      let b = this.atoms[bp.b];
      if (a && b) {
        push();
        specularMaterial(100);
        shininess(18);
        drawBond(a.pos, b.pos, 3, color(...COLOR_BOND));
        pop();
      }
    }

    if (typeof sphereDetail === 'function') sphereDetail(48);
    for (let a of this.atoms) {
      push();
      translate(a.pos.x, a.pos.y, a.pos.z);
      // Base color from ambientMaterial; small emissive to keep colors vivid but subtle
      ambientMaterial(red(a.col), green(a.col), blue(a.col));
      emissiveMaterial(red(a.col) * 0.03, green(a.col) * 0.03, blue(a.col) * 0.03);
      shininess(16);
      noStroke();
      sphere(a.size);
      pop();
    }
    pop();
  }
}

function drawBond(p1, p2, thickness = 3, colStroke = color(200)) {
  push();
  const v1 = createVector(p1.x, p1.y, p1.z);
  const v2 = createVector(p2.x, p2.y, p2.z);
  const dir = p5.Vector.sub(v2, v1);
  const mid = p5.Vector.add(v1, v2).mult(0.5);
  translate(mid.x, mid.y, mid.z);

  const len = dir.mag();
  if (len < 0.001) {
    pop();
    return;
  }

  const yAxis = createVector(0, 1, 0);
  const dirNorm = dir.copy().normalize();
  const axis = yAxis.cross(dirNorm);
  let angle = acos(constrain(yAxis.dot(dirNorm), -1, 1));

  if (axis.mag() > 0.0001) rotate(angle, axis);
  else if (yAxis.dot(dirNorm) < 0) rotateX(PI);

  noStroke();
  const r = max(1, thickness * 0.45);
  cylinder(r, len, 24, 1);
  pop();
}

class Atom {
  constructor(pos, col, label, size = 12) {
    this.pos = pos.copy();
    this.col = col;
    this.label = label;
    this.size = size;
    // phase seed for micro-light motion
    this.lightPhase = random(1000);
  }
}

// ---------- UI helper ----------
function selectSubstance(idx) {
  activeIndex = idx;
  for (let i = 0; i < regions.length; i++) {
    regions[i].visible = (i === idx);
    if (i === idx) {
      regions[i].center = createVector(0, 0, 0);
      if (regions[i].name === 'NaCl') regions[i].center.y += NACL_SCREEN_SHIFT;
    }
  }
  fitSceneToView();
  resetCameraToDefault();
}