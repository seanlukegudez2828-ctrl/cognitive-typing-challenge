"use strict";

const ROUND_COUNT = 5;
const MAX_INPUT_LENGTH = 500;
const STORAGE_KEY = "recall.personalBests.v2";

const DIFFICULTIES = {
  easy: {
    label: "Easy", words: "5–8", typeSeconds: 30,
    sentences: [
      "The small cat sleeps beside the window.","Fresh rain makes the garden smell sweet.","My favorite book is on the table.","Warm sunlight fills the quiet room.","We watched the stars after dinner.","Her blue notebook holds many bright ideas.","Small steps can lead to great changes.","The train arrived just before sunset.","A gentle breeze moved the curtains.","Please bring your umbrella this morning."
    ]
  },
  medium: {
    label: "Medium", words: "9–14", typeSeconds: 40,
    sentences: [
      "A quiet morning is the perfect time to learn something new.","The little bird built a warm nest above our kitchen window.","We walked through the park before the afternoon rain began.","My friend always writes important ideas in a small green notebook.","The old library stays open late during the final examination week.","A cup of warm tea helped me enjoy the rainy afternoon.","Our teacher asked everyone to explain the answer in their own words.","Every Saturday we buy fresh fruit from the market near home.","The fastest route to school passes beside a large stone bridge.","She saved a copy of her project before closing the laptop."
    ]
  },
  hard: {
    label: "Hard", words: "15–22", typeSeconds: 50,
    sentences: [
      "After the rain stopped, we followed the narrow path through the forest and watched the sunlight return.","Learning a new skill takes patience, regular practice, and the courage to make mistakes along the way.","Before leaving for school, she checked her backpack twice to make sure every important notebook was inside.","The students worked together to build a simple website that helped their classmates prepare for the science quiz.","When the power went out, we gathered around the kitchen table and told funny stories by candlelight.","Although the journey was longer than expected, everyone agreed that the beautiful mountain view made it worthwhile.","A careful reader notices small details, connects new ideas, and asks useful questions before reaching a final conclusion.","During the school holiday, my cousins visited our town and taught me a new card game every evening.","Instead of rushing through the assignment, he divided the work into smaller tasks and checked each part carefully.","We planted several young trees behind the classroom, hoping they would provide shade for future students during summer."
    ]
  }
};

const $ = (id) => document.getElementById(id);
const SCREEN_IDS = ["homeScreen", "gameScreen", "roundScreen", "summaryScreen"];
const answerInput = $("answer");

let state = { phase: "home" };
let personalBests = {};
let storageAvailable = true;

// ---------- Helpers ----------

function createElement(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function announce(message) { $("status").textContent = message; }

function showScreen(screenId) {
  for (const id of SCREEN_IDS) $(id).hidden = id !== screenId;
  $("helpButton").hidden = screenId === "gameScreen";
  window.scrollTo({ top: 0, behavior: "auto" });
}

function selectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked')?.value || "easy";
}

// ---------- Difficulty selector ----------

function buildDifficultyOptions() {
  const container = $("difficultyOptions");
  for (const [key, settings] of Object.entries(DIFFICULTIES)) {
    const label = createElement("label", "difficulty-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "difficulty";
    input.value = key;
    input.checked = key === "easy";
    const card = createElement("span", "difficulty-card");
    card.append(
      createElement("span", "difficulty-name", settings.label),
      createElement("span", "difficulty-words", settings.words + " words"),
      createElement("span", "difficulty-timing", "untimed reading · " + settings.typeSeconds + "s type")
    );
    label.append(input, card);
    container.append(label);
    input.addEventListener("change", refreshHomeBest);
  }
}

function refreshHomeBest() {
  const level = selectedDifficulty();
  const settings = DIFFICULTIES[level];
  const best = personalBests[level];
  $("homeBestLabel").textContent = settings.label + " personal best";
  $("homeBest").textContent = best ? best.score.toLocaleString() : "—";
}

// ---------- Storage ----------

function showStorageWarning() {
  storageAvailable = false;
  $("storageNotice").hidden = false;
  $("storageNotice").textContent =
    "Browser storage could not be accessed. You can still play, but new best scores may last only for this visit.";
}

function loadPersonalBests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const level of Object.keys(DIFFICULTIES)) {
      const record = parsed[level];
      if (record && Number.isSafeInteger(record.score) && record.score >= 0) {
        personalBests[level] = { score: record.score };
      }
    }
  } catch { showStorageWarning(); }
}

