// ── 카드 데이터 ──
const ALL_PAIRS = [
  { id: 'doraji',         name: '도라지꽃',    photo: '도라지꽃-실사 1.png',       illus: '도라지꽃-토비 1.png' },
  { id: 'maendurami',     name: '맨드라미',    photo: '맨드라비-실사 1.png',       illus: '맨드라미-토비 1.png' },
  { id: 'seokryu-yellow', name: '석류꽃(노랑)', photo: '석류꽃(노랑)-실사 1.png',  illus: '석류꽃(노랑)-토비 1.png' },
  { id: 'seokryu-pink',   name: '석류꽃(분홍)', photo: '석류꽃(분홍)-실사 1.png',  illus: '석류꽃(분홍)-토비 1.png' },
  { id: 'yeonil-lg',      name: '연잎(대)',    photo: '연잎(대)-실사.png',         illus: '연잎(대)-토비 1.png' },
  { id: 'yeonil-md',      name: '연잎(중)',    photo: '연잎(중)-실사.png',         illus: '연잎(중)-토비 1.png' },
  { id: 'yeonil-sm',      name: '연잎(소)',    photo: '연잎(소)-실사.png',         illus: '연잎(소)-토비 1.png' },
];

const STAGE_CONFIG = {
  1: { pairCount: 3, label: '1단계', timeLimit: 10, cols: 2, rows: 3, previewTime: 2000, maxCardW: 140 },
  2: { pairCount: 4, label: '2단계', timeLimit: 15, cols: 2, rows: 4, previewTime: 3000, maxCardW: 125 },
  3: { pairCount: 6, label: '3단계', timeLimit: 25, cols: 3, rows: 4, previewTime: 5000 },
};

// ── Fisher-Yates 셔플 ──
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 게임 전체 쌍 순서 (startStage(1) 시 초기화) ──
let gamePairs = [];

function initGamePairs() {
  gamePairs = shuffle(ALL_PAIRS);
}

// ── 스테이지용 카드 배열 생성 ──
// 1단계: gamePairs[0..2], 2단계: gamePairs[3..6] → 합쳐서 7종 모두 등장
// 3단계: 전체 다시 섞어 6쌍
function buildStageCards(stage) {
  let selectedPairs;

  if (stage === 1) {
    selectedPairs = gamePairs.slice(0, 3);
  } else if (stage === 2) {
    selectedPairs = gamePairs.slice(3, 7);
  } else {
    selectedPairs = shuffle(ALL_PAIRS).slice(0, 6);
  }

  const cards = selectedPairs.flatMap((pair, i) => [
    { uid: `${pair.id}-photo-${i}`, pairId: pair.id, name: pair.name, image: pair.photo, isFlipped: false, isMatched: false },
    { uid: `${pair.id}-illus-${i}`, pairId: pair.id, name: pair.name, image: pair.illus, isFlipped: false, isMatched: false },
  ]);

  return shuffle(cards);
}

// ── 전체 이미지 사전 캐싱 (페이지 로드 시) ──
function preloadAllGameImages() {
  ALL_PAIRS.forEach(pair => {
    new Image().src = pair.photo;
    new Image().src = pair.illus;
  });
}
preloadAllGameImages();

// ── 스테이지 카드 이미지 로딩 완료 대기 ──
function waitForImages(cards) {
  const loads = cards.map(card => new Promise(resolve => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = card.image;
  }));
  const timeout = new Promise(resolve => setTimeout(resolve, 5000));
  return Promise.race([Promise.all(loads), timeout]);
}

// ── 간단한 로직 검증 ──
console.assert(shuffle([1, 2, 3]).length === 3, 'shuffle: length preserved');
console.assert(buildStageCards(1).length === 6,  'stage 1: 6 cards');
console.assert(buildStageCards(2).length === 8,  'stage 2: 8 cards');
console.assert(buildStageCards(3).length === 12, 'stage 3: 12 cards');
console.log('✅ card data tests passed');

// ── 게임 상태 ──
const state = {
  stage: 1,
  cards: [],
  flipped: [],     // 현재 뒤집힌 카드 uid (최대 2개)
  matched: [],     // 매칭된 pairId 목록
  isLocked: false, // 애니메이션 중 클릭 방지
  timerId: null,   // setInterval ID
  timeLeft: 0,     // 남은 초
};

