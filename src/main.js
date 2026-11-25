import './styles.css';
import * as THREE from 'three';
import { buildStormEnvironment, StormEnvironmentController } from './stormScene.js';
import { RayquazaDragonRig } from './dragonRig.js';

const canvas = document.getElementById('scene');
const loadingVeil = document.getElementById('loadingVeil');
const loadingFill = document.getElementById('loadingFill');
const loadingText = document.getElementById('loadingText');
const whisper = document.getElementById('whisper');
const surgeBtn = document.getElementById('surgeBtn');
const cruiseBtn = document.getElementById('cruiseBtn');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.environment = buildStormEnvironment(renderer);

// Wide 58 deg lens at z=6.4 maximizes dramatic Z-axis foreshortening when lunging out of the box!
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.25, 50);
camera.position.set(0, 0, 6.4);

const storm = new StormEnvironmentController(scene, camera);

const dragon = new RayquazaDragonRig(
  scene,
  storm,
  (pct) => {
    loadingFill.style.width = `${Math.max(12, Math.round(pct * 100))}%`;
    loadingText.textContent = `正在载入 3D 裂空座模型 (${Math.round(pct * 100)}%)...`;
  },
  () => {
    loadingFill.style.width = '100%';
    loadingVeil.classList.add('done');
  }
);

function pointerToWorldAtDepth(clientX, clientY, targetZ) {
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -targetZ);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  return { hit, ndcX, ndcY };
}

function guideDragonToPointer(clientX, clientY) {
  whisper.classList.add('dim');
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(clientY / window.innerHeight) * 2 + 1;

  // Target depth sits well in front of the z=0 pure-black matte border so head & claws
  // lunge cleanly out over the viewer's clicked coordinate at ~3.8x close-up perspective!
  const edgeFactor = Math.min(1, Math.hypot(ndcX, ndcY) / 0.85);
  const targetZ = 2.95 + edgeFactor * 0.55;

  const { hit } = pointerToWorldAtDepth(clientX, clientY, targetZ);
  storm.triggerClickPulse(hit);
  dragon.swimTo(hit, ndcX, ndcY);
}

let isDragging = false;
let lastDragGuide = 0;

canvas.addEventListener('pointerdown', (e) => {
  isDragging = true;
  guideDragonToPointer(e.clientX, e.clientY);
});

window.addEventListener('pointermove', (e) => {
  const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  storm.setPointerParallax(ndcX, ndcY);

  if (isDragging) {
    const now = performance.now();
    if (now - lastDragGuide > 110) {
      lastDragGuide = now;
      guideDragonToPointer(e.clientX, e.clientY);
    }
  }
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

surgeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  whisper.classList.add('dim');
  dragon.triggerDramaticSurge();
});

cruiseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dragon.returnToCruise();
});

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  renderer.setSize(w, h);
  storm.updateViewportMetrics();
}

window.addEventListener('resize', handleResize);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  storm.update(dt, elapsed);
  dragon.update(dt, elapsed);
  renderer.render(scene, camera);
}

animate();