function saveCompletedSessionBest() {
  const previous = personalBests[state.level];
  state.previousBest = previous?.score ?? null;
  state.isNewBest = !previous || state.totalScore > previous.score;
  if (!state.isNewBest) return;
  personalBests[state.level] = { score: state.totalScore };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(personalBests));
    storageAvailable = true;
    $("storageNotice").hidden = true;
  } catch { showStorageWarning(); }
  refreshHomeBest();
}

// ---------- Session & rounds ----------

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function startSession(level) {
  if (state.phase !== "home" && state.phase !== "summary") return;
  const settings = DIFFICULTIES[level];
  if (!settings) return;
  const unique = [...new Set(settings.sentences)];
  if (unique.length < ROUND_COUNT) {
    announce("This difficulty needs at least five unique sentences.");
    return;
  }
  state = {
    phase: "preparing", level,
    deck: shuffle(unique).slice(0, ROUND_COUNT),
    roundIndex: 0, results: [], totalScore: 0, target: "",
    deadline: 0, durationMs: 0, typingStartedAt: 0,
    isNewBest: false, previousBest: null
  };
  startRound();
}

function renderRoundSteps() {
  const container = $("roundSteps");
  container.replaceChildren();
  for (let i = 0; i < ROUND_COUNT; i++) {
    let cls = "round-step";
    if (i < state.roundIndex) cls += " complete";
    else if (i === state.roundIndex) cls += " current";
    container.append(createElement("span", cls, String(i + 1)));
  }
}

function startRound() {
  const settings = DIFFICULTIES[state.level];

  state.phase = "memorize";
  state.target = state.deck[state.roundIndex];

  answerInput.value = "";
  answerInput.disabled = true;
  answerInput.maxLength = MAX_INPUT_LENGTH;
  $("submitButton").disabled = true;
  $("typingPanel").hidden = true;
  $("inputNotice").textContent = "";

  $("memoryPanel").hidden = false;
  $("sentenceText").textContent = state.target;

  $("gameRound").textContent = `ROUND ${state.roundIndex + 1} OF ${ROUND_COUNT}`;
  $("gameDifficulty").textContent = settings.label;
  $("phaseTitle").textContent = "Read and remember.";
  $("phaseDescription").textContent = "Take as much time as you need, then press Enter or Start typing.";

  // No timer during the reading phase.
  $("timerRegion").hidden = true;
  $("memorizeActions").hidden = false;

  renderRoundSteps();
  showScreen("gameScreen");
  $("phaseTitle").focus();
  announce(`Round ${state.roundIndex + 1}. Read the sentence, then press Enter to begin typing.`);
}

function beginTyping(startedAt = performance.now()) {
  if (state.phase !== "memorize") return;
  const settings = DIFFICULTIES[state.level];

  state.phase = "type";
  state.typingStartedAt = startedAt;
  state.durationMs = settings.typeSeconds * 1000;
  state.deadline = startedAt + state.durationMs;

  $("sentenceText").textContent = "";
  $("memoryPanel").hidden = true;
  $("memorizeActions").hidden = true;
  $("typingPanel").hidden = false;
  $("timerRegion").hidden = false;

  $("phaseTitle").textContent = "Your memory takes over.";
  $("phaseDescription").textContent = "Rebuild the sentence. Accuracy matters as much as speed.";

  answerInput.disabled = false;
  $("submitButton").disabled = false;

  if (!document.hidden && performance.now() < state.deadline) answerInput.focus();
  syncClock();
  announce(`Sentence hidden. Type from memory. You have ${settings.typeSeconds} seconds.`);
}

// ---------- Timer (typing phase only) ----------