// ── DOM 참조 ──
const $grid          = document.getElementById('grid');
const $stageLabel    = document.getElementById('stage-label');
const $stageDots     = document.querySelectorAll('.dot');
const $pairCount     = document.getElementById('pair-count');
const $timerBar      = document.getElementById('timer-bar');
const $stageClear    = document.getElementById('stage-clear');
const $clearTitle    = document.getElementById('clear-title');
const $clearSub      = document.getElementById('clear-sub');
const $nextBtn       = document.getElementById('next-btn');
const $gameComplete  = document.getElementById('game-complete');
const $shareBtn      = document.getElementById('share-btn');
const $restartBtn    = document.getElementById('restart-btn');
const $gameOver      = document.getElementById('game-over');
const $retryBtn      = document.getElementById('retry-btn');

// ── 카드 DOM 생성 ──
function createCardEl(card) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.uid = card.uid;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const back = document.createElement('div');
  back.className = 'card-back';

  const front = document.createElement('div');
  front.className = 'card-front';
  const img = document.createElement('img');
  img.src = card.image;
  img.alt = card.name;
  img.loading = 'lazy';
  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  el.appendChild(inner);

  el.addEventListener('click', () => onCardClick(card.uid));
  return el;
}

// ── 그리드 렌더링 ──
function renderGrid(cards) {
  $grid.innerHTML = '';
  cards.forEach(card => $grid.appendChild(createCardEl(card)));
}

// ── 헤더 업데이트 ──
function updateHeader() {
  const config = STAGE_CONFIG[state.stage];
  $stageLabel.textContent = config.label;
  $pairCount.textContent  = `${state.matched.length} / ${config.pairCount}`;
  $stageDots.forEach((dot, i) => {
    dot.className = 'dot';
    if (i + 1 < state.stage)      dot.classList.add('done');
    else if (i + 1 === state.stage) dot.classList.add('active');
  });
}

// ── 카드 엘리먼트 가져오기 ──
function getCardEl(uid) {
  return $grid.querySelector(`[data-uid="${uid}"]`);
}

// ── 카드 뒤집기 (시각적) ──
function flipCard(uid, faceUp) {
  const el = getCardEl(uid);
  if (!el) return;
  if (faceUp) el.classList.add('flipped');
  else        el.classList.remove('flipped');
}

// ── 매칭 완료 표시 ──
function markMatched(uid1, uid2) {
  [uid1, uid2].forEach(uid => {
    const el = getCardEl(uid);
    if (el) {
      el.classList.remove('selected');
      el.classList.add('matched');
    }
  });
}

// ── 카드 클릭 핸들러 ──
function onCardClick(uid) {
  if (state.isLocked) return;

  const card = state.cards.find(c => c.uid === uid);
  if (!card || card.isFlipped || card.isMatched) return;
  if (state.flipped.length >= 2) return;

  card.isFlipped = true;
  flipCard(uid, true);
  getCardEl(uid).classList.add('selected');
  state.flipped.push(uid);

  if (state.flipped.length === 2) {
    checkMatch();
  }
}

// ── 매칭 판정 ──
function checkMatch() {
  const [uid1, uid2] = state.flipped;
  const card1 = state.cards.find(c => c.uid === uid1);
  const card2 = state.cards.find(c => c.uid === uid2);
  const isMatch = card1.pairId === card2.pairId && uid1 !== uid2;

  if (isMatch) {
    card1.isMatched = true;
    card2.isMatched = true;
    markMatched(uid1, uid2);
    state.matched.push(card1.pairId);
    state.flipped = [];
    updateHeader();

    if (state.matched.length === STAGE_CONFIG[state.stage].pairCount) {
      setTimeout(showStageClear, 500);
    }
  } else {
    state.isLocked = true;
    setTimeout(() => {
      [uid1, uid2].forEach(uid => {
        const el = getCardEl(uid);
        if (el) {
          el.classList.remove('selected');
          el.classList.remove('flipped');
        }
        const c = state.cards.find(c => c.uid === uid);
        if (c) c.isFlipped = false;
      });
      state.flipped = [];
      state.isLocked = false;
    }, 700);
  }
}

// ── 타이머 시작 ──
function startTimer() {
  stopTimer();
  const config = STAGE_CONFIG[state.stage];
  state.timeLeft = config.timeLimit;
  updateTimerBar();

  state.timerId = setInterval(() => {
    state.timeLeft -= 0.1;
    updateTimerBar();

    if (state.timeLeft <= 0) {
      stopTimer();
      $timerBar.classList.add('flash');
      setTimeout(showGameOver, 400);
    }
  }, 100);
}

// ── 타이머 정지 ──
function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

