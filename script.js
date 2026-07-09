/**
 * UGC Net PWA Logic
 * Pure Vanilla ES6+ JavaScript - Production Ready
 */

// Global State
let topicsList = [];
let allQuestionsCache = {}; // Cache: { topicKey: [questions] }
let isSearchIndexBuilt = false;
let searchIndex = [];
let topicSortOrder = 'desc'; // 'desc' = highest first, 'asc' = lowest first
let lastKnownCounts = {};    // remember counts across re-sorts

// Name Map for Hindi Translation
const topicNamesMap = {
  "acharya-shukla": "आचार्य रामचंद्र शुक्ल का इतिहास",
  "mishrabandhu": "मिश्रबंधु विनोद",
  "bhaktikal": "भक्तिकाल",
  "ritikal": "रीतिकाल"
};

// ==========================================================================
// 1. PWA MANAGER MODULE
// ==========================================================================
const PWAManager = {
  init() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => console.log('Service Worker registered successfully:', reg.scope))
          .catch(err => console.error('Service Worker registration failed:', err));
      });
    }

    // Monitor connectivity status
    window.addEventListener('online', this.updateOnlineStatus.bind(this));
    window.addEventListener('offline', this.updateOnlineStatus.bind(this));
    this.updateOnlineStatus();
  },

  updateOnlineStatus() {
    const offlineBanner = document.getElementById('offline-banner');
    if (navigator.onLine) {
      offlineBanner.style.display = 'none';
      UIRenderer.showToast('📶 आप ऑनलाइन हैं।', 'success');
    } else {
      offlineBanner.style.display = 'block';
      UIRenderer.showToast('📴 आप ऑफलाइन हैं। कैश्ड डाटा उपलब्ध है।', 'warning');
    }
  }
};

// ==========================================================================
// 2. THEME MANAGER MODULE
// ==========================================================================
const ThemeManager = {
  init() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const savedContrast = localStorage.getItem('contrast') || 'false';
    
    this.setTheme(savedTheme);
    this.setContrast(savedContrast === 'true');

    document.getElementById('theme-toggle').addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(nextTheme);
    });

    document.getElementById('contrast-toggle').addEventListener('click', () => {
      const currentContrast = document.documentElement.getAttribute('data-contrast') === 'true';
      this.setContrast(!currentContrast);
    });
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update SVG icon status inside buttons
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }
  },

  setContrast(isHighContrast) {
    document.documentElement.setAttribute('data-contrast', isHighContrast ? 'true' : 'false');
    localStorage.setItem('contrast', isHighContrast ? 'true' : 'false');
  }
};

// ==========================================================================
// 3. STATISTICS MANAGER MODULE
// ==========================================================================
const StatsManager = {
  defaultStats: {
    solved: 0,         // correct answers count
    attempts: 0,       // total questions attempted
    quizzesCompleted: 0, // total completed tests
    accuracy: 0,
    bestScore: 0,      // high score in a single quiz
    streak: 0,
    highestStreak: 0,
    xp: 0,
    level: 1,
    lastSolvedDate: null // String YYYY-MM-DD
  },

  getStats() {
    const data = localStorage.getItem('ugc_stats');
    if (!data) {
      this.saveStats(this.defaultStats);
      return { ...this.defaultStats };
    }
    return JSON.parse(data);
  },

  saveStats(stats) {
    localStorage.setItem('ugc_stats', JSON.stringify(stats));
  },

  // Calculate stats values
  awardXP(actionType, correctCount = 0, totalQuestions = 0) {
    const stats = this.getStats();
    let gainedXP = 0;

    if (actionType === 'correct_answer') {
      gainedXP = 10;
      stats.solved += 1;
    } else if (actionType === 'quiz_completed') {
      gainedXP = 50;
      stats.quizzesCompleted += 1;
      
      // Calculate perfect score bonus
      if (correctCount === totalQuestions && totalQuestions > 0) {
        gainedXP += 100; // Perfect score bonus
        UIRenderer.showToast('🏆 शत-प्रतिशत स्कोर! +100 XP बोनस!', 'success');
      }

      // Update best score
      if (correctCount > stats.bestScore) {
        stats.bestScore = correctCount;
      }

      // Handle daily streak
      this.updateStreak(stats);
    }

    stats.attempts += (actionType === 'correct_answer' ? 1 : 0);
    stats.xp += gainedXP;

    // Calculate level formula: Level = floor(XP / 100) + 1
    const oldLevel = stats.level;
    const newLevel = Math.floor(stats.xp / 100) + 1;
    
    if (newLevel > oldLevel) {
      stats.level = newLevel;
      setTimeout(() => {
        UIRenderer.showLevelUp(newLevel);
      }, 500);
    }

    // Update Accuracy: correct / attempted
    const attemptsCount = stats.attempts || 1;
    stats.accuracy = Math.round((stats.solved / attemptsCount) * 100);

    this.saveStats(stats);
    UIRenderer.renderStats();
    
    return gainedXP;
  },

  updateStreak(stats) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    if (!stats.lastSolvedDate) {
      stats.streak = 1;
    } else {
      const last = new Date(stats.lastSolvedDate).setHours(0,0,0,0);
      const curr = new Date(todayStr).setHours(0,0,0,0);
      const oneDayMs = 24 * 60 * 60 * 1000;
      const diff = curr - last;

      if (diff === oneDayMs) {
        stats.streak += 1;
      } else if (diff > oneDayMs) {
        stats.streak = 1; // broken streak
      }
      // If diff is 0 (solved on same day), streak doesn't change
    }

    stats.lastSolvedDate = todayStr;
    if (stats.streak > stats.highestStreak) {
      stats.highestStreak = stats.streak;
    }
  }
};

// ==========================================================================
// 4. FAVORITES MANAGER MODULE
// ==========================================================================
const FavoritesManager = {
  getFavorites() {
    const favs = localStorage.getItem('ugc_favorites');
    return favs ? JSON.parse(favs) : [];
  },

  saveFavorites(favs) {
    localStorage.setItem('ugc_favorites', JSON.stringify(favs));
    UIRenderer.renderFavorites();
  },

  addFavorite(question) {
    const favs = this.getFavorites();
    if (!favs.some(f => f.q === question.q)) {
      favs.push(question);
      this.saveFavorites(favs);
      UIRenderer.showToast('⭐ पसंदीदा सूची में जोड़ा गया', 'success');
    }
  },

  removeFavorite(qText) {
    let favs = this.getFavorites();
    favs = favs.filter(f => f.q !== qText);
    this.saveFavorites(favs);
    UIRenderer.showToast('🗑️ पसंदीदा सूची से हटाया गया', 'info');
  },

  isFavorite(qText) {
    const favs = this.getFavorites();
    return favs.some(f => f.q === qText);
  }
};