function syncClock(now = performance.now()) {
  if (state.phase === "type" && now >= state.deadline) {
    finishRound(state.deadline, true);
    return;
  }
  if (state.phase !== "type") return;

  const remaining = Math.max(0, state.deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  const label = seconds + "s";
  if ($("timeLeft").textContent !== label) {
    $("timeLeft").textContent = label;
    $("timerBar").setAttribute("aria-valuetext", seconds + " seconds remaining");
  }
  $("timerBar").value = Math.min(1, remaining / state.durationMs);
  $("timerRegion").classList.toggle("urgent", remaining <= 3000);
}

function animationLoop() { syncClock(); requestAnimationFrame(animationLoop); }

// ---------- Comparison & scoring ----------

function compareText(original, typed) {
  const source = Array.from(original.trim());
  const input = Array.from(typed.trim());
  const rows = source.length, columns = input.length;
  const matrix = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
  for (let i = 0; i <= rows; i++) matrix[i][0] = i;
  for (let j = 0; j <= columns; j++) matrix[0][j] = j;
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= columns; j++) {
      const cost = source[i - 1] === input[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  const operations = [];
  let i = rows, j = columns;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && source[i - 1] === input[j - 1] && matrix[i][j] === matrix[i - 1][j - 1]) {
      operations.push({ type: "equal", expected: source[i - 1], actual: input[j - 1] }); i--; j--;
    } else if (i > 0 && j > 0 && matrix[i][j] === matrix[i - 1][j - 1] + 1) {
      operations.push({ type: "replace", expected: source[i - 1], actual: input[j - 1] }); i--; j--;
    } else if (i > 0 && matrix[i][j] === matrix[i - 1][j] + 1) {
      operations.push({ type: "missing", expected: source[i - 1], actual: "" }); i--;
    } else {
      operations.push({ type: "extra", expected: "", actual: input[j - 1] }); j--;
    }
  }
  operations.reverse();
  const distance = matrix[rows][columns];
  const credited = Math.max(0, rows - distance);
  const accuracy = rows > 0 ? (credited / rows) * 100 : 0;
  return { operations, creditedCharacters: credited, accuracy };
}

function calculateResult(original, typed, elapsedSeconds) {
  const c = compareText(original, typed);
  const seconds = Math.max(1, elapsedSeconds);
  const wpm = (c.creditedCharacters / 5) / (seconds / 60);
  const score = c.accuracy < 30 ? 0 : Math.round((c.accuracy / 100) * wpm * 100);
  return { ...c, original, typed, elapsedSeconds, wpm, score };
}

function getLetterGrade(averageAccuracy, averageWpm) {
  const performance = (averageAccuracy * 0.75) + (Math.min(averageWpm, 100) * 0.25);
  if (performance >= 97) return "A+";
  if (performance >= 93) return "A";
  if (performance >= 90) return "A-";
  if (performance >= 87) return "B+";
  if (performance >= 83) return "B";
  if (performance >= 80) return "B-";
  if (performance >= 77) return "C+";
  if (performance >= 73) return "C";
  if (performance >= 70) return "C-";
  if (performance >= 67) return "D+";
  if (performance >= 63) return "D";
  if (performance >= 60) return "D-";
  return "F";
}

// ---------- Submission ----------

function finishRound(submittedAt = performance.now(), timedOut = false) {
  if (state.phase !== "type") return;
  const settings = DIFFICULTIES[state.level];
  const elapsedSeconds = Math.min(
    settings.typeSeconds,
    Math.max(0, (Math.min(submittedAt, state.deadline) - state.typingStartedAt) / 1000)
  );
  state.phase = "round-result";
  answerInput.disabled = true;
  $("submitButton").disabled = true;
  const typed = answerInput.value.slice(0, MAX_INPUT_LENGTH);
  const result = calculateResult(state.target, typed, elapsedSeconds);
  result.timedOut = timedOut || submittedAt >= state.deadline;
  state.results.push(result);
  state.totalScore += result.score;
  if (state.results.length === ROUND_COUNT) saveCompletedSessionBest();
  renderRoundResult(result);
}

function submitCurrentAnswer() {
  syncClock();
  if (state.phase === "type") finishRound();
}

// ---------- Mistake highlighting ----------

function characterName(ch) {
  if (ch === " ") return "space";
  if (ch === "\n") return "line break";
  if (ch === "\t") return "tab";
  return `"${ch}"`;
}

function visibleCharacter(ch) {
  if (ch === " ") return "␣";
  if (ch === "\n") return "↵";
  if (ch === "\t") return "⇥";
  return ch;
}

