// sketch.js — phiên bản đã loại bỏ toàn bộ nhãn (DOM + overlay)
// Hiển thị 3D phân tử/tinh thể, ánh sáng nhẹ, không còn logic nhãn.

let canvas, canvasContainer;
let regions = [];

let zoomFactor = 1.0;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const REGION_SIZE = 220;
const COLOR_H = [220, 40, 40];
const COLOR_CL = [40, 180, 40];
const COLOR_NA = [245, 210, 60];
const COLOR_HE = [80, 170, 255];
const COLOR_NE = [170, 80, 255];
const COLOR_BOND = [200, 200, 200, 200];
const EXTRA_LOWER_NACL = 14.0;
const NACL_SCREEN_SHIFT = 120.0;

// Di chuyển toàn hệ (Ctrl + chuột trái)
let systemDrag = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setup() {
  canvasContainer = document.getElementById('canvasContainer');
  canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  if (canvasContainer) canvas.parent('canvasContainer');
  textFont('Arial');
  if (typeof sphereDetail === 'function') sphereDetail(48);

  const marginX = 520;
  const marginY = 340;
  const centers = [
    createVector(-marginX, -marginY, 0),
    createVector(0, -marginY, 0),
    createVector(marginX, -marginY, 0),
    createVector(-marginX, marginY, 0),
    createVector(0, marginY, 0),
    createVector(marginX, marginY, 0)
  ];

  regions.push(new Region('', centers[0], REGION_SIZE, () => Molecule.createDiatomic('H','H', color(...COLOR_H), color(...COLOR_H)), 5));
  regions.push(new Region('', centers[1], REGION_SIZE, () => Molecule.createDiatomic('Cl','Cl', color(...COLOR_CL), color(...COLOR_CL)), 5));
  regions.push(new Region('', centers[2], REGION_SIZE, () => Molecule.createDiatomic('H','Cl', color(...COLOR_H), color(...COLOR_CL)), 5));
  regions.push(new Region('', centers[3], REGION_SIZE, () => Molecule.createNaClCrystal(4, 22, COLOR_NA, COLOR_CL), 1, true));
  regions.push(new Region('', centers[4], REGION_SIZE, () => Molecule.createMonoAtomic('He', color(...COLOR_HE)), 5));
  regions.push(new Region('', centers[5], REGION_SIZE, () => Molecule.createMonoAtomic('Ne', color(...COLOR_NE)), 5));

  if (regions[3]) regions[3].center.y += NACL_SCREEN_SHIFT;
  for (let r of regions) r.resolveCollisionsInitial();

  fitSceneToView();

  setAttributes('antialias', true);
  smooth();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fitSceneToView();
}

function draw() {
  background(0);

  // Ánh sáng đã giảm để tránh chói
  ambientLight(36, 36, 36);
  const cameraLightZ = 520;
  pointLight(140, 130, 120, 0, 0, cameraLightZ);

  const t = millis() * 0.001;
  const rOrbit = 420;
  const mx = rOrbit * cos(t * 0.9);
  const my = 90 * sin(t * 1.4);
  const mz = rOrbit * sin(t * 0.9);
  pointLight(46, 56, 76, mx, my, mz);

  // Xử lý di chuyển hệ thống với Ctrl + chuột trái
  if (!systemDrag) {
    orbitControl(1.1, 1.1, 0.5);
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'default';
  } else {
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'grabbing';
  }

  push();
  scale(zoomFactor);

  for (let r of regions) {
    push();
    translate(r.center.x, r.center.y, r.center.z);

    // Vẽ hình hộp vùng (trừ vùng NaCl)
    let hasCrystal = false;
    for (let mm of r.molecules) {
      if (mm && mm.isCrystal) { hasCrystal = true; break; }
    }
    if (!hasCrystal) {
      push();
      stroke(190,210,255,180);
      strokeWeight(3);
      noFill();
      drawBoxWireframe(r.size, r.size, r.size);
      pop();
    }

    r.updateAndDraw();
    pop();
  }

  pop();
}

// --- Di chuyển toàn hệ thống với Ctrl + chuột trái ---
function mousePressed(event) {
  const isLeft = (typeof event.button !== 'undefined' ? event.button === 0 : mouseButton === LEFT);
  const ctrlDown = keyIsDown(17); // CTRL key code
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
    r.center.x += dxWorld;
    r.center.y += dyWorld;
  }
}

function mouseReleased(event) {
  if (systemDrag) {
    systemDrag = false;
    if (canvas && canvas.canvas) canvas.canvas.style.cursor = 'default';
  }
}