// ==========================================================================
// 4B. TEST HISTORY MANAGER MODULE (max 15 saved tests, FIFO)
// ==========================================================================
const TestHistoryManager = {
  MAX_TESTS: 10,

  getHistory() {
    const data = localStorage.getItem('ugc_test_history');
    return data ? JSON.parse(data) : [];
  },

  // Returns true on success, false if localStorage write failed
  saveHistory(list) {
    try {
      localStorage.setItem('ugc_test_history', JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  },

  // Quota-safe save: if storage is full, keep trimming the oldest entries
  // (down to a minimum of 1) and retry before giving up entirely.
  saveTest(testObj) {
    let list = this.getHistory();
    list.unshift(testObj); // newest first
    if (list.length > this.MAX_TESTS) {
      list.length = this.MAX_TESTS; // drop oldest beyond the cap
    }

    const attemptedLength = list.length;
    let ok = this.saveHistory(list);
    while (!ok && list.length > 1) {
      list.length = list.length - 1; // trim one more oldest entry and retry
      ok = this.saveHistory(list);
    }

    if (!ok) {
      // Even a single test won't fit — storage is essentially full elsewhere.
      return { success: false, count: this.getHistory().length, trimmedForSpace: false };
    }

    return { success: true, count: list.length, trimmedForSpace: list.length < attemptedLength };
  },

  deleteTest(id) {
    let list = this.getHistory();
    list = list.filter(t => t.id !== id);
    this.saveHistory(list);
  },

  clearAll() {
    localStorage.removeItem('ugc_test_history');
  },

  count() {
    return this.getHistory().length;
  }
};

// ==========================================================================
// 5. REVISION MANAGER MODULE
// ==========================================================================
const RevisionManager = {
  getWeakTopics() {
    const history = localStorage.getItem('ugc_topic_history');
    if (!history) return [];
    
    const parsed = JSON.parse(history);
    const weakTopics = [];
    
    for (const [topicKey, val] of Object.entries(parsed)) {
      if (val.totalAttempted >= 5) {
        const accuracy = Math.round((val.correct / val.totalAttempted) * 100);
        if (accuracy < 60) {
          weakTopics.push({
            key: topicKey,
            name: QuestionLoader.formatTopicName(topicKey),
            accuracy: accuracy
          });
        }
      }
    }
    return weakTopics.sort((a, b) => a.accuracy - b.accuracy);
  },

  updateTopicPerformance(topicKey, isCorrect) {
    if (!topicKey) return;
    const history = localStorage.getItem('ugc_topic_history') || '{}';
    const parsed = JSON.parse(history);
    
    if (!parsed[topicKey]) {
      parsed[topicKey] = { correct: 0, totalAttempted: 0 };
    }
    parsed[topicKey].totalAttempted += 1;
    if (isCorrect) {
      parsed[topicKey].correct += 1;
    }
    localStorage.setItem('ugc_topic_history', JSON.stringify(parsed));
  },

  getWrongQuestions() {
    const data = localStorage.getItem('ugc_revision_wrong');
    return data ? JSON.parse(data) : [];
  },

  getUnattemptedQuestions() {
    const data = localStorage.getItem('ugc_revision_unattempted');
    return data ? JSON.parse(data) : [];
  },

  saveWrongQuestion(qObj) {
    const list = this.getWrongQuestions();
    if (!list.some(item => item.q === qObj.q)) {
      list.push(qObj);
      localStorage.setItem('ugc_revision_wrong', JSON.stringify(list));
    }
  },

  removeWrongQuestion(qText) {
    let list = this.getWrongQuestions();
    list = list.filter(item => item.q !== qText);
    localStorage.setItem('ugc_revision_wrong', JSON.stringify(list));
  },

  saveUnattemptedQuestion(qObj) {
    const list = this.getUnattemptedQuestions();
    if (!list.some(item => item.q === qObj.q)) {
      list.push(qObj);
      localStorage.setItem('ugc_revision_unattempted', JSON.stringify(list));
    }
  },

  removeUnattemptedQuestion(qText) {
    let list = this.getUnattemptedQuestions();
    list = list.filter(item => item.q !== qText);
    localStorage.setItem('ugc_revision_unattempted', JSON.stringify(list));
  }
};

// ==========================================================================
// 6. QUESTION LOADER MODULE
// ==========================================================================
const QuestionLoader = {
  formatTopicName(topicFileKey) {
    // topicFileKey is a string like 'bhaktikal'
    // Find display name from topicsList first
    const found = topicsList.find(t => t.file === topicFileKey);
    if (found) return found.topic;
    if (topicNamesMap[topicFileKey]) return topicNamesMap[topicFileKey];
    // Fallback: acharya-shukla -> Acharya Shukla
    return topicFileKey
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  async fetchTopics() {
    try {
      const response = await fetch('./questions/topics.json');
      if (!response.ok) throw new Error('Failed to load topics.json');
      topicsList = await response.json();
      return topicsList;
    } catch (err) {
      console.error(err);
      UIRenderer.showToast('विषय सूची लोड करने में विफल!', 'error');
      return [];
    }
  },

  async loadQuestionsForTopic(topicFileKey) {
    // topicFileKey must always be a string (the filename without .json)
    const key = typeof topicFileKey === 'object' ? topicFileKey.file : topicFileKey;

    // Return from cache if already loaded
    if (allQuestionsCache[key]) {
      return allQuestionsCache[key];
    }

    try {
      const response = await fetch(`./questions/${key}.json`);
      if (!response.ok) throw new Error(`Failed to load questions for ${key}`);
      const list = await response.json();
      
      // Inject topic tag on each question for referencing later
      list.forEach(q => {
        q.topic = key;
      });

      allQuestionsCache[key] = list;
      return list;
    } catch (err) {
      console.error(err);
      UIRenderer.showToast(`विषय '${key}' के प्रश्न लोड करने में त्रुटि`, 'error');
      return [];
    }
  },

  // Asynchronous background load of counts and indices (lazy loading pattern)
  lazyLoadAllCounts() {
    const cachedCounts = JSON.parse(localStorage.getItem('ugc_topic_qcounts') || '{}');
    
    // Render initial topics using cache if available
    UIRenderer.renderTopicCards(cachedCounts);

    // Load sequentially in the background
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => this.backgroundLoadCounts(cachedCounts));
    } else {
      setTimeout(() => this.backgroundLoadCounts(cachedCounts), 1000);
    }
  },

  async backgroundLoadCounts(cachedCounts) {
    let updated = false;
    for (const topic of topicsList) {
      const key = topic.file;
      try {
        const questions = await this.loadQuestionsForTopic(key);
        if (cachedCounts[key] !== questions.length) {
          cachedCounts[key] = questions.length;
          updated = true;
        }
      } catch (e) {
        console.warn(`Failed bg-load for topic: ${key}`, e);
      }
    }

    if (updated) {
      localStorage.setItem('ugc_topic_qcounts', JSON.stringify(cachedCounts));
      UIRenderer.renderTopicCards(cachedCounts);
      UIRenderer.renderStats();
    }
  }
};

// ==========================================================================
// 7. SEARCH ENGINE MODULE
// ==========================================================================
const SearchEngine = {
  async buildSearchIndex() {
    if (isSearchIndexBuilt) return;
    
    const loader = document.getElementById('search-loader');
    if (loader) loader.style.display = 'flex';

    // Fetch and load all topics into memory
    for (const topic of topicsList) {
      await QuestionLoader.loadQuestionsForTopic(topic.file);
    }

    // Build the flat search index
    searchIndex = [];
    for (const [topicKey, questions] of Object.entries(allQuestionsCache)) {
      questions.forEach((q, idx) => {
        searchIndex.push({
          q: q.q,
          opts: q.opts,
          ans: q.ans,
          expl: q.expl || '',
          topic: topicKey,
          topicName: QuestionLoader.formatTopicName(topicKey),
          origIndex: idx
        });
      });
    }

    isSearchIndexBuilt = true;
    if (loader) loader.style.display = 'none';
    
    const statsEl = document.getElementById('search-stats');
    if (statsEl) statsEl.textContent = `कुल ${searchIndex.length} प्रश्न इंडेक्स किए गए हैं।`;
  },

  query(keyword) {
    if (!keyword || keyword.trim() === '') {
      return [];
    }
    
    const queryStr = keyword.toLowerCase().trim();
    return searchIndex.filter(item => {
      return item.q.toLowerCase().includes(queryStr) || 
             item.topicName.toLowerCase().includes(queryStr) ||
             item.opts.some(opt => opt.toLowerCase().includes(queryStr)) ||
             item.expl.toLowerCase().includes(queryStr);
    });
  }
};

// ==========================================================================
// 8. QUIZ ENGINE MODULE
// ==========================================================================
const QuizEngine = {
  state: {
    questions: [],
    currentIndex: 0,
    answers: [],        // array of user indices (null if unattempted)
    markedReview: [],   // boolean array
    shuffledOpts: [],   // array of shuffled arrays: [[1,0,3,2], ...]
    startTime: null,
    endTime: null,
    timerInterval: null,
    timeLimitSec: 0,
    timeLeftSec: 0,
    mode: 'practice',   // 'practice', 'timed', 'mock', 'revision', 'favorites'
    topic: null,
    sourceTopicName: '',
    isReview: false      // true when viewing a saved test in read-only review mode
  },

  // Helper: Shuffle Array (Fisher-Yates)
  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },

  startQuiz(questions, config = {}) {
    if (!questions || questions.length === 0) {
      UIRenderer.showToast('प्रश्नोत्तरी के लिए कोई प्रश्न नहीं मिला!', 'warning');
      return;
    }

    let quizQuestions = [...questions];
    
    // Shuffle Questions if required
    if (config.shuffleQuestions) {
      quizQuestions = this.shuffle(quizQuestions);
    }

    this.state = {
      questions: quizQuestions,
      currentIndex: 0,
      answers: new Array(quizQuestions.length).fill(null),
      markedReview: new Array(quizQuestions.length).fill(false),
      shuffledOpts: [],
      startTime: new Date(),
      endTime: null,
      timerInterval: null,
      timeLimitSec: config.timeLimitMinutes ? config.timeLimitMinutes * 60 : 0,
      timeLeftSec: config.timeLimitMinutes ? config.timeLimitMinutes * 60 : 0,
      mode: config.mode || 'practice',
      topic: config.topic || null,
      sourceTopicName: config.sourceTopicName || 'मिश्रित टेस्ट',
      isReview: false
    };

    // Shuffling Options logic
    this.state.questions.forEach(q => {
      let indices = [0, 1, 2, 3];
      if (config.shuffleOptions) {
        indices = this.shuffle(indices);
      }
      this.state.shuffledOpts.push(indices);
    });

    // Start Timer if Timed Mode
    if (this.state.timeLimitSec > 0) {
      this.startTimer();
    }

    UIRenderer.openQuizArena();
    this.renderCurrentQuestion();
  },

  startTimer() {
    const timerDiv = document.getElementById('quiz-timer');
    const timerVal = document.getElementById('quiz-timer-val');
    timerDiv.style.display = 'inline-flex';
    timerDiv.classList.remove('urgent');

    const updateTimerUI = () => {
      const min = Math.floor(this.state.timeLeftSec / 60);
      const sec = this.state.timeLeftSec % 60;
      timerVal.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      
      if (this.state.timeLeftSec <= 60) {
        timerDiv.classList.add('urgent');
      }
    };

    updateTimerUI();

    this.state.timerInterval = setInterval(() => {
      this.state.timeLeftSec--;
      updateTimerUI();

      if (this.state.timeLeftSec <= 0) {
        clearInterval(this.state.timerInterval);
        this.submitQuiz(true); // Auto submit
      }
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
    }
  },

  // Load a previously saved test (from history) in read-only review mode
  loadSavedTestForReview(test) {
    this.stopTimer();

    this.state = {
      questions: test.questions,
      currentIndex: 0,
      answers: [...test.answers],
      markedReview: new Array(test.questions.length).fill(false),
      shuffledOpts: (test.shuffledOpts && test.shuffledOpts.length === test.questions.length)
        ? test.shuffledOpts
        : test.questions.map(() => [0, 1, 2, 3]),
      startTime: new Date(test.date),
      endTime: new Date(test.date),
      timerInterval: null,
      timeLimitSec: 0,
      timeLeftSec: 0,
      mode: 'practice',
      topic: test.topicKey || null,
      sourceTopicName: `📜 ${test.topicName} (समीक्षा)`,
      isReview: true
    };

    document.getElementById('quiz-timer').style.display = 'none';
    UIRenderer.openQuizArena();
    this.renderCurrentQuestion();
  },

  renderCurrentQuestion() {
    const qIdx = this.state.currentIndex;
    const q = this.state.questions[qIdx];
    const shufIdx = this.state.shuffledOpts[qIdx];
    
    // UI Updates
    document.getElementById('quiz-curr-idx').textContent = qIdx + 1;
    document.getElementById('quiz-total-cnt').textContent = this.state.questions.length;
    document.getElementById('quiz-mode-title').textContent = this.state.isReview ? 'REVIEW' : this.state.mode.toUpperCase();
    document.getElementById('quiz-topic-title').textContent = this.state.sourceTopicName;
    
    // Update Progress bar
    const progressPct = ((qIdx + 1) / this.state.questions.length) * 100;
    document.getElementById('quiz-bar').style.width = `${progressPct}%`;

    // Reset indicator elements
    document.getElementById('badge-marked-review').style.display = this.state.markedReview[qIdx] ? 'inline-block' : 'none';
    
    // Render question text
    document.getElementById('arena-question-heading').textContent = q.q;

    // Render Options List
    const optList = document.getElementById('quiz-options-list');
    optList.innerHTML = '';

    const selectedOption = this.state.answers[qIdx];

    shufIdx.forEach((originalIndex) => {
      const optionText = q.opts[originalIndex];
      const optBtn = document.createElement('button');
      optBtn.className = 'quiz-option';
      optBtn.setAttribute('role', 'radio');
      optBtn.setAttribute('aria-checked', selectedOption === originalIndex ? 'true' : 'false');
      optBtn.textContent = optionText;
      optBtn.dataset.origIndex = originalIndex;

      // Class rendering depending on selection & practice mode answer feedback
      if (selectedOption === originalIndex) {
        optBtn.classList.add('selected');
      }

      if (this.state.mode === 'practice' && selectedOption !== null) {
        // Correct option styling
        if (originalIndex === q.ans) {
          optBtn.classList.add('correct');
        }
        // Incorrectly selected option styling
        if (selectedOption === originalIndex && selectedOption !== q.ans) {
          optBtn.classList.add('incorrect');
        }
      }

      // Click Event (disabled entirely in review mode — read-only)
      if (!this.state.isReview) {
        optBtn.addEventListener('click', () => this.selectOption(originalIndex));
      } else {
        optBtn.style.cursor = 'default';
      }
      optList.appendChild(optBtn);
    });

    // Handle Bookmark state icon
    const bookmarkBtn = document.getElementById('btn-quiz-bookmark');
    if (FavoritesManager.isFavorite(q.q)) {
      bookmarkBtn.classList.add('favorited');
    } else {
      bookmarkBtn.classList.remove('favorited');
    }

    // Toggle Explanation panel in practice mode (also shown during review)
    const explPanel = document.getElementById('explanation-panel');
    if ((this.state.mode === 'practice' && selectedOption !== null) || this.state.isReview) {
      explPanel.style.display = 'block';
      document.getElementById('explanation-text').textContent = q.expl || 'इस प्रश्न के लिए कोई व्याख्या उपलब्ध नहीं है।';
    } else {
      explPanel.style.display = 'none';
    }

    // Previous/Next Buttons state update
    document.getElementById('btn-quiz-prev').disabled = qIdx === 0;
    
    const isLast = qIdx === this.state.questions.length - 1;
    if (isLast) {
      document.getElementById('btn-quiz-next').style.display = 'none';
      document.getElementById('btn-quiz-submit').style.display = 'block';
      document.getElementById('btn-quiz-submit').textContent = this.state.isReview ? '✅ समीक्षा समाप्त करें' : '✅ सबमिट';
    } else {
      document.getElementById('btn-quiz-next').style.display = 'block';
      document.getElementById('btn-quiz-submit').style.display = 'none';
    }

    // Update navigator button label
    const attemptedCount = this.state.answers.filter(a => a !== null).length;
    document.getElementById('btn-nav-label').textContent = `सूची (${attemptedCount}/${this.state.questions.length})`;

    // Re-draw Navigator dots
    this.drawNavigatorGrid();
  },

  selectOption(optionIndex) {
    const qIdx = this.state.currentIndex;

    // Read-only in review mode
    if (this.state.isReview) return;
    
    // In practice mode, locking selections after an attempt is made
    if (this.state.mode === 'practice' && this.state.answers[qIdx] !== null) {
      return;
    }

    const prevAnswer = this.state.answers[qIdx];
    this.state.answers[qIdx] = optionIndex;

    // Track XP immediately in practice mode
    if (this.state.mode === 'practice') {
      const q = this.state.questions[qIdx];
      const isCorrect = optionIndex === q.ans;
      
      // Update statistics and topics history
      RevisionManager.updateTopicPerformance(q.topic, isCorrect);
      if (isCorrect) {
        StatsManager.awardXP('correct_answer');
        RevisionManager.removeWrongQuestion(q.q);
        RevisionManager.removeUnattemptedQuestion(q.q);
        UIRenderer.showToast('🎯 सही उत्तर! +10 XP', 'success');
      } else {
        RevisionManager.saveWrongQuestion(q);
        UIRenderer.showToast('❌ गलत उत्तर!', 'error');
      }
    }

    // Re-render
    this.renderCurrentQuestion();
  },

  nextQuestion() {
    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.state.currentIndex++;
      this.renderCurrentQuestion();
    }
  },

  prevQuestion() {
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      this.renderCurrentQuestion();
    }
  },

  toggleMarkForReview() {
    const qIdx = this.state.currentIndex;
    this.state.markedReview[qIdx] = !this.state.markedReview[qIdx];
    this.renderCurrentQuestion();
    
    if (this.state.markedReview[qIdx]) {
      UIRenderer.showToast('⚠️ समीक्षा के लिए चिह्नित किया गया।', 'warning');
    }
  },

  toggleBookmark() {
    const q = this.state.questions[this.state.currentIndex];
    if (FavoritesManager.isFavorite(q.q)) {
      FavoritesManager.removeFavorite(q.q);
    } else {
      FavoritesManager.addFavorite(q);
    }
    this.renderCurrentQuestion();
  },

  drawNavigatorGrid() {
    const grid = document.getElementById('navigator-grid');
    grid.innerHTML = '';

    this.state.questions.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.className = 'navigator-dot';
      dot.textContent = idx + 1;
      dot.setAttribute('aria-label', `प्रश्न ${idx + 1}`);

      // Apply classes
      if (this.state.currentIndex === idx) {
        dot.classList.add('current');
      }
      
      if (this.state.answers[idx] !== null) {
        dot.classList.add('attempted');
      } else {
        dot.classList.add('unattempted');
      }

      if (this.state.markedReview[idx]) {
        dot.classList.add('flagged');
      }

      dot.addEventListener('click', () => {
        this.state.currentIndex = idx;
        this.renderCurrentQuestion();
        document.getElementById('question-navigator-drawer').style.display = 'none';
      });

      grid.appendChild(dot);
    });
  },

  submitQuiz(isAuto = false) {
    // In review mode (viewing a saved test), just exit — never re-score or re-save
    if (this.state.isReview) {
      this.stopTimer();
      UIRenderer.closeQuizArena();
      const statsTab = document.querySelector('.bottom-nav .nav-item[data-tab="tab-stats"]');
      if (statsTab) statsTab.click();
      return;
    }

    this.stopTimer();
    this.state.endTime = new Date();
    
    // Analyze results
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    this.state.questions.forEach((q, idx) => {
      const userAns = this.state.answers[idx];
      if (userAns === null) {
        unattemptedCount++;
        // If not in practice mode (where it tracks XP per answer), we track weak/revision details on submit
        if (this.state.mode !== 'practice') {
          RevisionManager.saveUnattemptedQuestion(q);
        }
      } else if (userAns === q.ans) {
        correctCount++;
        if (this.state.mode !== 'practice') {
          StatsManager.awardXP('correct_answer');
          RevisionManager.updateTopicPerformance(q.topic, true);
          RevisionManager.removeWrongQuestion(q.q);
          RevisionManager.removeUnattemptedQuestion(q.q);
        }
      } else {
        wrongCount++;
        if (this.state.mode !== 'practice') {
          RevisionManager.updateTopicPerformance(q.topic, false);
          RevisionManager.saveWrongQuestion(q);
          RevisionManager.removeUnattemptedQuestion(q.q);
        }
      }
    });

    // Award Completed XP
    const earnedXP = StatsManager.awardXP('quiz_completed', correctCount, this.state.questions.length);

    // Calculate time taken
    const timeDiffMs = this.state.endTime - this.state.startTime;
    const totalSecs = Math.floor(timeDiffMs / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const timeString = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    // Render results popup
    UIRenderer.showResults({
      correct: correctCount,
      wrong: wrongCount,
      unattempted: unattemptedCount,
      total: this.state.questions.length,
      timeStr: timeString,
      xpGained: earnedXP,
      isAutoSubmit: isAuto
    });
  }
};