function renderAnnotatedAnswer(operations) {
  const container = $("annotatedAnswer");
  container.replaceChildren();
  const counts = { replace: 0, missing: 0, extra: 0 };
  for (const op of operations) {
    if (op.type === "equal") { container.append(document.createTextNode(op.actual)); continue; }
    counts[op.type]++;
    let description, character;
    if (op.type === "replace") {
      character = op.actual;
      description = `Incorrect ${characterName(op.actual)}; expected ${characterName(op.expected)}`;
    } else if (op.type === "missing") {
      character = op.expected;
      description = `Missing ${characterName(op.expected)}`;
    } else {
      character = op.actual;
      description = `Extra ${characterName(op.actual)}`;
    }
    const marker = createElement("span", `diff-${op.type}`);
    marker.title = description;
    const visual = createElement("span", "", visibleCharacter(character));
    visual.setAttribute("aria-hidden", "true");
    const accessible = createElement("span", "sr-only", ` [${description}] `);
    marker.append(visual, accessible);
    container.append(marker);
  }
  $("errorCounts").textContent =
    `${counts.replace} incorrect · ${counts.missing} missing · ${counts.extra} extra characters`;
}

// ---------- Round results ----------

function renderRoundResult(result) {
  const roundNumber = state.roundIndex + 1;
  $("roundKicker").textContent = `ROUND ${roundNumber} OF ${ROUND_COUNT} COMPLETE`;
  let title, feedback;
  if (!result.typed.trim()) {
    title = "A fresh start next round.";
    feedback = "No answer was submitted. Try remembering a few words at a time.";
  } else if (result.accuracy === 100) {
    title = "Perfect recall.";
    feedback = "Every character matched. That is a sentence well remembered.";
  } else if (result.accuracy >= 80) {
    title = "That was close.";
    feedback = "Strong recall. Check the highlighted details below.";
  } else if (result.accuracy >= 30) {
    title = "Keep building your rhythm.";
    feedback = "Try breaking the sentence into two or three short phrases.";
  } else {
    title = "Memory takes practice.";
    feedback = "Below 30% accuracy scores zero. Focus on recall before speed.";
  }
  $("roundTitle").textContent = title;
  $("roundFeedback").textContent = (result.timedOut ? "Time’s up. " : "") + feedback;
  $("resultAccuracy").textContent = result.accuracy.toFixed(1) + "%";
  $("resultWpm").textContent = result.wpm.toFixed(1);
  $("resultTime").textContent = result.elapsedSeconds.toFixed(1) + "s";
  $("resultScore").textContent = result.score.toLocaleString();
  $("originalText").textContent = result.original;
  $("plainAnswer").textContent = result.typed.trim() ? result.typed : "(No answer submitted)";
  $("emptyAnswerNote").hidden = Boolean(result.typed.trim());
  document.querySelector(".plain-answer").open = false;
  renderAnnotatedAnswer(result.operations);
  $("runningTotal").textContent = state.totalScore.toLocaleString();
  $("nextButton").textContent = roundNumber === ROUND_COUNT ? "View session summary →" : "Next round →";
  $("exitResultButton").textContent = roundNumber === ROUND_COUNT ? "Back to home" : "End session";
  showScreen("roundScreen");
  $("roundTitle").focus();
  announce(`Round ${roundNumber} complete. ${result.accuracy.toFixed(1)} percent accuracy. ${result.score} points.`);
}

function nextRoundOrSummary() {
  if (state.phase !== "round-result") return;
  if (state.results.length === ROUND_COUNT) { showSummary(); return; }
  state.roundIndex++;
  startRound();
}

// ---------- Summary ----------

