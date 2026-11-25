# RAYQUAZA · 裸眼 3D 破屏点击互动

基于 Three.js + WebGL 打造的裸眼 3D 交互体验：外圈四边纯黑遮幅锁定在 `z = 0` 屏幕平面，内部为浅灰白 3D 凹陷展盒；点击任意位置时，裂空座沿 Z 轴迎面放大破框冲出，并在内盒地面与墙面上投射同步弯曲的实时软阴影。

- **在线试玩**：https://wonderful-1101.github.io/jardin-gallery/play.html?id=rayquaza-naked-3d

## 核心实现

- **四边纯黑遮幅 + 离轴全息视差**（`src/stormScene.js`）：利用 `camera.projectionMatrix.makePerspective` 锁定 `z = 0` 平面，晃动鼠标时纯黑外框纹丝不动，内部 3D 展盒产生真实全息窗错位；`z < 0` 被黑框硬件深度裁切，`z > 0` 直接压在纯黑外框前方。
- **GPU 32 节曲线变形 + 同步实时软阴影**（`src/dragonRig.js`）：通过 `onBeforeCompile` 同时改写 `MeshStandardMaterial` 与 `MeshDepthMaterial` 顶点着色器，使弯曲游动的龙身与 `PCFSoftShadowMap` 投影完全同步。
- **点击引导迎面破屏冲锋**（`src/main.js`）：点击或拖动任意位置后先回潜蓄力再沿点击视线迎面突破 `z = 0` 黑边，到达后盘旋停留。

## 本地运行与构建

```bash
npm install
npm run dev      # 本地开发调试
npm run build    # 构建 dist/（相对路径 base: './'）
npm run preview  # 本地预览生产构建
```
