/**
 * HỆ THỐNG TRÒ CHƠI TƯƠNG TÁC:
 * "THỬ THÁCH DI SẢN THÁI NGUYÊN – KHÁM PHÁ VĂN HÓA, CHINH PHỤC TRI THỨC"
 * File: heritage-quiz.js
 */
(function (window, document) {
  'use strict';

  const DATA = window.HERITAGE_QUIZ_DATA;
  if (!DATA) return;

  /* ──── 1. TRẠNG THÁI TRÒ CHƠI (SINGLE STATE OBJECT) ──── */
  const state = {
    selectedQuiz: null,
    currentQuestionIndex: 0,
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    selectedAnswer: null,
    isAnswered: false,
    isQuizActive: false,
    revealedHints: 1
  };

  let dom = {};
  let lastFocusedElement = null;

  /* ──── 2. HỆ THỐNG PHÁO HOA HAI BÊN MÀN HÌNH (CANVAS 2D DUAL EMITTERS) ──── */
  const fireworks = (function () {
    let canvas = null;
    let ctx = null;
    let rafId = null;
    let rockets = [];
    let particles = [];
    let spawnTimers = [];
    const MAX_PARTICLES = 220;

    const PALETTE = [
      '#FFD700', // Vàng kim
      '#00FFCC', // Ngọc lục bảo sáng
      '#52B788', // Xanh di sản
      '#FF8FA3', // Hồng đào
      '#FFE066', // Vàng nắng
      '#74C69D', // Xanh cốm
      '#FFB703'  // Hổ phách
    ];

    function prefersReducedMotion() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function ensureCanvas() {
      if (!canvas) {
        canvas = document.getElementById('quiz-fireworks-canvas');
        if (canvas) {
          ctx = canvas.getContext('2d');
          resizeCanvas();
          window.addEventListener('resize', resizeCanvas, { passive: true });
        }
      }
      return Boolean(canvas && ctx);
    }

    function resizeCanvas() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createEmitterRocket(side) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isLeft = side === 'left';

      const startX = isLeft ? 12 : w - 12;
      const startY = h * (0.38 + Math.random() * 0.32);
      const targetX = isLeft
        ? w * (0.22 + Math.random() * 0.22)
        : w * (0.56 + Math.random() * 0.22);
      const targetY = h * (0.18 + Math.random() * 0.34);

      const frames = 22 + Math.floor(Math.random() * 10);
      const vx = (targetX - startX) / frames;
      const vy = (targetY - startY) / frames - 1.6;

      rockets.push({
        side: side,
        x: startX,
        y: startY,
        prevX: startX,
        prevY: startY,
        vx: vx,
        vy: vy,
        ay: 0.12,
        age: 0,
        maxAge: frames,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }

    function explodeRocket(r) {
      const availableSlots = Math.max(0, MAX_PARTICLES - particles.length);
      const count = Math.min(34, availableSlots);
      const baseColor = r.color;

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
        const speed = 2.2 + Math.random() * 5.2;
        const life = 38 + Math.floor(Math.random() * 26);
        particles.push({
          x: r.x,
          y: r.y,
          prevX: r.x,
          prevY: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.6,
          ax: 0,
          ay: 0.11 + Math.random() * 0.05,
          friction: 0.965,
          life: life,
          maxLife: life,
          alpha: 1,
          size: 2 + Math.random() * 2.4,
          color: Math.random() < 0.7 ? baseColor : PALETTE[Math.floor(Math.random() * PALETTE.length)],
          sparkle: Math.random() < 0.45
        });
      }
    }

    function tick() {
      if (!ctx || !canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Cập nhật các luồng phóng từ Left Emitter & Right Emitter
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.prevX = r.x;
        r.prevY = r.y;
        r.x += r.vx;
        r.y += r.vy;
        r.vy += r.ay;
        r.age++;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(r.prevX, r.prevY);
        ctx.lineTo(r.x, r.y);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2.6;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();

        if (r.age >= r.maxAge) {
          explodeRocket(r);
          rockets.splice(i, 1);
        }
      }

      // Cập nhật các hạt pháo hoa bung tia & rơi tự nhiên
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.prevX = p.x;
        p.prevY = p.y;
        p.vx = (p.vx + p.ax) * p.friction;
        p.vy = (p.vy + p.ay) * p.friction;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.alpha = Math.max(0, p.life / p.maxLife);

        if (p.life <= 0 || p.alpha <= 0.02) {
          particles.splice(i, 1);
          continue;
        }

        const flicker = p.sparkle ? (0.65 + Math.random() * 0.35) : 1;
        ctx.save();
        ctx.globalAlpha = p.alpha * flicker;
        ctx.beginPath();
        ctx.moveTo(p.prevX, p.prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFDF7';
        ctx.fill();
        ctx.restore();
      }

      if (rockets.length > 0 || particles.length > 0 || spawnTimers.length > 0) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
        rafId = null;
      }
    }

    function launchDualFireworks() {
      if (prefersReducedMotion()) return;
      if (!ensureCanvas()) return;
      clearTimers();

      const waves = [0, 160, 330];
      waves.forEach(function (delay) {
        const timerId = window.setTimeout(function () {
          createEmitterRocket('left');
          createEmitterRocket('right');
          const idx = spawnTimers.indexOf(timerId);
          if (idx !== -1) spawnTimers.splice(idx, 1);
          if (!rafId) {
            rafId = window.requestAnimationFrame(tick);
          }
        }, delay);
        spawnTimers.push(timerId);
      });

      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    }

    function clearTimers() {
      while (spawnTimers.length > 0) {
        window.clearTimeout(spawnTimers.pop());
      }
    }

    function stop() {
      clearTimers();
      rockets = [];
      particles = [];
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (ctx && canvas) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    return {
      launch: launchDualFireworks,
      stop: stop
    };
  })();

  /* ──── 3. HÀM TIỆN ÍCH ──── */
  function formatScore(num) {
    return Number(num || 0).toLocaleString('vi-VN');
  }

  function pad2(num) {
    return String(num).padStart(2, '0');
  }

  function getCurrentDeck() {
    if (!state.selectedQuiz) return null;
    return DATA.decks[state.selectedQuiz] || null;
  }

  function getCurrentQuestion() {
    const deck = getCurrentDeck();
    if (!deck || !deck.questions) return null;
    return deck.questions[state.currentQuestionIndex] || null;
  }

  function switchScreen(screenName) {
    const screens = {
      welcome: dom.screenWelcome,
      play: dom.screenPlay,
      result: dom.screenResult
    };
    Object.keys(screens).forEach(function (key) {
      if (screens[key]) {
        screens[key].classList.toggle('quiz-screen-active', key === screenName);
      }
    });

    if (dom.backToDecksBtn) {
      dom.backToDecksBtn.style.display = screenName === 'welcome' ? 'none' : 'inline-flex';
    }
    if (dom.bodyContainer) {
      dom.bodyContainer.scrollTop = 0;
    }
  }

  /* ──── 4. MỞ / ĐÓNG MODAL TRÒ CHƠI ──── */
  function openQuizModal() {
    if (!dom.modal) return;
    lastFocusedElement = document.activeElement;
    state.isQuizActive = true;
    showWelcomeScreen();

    dom.modal.classList.add('quiz-open');
    dom.modal.setAttribute('aria-hidden', 'false');

    window.setTimeout(function () {
      if (dom.closeBtn) dom.closeBtn.focus();
    }, 60);
  }

  function closeQuizModal() {
    if (!dom.modal) return;
    fireworks.stop();
    closeImageZoom();

    state.isQuizActive = false;
    state.isAnswered = false;
    dom.modal.classList.remove('quiz-open');
    dom.modal.setAttribute('aria-hidden', 'true');

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  /* ──── 5. MÀN HÌNH CHỌN BỘ CÂU HỎI ──── */
  function renderDeckSelectionCards() {
    if (!dom.deckGrid) return;
    const deckKeys = ['knowledge', 'image', 'hint'];
    dom.deckGrid.innerHTML = '';

    deckKeys.forEach(function (key) {
      const deck = DATA.decks[key];
      if (!deck) return;

      const card = document.createElement('article');
      card.className = 'quiz-deck-card';
      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', deck.title);

      card.innerHTML =
        '<div class="quiz-deck-top">' +
          '<div class="quiz-deck-badge-row">' +
            '<div class="quiz-deck-icon" aria-hidden="true"><i class="' + deck.icon + '"></i></div>' +
            '<span class="quiz-deck-count-pill">' + deck.questionCountLabel + '</span>' +
          '</div>' +
          '<div class="quiz-deck-label">' + deck.badge + '</div>' +
          '<h3 class="quiz-deck-title">' + deck.title + '</h3>' +
          '<p class="quiz-deck-desc">' + deck.description + '</p>' +
        '</div>' +
        '<div>' +
          '<div class="quiz-deck-meta">' +
            '<div class="quiz-deck-meta-item"><i class="fa-solid fa-list-check" aria-hidden="true"></i><span><strong>Số lượng:</strong> ' + deck.questionCountLabel + '</span></div>' +
            '<div class="quiz-deck-meta-item"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span><strong>Hình thức:</strong> ' + deck.formatLabel + '</span></div>' +
            '<div class="quiz-deck-meta-item"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i><span><strong>Độ khó:</strong> ' + deck.difficultyLabel + '</span></div>' +
          '</div>' +
          '<button type="button" class="quiz-start-btn" data-deck-id="' + deck.id + '">' +
            '<span>BẮT ĐẦU THỬ THÁCH</span>' +
            '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
          '</button>' +
        '</div>';

      card.addEventListener('click', function (e) {
        const btn = e.target.closest('.quiz-start-btn');
        if (btn || e.currentTarget === card) {
          startQuizDeck(deck.id);
        }
      });

      dom.deckGrid.appendChild(card);
    });
  }

  function showWelcomeScreen() {
    fireworks.stop();
    state.selectedQuiz = null;
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.selectedAnswer = null;
    state.isAnswered = false;
    state.revealedHints = 1;

    if (dom.headerSub) {
      dom.headerSub.textContent = DATA.meta.subtitle;
    }
    switchScreen('welcome');
  }

  /* ──── 6. BẮT ĐẦU & HIỂN THỊ CÂU HỎI ──── */
  function startQuizDeck(deckId) {
    const deck = DATA.decks[deckId];
    if (!deck) return;

    fireworks.stop();
    state.selectedQuiz = deckId;
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.selectedAnswer = null;
    state.isAnswered = false;
    state.revealedHints = 1;

    if (dom.headerSub) {
      dom.headerSub.textContent = deck.badge + ' · ' + deck.title;
    }

    switchScreen('play');
    renderCurrentQuestion();
  }

  function updateStatsBar() {
    const deck = getCurrentDeck();
    if (!deck) return;

    const total = deck.questions.length;
    const currentNum = state.currentQuestionIndex + 1;
    const answeredCount = state.isAnswered ? currentNum : state.currentQuestionIndex;
    const progressPercent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

    if (dom.statQuestion) {
      dom.statQuestion.textContent = 'CÂU HỎI ' + pad2(currentNum) + ' / ' + pad2(total);
    }
    if (dom.statScore) {
      dom.statScore.textContent = 'ĐIỂM SỐ: ' + formatScore(state.score);
    }
    if (dom.progressLabel) {
      dom.progressLabel.textContent = 'PROGRESS: ' + progressPercent + '%';
    }
    if (dom.progressFill) {
      dom.progressFill.style.width = progressPercent + '%';
    }
  }

  function renderCurrentQuestion() {
    const deck = getCurrentDeck();
    const q = getCurrentQuestion();
    if (!deck || !q) return;

    fireworks.stop();
    state.selectedAnswer = null;
    state.isAnswered = false;
    state.revealedHints = 1;

    if (dom.stageCard) {
      dom.stageCard.classList.remove('quiz-shake');
    }

    updateStatsBar();

    // Câu hỏi
    if (dom.questionTag) {
      dom.questionTag.innerHTML = '<i class="' + deck.icon + '" aria-hidden="true"></i> <span>' + deck.title + ' · Câu ' + q.id + '</span>';
    }
    if (dom.questionText) {
      dom.questionText.textContent = q.question;
    }

    // Khu vực hình ảnh (Bộ 2)
    if (dom.imageShowcase) {
      if (deck.id === 'image' && q.image) {
        dom.imageShowcase.style.display = 'block';
        dom.questionImg.classList.remove('quiz-img-loaded');
        dom.questionImg.src = q.image;
        dom.questionImg.alt = q.imageAlt || q.question;
        dom.imageCaption.textContent = q.caption || q.imageAlt || '';
      } else {
        dom.imageShowcase.style.display = 'none';
        dom.questionImg.removeAttribute('src');
      }
    }

    // Khu vực gợi ý (Bộ 3)
    if (dom.hintsPanel) {
      if (deck.id === 'hint' && Array.isArray(q.hints)) {
        dom.hintsPanel.style.display = 'block';
        renderHintsList(q);
      } else {
        dom.hintsPanel.style.display = 'none';
      }
    }

    // Khu vực 4 phương án A, B, C, D
    renderOptions(q);

    // Ẩn khung phản hồi
    if (dom.feedbackBanner) {
      dom.feedbackBanner.className = 'quiz-feedback-banner';
    }
  }

  function renderHintsList(q) {
    if (!dom.hintsList || !dom.unlockHintBtn) return;
    dom.hintsList.innerHTML = '';

    const totalHints = q.hints.length;
    const countToShow = Math.min(state.revealedHints, totalHints);

    for (let i = 0; i < countToShow; i++) {
      const item = document.createElement('div');
      item.className = 'quiz-hint-item';
      item.innerHTML =
        '<span class="quiz-hint-badge">Gợi ý ' + (i + 1) + '/' + totalHints + '</span>' +
        '<div class="quiz-hint-text">' + q.hints[i] + '</div>';
      dom.hintsList.appendChild(item);
    }

    if (state.revealedHints < totalHints) {
      dom.unlockHintBtn.disabled = false;
      dom.unlockHintBtn.innerHTML =
        '<i class="fa-solid fa-key" aria-hidden="true"></i> ' +
        '<span>MỞ KHÓA GỢI Ý TIẾP THEO (' + state.revealedHints + '/' + totalHints + ')</span>';
    } else {
      dom.unlockHintBtn.disabled = true;
      dom.unlockHintBtn.innerHTML =
        '<i class="fa-solid fa-check-double" aria-hidden="true"></i> ' +
        '<span>ĐÃ MỞ ĐỦ 3 GỢI Ý</span>';
    }
  }

  function unlockNextHint() {
    const q = getCurrentQuestion();
    if (!q || !Array.isArray(q.hints)) return;
    if (state.revealedHints < q.hints.length) {
      state.revealedHints += 1;
      renderHintsList(q);
    }
  }

  function renderOptions(q) {
    if (!dom.optionsGrid) return;
    dom.optionsGrid.innerHTML = '';

    q.options.forEach(function (opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.dataset.optionId = opt.id;
      btn.setAttribute('aria-label', 'Phương án ' + opt.id + ': ' + opt.text);

      btn.innerHTML =
        '<span class="quiz-option-letter">' + opt.id + '</span>' +
        '<span class="quiz-option-text">' + opt.text + '</span>' +
        '<span class="quiz-option-status-icon" aria-hidden="true"></span>';

      btn.addEventListener('click', function () {
        handleSelectOption(opt.id);
      });

      dom.optionsGrid.appendChild(btn);
    });
  }

  /* ──── 7. XỬ LÝ CHỌN ĐÁP ÁN & HIỆU ỨNG ĐÚNG / SAI ──── */
  function handleSelectOption(optionId) {
    if (state.isAnswered) return;
    const deck = getCurrentDeck();
    const q = getCurrentQuestion();
    if (!deck || !q) return;

    state.isAnswered = true;
    state.selectedAnswer = optionId;

    const isCorrect = optionId === q.correctAnswer;
    const optionButtons = dom.optionsGrid.querySelectorAll('.quiz-option');

    optionButtons.forEach(function (btn) {
      btn.disabled = true;
      const id = btn.dataset.optionId;
      const iconEl = btn.querySelector('.quiz-option-status-icon');

      if (id === q.correctAnswer) {
        btn.classList.add('quiz-correct');
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
      } else if (id === optionId && !isCorrect) {
        btn.classList.add('quiz-wrong');
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
      }
    });

    if (isCorrect) {
      state.score += DATA.meta.pointsPerCorrect;
      state.correctCount += 1;
      updateStatsBar();
      showFeedback(true, q);
      fireworks.launch();
    } else {
      state.wrongCount += 1;
      updateStatsBar();
      triggerWrongShake();
      showFeedback(false, q);
    }
  }

  function triggerWrongShake() {
    if (!dom.stageCard) return;
    dom.stageCard.classList.remove('quiz-shake');
    // Force reflow
    void dom.stageCard.offsetWidth;
    dom.stageCard.classList.add('quiz-shake');
  }

  function showFeedback(isCorrect, q) {
    if (!dom.feedbackBanner) return;
    const deck = getCurrentDeck();
    const isLastQuestion = deck && state.currentQuestionIndex >= deck.questions.length - 1;
    const nextBtnLabel = isLastQuestion ? 'XEM TỔNG KẾT' : 'CÂU TIẾP THEO';

    dom.feedbackBanner.className = 'quiz-feedback-banner quiz-feedback-visible ' +
      (isCorrect ? 'quiz-feedback-correct' : 'quiz-feedback-wrong');

    if (isCorrect) {
      const messages = DATA.congratulations;
      const randomCongrats = messages[Math.floor(Math.random() * messages.length)];
      dom.feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
      dom.feedbackTitle.textContent = 'CHÍNH XÁC!';
      dom.feedbackMsg.textContent = randomCongrats;
      dom.feedbackAnswerReveal.textContent = q.explanation ? q.explanation : '';
      dom.feedbackAnswerReveal.style.display = q.explanation ? 'block' : 'none';
    } else {
      const correctOpt = q.options.find(function (o) { return o.id === q.correctAnswer; });
      const correctText = q.answer || (correctOpt ? (correctOpt.id + '. ' + correctOpt.text) : q.correctAnswer);

      dom.feedbackIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
      dom.feedbackTitle.textContent = 'CHƯA CHÍNH XÁC!';
      dom.feedbackMsg.textContent = 'Đừng lo lắng! Hãy tiếp tục khám phá và thử sức ở câu hỏi tiếp theo.';
      dom.feedbackAnswerReveal.textContent = 'Đáp án đúng: ' + correctText + (q.explanation ? ' — ' + q.explanation : '');
      dom.feedbackAnswerReveal.style.display = 'block';
    }

    if (dom.nextQuestionBtn) {
      dom.nextQuestionBtn.innerHTML =
        '<span>' + nextBtnLabel + '</span>' +
        '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
      dom.nextQuestionBtn.focus();
    }
  }

  function goToNextQuestion() {
    const deck = getCurrentDeck();
    if (!deck) return;

    fireworks.stop();

    if (state.currentQuestionIndex < deck.questions.length - 1) {
      state.currentQuestionIndex += 1;
      renderCurrentQuestion();
    } else {
      showResultScreen();
    }
  }

  /* ──── 8. MÀN HÌNH TỔNG KẾT & DANH HIỆU ──── */
  function getRankByPercent(percent) {
    for (let i = 0; i < DATA.ranks.length; i++) {
      if (percent >= DATA.ranks[i].minPercent) {
        return DATA.ranks[i];
      }
    }
    return DATA.ranks[DATA.ranks.length - 1];
  }

  function showResultScreen() {
    const deck = getCurrentDeck();
    if (!deck) return;

    const total = deck.questions.length;
    const percent = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;
    const rank = getRankByPercent(percent);

    if (dom.resultDeckName) {
      dom.resultDeckName.textContent = 'Bộ câu hỏi: ' + deck.title + ' (' + deck.badge + ')';
    }
    if (dom.rankEmblem) {
      dom.rankEmblem.innerHTML = '<i class="' + rank.icon + '" aria-hidden="true"></i>';
    }
    if (dom.rankBadge) {
      dom.rankBadge.innerHTML = '<i class="fa-solid fa-award" aria-hidden="true"></i> <span>DANH HIỆU: ' + rank.title + '</span>';
    }
    if (dom.rankDesc) {
      dom.rankDesc.textContent = rank.description;
    }

    if (dom.sumTotal) dom.sumTotal.textContent = total + ' câu hỏi';
    if (dom.sumCorrect) dom.sumCorrect.textContent = state.correctCount + ' câu đúng';
    if (dom.sumWrong) dom.sumWrong.textContent = state.wrongCount + ' câu sai';
    if (dom.sumScore) dom.sumScore.textContent = formatScore(state.score) + ' điểm';
    if (dom.sumAccuracy) dom.sumAccuracy.textContent = percent + '%';

    switchScreen('result');

    if (percent >= 50) {
      fireworks.launch();
    }
  }

  /* ──── 9. PHÓNG TO HÌNH ẢNH CÂU HỎI ──── */
  function openImageZoom() {
    if (!dom.questionImg || !dom.questionImg.src || !dom.zoomOverlay) return;
    dom.zoomImg.src = dom.questionImg.src;
    dom.zoomImg.alt = dom.questionImg.alt || 'Hình ảnh câu hỏi phóng to';
    dom.zoomOverlay.classList.add('quiz-zoom-open');
    dom.zoomOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeImageZoom() {
    if (!dom.zoomOverlay) return;
    dom.zoomOverlay.classList.remove('quiz-zoom-open');
    dom.zoomOverlay.setAttribute('aria-hidden', 'true');
  }

  /* ──── 10. KHỞI TẠO SỰ KIỆN (ĐĂNG KÝ 1 LẦN DUY NHẤT) ──── */
  function cacheDom() {
    dom = {
      fabBtn: document.getElementById('heritage-quiz-fab'),
      modal: document.getElementById('heritage-quiz-modal'),
      bodyContainer: document.getElementById('quiz-body-container'),
      headerSub: document.getElementById('quiz-header-sub'),
      backToDecksBtn: document.getElementById('quiz-back-decks-btn'),
      closeBtn: document.getElementById('quiz-close-btn'),

      screenWelcome: document.getElementById('quiz-screen-welcome'),
      screenPlay: document.getElementById('quiz-screen-play'),
      screenResult: document.getElementById('quiz-screen-result'),

      deckGrid: document.getElementById('quiz-deck-grid'),

      statQuestion: document.getElementById('quiz-stat-question'),
      statScore: document.getElementById('quiz-stat-score'),
      progressLabel: document.getElementById('quiz-progress-label'),
      progressFill: document.getElementById('quiz-progress-fill'),

      stageCard: document.getElementById('quiz-stage-card'),
      questionTag: document.getElementById('quiz-question-tag'),
      questionText: document.getElementById('quiz-question-text'),

      imageShowcase: document.getElementById('quiz-image-showcase'),
      imageFrame: document.getElementById('quiz-image-frame'),
      questionImg: document.getElementById('quiz-question-img'),
      imageCaption: document.getElementById('quiz-image-caption'),

      hintsPanel: document.getElementById('quiz-hints-panel'),
      hintsList: document.getElementById('quiz-hints-list'),
      unlockHintBtn: document.getElementById('quiz-unlock-hint-btn'),

      optionsGrid: document.getElementById('quiz-options-grid'),

      feedbackBanner: document.getElementById('quiz-feedback-banner'),
      feedbackIcon: document.getElementById('quiz-feedback-icon'),
      feedbackTitle: document.getElementById('quiz-feedback-title'),
      feedbackMsg: document.getElementById('quiz-feedback-msg'),
      feedbackAnswerReveal: document.getElementById('quiz-feedback-answer-reveal'),
      nextQuestionBtn: document.getElementById('quiz-next-question-btn'),

      resultDeckName: document.getElementById('quiz-result-deck-name'),
      rankEmblem: document.getElementById('quiz-rank-emblem'),
      rankBadge: document.getElementById('quiz-rank-badge'),
      rankDesc: document.getElementById('quiz-rank-desc'),
      sumTotal: document.getElementById('quiz-sum-total'),
      sumCorrect: document.getElementById('quiz-sum-correct'),
      sumWrong: document.getElementById('quiz-sum-wrong'),
      sumScore: document.getElementById('quiz-sum-score'),
      sumAccuracy: document.getElementById('quiz-sum-accuracy'),

      replayBtn: document.getElementById('quiz-btn-replay'),
      changeDeckBtn: document.getElementById('quiz-btn-change-deck'),
      returnSiteBtn: document.getElementById('quiz-btn-return-site'),

      zoomOverlay: document.getElementById('quiz-img-zoom-overlay'),
      zoomImg: document.getElementById('quiz-img-zoom-target'),
      zoomCloseBtn: document.getElementById('quiz-img-zoom-close')
    };
  }

  function bindEvents() {
    if (dom.fabBtn) {
      dom.fabBtn.addEventListener('click', openQuizModal);
    }
    if (dom.closeBtn) {
      dom.closeBtn.addEventListener('click', closeQuizModal);
    }
    if (dom.backToDecksBtn) {
      dom.backToDecksBtn.addEventListener('click', showWelcomeScreen);
    }
    if (dom.modal) {
      dom.modal.addEventListener('click', function (e) {
        if (e.target === dom.modal) {
          closeQuizModal();
        }
      });
    }
    if (dom.questionImg) {
      dom.questionImg.addEventListener('load', function () {
        dom.questionImg.classList.add('quiz-img-loaded');
      });
    }
    if (dom.imageFrame) {
      dom.imageFrame.addEventListener('click', openImageZoom);
    }
    if (dom.zoomOverlay) {
      dom.zoomOverlay.addEventListener('click', function (e) {
        if (e.target === dom.zoomOverlay || e.target === dom.zoomCloseBtn || e.target.closest('#quiz-img-zoom-close')) {
          closeImageZoom();
        }
      });
    }
    if (dom.unlockHintBtn) {
      dom.unlockHintBtn.addEventListener('click', unlockNextHint);
    }
    if (dom.nextQuestionBtn) {
      dom.nextQuestionBtn.addEventListener('click', goToNextQuestion);
    }
    if (dom.replayBtn) {
      dom.replayBtn.addEventListener('click', function () {
        if (state.selectedQuiz) {
          startQuizDeck(state.selectedQuiz);
        }
      });
    }
    if (dom.changeDeckBtn) {
      dom.changeDeckBtn.addEventListener('click', showWelcomeScreen);
    }
    if (dom.returnSiteBtn) {
      dom.returnSiteBtn.addEventListener('click', closeQuizModal);
    }

    // Điều hướng bàn phím (ESC để đóng phóng to ảnh hoặc đóng Modal trò chơi)
    document.addEventListener('keydown', function (e) {
      if (!state.isQuizActive) return;

      if (e.key === 'Escape') {
        if (dom.zoomOverlay && dom.zoomOverlay.classList.contains('quiz-zoom-open')) {
          e.stopPropagation();
          closeImageZoom();
          return;
        }
        e.stopPropagation();
        closeQuizModal();
      }
    });
  }

  function init() {
    cacheDom();
    if (!dom.modal) return;
    renderDeckSelectionCards();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);