// ==========================================================================
// 9. UI RENDERER MODULE
// ==========================================================================
const UIRenderer = {
  init() {
    this.setupTabNavigation();
    this.setupActionListeners();
  },

  setupTabNavigation() {
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navItems.forEach(item => {
      item.addEventListener('click', async () => {
        // Deactivate old active items
        navItems.forEach(nav => {
          nav.classList.remove('active');
          nav.setAttribute('aria-selected', 'false');
        });
        tabPanels.forEach(panel => panel.style.display = 'none');

        // Activate new items
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        
        const targetTabId = item.dataset.tab;
        const targetPanel = document.getElementById(targetTabId);
        if (targetPanel) {
          targetPanel.style.display = 'block';
        }

        // Search trigger loads index
        if (targetTabId === 'tab-search') {
          await SearchEngine.buildSearchIndex();
        }

        // Progress tab: refresh test history each time it's opened
        if (targetTabId === 'tab-stats') {
          UIRenderer.renderTestHistory();
        }
      });
    });
  },

  setupActionListeners() {

    // TOPIC SORT TOGGLE
    const sortBtn = document.getElementById('btn-sort-topics');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        topicSortOrder = topicSortOrder === 'desc' ? 'asc' : 'desc';
        sortBtn.dataset.order = topicSortOrder;
        sortBtn.querySelector('.sort-label').textContent =
          topicSortOrder === 'desc' ? 'प्रश्न अधिकतम' : 'प्रश्न न्यूनतम';
        this.renderTopicCards(lastKnownCounts);
      });
    }

    // CLEAR TEST HISTORY BUTTON
    const clearHistoryBtn = document.getElementById('btn-clear-history');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        if (TestHistoryManager.count() === 0) {
          this.showToast('इतिहास पहले से ही खाली है।', 'info');
          return;
        }
        if (confirm('क्या आप पूरा टेस्ट इतिहास साफ़ करना चाहते हैं? यह वापस नहीं आएगा।')) {
          TestHistoryManager.clearAll();
          this.showToast('🧹 इतिहास साफ़ कर दिया गया', 'info');
          this.renderTestHistory();
        }
      });
    }

    // MODALS CLOSE TRIGGERS
    document.getElementById('btn-close-topic-modal').onclick = () => this.closeModal('topic-modal');
    document.getElementById('btn-close-mock-modal').onclick = () => this.closeModal('mock-modal');
    document.getElementById('btn-close-level-modal').onclick = () => this.closeModal('level-modal');

    // MOCK MODAL QUICK LAUNCH
    document.getElementById('btn-quick-mock').onclick = () => this.openMockModal();
    document.getElementById('btn-quick-timed').onclick = () => this.openMockModal(true); // timed test
    
    // REVISION MODAL LAUNCH
    document.getElementById('btn-quick-revision').onclick = () => {
      const wrong = RevisionManager.getWrongQuestions();
      const unattempted = RevisionManager.getUnattemptedQuestions();
      const revisionQuestions = [...wrong, ...unattempted];

      if (revisionQuestions.length === 0) {
        this.showToast('संशोधन के लिए अभी कोई प्रश्न नहीं हैं। सही तैयारी जारी रखें!', 'info');
        return;
      }
      
      QuizEngine.startQuiz(revisionQuestions, {
        mode: 'revision',
        shuffleQuestions: true,
        shuffleOptions: true,
        sourceTopicName: 'पुनरावृत्ति (Revision)'
      });
    };

    // FAVORITES TEST START
    document.getElementById('btn-start-favorites-quiz').onclick = () => {
      const favs = FavoritesManager.getFavorites();
      if (favs.length === 0) {
        this.showToast('पसंदीदा सूची खाली है!', 'warning');
        return;
      }

      QuizEngine.startQuiz(favs, {
        mode: 'favorites',
        shuffleQuestions: true,
        shuffleOptions: true,
        sourceTopicName: 'पसंदीदा प्रश्न'
      });
    };

    // SEARCH INPUT CHANGE KEYWORD
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('focus', async () => {
      // Build index if not already built (handles direct focus without tab switch)
      if (!isSearchIndexBuilt) {
        await SearchEngine.buildSearchIndex();
      }
    });
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      this.renderSearchResults(query);
    });

    // QUIZ CONTROL BUTTONS
    document.getElementById('btn-quiz-prev').onclick = () => QuizEngine.prevQuestion();
    document.getElementById('btn-quiz-next').onclick = () => QuizEngine.nextQuestion();
    document.getElementById('btn-quiz-submit').onclick = () => QuizEngine.submitQuiz();
    document.getElementById('btn-quiz-bookmark').onclick = () => QuizEngine.toggleBookmark();
    document.getElementById('btn-quiz-mark-review').onclick = () => QuizEngine.toggleMarkForReview();
    
    // Toggle Navigator Grid
    document.getElementById('btn-toggle-navigator').onclick = () => {
      const drawer = document.getElementById('question-navigator-drawer');
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    };

    // QUIT QUIZ BUTTON
    document.getElementById('btn-quit-quiz').onclick = () => {
      const msg = QuizEngine.state.isReview
        ? 'क्या आप समीक्षा से बाहर निकलना चाहते हैं?'
        : 'क्या आप सचमुच परीक्षा से बाहर निकलना चाहते हैं? आपकी प्रगति सहेज ली जाएगी।';
      if (confirm(msg)) {
        QuizEngine.stopTimer();
        this.closeQuizArena();
      }
    };

    // MODAL OPTIONS TRIGGERS (Timed presetting display toggle)
    const radios = document.getElementsByName('quiz-mode');
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const box = document.getElementById('timed-settings-box');
        box.style.display = e.target.value === 'timed' ? 'block' : 'none';
      });
    });

    const mockRadios = document.getElementsByName('mock-mode');
    mockRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const box = document.getElementById('mock-time-settings');
        box.style.display = e.target.value === 'timed' ? 'block' : 'none';
      });
    });
  },

  // Toast Alerts System
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close" aria-label="बंद करें">&times;</button>
    `;

    toast.querySelector('.toast-close').onclick = () => toast.remove();
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 4000);
  },

  // Level Up Celebrations Modal popup
  showLevelUp(newLevel) {
    document.getElementById('level-up-val').textContent = newLevel;
    const modal = document.getElementById('level-modal');
    modal.style.display = 'flex';
  },

  // Close modals
  closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
  },

  // Render Dashboard Topic Cards
  renderTopicCards(cachedCounts) {
    lastKnownCounts = cachedCounts; // remember for re-sort toggling

    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '';

    // Build a sortable copy of topics using known counts (unknown counts treated as -1 so they sink/float consistently)
    const sortedTopics = [...topicsList].sort((a, b) => {
      const countA = cachedCounts[a.file] !== undefined ? cachedCounts[a.file] : -1;
      const countB = cachedCounts[b.file] !== undefined ? cachedCounts[b.file] : -1;
      return topicSortOrder === 'desc' ? countB - countA : countA - countB;
    });

    sortedTopics.forEach(topic => {
      const key = topic.file;
      const displayName = topic.topic;
      const icon = topic.icon || '📚';
      const desc = topic.desc || '';

      const card = document.createElement('div');
      card.className = 'topic-card animate-pop';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${displayName} विषय`);

      const count = cachedCounts[key] !== undefined ? `${cachedCounts[key]} प्रश्न` : 'गिनती लोड हो रही है...';
      
      card.innerHTML = `
        <div class="topic-title-area">
          <span class="topic-emoji">${icon}</span>
          <div>
            <h3 class="topic-name">${displayName}</h3>
            <p class="topic-desc">${desc}</p>
          </div>
        </div>
        <div class="topic-meta-row">
          <span class="topic-qcount">${count}</span>
          <span class="topic-solved-percent" id="solved-pct-${key}"></span>
        </div>
      `;

      card.onclick = () => this.openTopicModal(key, displayName, count);
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openTopicModal(key, displayName, count);
        }
      };

      grid.appendChild(card);
    });
  },

  // Open starting Modal configurator for topics
  openTopicModal(topicKey, displayName, countText) {
    const modal = document.getElementById('topic-modal');
    document.getElementById('modal-topic-title').textContent = displayName;
    document.getElementById('modal-topic-desc').textContent = `${countText} • अभ्यास करने या समयबद्ध परीक्षा देने के लिए चुनें।`;
    
    // Start Quiz Action
    document.getElementById('btn-start-quiz').onclick = async () => {
      modal.style.display = 'none';
      UIRenderer.showToast('🚀 प्रश्न लोड हो रहे हैं...', 'info');
      
      const questions = await QuestionLoader.loadQuestionsForTopic(topicKey);
      const isTimed = document.querySelector('input[name="quiz-mode"]:checked').value === 'timed';
      
      let timeLimit = null;
      if (isTimed) {
        const timeVal = document.querySelector('input[name="time-limit"]:checked').value;
        if (timeVal === 'custom') {
          timeLimit = parseInt(document.getElementById('input-custom-time').value) || 5;
        } else {
          timeLimit = parseInt(timeVal);
        }
      }

      const shuffleQ = document.getElementById('chk-shuffle-questions').checked;
      const shuffleO = document.getElementById('chk-shuffle-options').checked;

      QuizEngine.startQuiz(questions, {
        mode: isTimed ? 'timed' : 'practice',
        topic: topicKey,
        sourceTopicName: displayName,
        shuffleQuestions: shuffleQ,
        shuffleOptions: shuffleO,
        timeLimitMinutes: timeLimit
      });
    };

    modal.style.display = 'flex';
  },

  // Open Mock Test selector modal
  openMockModal(forceTimed = false) {
    const modal = document.getElementById('mock-modal');
    modal.style.display = 'flex';

    if (forceTimed) {
      document.querySelector('input[name="mock-mode"][value="timed"]').checked = true;
      document.getElementById('mock-time-settings').style.display = 'block';
    }

    document.getElementById('btn-close-mock-modal').onclick = () => this.closeModal('mock-modal');

    document.getElementById('btn-start-mock').onclick = async () => {
      this.closeModal('mock-modal');
      this.showToast('⚙️ मॉक टेस्ट तैयार किया जा रहा है...', 'info');

      // 1. Gather questions from all topics
      let allQuestions = [];
      for (const topic of topicsList) {
        const list = await QuestionLoader.loadQuestionsForTopic(topic.file);
        allQuestions = allQuestions.concat(list);
      }

      if (allQuestions.length === 0) {
        this.showToast('टेस्ट उत्पन्न करने के लिए कोई प्रश्न नहीं मिला!', 'error');
        return;
      }

      // 2. Sample size config
      const count = parseInt(document.querySelector('input[name="mock-count"]:checked').value) || 25;
      
      // Shuffle first to pick randomly
      allQuestions = QuizEngine.shuffle(allQuestions);
      const slicedQuestions = allQuestions.slice(0, count);

      const isTimed = document.querySelector('input[name="mock-mode"]:checked').value === 'timed';
      const timeVal = parseInt(document.querySelector('input[name="mock-time"]:checked').value) || 30;

      QuizEngine.startQuiz(slicedQuestions, {
        mode: isTimed ? 'timed' : 'practice',
        sourceTopicName: `मॉक टेस्ट (${count} प्रश्न)`,
        shuffleQuestions: false, // already shuffled
        shuffleOptions: true,
        timeLimitMinutes: isTimed ? timeVal : null
      });
    };
  },

  // Open fullscreen testing screen
  openQuizArena() {
    document.getElementById('quiz-arena').style.display = 'flex';
    document.body.style.overflow = 'hidden'; // prevent bg scroll
  },

  // Close testing screen
  closeQuizArena() {
    document.getElementById('quiz-arena').style.display = 'none';
    document.body.style.overflow = 'auto';
  },

  // Results display dialog on quiz completed
  showResults(res) {
    // Close quiz arena first, then show result overlay on top
    document.getElementById('quiz-arena').style.display = 'none';
    document.body.style.overflow = 'auto';
    const overlay = document.getElementById('result-overlay');
    overlay.style.display = 'flex';

    // Calculate percentage
    const pct = res.total > 0 ? Math.round((res.correct / res.total) * 100) : 0;
    
    document.getElementById('result-pct').textContent = `${pct}%`;
    document.getElementById('result-ratio').textContent = `${res.correct} / ${res.total}`;
    document.getElementById('result-time').textContent = res.timeStr;
    document.getElementById('result-xp-earned').textContent = `+${res.xpGained} XP`;
    
    // Breakdown values
    document.getElementById('res-total').textContent = res.total;
    document.getElementById('res-correct').textContent = res.correct;
    document.getElementById('res-wrong').textContent = res.wrong;
    document.getElementById('res-unattempted').textContent = res.unattempted;

    // Set dynamic top band color + emoji + title based on score
    const topBand = document.getElementById('result-top-band');
    topBand.className = 'result-top-band'; // reset
    const emojiEl  = document.getElementById('result-emoji-big');
    const titleEl  = document.getElementById('result-title-text');
    const motivEl  = document.getElementById('result-motivate-msg');

    if (pct === 100) {
      topBand.classList.add('band-gold');
      emojiEl.textContent  = '🥇';
      titleEl.textContent  = 'परफेक्ट स्कोर!';
      motivEl.textContent  = 'अविश्वसनीय! आपने सभी प्रश्न सही किए!';
    } else if (pct >= 80) {
      topBand.classList.add('band-green');
      emojiEl.textContent  = '🌟';
      titleEl.textContent  = 'बेहतरीन!';
      motivEl.textContent  = 'शानदार प्रदर्शन! आप परीक्षा के बहुत करीब हैं।';
    } else if (pct >= 50) {
      topBand.classList.add('band-blue');
      emojiEl.textContent  = '👍';
      titleEl.textContent  = 'अच्छा किया!';
      motivEl.textContent  = 'अच्छा प्रयास! और अभ्यास से और बेहतर होंगे।';
    } else {
      topBand.classList.add('band-gray');
      emojiEl.textContent  = '📚';
      titleEl.textContent  = 'अभ्यास जारी रखें!';
      motivEl.textContent  = 'हार मत मानो! पुनरावृत्ति मोड से सुधार करें।';
    }

    // Animate score arc circle
    const arcEl = document.getElementById('score-arc');
    const circumference = 2 * Math.PI * 52; // r=52 → ~326.7
    arcEl.style.strokeDasharray = `0 ${circumference}`;
    setTimeout(() => {
      arcEl.style.transition = 'stroke-dasharray 1.2s ease';
      arcEl.style.strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
    }, 150);

    // Feedback text
    let feedback = 'शानदार प्रयास!';
    if (pct === 100) feedback = '🥇 सर्वोत्कृष्ट! पूर्ण अंक मिले हैं!';
    else if (pct >= 80) feedback = '🌟 बेहतरीन! परीक्षा पास करने के बहुत करीब हैं।';
    else if (pct >= 50) feedback = '👍 अच्छा प्रयास! कमजोरी सुधारने के लिए अभ्यास जारी रखें।';
    else feedback = '📚 और अभ्यास की आवश्यकता है। पुनरावृत्ति मोड का उपयोग करें।';

    document.getElementById('result-feedback-text').textContent = feedback;

    // Button to Review Answers — re-opens the quiz arena in review mode
    document.getElementById('btn-result-review').onclick = () => {
      overlay.style.display = 'none';
      // Switch quiz mode to practice/review mode to show explanations
      QuizEngine.state.mode = 'practice';
      QuizEngine.state.currentIndex = 0;
      // Re-open quiz arena
      document.getElementById('quiz-arena').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      QuizEngine.renderCurrentQuestion();
    };

    // Close button returns to dashboard home
    document.getElementById('btn-result-close').onclick = () => {
      overlay.style.display = 'none';
      this.closeQuizArena();
      // Reset view to Home tab
      document.querySelector('.bottom-nav .nav-item[data-tab="tab-home"]').click();
    };

    // SAVE TEST BUTTON — ask-at-the-end save into local history (max 15, oldest dropped)
    const saveBtn = document.getElementById('btn-save-test');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 यह टेस्ट सेव करें';
    saveBtn.onclick = () => {
      const st = QuizEngine.state;
      const wasAtLimit = TestHistoryManager.count() >= TestHistoryManager.MAX_TESTS;
      const MAX = TestHistoryManager.MAX_TESTS;

      const testObj = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        mode: st.mode,
        topicName: st.sourceTopicName,
        topicKey: st.topic,
        questions: st.questions,
        answers: st.answers,
        shuffledOpts: st.shuffledOpts,
        correct: res.correct,
        wrong: res.wrong,
        unattempted: res.unattempted,
        total: res.total,
        timeStr: res.timeStr,
        xpGained: res.xpGained,
        timeLimitMinutes: st.timeLimitSec > 0 ? Math.round(st.timeLimitSec / 60) : null
      };

      const result = TestHistoryManager.saveTest(testObj);

      if (!result.success) {
        // Storage is full even after trimming everything else — fail gracefully.
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 यह टेस्ट सेव करें';
        this.showToast('⚠️ टेस्ट सेव नहीं हो सका — डिवाइस की स्टोरेज भर गई है। कृपया इतिहास साफ़ करें और पुनः प्रयास करें।', 'error');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = '✅ सेव हो गया';

      if (result.trimmedForSpace) {
        this.showToast(`📥 सेव हो गया, पर जगह कम होने से कुछ पुराने टेस्ट अतिरिक्त रूप से हट गए (${result.count}/${MAX})।`, 'warning');
      } else if (wasAtLimit) {
        this.showToast(`📥 सेव कर लिया गया। सीमा ${MAX} पूरी होने से सबसे पुराना टेस्ट हट गया (${result.count}/${MAX})।`, 'warning');
      } else {
        this.showToast(`📥 टेस्ट सेव कर लिया गया (${result.count}/${MAX}) — अधिकतम ${MAX} टेस्ट ही सुरक्षित रह सकते हैं।`, 'success');
      }

      this.renderTestHistory();
    };
  },


  // Render general statistics across screens
  renderStats() {
    const stats = StatsManager.getStats();

    // Home Statistics update
    document.getElementById('stats-total-topics').textContent = topicsList.length || '-';
    
    const countCache = JSON.parse(localStorage.getItem('ugc_topic_qcounts') || '{}');
    const totalQCount = Object.values(countCache).reduce((a, b) => a + b, 0);
    document.getElementById('stats-total-questions').textContent = totalQCount || '-';
    
    document.getElementById('stats-solved-questions').textContent = stats.solved;
    document.getElementById('stats-accuracy').textContent = `${stats.accuracy}%`;
    document.getElementById('stats-best-score').textContent = stats.bestScore;
    document.getElementById('stats-streak').textContent = `${stats.streak} दिन`;

    // Streak flame banner
    const streakBanner = document.getElementById('streak-banner');
    if (stats.streak > 0) {
      streakBanner.style.display = 'flex';
      document.getElementById('streak-days-count').textContent = stats.streak;
    } else {
      streakBanner.style.display = 'none';
    }

    // Header Level progress rendering
    document.getElementById('header-level-val').textContent = stats.level;
    document.getElementById('stats-level-val').textContent = stats.level;
    document.getElementById('stats-xp-total').textContent = stats.xp;
    
    const levelStartXP = (stats.level - 1) * 100;
    const progressXP = stats.xp - levelStartXP;
    const xpPercent = Math.min(Math.max(progressXP, 0), 100);

    document.getElementById('header-xp-val').textContent = `${progressXP} / 100 XP`;
    document.getElementById('header-xp-progress').style.width = `${xpPercent}%`;
    document.getElementById('header-xp-bar-desc').setAttribute('aria-valuenow', xpPercent);
    
    document.getElementById('stats-xp-needed').textContent = `${100 - progressXP} XP`;
    document.getElementById('stats-xp-progress-large').style.width = `${xpPercent}%`;

    // Progress Tab details
    document.getElementById('stats-total-quizzes').textContent = stats.quizzesCompleted;
    document.getElementById('stats-correct-answers').textContent = stats.solved;
    document.getElementById('stats-highest-streak').textContent = `${stats.highestStreak} दिन`;

    // Revision items update
    const wrong = RevisionManager.getWrongQuestions();
    const unattempted = RevisionManager.getUnattemptedQuestions();
    document.getElementById('rev-wrong-count').textContent = wrong.length;
    document.getElementById('rev-unattempted-count').textContent = unattempted.length;

    // Renders list of weak topics
    const weakTopics = RevisionManager.getWeakTopics();
    const weakListContainer = document.getElementById('weak-topics-list');
    
    if (weakTopics.length > 0) {
      weakListContainer.innerHTML = '';
      weakTopics.forEach(item => {
        const row = document.createElement('div');
        row.className = 'weak-topic-item animate-pop';
        row.innerHTML = `
          <span class="weak-topic-name">🚨 ${item.name}</span>
          <span class="weak-topic-pct">${item.accuracy}% शुद्धता</span>
        `;
        weakListContainer.appendChild(row);
      });
    } else {
      weakListContainer.innerHTML = '<div class="empty-state-small">सभी विषयों में आपकी शुद्धता अच्छी है (>60%)!</div>';
    }

    // Keep test history + its count badge in sync whenever stats refresh
    this.renderTestHistory();
  },

  // Favorites Panel Renderer
  renderFavorites() {
    const list = FavoritesManager.getFavorites();
    const container = document.getElementById('favorites-list');
    const quizBtn = document.getElementById('btn-start-favorites-quiz');

    if (list.length > 0) {
      quizBtn.style.display = 'inline-flex';
      container.innerHTML = '';
      
      list.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'favorite-question-card animate-pop';
        
        card.innerHTML = `
          <div class="fav-card-meta">📚 ${QuestionLoader.formatTopicName(item.topic)}</div>
          <div class="fav-card-text">${item.q}</div>
          <button class="btn-remove-fav" aria-label="पसंदीदा से हटाएं">
            <svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>
          <div class="fav-card-expl"><strong>सही उत्तर:</strong> ${item.opts[item.ans]}<br>${item.expl || ''}</div>
        `;

        card.querySelector('.btn-remove-fav').onclick = () => {
          FavoritesManager.removeFavorite(item.q);
        };
        
        container.appendChild(card);
      });
    } else {
      quizBtn.style.display = 'none';
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⭐</span>
          <p>पसंदीदा सूची खाली है। अभ्यास करते समय प्रश्नों को बुकमार्क करने के लिए तारा (⭐) आइकन का उपयोग करें।</p>
        </div>
      `;
    }
  },

  // Test History Panel Renderer (Progress tab) — shows count (x/15) and a hard-limit warning banner
  renderTestHistory() {
    const container = document.getElementById('test-history-list');
    const countEl = document.getElementById('history-count-val');
    const maxEl = document.getElementById('history-max-val');
    if (!container) return;

    const history = TestHistoryManager.getHistory();

    if (countEl) countEl.textContent = history.length;
    if (maxEl) maxEl.textContent = TestHistoryManager.MAX_TESTS;

    if (history.length === 0) {
      container.innerHTML = `<div class="empty-state-small">अभी तक कोई टेस्ट सेव नहीं किया गया। टेस्ट पूरा करने के बाद "सेव करें" दबाएँ।</div>`;
      return;
    }

    const modeLabelMap = {
      practice: '📖 अभ्यास',
      timed: '⏱️ समयबद्ध',
      mock: '🎯 मॉक',
      revision: '🔄 पुनरावृत्ति',
      favorites: '⭐ पसंदीदा'
    };

    container.innerHTML = '';
    history.forEach(test => {
      const pct = test.total > 0 ? Math.round((test.correct / test.total) * 100) : 0;
      const dateObj = new Date(test.date);
      const dateStr = dateObj.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeOfDay = dateObj.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
      const modeLabel = modeLabelMap[test.mode] || test.mode;

      const card = document.createElement('div');
      card.className = 'history-card animate-pop';
      card.innerHTML = `
        <div class="history-card-top">
          <span class="history-mode-badge">${modeLabel}</span>
          <span class="history-date">${dateStr} • ${timeOfDay}</span>
        </div>
        <div class="history-topic-name">📚 ${test.topicName}</div>
        <div class="history-score-row">
          <span class="history-pct">${pct}%</span>
          <span class="history-ratio">${test.correct}/${test.total} सही</span>
          <span class="history-time">⏱ ${test.timeStr}</span>
        </div>
        <div class="history-actions">
          <button class="btn-history-review">🔍 समीक्षा</button>
          <button class="btn-history-retake">🔁 फिर से दें</button>
          <button class="btn-history-delete" aria-label="हटाएं">🗑️</button>
        </div>
      `;

      card.querySelector('.btn-history-review').onclick = () => {
        QuizEngine.loadSavedTestForReview(test);
      };

      card.querySelector('.btn-history-retake').onclick = () => {
        QuizEngine.startQuiz(test.questions, {
          mode: test.timeLimitMinutes ? 'timed' : 'practice',
          topic: test.topicKey,
          sourceTopicName: test.topicName,
          shuffleQuestions: false,
          shuffleOptions: true,
          timeLimitMinutes: test.timeLimitMinutes || null
        });
      };

      card.querySelector('.btn-history-delete').onclick = () => {
        if (confirm('क्या आप इस सेव किए गए टेस्ट को हटाना चाहते हैं?')) {
          TestHistoryManager.deleteTest(test.id);
          this.showToast('🗑️ टेस्ट इतिहास से हटाया गया', 'info');
          this.renderTestHistory();
        }
      };

      container.appendChild(card);
    });
  },

  // Instant Search Results Renderer
  renderSearchResults(query) {
    const resultsContainer = document.getElementById('search-results');
    
    if (!query || query.trim() === '') {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🔍</span>
          <p>सर्च करने के लिए ऊपर टाइप करें। प्रश्न का पाठ या विकल्प खोजे जा सकते हैं।</p>
        </div>
      `;
      return;
    }

    const results = SearchEngine.query(query);
    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>कोई परिणाम नहीं मिला। कृपया अन्य शब्द का प्रयास करें।</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = '';
    
    results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'search-result-card animate-pop';
      
      // Highlighting keywords helper
      const highlightText = (text, key) => {
        if (!key) return text;
        const regex = new RegExp(`(${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
      };

      const highlightedQuestion = highlightText(item.q, query);
      const highlightedTopic = highlightText(item.topicName, query);

      card.innerHTML = `
        <div class="search-result-header">
          <span>📚 ${highlightedTopic}</span>
          <span>उत्तर विकल्प:</span>
        </div>
        <div class="search-q-text">${highlightedQuestion}</div>
        <div class="search-opts-list">
          ${item.opts.map((opt, i) => `
            <div class="search-opt-item ${i === item.ans ? 'is-ans' : ''}">
              ${highlightText(opt, query)}
            </div>
          `).join('')}
        </div>
      `;

      // Click card starts Practice quiz starting from that specific question
      card.onclick = () => {
        const sourceQuestions = allQuestionsCache[item.topic] || [item];
        const matchIdx = sourceQuestions.findIndex(q => q.q === item.q);
        
        QuizEngine.startQuiz(sourceQuestions, {
          mode: 'practice',
          topic: item.topic,
          sourceTopicName: item.topicName,
          shuffleQuestions: false,
          shuffleOptions: false
        });
        
        // Jump directly to that question index
        if (matchIdx !== -1) {
          QuizEngine.state.currentIndex = matchIdx;
          QuizEngine.renderCurrentQuestion();
        }
      };

      resultsContainer.appendChild(card);
    });
  }
};

// ==========================================================================
// INITIALIZATION ON LOAD
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  PWAManager.init();
  ThemeManager.init();
  UIRenderer.init();

  // Load Topics metadata
  const topics = await QuestionLoader.fetchTopics();
  if (topics.length > 0) {
    // Sequentially background load actual counts and build search lazy cache
    QuestionLoader.lazyLoadAllCounts();
  }

  // Load Initial Storage Stats & Favorites
  UIRenderer.renderStats();
  UIRenderer.renderFavorites();
  UIRenderer.renderTestHistory();
});
