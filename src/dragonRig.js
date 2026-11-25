import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const SPINE_NODES = 32;

export class RayquazaDragonRig {
  constructor(scene, stormController, onProgress, onReady) {
    this.scene = scene;
    this.storm = stormController;
    this.mesh = null;
    this.ready = false;

    this.modelScale = 2.65;
    this.zMinRaw = -1.0921;
    this.zMaxRaw = 0.8774;
    this.rawSpanZ = 1.9695;
    this.worldLength = this.rawSpanZ * this.modelScale;
    this.segLen = this.worldLength / (SPINE_NODES - 1);

    // Kinematic state
    this.mode = 'CRUISE'; // 'CRUISE' | 'SUMMON_PULL' | 'SUMMON_LUNGE' | 'SUMMON_HOVER' | 'SURGE'
    this.pullTarget = new THREE.Vector3(0, 0, -4.4);
    this.lungeTarget = new THREE.Vector3(0, 0, 3.15);
    this.stateTimer = 0;

    // Initial dramatic pose: tail back inside white room, head thrusting past z=0 black matte
    this.headPos = new THREE.Vector3(0.45, 0.15, 1.55);
    this.headDir = new THREE.Vector3(0.32, 0.04, 0.94).normalize();
    this.headSpeed = 2.6;

    this.spine = Array.from({ length: SPINE_NODES }, (_, i) =>
      new THREE.Vector3(
        this.headPos.x - i * this.segLen * 0.28,
        0.15 - Math.sin(i * 0.22) * 0.25,
        this.headPos.z - i * this.segLen * 0.92
      )
    );

    this.uSpinePos = Array.from({ length: SPINE_NODES }, (_, i) => this.spine[i].clone());
    this.uSpineRight = Array.from({ length: SPINE_NODES }, () => new THREE.Vector3(1, 0, 0));
    this.uSpineUp = Array.from({ length: SPINE_NODES }, () => new THREE.Vector3(0, 1, 0));
    this.uSpineFwd = Array.from({ length: SPINE_NODES }, () => new THREE.Vector3(0, 0, 1));

    this._loadModel(onProgress, onReady);
  }

  _spineHeaderGLSL() {
    return `
      uniform vec3 uSpinePos[${SPINE_NODES}];
      uniform vec3 uSpineRight[${SPINE_NODES}];
      uniform vec3 uSpineUp[${SPINE_NODES}];
      uniform vec3 uSpineFwd[${SPINE_NODES}];
      uniform float uScale;
      uniform float uZMin;
      uniform float uZMax;
      uniform float uWorldLen;

      void sampleSpine(float zRaw, out vec3 sPos, out vec3 sRight, out vec3 sUp, out vec3 sFwd) {
        float t = (uZMax - zRaw) / max(0.0001, (uZMax - uZMin));
        float tClamped = clamp(t, 0.0, 1.0);
        float s = tClamped * float(${SPINE_NODES - 1});
        int i0 = int(floor(s));
        int i1 = min(${SPINE_NODES - 1}, i0 + 1);
        float f = fract(s);
        float sf = f * f * (3.0 - 2.0 * f);

        sPos = mix(uSpinePos[i0], uSpinePos[i1], sf);
        sRight = normalize(mix(uSpineRight[i0], uSpineRight[i1], sf));
        sUp = normalize(mix(uSpineUp[i0], uSpineUp[i1], sf));
        sFwd = normalize(mix(uSpineFwd[i0], uSpineFwd[i1], sf));

        float overshoot = (t - tClamped);
        sPos -= sFwd * (overshoot * uWorldLen);
      }
    `;
  }

  _bindSpineUniforms(shader) {
    shader.uniforms.uSpinePos = { value: this.uSpinePos };
    shader.uniforms.uSpineRight = { value: this.uSpineRight };
    shader.uniforms.uSpineUp = { value: this.uSpineUp };
    shader.uniforms.uSpineFwd = { value: this.uSpineFwd };
    shader.uniforms.uScale = { value: this.modelScale };
    shader.uniforms.uZMin = { value: this.zMinRaw };
    shader.uniforms.uZMax = { value: this.zMaxRaw };
    shader.uniforms.uWorldLen = { value: this.worldLength };
  }