// ── 타이머 바 시각 업데이트 ──
function updateTimerBar() {
  const config = STAGE_CONFIG[state.stage];
  const pct = Math.max(0, state.timeLeft / config.timeLimit) * 100;
  $timerBar.style.width = pct + '%';
  $timerBar.classList.remove('warning', 'danger');
  if (pct <= 20)      $timerBar.classList.add('danger');
  else if (pct <= 50) $timerBar.classList.add('warning');
}

// ── 그리드 레이아웃 계산 (4:5 비율 유지, 뷰포트 내 수용) ──
function setGridLayout(stage) {
  const { cols, rows, maxCardW } = STAGE_CONFIG[stage];
  const gap      = 8;
  const paddingH = 16; // 좌우 여백
  const paddingV = 16; // 상하 여백
  const availH  = window.innerHeight - 48; // header(44) + timer(4)
  const availW  = Math.min(window.innerWidth, 480) - paddingH * 2;

  // 높이 기준 카드 폭 (4:5 비율)
  const cardWFromH = ((availH - gap * (rows - 1) - paddingV * 2) / rows) * (4 / 5);
  // 너비 기준 카드 폭
  const cardWFromW = (availW - gap * (cols - 1)) / cols;

  let cardW = Math.min(cardWFromH, cardWFromW);
  if (maxCardW) cardW = Math.min(cardW, maxCardW);
  const cardH = cardW * (5 / 4);

  $grid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
  $grid.style.gridTemplateRows    = `repeat(${rows}, ${cardH}px)`;
}

// ── 스테이지 시작 ──
async function startStage(stage) {
  if (stage === 1) initGamePairs(); // 새 게임마다 7쌍 순서 확정
  state.stage    = stage;
  state.cards    = buildStageCards(stage);
  state.flipped  = [];
  state.matched  = [];
  state.isLocked = true;

  // 오버레이 숨기기
  $stageClear.classList.add('hidden');
  $gameComplete.classList.add('hidden');
  $gameOver.classList.add('hidden');

  // 타이머 바 리셋
  stopTimer();
  $timerBar.style.transition = 'none';
  $timerBar.style.width = '100%';
  $timerBar.className = '';

  updateHeader();
  setGridLayout(stage);
  renderGrid(state.cards);

  // 이미지 로딩 완료 후 미리보기 시작
  await waitForImages(state.cards);

  const { previewTime } = STAGE_CONFIG[stage];

  $grid.classList.add('preview');
  state.cards.forEach(card => {
    flipCard(card.uid, true);
    card.isFlipped = true;
  });

  // 미리보기 타이머 바 카운트다운
  $timerBar.style.transition = 'none';
  $timerBar.style.width = '100%';
  $timerBar.className = '';
  $timerBar.offsetWidth; // force reflow
  $timerBar.style.transition = `width ${previewTime}ms linear`;
  $timerBar.style.width = '0%';

  // 미리보기 종료 후 뒤집기 + 게임 타이머 시작
  setTimeout(() => {
    state.cards.forEach(card => {
      flipCard(card.uid, false);
      card.isFlipped = false;
    });
    requestAnimationFrame(() => {
      $grid.classList.remove('preview');
      $timerBar.style.transition = '';
      state.isLocked = false;
      startTimer();
    });
  }, previewTime);
}

// ── 스테이지 클리어 ──
function showStageClear() {
  stopTimer();
  $timerBar.style.width = '100%';
  $timerBar.className = '';

  const config = STAGE_CONFIG[state.stage];
  $clearTitle.textContent = `${config.label} 완료`;
  $clearSub.textContent   = `${config.pairCount}쌍을 모두 찾았어요`;

  if (state.stage < 3) {
    $nextBtn.textContent = '다음 단계';
    $nextBtn.onclick = () => startStage(state.stage + 1);
    $stageClear.classList.remove('hidden');
  } else {
    showGameComplete();
  }
}

// ── 게임 완료 ──
function showGameComplete() {
  $gameComplete.classList.remove('hidden');
}

// ── 게임 오버 ──
function showGameOver() {
  stopTimer();
  state.isLocked = true;
  $gameOver.classList.remove('hidden');
}

$shareBtn.onclick = async () => {
  const response = await fetch('share.png');
  const blob = await response.blob();
  const file = new File([blob], 'baram-botany.png', { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: '바람식물도감' });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baram-botany.png';
    a.click();
    URL.revokeObjectURL(url);
  }
};

// ── 버튼 이벤트 ──
$restartBtn.onclick = () => startStage(1);
$retryBtn.onclick   = () => startStage(1);

// ── 게임 시작 ──
startStage(1);
