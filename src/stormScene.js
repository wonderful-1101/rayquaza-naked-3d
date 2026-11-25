import * as THREE from 'three';

function createArchitecturalConcreteTexture({ baseColor = '#e6e8e5', seamColor = '#c5cac6', glowCenter = false }) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Fine mineral plaster micro-texture
  let seed = 42019;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 4200; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const a = 0.015 + rand() * 0.028;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(24,32,28,${a})`;
    ctx.fillRect(x, y, 2, 2);
  }

  if (glowCenter) {
    const g = ctx.createRadialGradient(size * 0.5, size * 0.45, 20, size * 0.5, size * 0.5, size * 0.65);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Architectural gallery panel seams to reinforce strong Z vanishing perspective
  ctx.strokeStyle = seamColor;
  ctx.lineWidth = 2;
  const step = size / 2;
  for (let p = 0; p <= size; p += step) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Subtle joint recess highlight next to seams
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 1;
  for (let p = 0; p <= size; p += step) {
    ctx.beginPath();
    ctx.moveTo(p + 2, 0);
    ctx.lineTo(p + 2, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generates a bright neutral architectural daylight-gallery PMREM environment
 * so Rayquaza's metallic emerald armor gleams authentically inside the box.
 */
export function buildStormEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xcbd2ce);

  const ceilingSoftbox = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.45, 2.38), side: THREE.DoubleSide })
  );
  ceilingSoftbox.position.set(0, 8, 0);
  ceilingSoftbox.lookAt(0, 0, 0);
  envScene.add(ceilingSoftbox);

  const sideFill = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.45), side: THREE.DoubleSide })
  );
  sideFill.position.set(7, 2, 4);
  sideFill.lookAt(0, 0, 0);
  envScene.add(sideFill);

  const emeraldBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.65, 1.25, 0.95), side: THREE.DoubleSide })
  );
  emeraldBounce.position.set(-7, -3, -4);
  emeraldBounce.lookAt(0, 0, 0);
  envScene.add(emeraldBounce);

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

export class StormEnvironmentController {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.baseCamZ = 6.4;
    this.baseFov = 58;
    this.boxDepth = 9.0;

    this.windowHalfW = 4.6;
    this.windowHalfH = 2.5;
    this.baseHalfW = 6.2;
    this.baseHalfH = 3.5;

    this.parallax = new THREE.Vector2(0, 0);
    this.targetParallax = new THREE.Vector2(0, 0);

    this._initLights();
    this._initGalleryBox();
    this._initBlackMatteFrame();
    this._initClickPulse();
    this.updateViewportMetrics();
  }

  _initLights() {
    this.hemiLight = new THREE.HemisphereLight(0xf6f8f5, 0x89928d, 1.25);
    this.scene.add(this.hemiLight);

    // Primary overhead-front architectural key light casting sharp soft shadows onto floor & inner walls
    this.keyLight = new THREE.DirectionalLight(0xfffaf0, 2.55);
    this.keyLight.position.set(2.4, 5.4, 5.2);
    this.keyLight.target.position.set(-0.3, -0.5, -3.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 22;
    this.keyLight.shadow.camera.left = -7.5;
    this.keyLight.shadow.camera.right = 7.5;
    this.keyLight.shadow.camera.top = 6.5;
    this.keyLight.shadow.camera.bottom = -6.5;
    this.keyLight.shadow.bias = -0.00045;
    this.keyLight.shadow.normalBias = 0.025;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Subtle cool back rim light from deep end of room so scales silhouette dramatically
    this.rimLight = new THREE.DirectionalLight(0xaef7d2, 1.15);
    this.rimLight.position.set(-3.5, 2.5, -7.0);
    this.scene.add(this.rimLight);

    // Soft emerald bounce light following dragon head slightly
    this.dragonGlow = new THREE.PointLight(0x6effb5, 0.75, 10, 1.8);
    this.dragonGlow.position.set(0, 0, 1.5);
    this.scene.add(this.dragonGlow);
  }

  _initGalleryBox() {
    const floorTex = createArchitecturalConcreteTexture({ baseColor: '#e9ebe8', seamColor: '#bfc5c0' });
    floorTex.repeat.set(3, 4);

    const wallTex = createArchitecturalConcreteTexture({ baseColor: '#dfe3df', seamColor: '#bcc2be' });
    wallTex.repeat.set(4, 2);

    const ceilTex = createArchitecturalConcreteTexture({ baseColor: '#e4e7e4', seamColor: '#c3c8c4' });
    ceilTex.repeat.set(3, 4);

    const backTex = createArchitecturalConcreteTexture({ baseColor: '#cfd5d1', seamColor: '#afb6b1', glowCenter: true });
    backTex.repeat.set(2, 1.5);

    const mkWallMat = (tex, rough = 0.78) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: rough,
        metalness: 0.04,
        envMapIntensity: 0.55,
      });

    this.floorWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mkWallMat(floorTex, 0.72));
    this.floorWall.rotation.x = -Math.PI * 0.5;
    this.floorWall.receiveShadow = true;

    this.ceilWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mkWallMat(ceilTex, 0.85));
    this.ceilWall.rotation.x = Math.PI * 0.5;
    this.ceilWall.receiveShadow = true;

    this.leftWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mkWallMat(wallTex, 0.80));
    this.leftWall.rotation.y = Math.PI * 0.5;
    this.leftWall.receiveShadow = true;

    this.rightWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mkWallMat(wallTex, 0.80));
    this.rightWall.rotation.y = -Math.PI * 0.5;
    this.rightWall.receiveShadow = true;

    this.backWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mkWallMat(backTex, 0.86));
    this.backWall.receiveShadow = true;

    // Two clean architectural light strips recessed on ceiling to accentuate Z depth perspective lines
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xfcfdfb });
    this.lightStripL = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1), stripMat);
    this.lightStripL.rotation.x = Math.PI * 0.5;
    this.lightStripR = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1), stripMat);
    this.lightStripR.rotation.x = Math.PI * 0.5;

    this.scene.add(
      this.floorWall,
      this.ceilWall,
      this.leftWall,
      this.rightWall,
      this.backWall,
      this.lightStripL,
      this.lightStripR
    );
  }

  _initBlackMatteFrame() {
    // Razor-sharp pure black #000000 matte at exact z = 0 screen plane (no feathering!)
    // Writes depth cleanly so dragon segments at z < 0 stay strictly clipped inside the ash-white room,
    // while segments at z > 0 climb physically right over the pitch-black border!
    const blackMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      depthWrite: true,
      depthTest: true,
    });
    this.framePanels = {
      top: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackMat),
      bottom: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackMat),
      left: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackMat),
      right: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackMat),
    };
    for (const panel of Object.values(this.framePanels)) {
      panel.position.z = 0;
      panel.renderOrder = 1;
      this.scene.add(panel);
    }
  }

  _initClickPulse() {
    const ringGeo = new THREE.RingGeometry(0.14, 0.20, 48);
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: 0x26b874,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.pulseRing = new THREE.Mesh(ringGeo, this.pulseMat);
    this.pulseRing.renderOrder = 10;
    this.scene.add(this.pulseRing);
    this.pulseLife = 0;
  }

  triggerClickPulse(worldPos) {
    this.pulseRing.position.copy(worldPos);
    this.pulseRing.scale.setScalar(0.5);
    this.pulseLife = 1.0;
  }

  setPointerParallax(ndcX, ndcY) {
    this.targetParallax.set(ndcX, ndcY);
  }

  setDragonHeadHint(pos) {
    this.dragonGlow.position.set(pos.x, pos.y + 0.3, Math.max(-5, pos.z + 0.4));
  }

  updateViewportMetrics() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const vFov = THREE.MathUtils.degToRad(this.baseFov);
    this.baseHalfH = this.baseCamZ * Math.tan(vFov * 0.5);
    this.baseHalfW = this.baseHalfH * aspect;

    // 4-sided razor-sharp pure black matte (~13% border each side, portrait-friendly too)
    const wx = this.baseHalfW * 0.74;
    const wy = this.baseHalfH * 0.72;
    this.windowHalfW = wx;
    this.windowHalfH = wy;

    // Position 5 architectural concrete walls seamlessly flush against z = 0 aperture
    const d = this.boxDepth;
    this.floorWall.scale.set(wx * 2, d, 1);
    this.floorWall.position.set(0, -wy, -d * 0.5);

    this.ceilWall.scale.set(wx * 2, d, 1);
    this.ceilWall.position.set(0, wy, -d * 0.5);

    this.leftWall.scale.set(d, wy * 2, 1);
    this.leftWall.position.set(-wx, 0, -d * 0.5);

    this.rightWall.scale.set(d, wy * 2, 1);
    this.rightWall.position.set(wx, 0, -d * 0.5);

    this.backWall.scale.set(wx * 2.02, wy * 2.02, 1);
    this.backWall.position.set(0, 0, -d);

    this.lightStripL.scale.set(1, d * 0.78, 1);
    this.lightStripL.position.set(-wx * 0.48, wy - 0.01, -d * 0.48);

    this.lightStripR.scale.set(1, d * 0.78, 1);
    this.lightStripR.position.set(wx * 0.48, wy - 0.01, -d * 0.48);

    // Position 4 pure-black matte panels cleanly around [-wx, +wx] x [-wy, +wy] at z = 0
    const huge = 48;
    const { top, bottom, left, right } = this.framePanels;

    top.scale.set(huge, huge, 1);
    top.position.set(0, wy + huge * 0.5, 0);

    bottom.scale.set(huge, huge, 1);
    bottom.position.set(0, -wy - huge * 0.5, 0);

    left.scale.set(huge, wy * 2 + 0.04, 1);
    left.position.set(-wx - huge * 0.5, 0, 0);

    right.scale.set(huge, wy * 2 + 0.04, 1);
    right.position.set(wx + huge * 0.5, 0, 0);

    this._applyOffAxisProjection();
  }

  _applyOffAxisProjection() {
    // Off-axis holographic window projection locked strictly to z = 0 screen plane.
    // Moving mouse translates the virtual eye (eyeX, eyeY), shifting deep interior walls & dragon
    // while keeping the pure black screen frame 100% locked in screen pixels!
    const eyeX = this.parallax.x * 0.65;
    const eyeY = this.parallax.y * 0.42;

    this.camera.position.set(eyeX, eyeY, this.baseCamZ);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();

    const near = this.camera.near;
    const far = this.camera.far;
    const scale = near / this.baseCamZ;

    const left = (-this.baseHalfW - eyeX) * scale;
    const right = (this.baseHalfW - eyeX) * scale;
    const bottom = (-this.baseHalfH - eyeY) * scale;
    const top = (this.baseHalfH - eyeY) * scale;

    this.camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  update(dt) {
    this.parallax.lerp(this.targetParallax, 1 - Math.exp(-6 * dt));
    this._applyOffAxisProjection();

    if (this.pulseLife > 0) {
      this.pulseLife = Math.max(0, this.pulseLife - dt * 2.2);
      const t = 1 - this.pulseLife;
      this.pulseRing.scale.setScalar(0.5 + t * 2.4);
      this.pulseMat.opacity = this.pulseLife * 0.85;
    }
  }
}
