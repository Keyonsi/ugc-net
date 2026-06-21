# 📚 UGC Net — Developer Notes & Progress Log

> **Last Updated:** 2026-06-21  
> **Repo:** [github.com/Keyonsi/ugc-net](https://github.com/Keyonsi/ugc-net)  
> **Stack:** Pure HTML + Vanilla CSS + Vanilla JS (no frameworks, no build step)

---

## 📌 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [How to Run Locally](#how-to-run-locally)
5. [How to Get a Remote Access Link](#how-to-get-a-remote-access-link)
6. [Question Data Format](#question-data-format)
7. [Adding New Topics & Questions](#adding-new-topics--questions)
8. [Key Design Decisions](#key-design-decisions)
9. [Features Implemented](#features-implemented)
10. [PWA Details](#pwa-details)
11. [Progress Log](#progress-log)
12. [Backlog / Future Ideas](#backlog--future-ideas)

---

## 🎯 Project Overview

**UGC Net** is an offline-capable Progressive Web App (PWA) for UGC NET Hindi Literature exam preparation. It is designed as a mobile-first, gamified practice app that works completely offline after first load.

### Goals
- 📱 Mobile-first, installable PWA
- 📴 100% offline capable (Service Worker + Cache API)
- 🎮 Gamified (XP, Levels, Streaks, Bookmarks)
- ⚡ Zero dependencies — pure HTML/CSS/JS, no build step
- 🌐 Can be shared via a remote link using Cloudflare Tunnel

---

## 🏗️ Architecture

```
Browser
  └── index.html          ← Single Page App shell
        ├── style.css     ← All styling (design tokens, components)
        └── script.js     ← All logic (modular objects, no framework)
              ├── PWAManager       → Service Worker registration & offline detection
              ├── ThemeManager     → Dark/light mode toggle (localStorage)
              ├── StatsManager     → XP, levels, streaks, accuracy (localStorage)
              ├── FavoritesManager → Bookmarked questions (localStorage)
              ├── RevisionManager  → Wrong/unattempted question tracking (localStorage)
              ├── QuestionLoader   → Fetch + cache JSON question files
              ├── SearchEngine     → Full-text search across all questions
              └── QuizEngine       → Quiz state, timer, scoring, navigation
```

### Data Flow
```
topics.json ──→ QuestionLoader.fetchTopics()
                    └── renders topic cards on Home tab

[topic].json ──→ QuestionLoader.loadQuestionsForTopic(key)
                    └── cached in allQuestionsCache{}
                    └── QuizEngine.startQuiz()
                    └── SearchEngine.buildSearchIndex()
```

### State Storage (localStorage keys)
| Key | Contents |
|-----|----------|
| `ugc_stats` | XP, level, streak, accuracy, quiz count |
| `ugc_favorites` | Array of bookmarked question objects |
| `ugc_revision_wrong` | Array of incorrectly answered questions |
| `ugc_revision_unattempted` | Array of skipped questions |
| `ugc_topic_history` | Per-topic correct/attempt counts |
| `ugc_topic_qcounts` | Cached question counts per topic |
| `theme` | `"light"` or `"dark"` |

---

## 📁 File Structure

```
ugc-net/
├── index.html            ← Main SPA (single file, all tabs)
├── style.css             ← Vanilla CSS design system
├── script.js             ← All JavaScript logic (~1400 lines)
├── manifest.json         ← PWA manifest (name, icons, theme)
├── service-worker.js     ← Caches all files for offline use
├── launch.ps1            ← 🚀 ONE-CLICK local server + remote tunnel
├── serve.ps1             ← PowerShell-only local server (no Python)
├── DEVNOTES.md           ← THIS FILE — project notes & log
├── assets/
│   ├── icon-192.png      ← PWA icon (192x192)
│   └── icon-512.png      ← PWA icon (512x512)
├── questions/
│   ├── topics.json       ← Master list of all topics
│   ├── acharya-shukla.json
│   ├── bhaktikal.json
│   ├── garsa-de-tasi.json
│   ├── george-grierson.json
│   ├── itihas-lekhan.json
│   ├── mishrabandhu.json
│   ├── ritikal.json
│   ├── sahitya-ki-paribhasha.json
│   ├── shiv-singh-sengar.json
│   └── [more topics...]
└── .logs/
    └── cloudflared.log   ← Tunnel log (auto-created by launch.ps1)
```

---

## 🖥️ How to Run Locally

### Method 1 — One-click launcher (Recommended)

```powershell
powershell -ExecutionPolicy Bypass -File launch.ps1
```

This will:
1. Start a Python HTTP server at `http://localhost:3000`
2. Download `cloudflared.exe` (once, ~30 MB) and create a remote tunnel
3. Open the app in your browser automatically
4. Copy the remote URL to your clipboard

### Method 2 — PowerShell-only (no Python needed)

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Serves on `http://localhost:3000` — no remote tunnel.

### Method 3 — Python directly

```powershell
python -m http.server 3000
# Then open http://localhost:3000
```

> ⚠️ **Important:** You MUST use a local server (not `file://`) because:
> - `fetch()` calls for JSON files are blocked on `file://` protocol
> - Service Workers require HTTP/HTTPS

---

## 🌐 How to Get a Remote Access Link

The `launch.ps1` script does this automatically using **Cloudflare Quick Tunnel**.

**What it does:**
- Downloads `cloudflared.exe` to the project folder (one-time)
- Runs `cloudflared tunnel --url http://localhost:3000`
- Cloudflare assigns a random public HTTPS URL like:
  `https://random-words-here.trycloudflare.com`
- This URL is shareable with anyone on any device/network
- No account or sign-up needed for quick tunnels
- URL changes every time you restart the launcher

**Manual tunnel (if launch.ps1 fails):**
```powershell
.\cloudflared.exe tunnel --url http://localhost:3000
```
Then look for a line like:
```
https://something.trycloudflare.com
```

---

## 📋 Question Data Format

Each topic is a `.json` file in `questions/`. The format:

```json
[
  {
    "q": "प्रश्न का पाठ यहाँ लिखें",
    "opts": [
      "विकल्प A",
      "विकल्प B",
      "विकल्प C",
      "विकल्प D"
    ],
    "ans": 2,
    "expl": "सही उत्तर C है क्योंकि..."
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `q` | string | Question text (Hindi) |
| `opts` | string[4] | Exactly 4 options |
| `ans` | number | 0-indexed correct option (0=A, 1=B, 2=C, 3=D) |
| `expl` | string | Explanation shown in Practice mode |

### topics.json format

```json
[
  {
    "topic": "आचार्य रामचंद्र शुक्ल का इतिहास",
    "file": "acharya-shukla",
    "desc": "हिंदी साहित्य का इतिहास",
    "emoji": "📖"
  }
]
```

---

## ➕ Adding New Topics & Questions

1. **Create question file:** `questions/your-topic-name.json` (follow format above)
2. **Add entry to topics.json:**
   ```json
   {
     "topic": "Topic Display Name (Hindi)",
     "file": "your-topic-name",
     "desc": "Short description",
     "emoji": "🎯"
   }
   ```
3. **Service Worker:** The SW caches files dynamically so no update needed there.
4. **Commit and push:**
   ```bash
   git add questions/your-topic-name.json questions/topics.json
   git commit -m "Add questions: Your Topic Name"
   git push
   ```

---

## 🎨 Key Design Decisions

### Why no framework?
- Zero build step — open `index.html` and it works
- Smaller payload, faster load
- Easier to understand and modify
- Works offline without Node.js or bundlers

### CSS Design System
All visual tokens are in `:root` CSS variables:
- `--primary: #7C3AED` — purple brand color
- `--accent: #EC4899` — pink accent
- `--success / --error / --warning / --info` — status colors
- `--radius-*` — border radius scale
- `--shadow-*` — shadow scale
- `--transition` — standard animation curve

### PWA Strategy (Service Worker)
- **Cache-first** for assets (CSS, JS, icons)
- **Network-first** for JSON question files (falls back to cache)
- Offline banner shown when connectivity is lost

### Quiz Modes
| Mode | Behavior |
|------|----------|
| Practice | Immediate answer feedback, XP per correct answer |
| Timed | No feedback until submit; countdown timer |
| Mock Test | Mixed questions from all topics |
| Revision | Only wrong/unattempted questions |
| Favorites Quiz | Only bookmarked questions |

### Gamification
- **XP:** +10 per correct answer, +50 per quiz, +100 for perfect score
- **Level:** `floor(totalXP / 100) + 1`
- **Streak:** Consecutive days practicing
- **Weak Topics:** Topics with <60% accuracy after 5+ attempts

---

## ✅ Features Implemented

- [x] Home tab with hero stats (topics, questions, solved, accuracy)
- [x] Topics grid with per-topic progress bars
- [x] Practice mode (immediate feedback + explanations)
- [x] Timed mode (countdown timer, submit on expire)
- [x] Mock test (mixed questions from all topics)
- [x] Revision mode (wrong + unattempted questions)
- [x] Favorites (bookmark questions, quiz from favorites)
- [x] Full-text search across all questions
- [x] XP & level system
- [x] Daily streak tracking
- [x] Dark / Light mode toggle
- [x] PWA (installable, offline-capable)
- [x] Question navigator drawer
- [x] Mark for Review flag
- [x] Score circle animation on results
- [x] Weak topics tracker
- [x] Service Worker with cache strategy
- [x] Responsive, mobile-first layout

---

## 📱 PWA Details

| Property | Value |
|----------|-------|
| App Name | UGC Net |
| Short Name | UGC Net |
| Theme Color | `#7C3AED` |
| Background | `#F7F8FC` |
| Display | Standalone |
| Orientation | Portrait Primary |
| Icons | 192×192, 512×512 PNG |
| Start URL | `./index.html` |

**To install on Android:**
1. Open the remote tunnel URL in Chrome
2. Tap the "Add to Home Screen" banner or Menu → "Install App"

**To install on iPhone:**
1. Open in Safari
2. Tap Share → "Add to Home Screen"

---

## 📈 Progress Log

### Session 1 — 2026-06-21
- **Built:** Full production-ready PWA from scratch
  - Single-file SPA (`index.html`, `style.css`, `script.js`)
  - 8 JavaScript modules (PWA, Theme, Stats, Favorites, Revision, Loader, Search, Quiz)
  - CSS design system with dark mode, animations, glassmorphism
  - Service Worker for offline caching
  - PWA manifest with icons
- **Questions Added:**
  - `acharya-shukla` — आचार्य रामचंद्र शुक्ल (multiple questions)
  - `mishrabandhu` — मिश्रबंधु विनोद
  - `bhaktikal` — भक्तिकाल
  - `ritikal` — रीतिकाल
  - `garsa-de-tasi` — गार्सा-द-तासी
  - `george-grierson` — जॉर्ज ग्रियर्सन
  - `itihas-lekhan` — इतिहास लेखन
  - `shiv-singh-sengar` — शिव सिंह सेंगर
  - `sahitya-ki-paribhasha` — साहित्य की परिभाषा
- **GitHub repo created:** `Keyonsi/ugc-net` (public)
- **App renamed** from "UGC NET Hindi Master" → **"UGC Net"** across all files
- **Created:** `launch.ps1` — one-click local server + Cloudflare remote tunnel

---

## 🗺️ Backlog / Future Ideas

### High Priority
- [ ] Add more question topics (remaining UGC NET syllabus)
- [ ] GitHub Pages deployment (free static hosting, permanent URL)
- [ ] Progress bar per topic on the topic card (% solved)

### Medium Priority
- [ ] Import questions from CSV/Excel file
- [ ] Share score as image (Web Share API)
- [ ] Multiple language support (English UI option)
- [ ] Question difficulty tags (Easy / Medium / Hard)
- [ ] Notes/Annotations per question

### Low Priority / Nice to Have
- [ ] Spaced Repetition System (SRS) for revision scheduling
- [ ] Study timer / Pomodoro mode
- [ ] Leaderboard (would require a backend)
- [ ] PDF export of favorites/wrong answers
- [ ] Voice reading of questions (Web Speech API)

---

## 🔗 Quick Reference

| Resource | Link |
|----------|------|
| GitHub Repo | https://github.com/Keyonsi/ugc-net |
| Run locally | `powershell -ExecutionPolicy Bypass -File launch.ps1` |
| UGC NET Syllabus | https://ugcnet.nta.ac.in |
| Cloudflare Tunnel docs | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/ |

---

*This file is the single source of truth for this project. Update it as you add features, fix bugs, or make architectural changes.*
