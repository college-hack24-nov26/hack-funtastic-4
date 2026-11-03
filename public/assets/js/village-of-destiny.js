(function () {
  const canvas = document.getElementById('game-canvas');
  const messageEl = document.getElementById('game-message');
  const currentRegionEl = document.getElementById('current-region');
  const healthValueEl = document.getElementById('health-value');
  const staminaValueEl = document.getElementById('stamina-value');
  const dharmaValueEl = document.getElementById('dharma-value');
  const healthFillEl = document.getElementById('health-fill');
  const staminaFillEl = document.getElementById('stamina-fill');
  const dharmaFillEl = document.getElementById('dharma-fill');
  const questItems = Array.from(document.querySelectorAll('.quest-item'));
  const regionButtons = Array.from(document.querySelectorAll('.region-button'));
  const resumeButton = document.getElementById('resume-journey');
  const travelButton = document.getElementById('quick-travel');

  if (!canvas || !messageEl || !currentRegionEl || !window.THREE) {
    if (messageEl) {
      messageEl.textContent = 'The realm view could not load. Refresh the page or try again in a moment.';
    }
    return;
  }

  const { Scene, PerspectiveCamera, WebGLRenderer, Group, Mesh, MeshStandardMaterial, HemisphereLight, DirectionalLight, CircleGeometry, BoxGeometry, CylinderGeometry, SphereGeometry, CapsuleGeometry, ConeGeometry, Color, Vector3, MathUtils } = THREE;

  const worldSize = 46;
  const regions = [
    { name: 'Anandgram', position: new Vector3(0, 0, 0), color: 0x7cc972 },
    { name: 'Raj Mahal', position: new Vector3(-16, 0, 16), color: 0x79b7ff },
    { name: 'Mythic Forest', position: new Vector3(18, 0, -16), color: 0x4ba06d },
    { name: 'Ancient Ruins', position: new Vector3(16, 0, 18), color: 0xd8b46a }
  ];

  const state = {
    health: 100,
    stamina: 100,
    dharma: 72,
    region: 'Anandgram',
    questIndex: 0,
    enemies: [],
    attackCooldown: 0,
    lastMessage: 'A calm dawn settles over Anandgram. The path of Dharma is yours to discover.'
  };

  const keys = {};
  const scene = new Scene();
  scene.background = new Color(0x0c1f2d);
  scene.fog = new THREE.Fog(0x0c1f2d, 18, 62);

  const camera = new PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
  camera.position.set(0, 10, 10);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new HemisphereLight(0xcfe5ff, 0x1d2a2f, 1.35);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff3d6, 1.1);
  sun.position.set(10, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  scene.add(sun);

  const world = new Group();
  scene.add(world);

  const ground = new Mesh(
    new CircleGeometry(worldSize, 80),
    new MeshStandardMaterial({ color: 0x254f3c, roughness: 0.92, metalness: 0.08 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const ringMaterial = new MeshStandardMaterial({ color: 0x8cc7ba, transparent: true, opacity: 0.32 });
  const regionMarkers = regions.map((region) => {
    const ring = new Mesh(new CylinderGeometry(2.5, 2.5, 0.22, 28), ringMaterial.clone());
    ring.position.set(region.position.x, 0.15, region.position.z);
    ring.rotation.x = Math.PI / 2;
    ring.material.color = new Color(region.color);
    world.add(ring);
    return { ...region, ring };
  });

  function addHouse(x, z, scale = 1, color = 0xc58c5d) {
    const group = new Group();
    const base = new Mesh(new BoxGeometry(2.8 * scale, 1.6 * scale, 2.3 * scale), new MeshStandardMaterial({ color, roughness: 0.9 }));
    base.position.y = 0.8 * scale;
    const roof = new Mesh(new BoxGeometry(3.3 * scale, 0.6 * scale, 2.9 * scale), new MeshStandardMaterial({ color: 0x7a3f31, roughness: 0.8 }));
    roof.position.y = 2 * scale;
    roof.rotation.y = Math.PI / 18;
    group.add(base, roof);
    group.position.set(x, 0, z);
    group.castShadow = true;
    group.receiveShadow = true;
    world.add(group);
  }

  function addTree(x, z, scale = 1) {
    const trunk = new Mesh(new CylinderGeometry(0.2 * scale, 0.28 * scale, 1.5 * scale, 12), new MeshStandardMaterial({ color: 0x6b4528, roughness: 1 }));
    trunk.position.y = 0.75 * scale;
    const leaves = new Mesh(new SphereGeometry(0.9 * scale, 14, 14), new MeshStandardMaterial({ color: 0x3e8a52, roughness: 0.9 }));
    leaves.position.y = 1.9 * scale;
    const group = new Group();
    group.add(trunk, leaves);
    group.position.set(x, 0, z);
    group.castShadow = true;
    world.add(group);
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const x = Math.cos(angle) * 12 + (Math.random() - 0.5) * 4;
    const z = Math.sin(angle) * 12 + (Math.random() - 0.5) * 4;
    addHouse(x, z, 1 + Math.random() * 0.7, i % 2 === 0 ? 0xcfa46e : 0xb88f59);
  }

  addHouse(-16, 15, 1.9, 0xa87652);
  addHouse(-11, 18, 1.4, 0x9d7d5a);
  addHouse(18, -15, 1.8, 0xb9884f);
  addHouse(14, 19, 1.6, 0x9f775d);

  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2;
    const dist = 22 + (i % 5) * 2;
    const x = Math.cos(angle) * dist + (Math.random() - 0.5) * 5;
    const z = Math.sin(angle) * dist + (Math.random() - 0.5) * 5;
    addTree(x, z, 1 + Math.random() * 0.9);
  }

  const templeBase = new Mesh(new CylinderGeometry(2.2, 2.8, 1.2, 18), new MeshStandardMaterial({ color: 0xd1c090, roughness: 0.8 }));
  templeBase.position.set(0, 0.55, 0);
  templeBase.castShadow = true;
  templeBase.receiveShadow = true;
  world.add(templeBase);

  const templeRoof = new Mesh(new ConeGeometry(2.8, 2.1, 18), new MeshStandardMaterial({ color: 0xa76041, roughness: 0.65 }));
  templeRoof.position.set(0, 2.2, 0);
  templeRoof.castShadow = true;
  world.add(templeRoof);

  const playerGroup = new Group();
  const playerBody = new Mesh(
    new CapsuleGeometry(0.6, 1.3, 4, 12),
    new MeshStandardMaterial({ color: 0xf0d74d, roughness: 0.6 })
  );
  playerBody.position.y = 1.2;
  playerBody.castShadow = true;

  const playerHead = new Mesh(new SphereGeometry(0.42, 18, 18), new MeshStandardMaterial({ color: 0xf3c99a, roughness: 0.9 }));
  playerHead.position.y = 2.25;
  playerHead.castShadow = true;

  const weapon = new Mesh(new BoxGeometry(0.18, 1.1, 0.18), new MeshStandardMaterial({ color: 0x5f8dae, metalness: 0.7, roughness: 0.3 }));
  weapon.position.set(0.8, 1.2, 0);
  weapon.rotation.z = 0.7;

  playerGroup.add(playerBody, playerHead, weapon);
  playerGroup.position.set(0, 0, 0);
  world.add(playerGroup);

  const enemyData = [
    { name: 'Ashen Warden', position: new Vector3(-18, 0, 8), color: 0x793d57 },
    { name: 'Mire Stalker', position: new Vector3(12, 0, -12), color: 0x4c6b7c },
    { name: 'Sunless Striker', position: new Vector3(18, 0, 16), color: 0x6b4b7d }
  ];

  const enemyGroup = new Group();
  world.add(enemyGroup);

  function makeEnemy(config) {
    const mesh = new Mesh(new SphereGeometry(0.75, 14, 14), new MeshStandardMaterial({ color: config.color, roughness: 0.8 }));
    mesh.position.set(config.position.x, 0.75, config.position.z);
    mesh.castShadow = true;
    enemyGroup.add(mesh);
    return { ...config, mesh, active: true, speed: 0.9 + Math.random() * 0.6 };
  }

  state.enemies = enemyData.map(makeEnemy);

  function setMessage(message) {
    state.lastMessage = message;
    messageEl.textContent = message;
  }

  function updateHud() {
    const healthPct = Math.max(0, Math.min(100, state.health));
    const staminaPct = Math.max(0, Math.min(100, state.stamina));
    const dharmaPct = Math.max(0, Math.min(100, (state.dharma / 100) * 100));

    healthValueEl.textContent = `${Math.round(healthPct)}%`;
    staminaValueEl.textContent = `${Math.round(staminaPct)}%`;
    dharmaValueEl.textContent = `${Math.round(state.dharma)}`;

    healthFillEl.style.width = `${healthPct}%`;
    staminaFillEl.style.width = `${staminaPct}%`;
    dharmaFillEl.style.width = `${dharmaPct}%`;

    const questStatus = questItems[state.questIndex];
    questItems.forEach((item, index) => {
      item.classList.toggle('is-active', index === state.questIndex);
    });

    if (questStatus) {
      const label = questStatus.querySelector('strong');
      if (label) {
        label.textContent = `${state.questIndex + 1}. ${label.textContent.replace(/^[0-9]+\.\s*/, '')}`;
      }
    }
  }

  function getNearestRegion(point) {
    let closest = regions[0];
    let best = Number.POSITIVE_INFINITY;
    regions.forEach((region) => {
      const distance = point.distanceTo(region.position);
      if (distance < best) {
        best = distance;
        closest = region;
      }
    });
    return closest;
  }

  function movePlayerTo(regionName) {
    const region = regions.find((item) => item.name === regionName);
    if (!region) return;
    const destination = new Vector3(region.position.x, 0, region.position.z);
    playerGroup.position.set(destination.x, 0, destination.z);
    const current = getNearestRegion(playerGroup.position);
    state.region = current.name;
    currentRegionEl.textContent = current.name;
    if (current.name === 'Anandgram') {
      setMessage('The elders welcome you beneath the banyan tree. The village hums with life once more.');
    } else if (current.name === 'Raj Mahal') {
      setMessage('Moonlit pillars rise around you. A royal secret waits behind the painted archway.');
    } else if (current.name === 'Mythic Forest') {
      setMessage('The forest breathes around you. Shadow spirits gather near the sacred shrine.');
    } else if (current.name === 'Ancient Ruins') {
      setMessage('Stone ruins whisper beneath the stars. The lost starstone calls from the broken sanctum.');
    }
  }

  function triggerQuestProgress() {
    const questGoals = [
      'Anandgram',
      'Raj Mahal',
      'Mythic Forest',
      'Ancient Ruins'
    ];

    if (state.questIndex < questGoals.length && state.region === questGoals[state.questIndex]) {
      state.questIndex += 1;
      if (state.questIndex <= questItems.length - 1) {
        const item = questItems[state.questIndex - 1];
        if (item) {
          item.classList.add('is-complete');
        }
      }
      if (state.questIndex < questItems.length) {
        const next = questItems[state.questIndex];
        if (next) {
          setMessage(`${next.querySelector('strong').textContent} is now your active objective.`);
        }
      } else {
        setMessage('A radiant path opens. The realm recognises your courage and Dharma is restored.');
      }
    }
  }

  function performAttack() {
    if (state.attackCooldown > 0) return;
    state.attackCooldown = 0.42;
    const target = state.enemies.filter((enemy) => enemy.active).sort((a, b) => {
      return playerGroup.position.distanceTo(a.mesh.position) - playerGroup.position.distanceTo(b.mesh.position);
    })[0];

    if (target && playerGroup.position.distanceTo(target.mesh.position) < 3.3) {
      target.active = false;
      target.mesh.visible = false;
      state.dharma += 8;
      state.health = Math.min(100, state.health + 4);
      setMessage(`${target.name} falls. The valley lights with a flash of Dharma.`);
    } else {
      setMessage('Your blade cuts the air, but the path ahead remains clear. The sacred realm is calm for now.');
    }

    updateHud();
  }

  function handleMovement(delta) {
    const direction = { x: 0, z: 0 };
    if (keys.w || keys.arrowup) direction.z -= 1;
    if (keys.s || keys.arrowdown) direction.z += 1;
    if (keys.a || keys.arrowleft) direction.x -= 1;
    if (keys.d || keys.arrowright) direction.x += 1;

    const hasMovement = direction.x !== 0 || direction.z !== 0;
    if (hasMovement) {
      const speed = 7.2;
      const normalized = new Vector3(direction.x, 0, direction.z).normalize();
      playerGroup.position.x += normalized.x * speed * delta;
      playerGroup.position.z += normalized.z * speed * delta;
      playerGroup.position.x = MathUtils.clamp(playerGroup.position.x, -worldSize + 3, worldSize - 3);
      playerGroup.position.z = MathUtils.clamp(playerGroup.position.z, -worldSize + 3, worldSize - 3);
      playerGroup.rotation.y = Math.atan2(normalized.x, normalized.z);
      state.stamina = Math.max(0, state.stamina - delta * 8);
    } else {
      state.stamina = Math.min(100, state.stamina + delta * 14);
    }

    const nearest = getNearestRegion(playerGroup.position);
    if (nearest.name !== state.region) {
      state.region = nearest.name;
      currentRegionEl.textContent = nearest.name;
      if (nearest.name === 'Anandgram') {
        setMessage('Anandgram welcomes you with prayer and warm light. Explore the square to continue your quest.');
      } else if (nearest.name === 'Raj Mahal') {
        setMessage('Raj Mahal glows with palace lanterns and hidden chambers. A deeper truth waits inside.');
      } else if (nearest.name === 'Mythic Forest') {
        setMessage('The forest hums with spirit-song. Protect the sacred grove from the creeping dark.');
      } else if (nearest.name === 'Ancient Ruins') {
        setMessage('The ruins open beneath the moon. The starstone is near, but the shadows remain watchful.');
      }
      triggerQuestProgress();
    }

    const travelInfo = questItems[state.questIndex];
    if (travelInfo && state.region === 'Anandgram' && state.questIndex === 0) {
      setMessage('The village elders bless your steps. Adventure begins in the heart of Anandgram.');
    }
  }

  function updateEnemies(delta) {
    state.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      const toPlayer = new Vector3(playerGroup.position.x - enemy.mesh.position.x, 0, playerGroup.position.z - enemy.mesh.position.z);
      const distance = toPlayer.length();
      if (distance > 0.001) {
        toPlayer.normalize();
        const step = enemy.speed * delta;
        enemy.mesh.position.x += toPlayer.x * step;
        enemy.mesh.position.z += toPlayer.z * step;
      }

      if (distance < 2.2) {
        state.health = Math.max(0, state.health - 7 * delta);
        if (state.health <= 0) {
          state.health = 100;
          state.dharma = Math.max(0, state.dharma - 6);
          setMessage('You were struck, but the spirit of Dharma steadies you. Press onward.');
        }
      }
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = Math.min(0.033, (now - (animate.lastTime || now)) / 1000 || 0.016);
    animate.lastTime = now;

    state.attackCooldown = Math.max(0, state.attackCooldown - delta);
    handleMovement(delta);
    updateEnemies(delta);

    camera.position.x = MathUtils.lerp(camera.position.x, playerGroup.position.x + 7.5, 0.08);
    camera.position.y = MathUtils.lerp(camera.position.y, 10.2, 0.08);
    camera.position.z = MathUtils.lerp(camera.position.z, playerGroup.position.z + 9.8, 0.08);
    camera.lookAt(playerGroup.position.x, 1.2, playerGroup.position.z);

    regionMarkers.forEach((marker) => {
      const pulse = 1 + Math.sin(now * 0.002 + marker.position.x) * 0.08;
      marker.ring.scale.setScalar(pulse);
    });

    updateHud();
    renderer.render(scene, camera);
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    keys[key] = true;
    if (event.key === 'ArrowLeft') keys.arrowleft = true;
    if (event.key === 'ArrowRight') keys.arrowright = true;
    if (event.key === 'ArrowUp') keys.arrowup = true;
    if (event.key === 'ArrowDown') keys.arrowdown = true;
    if (event.code === 'Space') {
      event.preventDefault();
      performAttack();
    }
  });

  document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keys[key] = false;
    if (event.key === 'ArrowLeft') keys.arrowleft = false;
    if (event.key === 'ArrowRight') keys.arrowright = false;
    if (event.key === 'ArrowUp') keys.arrowup = false;
    if (event.key === 'ArrowDown') keys.arrowdown = false;
  });

  regionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      movePlayerTo(button.dataset.region);
      updateHud();
    });
  });

  resumeButton?.addEventListener('click', () => {
    const current = getNearestRegion(playerGroup.position);
    setMessage(`The journey continues in ${current.name}. A new chapter is waiting to be written.`);
  });

  travelButton?.addEventListener('click', () => {
    const regionOrder = ['Anandgram', 'Raj Mahal', 'Mythic Forest', 'Ancient Ruins'];
    const currentIndex = regionOrder.indexOf(state.region);
    const nextIndex = (currentIndex + 1) % regionOrder.length;
    movePlayerTo(regionOrder[nextIndex]);
    updateHud();
  });

  const touchMap = {
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    attack: 'attack'
  };

  document.querySelectorAll('[data-control]').forEach((button) => {
    const control = button.dataset.control;
    const key = touchMap[control];

    button.addEventListener('pointerdown', () => {
      if (key === 'attack') {
        performAttack();
      } else {
        keys[key] = true;
      }
    });

    button.addEventListener('pointerup', () => {
      if (key !== 'attack') {
        keys[key] = false;
      }
    });

    button.addEventListener('pointerleave', () => {
      if (key !== 'attack') {
        keys[key] = false;
      }
    });
  });

  function onResize() {
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
    renderer.setSize(bounds.width, bounds.height, false);
  }

  window.addEventListener('resize', onResize);
  onResize();
  updateHud();
  setMessage(state.lastMessage);
  animate();
})();