  _loadModel(onProgress, onReady) {
    const loader = new GLTFLoader();
    loader.load(
      './rayquaza.glb',
      (gltf) => {
        let foundMesh = null;
        gltf.scene.traverse((obj) => {
          if (obj.isMesh && !foundMesh) foundMesh = obj;
        });
        if (!foundMesh) return;

        foundMesh.geometry.computeBoundingBox();
        const bb = foundMesh.geometry.boundingBox;
        this.zMinRaw = bb.min.z;
        this.zMaxRaw = bb.max.z;
        this.rawSpanZ = Math.max(0.1, this.zMaxRaw - this.zMinRaw);
        this.worldLength = this.rawSpanZ * this.modelScale;
        this.segLen = this.worldLength / (SPINE_NODES - 1);

        for (let i = 0; i < SPINE_NODES; i += 1) {
          this.spine[i].set(
            this.headPos.x - i * this.segLen * 0.30,
            0.15 - Math.sin(i * 0.22) * 0.25,
            this.headPos.z - i * this.segLen * 0.90
          );
        }

        const mat = foundMesh.material;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.depthTest = true;
        mat.side = THREE.DoubleSide;
        mat.envMapIntensity = 1.45;
        if (mat.roughness !== undefined) mat.roughness = Math.min(0.60, mat.roughness * 0.88);
        if (mat.metalness !== undefined) mat.metalness = Math.max(0.28, mat.metalness);

        this._injectSurfaceShader(mat);

        // Synchronized depth material so dynamic shadow map bends identically with Rayquaza!
        const depthMat = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          side: THREE.DoubleSide,
        });
        this._injectDepthShader(depthMat);
        foundMesh.customDepthMaterial = depthMat;
        foundMesh.castShadow = true;

        foundMesh.frustumCulled = false;
        foundMesh.position.set(0, 0, 0);
        foundMesh.rotation.set(0, 0, 0);
        foundMesh.scale.set(1, 1, 1);
        foundMesh.renderOrder = 2;

        this.mesh = foundMesh;
        this.scene.add(foundMesh);
        this.ready = true;
        this._syncUniforms(0);
        if (onReady) onReady();
      },
      (xhr) => {
        if (onProgress && xhr.total > 0) {
          onProgress(Math.min(1, xhr.loaded / xhr.total));
        }
      },
      (err) => {
        console.error('Failed to load rayquaza.glb:', err);
      }
    );
  }

  _injectSurfaceShader(material) {
    material.onBeforeCompile = (shader) => {
      this._bindSpineUniforms(shader);
      shader.vertexShader = this._spineHeaderGLSL() + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        vec3 _spPos;
        vec3 _spRight;
        vec3 _spUp;
        vec3 _spFwd;
        sampleSpine(position.z, _spPos, _spRight, _spUp, _spFwd);
        objectNormal = normalize(_spRight * normal.x + _spUp * normal.y + _spFwd * normal.z);
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        transformed = _spPos + _spRight * (position.x * uScale) + _spUp * (position.y * uScale);
        `
      );
    };
    material.needsUpdate = true;
  }

  _injectDepthShader(depthMat) {
    depthMat.onBeforeCompile = (shader) => {
      this._bindSpineUniforms(shader);
      shader.vertexShader = this._spineHeaderGLSL() + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec3 _spPos;
        vec3 _spRight;
        vec3 _spUp;
        vec3 _spFwd;
        sampleSpine(position.z, _spPos, _spRight, _spUp, _spFwd);
        transformed = _spPos + _spRight * (position.x * uScale) + _spUp * (position.y * uScale);
        `
      );
    };
    depthMat.needsUpdate = true;
  }

  swimTo(frontTarget, ndcX = 0, ndcY = 0) {
    this.lungeTarget.copy(frontTarget);
    const wx = this.storm.windowHalfW;
    const wy = this.storm.windowHalfH;

    // Launch point sits deep inside the ash-white gallery box slightly opposite the click ray
    // so the subsequent lunge rockets directly forward across Z (4x scale explosion)!
    this.pullTarget.set(
      THREE.MathUtils.clamp(-ndcX * wx * 0.45, -wx * 0.55, wx * 0.55),
      THREE.MathUtils.clamp(-ndcY * wy * 0.45, -wy * 0.45, wy * 0.45),
      -4.6
    );

    if (this.headPos.z > -1.8) {
      this.mode = 'SUMMON_PULL';
      this.stateTimer = 0.48;
    } else {
      this.mode = 'SUMMON_LUNGE';
      this.stateTimer = 1.6;
    }
  }

  triggerDramaticSurge() {
    this.lungeTarget.set(this.storm.windowHalfW * 0.25, -this.storm.windowHalfH * 0.12, 3.55);
    this.pullTarget.set(-this.storm.windowHalfW * 0.35, 0.25, -5.8);
    this.mode = 'SURGE';
    this.stateTimer = 2.9;
  }

  returnToCruise() {
    this.mode = 'CRUISE';
  }

  update(dt, elapsed) {
    if (!this.ready) return;

    const wx = this.storm.windowHalfW;
    const wy = this.storm.windowHalfH;
    let desiredTarget = new THREE.Vector3();
    let maxSpeed = 3.1;
    let steerRate = 3.8;

    if (this.mode === 'SURGE') {
      this.stateTimer -= dt;
      if (this.stateTimer > 2.25) {
        desiredTarget.copy(this.pullTarget);
        maxSpeed = 6.2;
        steerRate = 6.0;
      } else if (this.stateTimer > 0.55) {
        desiredTarget.copy(this.lungeTarget);
        maxSpeed = 6.8;
        steerRate = 5.4;
      } else {
        this.mode = 'CRUISE';
      }
    }

    if (this.mode === 'SUMMON_PULL') {
      this.stateTimer -= dt;
      desiredTarget.copy(this.pullTarget);
      maxSpeed = 6.0;
      steerRate = 6.4;
      if (this.stateTimer <= 0 || this.headPos.z < -2.6) {
        this.mode = 'SUMMON_LUNGE';
        this.stateTimer = 1.65;
      }
    }

    if (this.mode === 'SUMMON_LUNGE') {
      this.stateTimer -= dt;
      desiredTarget.copy(this.lungeTarget);
      maxSpeed = 6.6;
      steerRate = 6.0;
      if (this.headPos.distanceTo(this.lungeTarget) < 0.55 || this.stateTimer <= 0) {
        this.mode = 'SUMMON_HOVER';
        this.stateTimer = 1.85;
      }
    }

    if (this.mode === 'SUMMON_HOVER') {
      this.stateTimer -= dt;
      const orb = elapsed * 2.2;
      desiredTarget.set(
        this.lungeTarget.x + Math.cos(orb) * 0.55,
        this.lungeTarget.y + Math.sin(orb * 0.9) * 0.35,
        this.lungeTarget.z + Math.sin(orb * 0.7) * 0.25
      );
      maxSpeed = 2.6;
      steerRate = 4.2;
      if (this.stateTimer <= 0) {
        this.mode = 'CRUISE';
      }
    }

    if (this.mode === 'CRUISE') {
      // Deep gallery orbit periodically surging past z=0 out into viewer's space
      const t = elapsed * 0.46;
      const zPulse = Math.sin(elapsed * 0.72);
      const zTarget = zPulse > 0.30 ? 2.45 : -3.8 + zPulse * 1.8;
      desiredTarget.set(
        Math.sin(t) * wx * 0.86,
        Math.sin(t * 2.0 + 0.5) * wy * 0.58,
        zTarget
      );
      maxSpeed = 3.1;
      steerRate = 2.8;
    }

    const toTarget = desiredTarget.clone().sub(this.headPos);
    const desiredDir = toTarget.lengthSq() > 0.0001 ? toTarget.normalize() : this.headDir.clone();
    desiredDir.y = THREE.MathUtils.clamp(desiredDir.y, -0.76, 0.76);
    desiredDir.normalize();

    this.headDir.lerp(desiredDir, 1 - Math.exp(-steerRate * dt)).normalize();
    this.headSpeed = THREE.MathUtils.lerp(this.headSpeed, maxSpeed, 1 - Math.exp(-4.2 * dt));
    this.headPos.addScaledVector(this.headDir, this.headSpeed * dt);

    // Clamp inside deep room bounds so dragon never clips behind back wall or side walls awkwardly
    this.headPos.z = THREE.MathUtils.clamp(this.headPos.z, -7.2, 3.85);
    this.headPos.y = THREE.MathUtils.clamp(this.headPos.y, -wy * 0.88, wy * 0.88);

    this.storm.setDragonHeadHint(this.headPos);

    this.spine[0].copy(this.headPos);
    for (let i = 1; i < SPINE_NODES; i += 1) {
      const prev = this.spine[i - 1];
      const cur = this.spine[i];
      const delta = cur.clone().sub(prev);
      if (delta.lengthSq() < 1e-6) delta.set(0, 0, -1);
      delta.normalize().multiplyScalar(this.segLen);
      cur.copy(prev).add(delta);
    }

    this._syncUniforms(elapsed);
  }

  _syncUniforms(elapsed) {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const headFwd = this.spine[0].clone().sub(this.spine[1]).normalize();
    const bankAngle = THREE.MathUtils.clamp(-headFwd.x * 0.24, -0.35, 0.35);

    for (let i = 0; i < SPINE_NODES; i += 1) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(SPINE_NODES - 1, i + 1);
      const fwd = this.spine[iPrev].clone().sub(this.spine[iNext]).normalize();
      let right = new THREE.Vector3().crossVectors(worldUp, fwd);
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(fwd, right).normalize();

      const u = i / (SPINE_NODES - 1);
      const amp = Math.pow(u, 1.35) * 0.28;
      const swayLat = Math.sin(elapsed * 4.4 - i * 0.44) * amp;
      const swayVert = Math.cos(elapsed * 3.1 - i * 0.36) * amp * 0.34;

      this.uSpinePos[i]
        .copy(this.spine[i])
        .addScaledVector(right, swayLat)
        .addScaledVector(up, swayVert);
    }

    for (let i = 0; i < SPINE_NODES; i += 1) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(SPINE_NODES - 1, i + 1);
      const fwd = this.uSpinePos[iPrev].clone().sub(this.uSpinePos[iNext]).normalize();
      let right = new THREE.Vector3().crossVectors(worldUp, fwd);
      if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(fwd, right).normalize();

      if (bankAngle !== 0) {
        const decay = Math.max(0, 1 - i / 12);
        const qBank = new THREE.Quaternion().setFromAxisAngle(fwd, bankAngle * decay);
        right.applyQuaternion(qBank);
        up.applyQuaternion(qBank);
      }

      this.uSpineFwd[i].copy(fwd);
      this.uSpineRight[i].copy(right);
      this.uSpineUp[i].copy(up);
    }
  }
}