// --- Vẽ wireframe hình hộp vùng ---
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
  if (!regions || regions.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let r of regions) {
    const half = r.size / 2;
    minX = Math.min(minX, r.center.x - half);
    maxX = Math.max(maxX, r.center.x + half);
    minY = Math.min(minY, r.center.y - half);
    maxY = Math.max(maxY, r.center.y + half);
  }
  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  const margin = 160;
  if (worldWidth <= 0 || worldHeight <= 0) return;
  const scaleX = (windowWidth - margin) / worldWidth;
  const scaleY = (windowHeight - margin) / worldHeight;
  zoomFactor = constrain(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM);
}

function randomBrownianMotion(molecule, scale = 0.7) {
  molecule.velocity.x += random(-scale, scale);
  molecule.velocity.y += random(-scale, scale);
  molecule.velocity.z += random(-scale, scale);
  if (molecule.velocity.mag() > 8) molecule.velocity.setMag(8);
}

function resolveMoleculeCollisions(region) {
  const minGap = 1.5;
  for (let i = 0; i < region.molecules.length; i++) {
    for (let j = i + 1; j < region.molecules.length; j++) {
      const a = region.molecules[i];
      const b = region.molecules[j];
      const dir = p5.Vector.sub(b.position, a.position);
      let d = dir.mag();
      const minDist = a.boundRadius + b.boundRadius + minGap;
      if (d < minDist) {
        const overlap = minDist - d;
        const push = dir.copy().normalize().mult(overlap * 0.55);
        a.position.sub(push.copy().mult(0.5));
        b.position.add(push.copy().mult(0.5));
        a.velocity.mult(0.95);
        b.velocity.mult(0.95);
      }
    }
  }
  for (let m of region.molecules) {
    const limit = region.size * 0.45 - m.boundRadius;
    m.position.x = constrain(m.position.x, -limit, limit);
    m.position.y = constrain(m.position.y, -limit, limit);
    m.position.z = constrain(m.position.z, -limit, limit);
  }
}

// --- Classes ---
class Region {
  constructor(name, center, size, moleculeFactory, count = 1, isStatic = false) {
    this.name = name;
    this.center = center.copy();
    this.size = size;
    this.moleculeFactory = moleculeFactory;
    this.count = count;
    this.isStatic = isStatic;
    this.molecules = [];
    for (let i = 0; i < count; i++) {
      let m = moleculeFactory();
      m.computeBoundRadius();
      const centerLimit = this.size * 0.5 - m.boundRadius;
      if (m.isCrystal) {
        let minAtomLocal = Infinity;
        for (let a of m.atoms) {
          minAtomLocal = min(minAtomLocal, a.pos.y - a.size);
        }
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
        m.velocity = p5.Vector.random3D().mult(random(2.4, 4.2));
        m.angularVel = p5.Vector.random3D().mult(random(0.006, 0.016));
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
        m.velocity.mult(0.98);
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
    m.atoms.push(new Atom(createVector(0,0,0), col, label, size));
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
    const idx = (x,y,z) => x * N * N + y * N + z;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          let i = idx(x,y,z);
          let atomA = m.atoms[i];
          const neighbors = [[x+1,y,z],[x,y+1,z],[x,y,z+1]];
          for (let nb of neighbors) {
            let nx=nb[0], ny=nb[1], nz=nb[2];
            if (nx < N && ny < N && nz < N) {
              let j = idx(nx,ny,nz);
              let atomB = m.atoms[j];
              if ((atomA.type === 'Na' && atomB.type === 'Cl') ||
                  (atomA.type === 'Cl' && atomB.type === 'Na')) {
                m.bondPairs.push({a:i, b:j});
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

    // bonds for crystals (NaCl bonds: Na-Cl only)
    for (let bp of this.bondPairs) {
      let a = this.atoms[bp.a];
      let b = this.atoms[bp.b];
      if (a && b) {
        push();
        specularMaterial(180,180,180);
        shininess(10);
        drawBond(a.pos, b.pos, 3, color(...COLOR_BOND));
        pop();
      }
    }

    if (typeof sphereDetail === 'function') sphereDetail(48);
    for (let a of this.atoms) {
      push();
      translate(a.pos.x, a.pos.y, a.pos.z);
      emissiveMaterial(red(a.col)*0.72, green(a.col)*0.72, blue(a.col)*0.72);
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

  if (axis.mag() > 0.0001) {
    rotate(angle, axis);
  } else {
    if (yAxis.dot(dirNorm) < 0) rotateX(PI);
  }

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
  }
}