function showSummary() {
  if (state.phase !== "round-result" || state.results.length !== ROUND_COUNT) return;
  state.phase = "summary";
  const settings = DIFFICULTIES[state.level];

  const avgAcc = state.results.reduce((t, r) => t + r.accuracy, 0) / ROUND_COUNT;
  const avgWpm = state.results.reduce((t, r) => t + r.wpm, 0) / ROUND_COUNT;
  const grade = getLetterGrade(avgAcc, avgWpm);

  let bestIdx = 0;
  state.results.forEach((r, i) => { if (r.score > state.results[bestIdx].score) bestIdx = i; });
  const best = state.results[bestIdx];

  $("summaryKicker").textContent = state.isNewBest ? "NEW PERSONAL BEST" : "SESSION COMPLETE";
  $("summaryTitle").textContent = state.isNewBest ? "You set the bar higher." : "Five rounds. Well played.";
  $("summaryDescription").textContent =
    `${settings.label} difficulty · ${ROUND_COUNT} rounds completed. ` +
    (state.isNewBest
      ? "This is your best recorded session at this difficulty."
      : "Another session, another chance to improve your recall.");

  $("totalScore").textContent = grade;
  $("gradeDetails").textContent =
    `${avgAcc.toFixed(1)}% avg accuracy · ${avgWpm.toFixed(1)} avg WPM`;
  $("averageAccuracy").textContent = avgAcc.toFixed(1) + "%";
  $("averageWpm").textContent = avgWpm.toFixed(1);
  $("summaryBest").textContent = personalBests[state.level].score.toLocaleString();
  $("bestRoundText").textContent =
    `Best round: Round ${bestIdx + 1} · ${best.score.toLocaleString()} points`;
  $("bestSaveNote").textContent = storageAvailable
    ? `Personal bests are saved in this browser, separately for ${settings.label} difficulty.`
    : "Browser storage is unavailable. This best score is available for this visit only.";

  const body = $("roundTableBody");
  body.replaceChildren();
  state.results.forEach((r, i) => {
    const row = document.createElement("tr");
    const th = createElement("th", "", String(i + 1));
    th.scope = "row";
    row.append(
      th,
      createElement("td", "", r.accuracy.toFixed(1) + "%"),
      createElement("td", "", r.wpm.toFixed(1)),
      createElement("td", "", r.score.toLocaleString())
    );
    body.append(row);
  });

  showScreen("summaryScreen");
  $("summaryTitle").focus();
  announce(`Session complete. Final grade: ${grade}.` + (state.isNewBest ? " New personal best." : ""));
}

// ---------- Navigation ----------

function returnHome() {
  state.phase = "home";
  answerInput.disabled = true;
  $("submitButton").disabled = true;
  $("sentenceText").textContent = "";
  refreshHomeBest();
  showScreen("homeScreen");
  document.querySelector('input[name="difficulty"]:checked').focus();
  announce("Choose a difficulty to start a new session.");
}

function requestExit() {
  const unfinished = ["memorize", "type", "round-result"].includes(state.phase) &&
    state.results.length < ROUND_COUNT;
  if (unfinished) {
    const ok = window.confirm(
      "End this session? Your current progress will be lost, and an unfinished session will not update your personal best."
    );
    if (!ok) { syncClock(); return; }
  }
  returnHome();
}

// ---------- Input fairness ----------

function blockAssistedInput(event) {
  event.preventDefault();
  if (state.phase === "type") {
    const msg = "Paste and drag-and-drop are disabled. Please type your answer.";
    $("inputNotice").textContent = msg;
    announce(msg);
  }
}

answerInput.addEventListener("paste", blockAssistedInput);
answerInput.addEventListener("drop", blockAssistedInput);
answerInput.addEventListener("beforeinput", (event) => {
  syncClock();
  if (state.phase !== "type") { event.preventDefault(); return; }
  if (event.inputType?.startsWith("insertFromPaste") || event.inputType === "insertFromDrop") {
    blockAssistedInput(event);
  }
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    submitCurrentAnswer();
  }
});

// ---------- Global Enter key: proceed without the mouse ----------

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;

  // The textarea handles its own Enter (submit) during typing.
  if (document.activeElement === answerInput && state.phase === "type") return;

  if ($("helpDialog").open) return;

  if (state.phase === "home") {
    event.preventDefault();
    startSession(selectedDifficulty());
    return;
  }

  if (state.phase === "memorize") {
    event.preventDefault();
    beginTyping(performance.now());
    return;
  }

  if (state.phase === "round-result") {
    event.preventDefault();
    nextRoundOrSummary();
    return;
  }

  if (state.phase === "summary") {
    event.preventDefault();
    startSession(state.level);
  }
});

// ---------- Buttons ----------

$("startButton").addEventListener("click", () => startSession(selectedDifficulty()));
$("skipReadButton").addEventListener("click", () => beginTyping(performance.now()));
$("submitButton").addEventListener("click", submitCurrentAnswer);
$("nextButton").addEventListener("click", nextRoundOrSummary);
$("exitGameButton").addEventListener("click", requestExit);
$("exitResultButton").addEventListener("click", requestExit);
$("replayButton").addEventListener("click", () => startSession(state.level));
$("changeDifficultyButton").addEventListener("click", returnHome);
$("helpButton").addEventListener("click", () => $("helpDialog").showModal());
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncClock(); });

// ---------- Init ----------

loadPersonalBests();
buildDifficultyOptions();
refreshHomeBest();
requestAnimationFrame(animationLoop);
