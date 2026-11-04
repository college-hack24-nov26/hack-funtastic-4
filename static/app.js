const urlParams = new URLSearchParams(window.location.search);
const state = { studentId: urlParams.get('student_id') || 'demo-student', conversationId: null, activeDebateId: null, debatePollTimer: null };

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.dataset.state = isError ? 'error' : 'info';
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }
  return { response, data };
}

function addChatMessage(sender, text, metadata = {}) {
  const container = document.getElementById('chat-log');
  if (!container) return;
  const wrapper = makeElement('div', `message ${sender}`);
  wrapper.appendChild(makeElement('div', 'bubble', text));
  wrapper.appendChild(makeElement('div', 'message-meta', sender === 'guru' ? 'Dataset Mentor' : 'You'));
  if (sender === 'guru' && metadata.references?.length) {
    const sources = makeElement('div', 'message-sources');
    sources.appendChild(makeElement('strong', '', 'Sources from the mythology dataset'));
    metadata.references.forEach((reference) => {
      sources.appendChild(makeElement(
        'div', '', `${reference.source_name} — ${reference.source_reference}`,
      ));
    });
    wrapper.appendChild(sources);
  }
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function renderConversation(conversation) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  state.conversationId = conversation.id;
  log.replaceChildren();
  conversation.messages.forEach((message) => {
    if (message.sender !== 'guru') {
      addChatMessage('user', message.text);
      return;
    }
    let metadata = {};
    try {
      metadata = JSON.parse(message.metadata || '{}');
    } catch (error) {
      metadata = {};
    }
    const text = metadata.provider && metadata.provider !== 'local-guidance'
      ? message.text
      : 'This saved response came from an older local fallback and is not shown as an AI-generated answer.';
    addChatMessage('guru', text, metadata);
  });
}

function renderConversationList(conversations) {
  const list = document.getElementById('conversation-list');
  if (!list) return;
  list.replaceChildren();
  if (!conversations.length) {
    list.appendChild(makeElement('p', '', 'No saved conversations yet.'));
    return;
  }
  conversations.forEach((conversation) => {
    const button = makeElement('button', 'suggestion', conversation.title || 'Conversation');
    button.type = 'button';
    button.addEventListener('click', () => renderConversation(conversation));
    list.appendChild(button);
  });
}

async function loadConversations(restoreLatest = true) {
  try {
    const { response, data } = await requestJson(
      `/api/mentor/conversations?student_id=${encodeURIComponent(state.studentId)}`,
    );
    if (!response.ok) throw new Error(data.error || 'Could not load saved conversations.');
    const conversations = data.conversations || [];
    renderConversationList(conversations);
    if (restoreLatest && conversations.length) renderConversation(conversations[0]);
  } catch (error) {
    setStatus('mentor-status', error.message || 'Could not load saved conversations.', true);
  }
}

async function sendMentorQuestion() {
  const input = document.getElementById('mentor-question');
  const send = document.getElementById('send-mentor-question');
  if (!input || !send || send.disabled) return;
  const question = input.value.trim();
  if (!question) return;

  const ageGroup = document.getElementById('age-group')?.value || '9-12';
  const ageSelector = document.getElementById('age-group');
  const newChat = document.getElementById('new-chat');
  const suggestions = [...document.querySelectorAll('.suggestion[data-question]')];
  addChatMessage('user', question);
  input.value = '';
  send.disabled = true;
  input.disabled = true;
  if (ageSelector) ageSelector.disabled = true;
  if (newChat) newChat.disabled = true;
  suggestions.forEach((button) => { button.disabled = true; });
  send.textContent = 'Thinking...';
  setStatus('mentor-status', 'Searching the local mythology dataset...');
  try {
    const payload = {
      message: question,
      student_id: state.studentId,
      age_group: ageGroup,
    };
    if (state.conversationId) payload.conversation_id = state.conversationId;
    const { response, data } = await requestJson('/api/mentor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(data.error || 'The local knowledge base could not answer.');
    state.conversationId = data.conversation_id;
    addChatMessage('guru', data.answer, data);
    setStatus('mentor-status', `Answered by ${data.provider}${data.model ? ` (${data.model})` : ''}.`);
    await loadConversations(false);
  } catch (error) {
    setStatus('mentor-status', error.message || 'The local knowledge base is unavailable. Please try again.', true);
  } finally {
    send.disabled = false;
    input.disabled = false;
    if (ageSelector) ageSelector.disabled = false;
    if (newChat) newChat.disabled = false;
    suggestions.forEach((button) => { button.disabled = false; });
    send.textContent = 'Send';
    input.focus();
  }
}

function attachMentorEvents() {
  const send = document.getElementById('send-mentor-question');
  const input = document.getElementById('mentor-question');
  const newChat = document.getElementById('new-chat');
  if (!send || !input) return;
  send.addEventListener('click', sendMentorQuestion);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMentorQuestion();
    }
  });
  newChat?.addEventListener('click', () => {
    state.conversationId = null;
    document.getElementById('chat-log')?.replaceChildren();
    setStatus('mentor-status', 'New conversation. Your next successful answer will be saved.');
    input.focus();
  });
  document.querySelectorAll('.suggestion[data-question]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.question || '';
      sendMentorQuestion();
    });
  });
  const initialQuestion = new URLSearchParams(window.location.search).get('q');
  if (initialQuestion) {
    input.value = initialQuestion;
    setStatus('mentor-status', 'Your selected topic is ready to explore.');
  }
  loadConversations();
}

async function loadHomeOverview() {
  const score = document.getElementById('home-progress-score');
  const quizzes = document.getElementById('home-progress-quizzes');
  const lessons = document.getElementById('home-progress-lessons');
  const message = document.getElementById('home-progress-message');
  if (!score || !quizzes || !lessons || !message) return;
  try {
    const { response, data } = await requestJson(
      `/api/learning/summary?student_id=${encodeURIComponent(state.studentId)}`,
    );
    if (!response.ok) throw new Error(data.error || 'Learning overview is unavailable.');
    const progress = data.progress || {};
    score.textContent = progress.average_quiz_score == null ? '--' : `${progress.average_quiz_score}%`;
    quizzes.textContent = progress.quizzes_attempted ?? 0;
    lessons.textContent = progress.lessons_completed ?? 0;
    if (data.status === 'no-data') {
      message.textContent = 'Your path is waiting for its first chapter. Ask the AI Guru or start a quiz to begin.';
    } else if (data.weakest_topic) {
      message.textContent = `Next suggested focus: ${data.weakest_topic}. Open Learning Intelligence for your personalised recommendations.`;
    } else {
      message.textContent = 'Your latest learning activity is ready. Keep exploring to build a richer path.';
    }
  } catch (error) {
    score.textContent = '--';
    quizzes.textContent = '--';
    lessons.textContent = '--';
    message.textContent = 'Learning overview will appear when your activity is available.';
  }
}

function attachHomeEvents() {
  if (!document.querySelector('.home-page')) return;
  loadHomeOverview();
}

function renderTextList(container, items, emptyMessage, renderItem) {
  if (!container) return;
  container.replaceChildren();
  if (!items.length) {
    container.appendChild(makeElement('li', '', emptyMessage));
    return;
  }
  items.forEach((item) => container.appendChild(renderItem(item)));
}

async function loadLearningSummary() {
  try {
    const { response, data } = await requestJson(
      `/api/learning/summary?student_id=${encodeURIComponent(state.studentId)}`,
    );
    if (!response.ok) throw new Error(data.error || 'Learning summary is unavailable.');
    const progressOverview = document.getElementById('progress-overview');
    if (!progressOverview) return;
    const strengthList = document.getElementById('strength-list');
    const improvementList = document.getElementById('improvement-list');
    const recommendationsList = document.getElementById('recommendations-list');
    if (data.status === 'no-data') {
      progressOverview.textContent = 'No data';
      document.getElementById('progress-details').textContent = data.message;
      document.getElementById('strength-summary').textContent = 'No data';
      document.getElementById('strength-details').textContent = 'No scored records';
      document.getElementById('improvement-summary').textContent = 'No data';
      document.getElementById('improvement-details').textContent = 'No scored records';
      renderTextList(strengthList, [], 'No learning records are available.', () => null);
      renderTextList(improvementList, [], 'No learning records are available.', () => null);
      renderTextList(recommendationsList, [], data.message, () => null);
      return;
    }

    const progress = data.progress;
    progressOverview.textContent = `${progress.completed_topics}/${progress.total_topics} topics`;
    document.getElementById('progress-details').textContent =
      `${progress.completion_rate}% completed · Average score: ${progress.average_score ?? 'not available'}`;
    document.getElementById('strength-summary').textContent = `${data.strengths.length} topics`;
    document.getElementById('strength-details').textContent = data.strengths[0]?.topic || 'No scored strengths';
    document.getElementById('improvement-summary').textContent = `${data.improvement_areas.length} topics`;
    document.getElementById('improvement-details').textContent = data.improvement_areas[0]?.topic || 'No scored concerns';
    renderTextList(strengthList, data.strengths, 'No scored strengths are available.', (item) =>
      makeElement('li', '', `${item.topic} - ${item.score}%`));
    renderTextList(improvementList, data.improvement_areas, 'No scored improvement areas are available.', (item) =>
      makeElement('li', '', `${item.topic} - ${item.score}%`));
    renderTextList(recommendationsList, data.recommendations, 'No recommendations are available.', (item) => {
      const row = makeElement('li');
      row.appendChild(makeElement('strong', '', item.title));
      row.appendChild(document.createElement('br'));
      row.appendChild(document.createTextNode(item.reason));
      return row;
    });
  } catch (error) {
    setStatus('learning-status', error.message || 'Learning summary is unavailable.', true);
  }
}

async function loadEnhancedLearningSummary() {
  try {
    const learningAge = document.getElementById('learning-age-group')?.value || '13-15';
    const { response, data } = await requestJson(
      `/api/learning/summary?student_id=${encodeURIComponent(state.studentId)}&age_group=${encodeURIComponent(learningAge)}`,
    );
    if (!response.ok) throw new Error(data.error || 'Learning summary is unavailable.');
    const progress = data.progress || {};
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const renderItems = (id, items, empty, formatter) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.replaceChildren();
      if (!items?.length) { element.appendChild(makeElement('li', '', empty)); return; }
      items.forEach((item) => element.appendChild(formatter(item)));
    };
    setText('progress-overview', data.status === 'no-data' ? 'No data' : `${progress.completed_topics || 0}/${progress.total_topics || 0} topics`);
    setText('progress-details', data.message || `${progress.completion_rate || 0}% completed · ${progress.questions_attempted || 0} questions analysed`);
    setText('lessons-completed', progress.lessons_completed ?? 0);
    setText('quizzes-attempted', progress.quizzes_attempted ?? 0);
    setText('questions-attempted', `${progress.questions_attempted || 0} questions attempted`);
    setText('average-quiz-score', progress.average_quiz_score == null ? '--' : `${progress.average_quiz_score}%`);
    setText('streak-details', progress.learning_streak_days == null ? 'Learning streak: not enough activity' : `Learning streak: ${progress.learning_streak_days} days`);
    const strengths = data.strengths || [];
    const improvements = data.improvement_areas || [];
    setText('strength-summary', data.status === 'no-data' ? 'No data' : `${strengths.length} topics`);
    setText('strength-details', strengths[0]?.topic || 'No reliable strength yet');
    setText('improvement-summary', data.status === 'no-data' ? 'No data' : `${improvements.length} topics`);
    setText('improvement-details', improvements[0]?.topic || 'No reliable weakness yet');
    setText('strongest-topic', data.strongest_topic?.topic || 'Not enough data');
    setText('strongest-topic-details', data.strongest_topic ? `${data.strongest_topic.accuracy}% accuracy across ${data.strongest_topic.questions_attempted} questions (${data.strongest_topic.trend}).` : 'Complete at least two questions in a topic for a reliable classification.');
    setText('weakest-topic', data.weakest_topic?.topic || 'Not enough data');
    setText('weakest-topic-details', data.weakest_topic ? `${data.weakest_topic.accuracy}% accuracy. Revise ${(data.weakest_topic.related_concepts || []).join(', ') || 'the related lesson'}.` : 'No topic has enough low-scoring data yet.');
    setText('adaptive-difficulty', `Next quiz: ${data.adaptive_difficulty || 'medium'}`);
    setText('quiz-difficulty-note', data.status === 'no-data' ? 'Start a quiz to establish your first adaptive difficulty level.' : `Difficulty is based on recent question-level results: ${data.adaptive_difficulty || 'medium'}.`);
    renderItems('strength-list', strengths, 'No reliable strengths are available yet.', (item) => makeElement('li', '', `${item.topic} · ${item.score}% · ${item.trend || 'recorded'}`));
    renderItems('improvement-list', improvements, 'No reliable improvement areas are available yet.', (item) => makeElement('li', '', `${item.topic} · ${item.score}% · ${item.related_concepts?.join(', ') || 'review related concepts'}`));
    renderItems('recommendations-list', data.recommendations, data.message || 'No recommendations are available yet.', (item) => makeElement('li', '', `${item.title} — ${item.reason}`));
    renderItems('revision-list', data.revision_plan, 'No incorrect questions need revision yet.', (item) => makeElement('li', '', `${item.title} — ${item.question} (${item.incorrect_count} incorrect)`));
    renderItems('history-list', data.learning_history, 'No learning activity has been recorded yet.', (item) => makeElement('li', '', `${item.topic} · ${item.activity_type || 'activity'} · ${item.score == null ? 'score pending' : `${item.score}%`} · ${item.created_at || 'date unavailable'}`));
    const table = document.getElementById('topic-performance-list');
    if (table) {
      table.replaceChildren();
      const topics = Object.values(data.topic_performance || {});
      if (!topics.length) {
        const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6; cell.textContent = 'No question-level topic data yet.'; row.appendChild(cell); table.appendChild(row);
      } else topics.forEach((item) => {
        const row = document.createElement('tr');
        [item.topic, item.questions_attempted, item.correct_answers, item.accuracy == null ? '--' : `${item.accuracy}%`, item.classification, item.trend].forEach((value) => { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); });
        table.appendChild(row);
      });
    }
  } catch (error) {
    setStatus('learning-status', error.message || 'Learning summary is unavailable.', true);
  }
}

async function startLearningQuiz() {
  const form = document.getElementById('learning-quiz-form');
  const result = document.getElementById('learning-quiz-result');
  if (!form || !result) return;
  result.textContent = 'Loading an adaptive quiz from the mythology dataset...';
  const learningAge = document.getElementById('learning-age-group')?.value || '13-15';
  const { response, data } = await requestJson(`/api/learning/quiz?student_id=${encodeURIComponent(state.studentId)}&age_group=${encodeURIComponent(learningAge)}&count=5`);
  if (!response.ok) { result.textContent = data.error || 'Quiz is unavailable.'; return; }
  form.replaceChildren(); form.hidden = false;
  data.quiz.forEach((item, index) => {
    const fieldset = document.createElement('fieldset'); fieldset.className = 'learning-question';
    const legend = document.createElement('legend'); legend.textContent = `${index + 1}. ${item.question}`; fieldset.appendChild(legend);
    item.options.forEach((option) => { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'radio'; input.name = `question-${index}`; input.value = option; input.dataset.recordId = item.record_id; label.appendChild(input); label.appendChild(document.createTextNode(` ${option}`)); fieldset.appendChild(label); });
    form.appendChild(fieldset);
  });
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'button primary'; submit.textContent = 'Submit quiz'; form.appendChild(submit);
  result.textContent = `Adaptive level: ${data.difficulty}. Correct answers remain hidden until submission.`;
}

async function submitLearningQuiz(event) {
  event.preventDefault();
  const form = event.currentTarget; const result = document.getElementById('learning-quiz-result');
  const answers = [...form.querySelectorAll('input[type="radio"]:checked')].map((input) => ({ record_id: input.dataset.recordId, answer: input.value }));
  const learningAge = document.getElementById('learning-age-group')?.value || '13-15';
  const { response, data } = await requestJson('/api/learning/quiz/submit', { method: 'POST', body: JSON.stringify({ student_id: state.studentId, age_group: learningAge, answers }) });
  if (!response.ok) { result.textContent = data.error || 'Quiz submission failed.'; return; }
  form.hidden = true; result.textContent = `Quiz saved. Score: ${data.score ?? 'not available'}%.`; loadEnhancedLearningSummary();
}

async function loadSearchResults() {
  const input = document.getElementById('search-input');
  const container = document.getElementById('search-results');
  if (!input || !container) return;
  const query = input.value.trim();
  container.replaceChildren();
  if (!query) {
    container.appendChild(makeElement('p', '', 'Enter a topic to search the learning catalog.'));
    return;
  }
  try {
    const { response, data } = await requestJson(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(data.error || 'Search is unavailable.');
    if (!data.results?.length) {
      container.appendChild(makeElement('p', '', 'No matching catalog items were found.'));
      return;
    }
    data.results.forEach((item) => {
      const result = makeElement('article', 'search-result-item');
      result.appendChild(makeElement('h4', '', item.title));
      result.appendChild(makeElement('p', '', item.description || ''));
      if (item.title) {
        const link = makeElement('a', '', 'Open learning resource');
        link.href = `/learning-intelligence?q=${encodeURIComponent(item.title)}`;
        result.appendChild(link);
      }
      container.appendChild(result);
    });
  } catch (error) {
    setStatus('learning-status', error.message || 'Search is unavailable.', true);
  }
}

function attachLearningEvents() {
  const form = document.getElementById('search-learning');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadSearchResults();
  });
  loadEnhancedLearningSummary();
  document.getElementById('learning-age-group')?.addEventListener('change', loadEnhancedLearningSummary);
  document.getElementById('start-learning-quiz')?.addEventListener('click', startLearningQuiz);
  document.getElementById('learning-quiz-form')?.addEventListener('submit', submitLearningQuiz);
  const query = new URLSearchParams(window.location.search).get('q');
  if (query && input) {
    input.value = query;
    loadSearchResults();
  } else if (results) {
    results.appendChild(makeElement('p', '', 'Enter a topic to search the learning catalog.'));
  }
}

async function legacyOpenDebate(debateId) {
  const workspace = document.getElementById('debate-workspace');
  if (!workspace) return;
  try {
    const { response, data } = await requestJson(`/api/debate/${debateId}`);
    if (!response.ok) throw new Error(data.error || 'Could not open this debate.');
    const { debate, participants, arguments: debateArguments, rounds = [], scores = [] } = data;
    workspace.hidden = false;
    workspace.replaceChildren();
    const header = makeElement('div', 'page-header');
    const heading = makeElement('div');
    heading.appendChild(makeElement('p', 'eyebrow accent', `Debate ${debate.id} · ${debate.status.replace('_', ' ')}`));
    heading.appendChild(makeElement('h3', '', debate.topic));
    header.appendChild(heading);
    const close = makeElement('button', 'button ghost', 'Close view');
    close.type = 'button';
    close.addEventListener('click', () => { workspace.hidden = true; });
    header.appendChild(close);
    workspace.appendChild(header);

    const participantSection = makeElement('div', 'debate-list');
    participantSection.appendChild(makeElement('h4', '', 'Participants'));
    participants.forEach((participant) => {
      participantSection.appendChild(makeElement('p', '', `${participant.student_id} · ${participant.position} · ${participant.role}`));
    });
    workspace.appendChild(participantSection);

    const argumentSection = makeElement('div', 'debate-list');
    argumentSection.appendChild(makeElement('h4', '', 'Arguments'));
    if (!debateArguments.length) argumentSection.appendChild(makeElement('p', '', 'No arguments have been submitted yet.'));
    debateArguments.forEach((item) => {
      const card = makeElement('article', 'debate-item');
      card.appendChild(makeElement('strong', '', `${item.speaker} · Round ${item.round_number}`));
      card.appendChild(makeElement('p', '', item.argument));
      argumentSection.appendChild(card);
    });
    workspace.appendChild(argumentSection);

    const scoreSection = makeElement('div', 'debate-list');
    scoreSection.appendChild(makeElement('h4', '', 'Automated rubric results'));
    rounds.forEach((round) => {
      const roundCard = makeElement('article', 'debate-item');
      roundCard.appendChild(makeElement('strong', '', `Round ${round.round_number} · ${round.status}`));
      if (round.judge_summary) roundCard.appendChild(makeElement('p', '', round.judge_summary));
      scores.filter((score) => score.round_number === round.round_number).forEach((score) => {
        const participant = makeElement('div', 'score-card');
        participant.appendChild(makeElement('strong', '', `${score.participant_id} · ${score.total}/10`));
        participant.appendChild(makeElement(
          'p', '', `Relevance ${score.relevance} · Reasoning ${score.reasoning} · Evidence ${score.evidence} · Clarity ${score.clarity} · Rebuttal ${score.rebuttal} · Respect ${score.respect}`,
        ));
        if (score.explanation) participant.appendChild(makeElement('p', '', score.explanation));
        roundCard.appendChild(participant);
      });
      scoreSection.appendChild(roundCard);
    });
    if (debate.status === 'completed') {
      scoreSection.appendChild(makeElement('p', '', `Winner: ${debate.winner || 'draw'}. Three-round debate complete.`));
    }
    workspace.appendChild(scoreSection);

    const isParticipant = participants.some((participant) => participant.student_id === state.studentId && participant.role === 'student');
    if (isParticipant && debate.status !== 'completed') {
      const form = makeElement('form', 'stack-form');
      form.appendChild(makeElement('h4', '', 'Submit an argument'));
      const label = makeElement('label', '', 'Your argument');
      const input = makeElement('textarea');
      input.name = 'argument';
      input.maxLength = 3000;
      input.required = true;
      input.placeholder = 'State your reasoning clearly and respectfully...';
      label.appendChild(input);
      form.appendChild(label);
      const submit = makeElement('button', 'button primary', 'Submit argument');
      submit.type = 'submit';
      form.appendChild(submit);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        submit.disabled = true;
        setStatus('debate-status', 'Saving argument...');
        try {
          const result = await requestJson(`/api/debate/${debate.id}/arguments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: state.studentId, argument: input.value.trim() }),
          });
          if (!result.response.ok) {
            setStatus('debate-status', result.data.ai_error || result.data.error || 'Argument could not be submitted.', true);
          } else {
            setStatus('debate-status', result.data.ai_response ? 'Argument saved and dataset opponent response received.' : 'Argument saved.');
          }
          input.value = '';
          await openDebate(debate.id);
          await loadDebates();
        } catch (error) {
          setStatus('debate-status', error.message || 'Argument could not be submitted.', true);
        } finally {
          submit.disabled = false;
        }
      });
      workspace.appendChild(form);
    }

    if (debate.created_by === state.studentId && debate.status !== 'completed') {
      const complete = makeElement('button', 'button secondary', 'Complete debate');
      complete.type = 'button';
      complete.addEventListener('click', async () => {
        try {
          const result = await requestJson(`/api/debate/${debate.id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: state.studentId }),
          });
          if (!result.response.ok) throw new Error(result.data.error || 'Could not complete debate.');
          setStatus('debate-status', result.data.message);
          await openDebate(debate.id);
          await loadDebates();
        } catch (error) {
          setStatus('debate-status', error.message, true);
        }
      });
      workspace.appendChild(complete);
    }
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus('debate-status', error.message || 'Could not open this debate.', true);
  }
}

function debateStageFor(debate, rounds) {
  if (debate.status === 'completed') return 5;
  const current = rounds.find((round) => round.round_number === debate.current_round);
  if (current?.status === 'awaiting_opponent') return 2;
  if (debate.current_round === 1) return 1;
  if (debate.current_round === 2) return 3;
  return 4;
}

function renderDebateResults(container, scores, debate, debateArguments) {
  const criteria = ['relevance', 'reasoning', 'evidence', 'clarity', 'rebuttal', 'respect'];
  container.appendChild(makeElement('p', 'eyebrow accent', "Judge's evaluation"));
  container.appendChild(makeElement('h3', '', 'A transparent rubric, not a human verdict'));
  container.appendChild(makeElement('p', 'debate-results-note', 'Scores use a deterministic formula based on topic relevance, reasoning, dataset evidence, clarity, rebuttal engagement, and respectful tone.'));
  const studentScores = scores.filter((score) => score.participant_id === state.studentId || score.role === 'student');
  const latest = studentScores[studentScores.length - 1];
  if (latest) {
    const total = makeElement('div', 'debate-final-score');
    total.appendChild(makeElement('span', 'eyebrow', 'Round score')); total.appendChild(makeElement('strong', '', `${Math.round(latest.total * 10)}/100`));
    total.appendChild(makeElement('small', '', `${latest.total}/10 mean across six criteria`)); container.appendChild(total);
  }
  const strongestScore = studentScores.reduce((best, score) => !best || score.total > best.total ? score : best, null);
  const strongestArgument = strongestScore && (debateArguments || []).find(
    (item) => item.speaker === state.studentId && item.round_number === strongestScore.round_number,
  );
  if (strongestArgument) {
    const strongest = makeElement('blockquote', 'debate-strongest-argument');
    strongest.appendChild(makeElement('span', 'eyebrow accent', `Strongest argument · Round ${strongestScore.round_number}`));
    strongest.appendChild(makeElement('p', '', strongestArgument.argument));
    container.appendChild(strongest);
  }
  const grid = makeElement('div', 'debate-score-grid');
  studentScores.forEach((score) => {
    const card = makeElement('article', 'debate-score-card');
    card.appendChild(makeElement('strong', '', `Round ${score.round_number} · ${score.total}/10`));
    criteria.forEach((criterion) => {
      const row = makeElement('div', 'debate-criterion');
      row.appendChild(makeElement('span', '', `${criterion[0].toUpperCase()}${criterion.slice(1)}`));
      const track = makeElement('span', 'debate-score-track'); const fill = makeElement('i');
      fill.style.width = `${Math.max(0, Math.min(10, score[criterion] || 0)) * 10}%`; track.appendChild(fill); row.appendChild(track);
      row.appendChild(makeElement('b', '', `${score[criterion]}/10`)); card.appendChild(row);
    });
    if (score.strengths?.length) card.appendChild(makeElement('p', 'debate-feedback-positive', `Strength: ${score.strengths[0]}`));
    if (score.improvements?.length) card.appendChild(makeElement('p', 'debate-feedback-improve', `Next: ${score.improvements[0]}`));
    grid.appendChild(card);
  });
  container.appendChild(grid);
  const result = makeElement('div', 'debate-result-banner');
  result.appendChild(makeElement('p', 'eyebrow accent', debate.winner === 'draw' ? 'Balanced exchange' : debate.winner === state.studentId ? 'Dharma points earned' : 'A thoughtful challenge'));
  result.appendChild(makeElement('h3', '', debate.winner === 'draw' ? 'The sabha records a draw.' : debate.winner === state.studentId ? 'Your argument carried the debate.' : `${debate.winner || 'The opponent'} prevailed this time.`));
  result.appendChild(makeElement('p', '', debate.winner === state.studentId ? 'Five Dharma Points were queued exactly once for this completed win.' : 'Review the criterion feedback and return for another exchange.'));
  container.appendChild(result);
}

async function legacyOpenDebateCurrent(debateId) {
  const workspace = document.getElementById('debate-workspace');
  if (!workspace) return;
  workspace.hidden = false; workspace.replaceChildren(makeElement('p', 'debate-loading', 'Opening the sabha...'));
  try {
    const { response, data } = await requestJson(`/api/debate/${debateId}`);
    if (!response.ok) throw new Error(data.error || 'Could not open this debate.');
    const { debate, participants, arguments: debateArguments, rounds = [], scores = [] } = data;
    const currentRound = rounds.find((round) => round.round_number === debate.current_round);
    const stage = debateStageFor(debate, rounds);
    workspace.replaceChildren();

    const header = makeElement('header', 'debate-live-header'); const heading = makeElement('div');
    heading.appendChild(makeElement('p', 'eyebrow accent', `Debate Sabha · ${debate.mode === 'student-vs-ai' ? 'Dataset Practice' : debate.mode === 'student-vs-llm' ? 'LLM Debate' : 'Human Exchange'}`));
    heading.appendChild(makeElement('h2', '', debate.topic));
    const me = participants.find((participant) => participant.student_id === state.studentId);
    heading.appendChild(makeElement('p', 'debate-live-meta', `${debate.difficulty || 'intermediate'} difficulty · Your position: ${me?.position || 'participant'}`)); header.appendChild(heading);
    const close = makeElement('button', 'button ghost', 'Return to topics'); close.type = 'button'; close.onclick = () => { workspace.hidden = true; }; header.appendChild(close); workspace.appendChild(header);

    const stages = makeElement('ol', 'debate-stage-track');
    ['Opening argument', "Opponent's counterargument", "Student's rebuttal", 'Final argument', "Judge's evaluation"].forEach((label, index) => {
      stages.appendChild(makeElement('li', index + 1 < stage ? 'is-complete' : index + 1 === stage ? 'is-current' : '', `${index + 1}. ${label}`));
    });
    workspace.appendChild(stages);

    const liveGrid = makeElement('div', 'debate-live-grid'); const transcript = makeElement('section', 'debate-transcript');
    transcript.appendChild(makeElement('div', 'debate-panel-heading', 'The exchange'));
    if (!debateArguments.length) {
      const welcome = makeElement('div', 'debate-welcome-message'); welcome.appendChild(makeElement('span', 'debate-avatar opponent-avatar', 'ॐ'));
      const copy = makeElement('div'); copy.appendChild(makeElement('strong', '', 'The Sabha welcomes you.')); copy.appendChild(makeElement('p', '', 'Make a clear opening claim, connect it to the mythology record, and explain why your reasoning matters.')); welcome.appendChild(copy); transcript.appendChild(welcome);
    }
    debateArguments.forEach((item) => {
      const isUser = item.speaker === state.studentId; const message = makeElement('article', `debate-message ${isUser ? 'student-message' : 'opponent-message'}`);
      message.appendChild(makeElement('span', 'debate-message-label', `${isUser ? 'Your argument' : 'Dataset opponent'} · Round ${item.round_number}`)); message.appendChild(makeElement('p', '', item.argument));
      if (!isUser) message.appendChild(makeElement('small', 'debate-source-note', 'Grounded in the MythoVerse local knowledge base.')); transcript.appendChild(message);
    });
    liveGrid.appendChild(transcript);

    const rail = makeElement('aside', 'debate-live-rail'); const roundCard = makeElement('section', 'debate-round-card');
    roundCard.appendChild(makeElement('p', 'eyebrow accent', `Stage ${stage} of 5`));
    roundCard.appendChild(makeElement('h3', '', stage === 5 ? "Judge's evaluation" : `Round ${debate.current_round} · ${stage === 1 ? 'Opening argument' : stage === 3 ? "Student's rebuttal" : 'Final argument'}`));
    roundCard.appendChild(makeElement('p', '', stage === 1 ? 'Set out your position and the evidence that supports it.' : stage === 2 ? 'The opponent is responding to your submitted argument.' : stage === 3 ? 'Address the strongest point raised by the other side.' : stage === 4 ? 'Make your final, focused case before evaluation.' : 'Review the transparent rubric and your next steps.')); rail.appendChild(roundCard);
    const people = makeElement('section', 'debate-participant-card'); people.appendChild(makeElement('p', 'eyebrow accent', 'At the sabha'));
    participants.forEach((participant) => { const person = makeElement('div', 'debate-person'); person.appendChild(makeElement('span', 'debate-person-avatar', participant.role === 'ai' ? 'ॐ' : 'You')); person.appendChild(makeElement('span', '', `${participant.role === 'ai' ? 'Dataset opponent' : participant.student_id} · ${participant.position}`)); people.appendChild(person); });
    rail.appendChild(people); liveGrid.appendChild(rail); workspace.appendChild(liveGrid);

    const isParticipant = Boolean(me);
    if (isParticipant && debate.status === 'open') {
      const readyPanel = makeElement('section', 'debate-action-panel'); readyPanel.appendChild(makeElement('h3', '', 'Ready to enter the sabha?')); readyPanel.appendChild(makeElement('p', '', 'Both sides must mark ready before the first argument can be submitted.'));
      const ready = makeElement('button', 'button primary', 'I am ready to begin'); ready.type = 'button'; ready.onclick = async () => { ready.disabled = true; setStatus('debate-status', 'Marking you ready...'); const result = await requestJson(`/api/debate/${debate.id}/ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: state.studentId }) }); if (!result.response.ok) setStatus('debate-status', result.data.error || 'Could not mark ready.', true); await openDebate(debate.id); }; readyPanel.appendChild(ready); workspace.appendChild(readyPanel);
    } else if (isParticipant && debate.status === 'in_progress' && currentRound?.status === 'active') {
      const form = makeElement('form', 'debate-argument-panel'); const label = makeElement('label', '', stage === 1 ? 'Your opening argument' : stage === 3 ? 'Your rebuttal' : 'Your final argument'); const input = makeElement('textarea'); input.maxLength = 3000; input.required = true; input.placeholder = stage === 1 ? 'State your position and connect it to a story, character, or teaching...' : 'Respond with a precise, respectful argument grounded in the topic...'; label.appendChild(input); form.appendChild(label);
      const submit = makeElement('button', 'button primary', stage === 1 ? 'Submit opening argument' : stage === 3 ? 'Submit rebuttal' : 'Submit final argument'); submit.type = 'submit'; form.appendChild(submit);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const argument = input.value.trim();
        if (!argument) {
          setStatus('debate-status', 'Write an argument before submitting.', true);
          input.focus();
          return;
        }

        submit.disabled = true;
        input.disabled = true;
        setStatus('debate-status', 'Recording your argument and evaluating the round...');
        try {
          const result = await requestJson(`/api/debate/${debate.id}/arguments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: state.studentId,
              argument,
              round_number: debate.current_round,
            }),
          });

          if (!result.response.ok) {
            throw new Error(result.data.error || `Argument submission failed (${result.response.status}).`);
          }

          setStatus(
            'debate-status',
            result.data.ai_response
              ? 'Argument recorded; the dataset opponent has responded.'
              : 'Argument recorded; waiting for the other participant.',
          );
          await openDebate(debate.id);
          await loadDebates();
        } catch (error) {
          // Do not reload the workspace on failure: the local `argument` value
          // remains in the textarea so the student can retry safely.
          setStatus('debate-status', error.message || 'Argument could not be submitted.', true);
          input.disabled = false;
          submit.disabled = false;
          input.focus();
        }
      };
      workspace.appendChild(form);
    } else if (debate.status === 'open') workspace.appendChild(makeElement('section', 'debate-action-panel', 'Waiting for the registered participants to mark ready.'));
    else if (isParticipant && debate.status === 'in_progress') workspace.appendChild(makeElement('section', 'debate-action-panel', 'Your opponent is submitting this round. The next stage will open when the round is evaluated.'));

    if (debate.status === 'completed') { const results = makeElement('section', 'debate-results-panel'); renderDebateResults(results, scores, debate, debateArguments); workspace.appendChild(results); const replay = makeElement('a', 'button secondary', 'Start another debate'); replay.href = '#debate-topic-grid'; workspace.appendChild(replay); }
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { workspace.replaceChildren(makeElement('p', 'debate-error', error.message || 'Could not open this debate.')); setStatus('debate-status', error.message || 'Could not open this debate.', true); }
}

function clearDebatePolling() {
  if (state.debatePollTimer) {
    window.clearTimeout(state.debatePollTimer);
    state.debatePollTimer = null;
  }
}

function debateTimeLabel(createdAt) {
  if (!createdAt) return '';
  const parsed = new Date(`${createdAt.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? createdAt : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function appendChatMessage(transcript, item, isUser, participantLabel) {
  const message = makeElement('article', `debate-chat-message ${isUser ? 'is-user' : 'is-opponent'}`);
  const avatar = makeElement('span', `debate-chat-avatar ${isUser ? 'user-avatar' : 'opponent-avatar'}`, isUser ? 'You' : 'ॐ');
  const body = makeElement('div', 'debate-chat-message-body');
  const meta = makeElement('div', 'debate-chat-message-meta');
  meta.appendChild(makeElement('strong', '', isUser ? 'You' : participantLabel));
  meta.appendChild(makeElement('time', '', `Round ${item.round_number} · ${debateTimeLabel(item.created_at)}`));
  body.appendChild(meta);
  body.appendChild(makeElement('p', 'debate-chat-bubble', item.argument));
  if (!isUser) body.appendChild(makeElement('small', 'debate-source-note', 'Grounded in the MythoVerse local knowledge base.'));
  message.appendChild(avatar);
  message.appendChild(body);
  transcript.appendChild(message);
}

async function renderDebateHistory(sidebar, activeId) {
  const history = makeElement('div', 'debate-chat-history');
  history.appendChild(makeElement('p', 'debate-chat-sidebar-label', 'Recent conversations'));
  const { response, data } = await requestJson('/api/debate/list');
  if (!response.ok || !data.debates?.length) {
    history.appendChild(makeElement('p', 'debate-chat-empty', 'No previous debates yet.'));
  } else {
    data.debates.slice(0, 8).forEach((item) => {
      const button = makeElement('button', `debate-chat-history-item ${item.id === activeId ? 'is-active' : ''}`);
      button.type = 'button';
      button.appendChild(makeElement('strong', '', item.topic));
      button.appendChild(makeElement('small', '', `${item.mode === 'student-vs-ai' ? 'Dataset practice' : item.mode === 'student-vs-llm' ? 'LLM debate' : 'Human exchange'} · ${item.status.replace('_', ' ')}`));
      button.addEventListener('click', () => openDebate(item.id));
      history.appendChild(button);
    });
  }
  sidebar.appendChild(history);
}

async function openDebate(debateId) {
  const workspace = document.getElementById('debate-workspace');
  if (!workspace) return;
  clearDebatePolling();
  state.activeDebateId = debateId;
  workspace.hidden = false;
  workspace.className = 'debate-workspace debate-chat-workspace';
  workspace.replaceChildren(makeElement('p', 'debate-loading', 'Opening the sabha...'));
  try {
    const { response, data } = await requestJson(`/api/debate/${debateId}`);
    if (!response.ok) throw new Error(data.error || 'Could not open this debate.');
    const { debate, participants, arguments: debateArguments, rounds = [], scores = [] } = data;
    const currentRound = rounds.find((round) => round.round_number === debate.current_round);
    const stage = debateStageFor(debate, rounds);
    const me = participants.find((participant) => participant.student_id === state.studentId && participant.role === 'student');
    const opponent = participants.find((participant) => participant.role === 'ai' || participant.student_id !== state.studentId);
    const opponentLabel = opponent?.role === 'ai'
      ? (debate.mode === 'student-vs-llm' ? 'LLM Debate Opponent' : 'Dataset Practice Opponent')
      : (opponent?.student_id || 'Human opponent');

    workspace.replaceChildren();
    const shell = makeElement('div', 'debate-chat-shell');
    const sidebar = makeElement('aside', 'debate-chat-sidebar');
    const sidebarTop = makeElement('div', 'debate-chat-sidebar-top');
    sidebarTop.appendChild(makeElement('p', 'eyebrow accent', 'MythoVerse'));
    sidebarTop.appendChild(makeElement('h2', '', 'Debate Sabha'));
    const newDebate = makeElement('button', 'button secondary debate-new-button', '+ New debate');
    newDebate.type = 'button';
    newDebate.onclick = () => { clearDebatePolling(); workspace.hidden = true; document.getElementById('debate-topic-grid')?.scrollIntoView({ behavior: 'smooth' }); };
    sidebarTop.appendChild(newDebate);
    sidebar.appendChild(sidebarTop);
    await renderDebateHistory(sidebar, debate.id);

    const main = makeElement('section', 'debate-chat-main');
    const header = makeElement('header', 'debate-chat-header');
    const headerCopy = makeElement('div', 'debate-chat-header-copy');
    headerCopy.appendChild(makeElement('p', 'eyebrow accent', debate.mode === 'student-vs-ai' ? 'Retrieval-based practice mode' : debate.mode === 'student-vs-llm' ? 'LLM-powered debate mode' : 'Human exchange'));
    headerCopy.appendChild(makeElement('h2', '', debate.topic));
    const meta = makeElement('div', 'debate-chat-badges');
    [opponentLabel, `${debate.difficulty || 'intermediate'} difficulty`, `${me?.position || 'participant'} position`].forEach((label) => meta.appendChild(makeElement('span', 'debate-chat-badge', label)));
    headerCopy.appendChild(meta);
    header.appendChild(headerCopy);
    const close = makeElement('button', 'button ghost debate-chat-close', 'Back to topics');
    close.type = 'button';
    close.onclick = () => { clearDebatePolling(); workspace.hidden = true; };
    header.appendChild(close);
    main.appendChild(header);

    const progress = makeElement('ol', 'debate-chat-progress');
    ['Opening', 'Rebuttal', 'Final argument', 'Judge evaluation'].forEach((label, index) => {
      const active = index === 0 ? stage >= 1 : index === 1 ? stage >= 3 : index === 2 ? stage >= 4 : stage >= 5;
      const complete = index === 0 ? stage > 2 : index === 1 ? stage > 3 : index === 2 ? stage > 4 : false;
      progress.appendChild(makeElement('li', active ? (complete ? 'is-complete' : 'is-current') : '', label));
    });
    main.appendChild(progress);

    const transcript = makeElement('section', 'debate-chat-transcript');
    transcript.setAttribute('aria-label', 'Debate conversation');
    if (!debateArguments.length) {
      const welcome = makeElement('article', 'debate-chat-welcome');
      welcome.appendChild(makeElement('span', 'debate-chat-avatar opponent-avatar', 'ॐ'));
      const welcomeCopy = makeElement('div');
      welcomeCopy.appendChild(makeElement('strong', '', `Welcome to Debate Sabha, ${state.studentId}.`));
      welcomeCopy.appendChild(makeElement('p', '', `Your ${opponentLabel.toLowerCase()} is ready. Make your opening argument when you are ready.`));
      welcome.appendChild(welcomeCopy);
      transcript.appendChild(welcome);
    }
    debateArguments.forEach((item) => appendChatMessage(transcript, item, item.speaker === state.studentId, item.speaker === 'ai-opponent' ? opponentLabel : item.speaker));
    main.appendChild(transcript);

    const context = makeElement('div', 'debate-chat-context');
    context.appendChild(makeElement('span', 'eyebrow accent', debate.status === 'completed' ? 'Conversation complete' : `Round ${debate.current_round} · Stage ${stage} of 5`));
    context.appendChild(makeElement('p', '', stage === 1 ? 'Set out your position and connect it to a mythology record.' : stage === 3 ? 'Respond to the strongest point raised by the other side.' : stage === 4 ? 'Make your final, focused case before evaluation.' : stage === 5 ? 'Review the transparent rubric and feedback.' : 'The other participant is responding.'));
    main.appendChild(context);

    const isParticipant = Boolean(me);
    if (isParticipant && debate.status === 'open') {
      const readyPanel = makeElement('section', 'debate-chat-system-card');
      readyPanel.appendChild(makeElement('strong', '', 'Ready to enter the sabha?'));
      readyPanel.appendChild(makeElement('p', '', 'Both human participants must mark ready before the first message can be sent.'));
      const ready = makeElement('button', 'button primary', 'I am ready to begin');
      ready.type = 'button';
      ready.onclick = async () => {
        ready.disabled = true;
        setStatus('debate-status', 'Marking you ready...');
        try {
          const result = await requestJson(`/api/debate/${debate.id}/ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: state.studentId }) });
          if (!result.response.ok) throw new Error(result.data.error || 'Could not mark ready.');
          await openDebate(debate.id);
        } catch (error) {
          ready.disabled = false;
          setStatus('debate-status', error.message || 'Could not mark ready.', true);
        }
      };
      readyPanel.appendChild(ready);
      main.appendChild(readyPanel);
    } else if (isParticipant && debate.status === 'in_progress' && currentRound?.status === 'active') {
      const form = makeElement('form', 'debate-chat-composer');
      const input = makeElement('textarea', 'debate-chat-input');
      input.maxLength = 3000;
      input.required = true;
      input.placeholder = 'Write your argument...';
      input.setAttribute('aria-label', stage === 1 ? 'Opening argument' : 'Debate argument');
      const composerFooter = makeElement('div', 'debate-chat-composer-footer');
      const hint = makeElement('span', 'debate-chat-hint', 'Enter to send · Shift + Enter for a new line');
      const counter = makeElement('span', 'debate-chat-counter', '0 / 3000');
      const submit = makeElement('button', 'button primary debate-send-button', 'Send argument');
      submit.type = 'submit';
      submit.disabled = true;
      const composerStatus = makeElement('p', 'debate-composer-status', '');
      composerStatus.setAttribute('role', 'status');
      composerStatus.setAttribute('aria-live', 'polite');

      input.addEventListener('input', () => {
        counter.textContent = `${input.value.length} / 3000`;
        submit.disabled = !input.value.trim();
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
      composerFooter.appendChild(hint); composerFooter.appendChild(counter); composerFooter.appendChild(submit);
      form.appendChild(input); form.appendChild(composerFooter);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const argument = input.value.trim();
        if (!argument) { composerStatus.textContent = 'Write an argument before sending.'; composerStatus.dataset.state = 'error'; setStatus('debate-status', 'Write an argument before sending.', true); input.focus(); return; }
        submit.disabled = true; input.disabled = true;
        composerStatus.textContent = 'Sending your argument...';
        composerStatus.dataset.state = 'info';
        setStatus('debate-status', 'Sending your argument...');
        try {
          const result = await requestJson(`/api/debate/${debate.id}/arguments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: state.studentId, argument, round_number: debate.current_round }) });
          if (!result.response.ok) throw new Error(result.data.error || `Argument submission failed (${result.response.status}).`);
          composerStatus.textContent = result.data.ai_response ? `Argument sent; ${opponentLabel} has responded.` : 'Argument sent; waiting for the other participant.';
          composerStatus.dataset.state = 'info';
          setStatus('debate-status', composerStatus.textContent);
          await openDebate(debate.id);
          await loadDebates();
        } catch (error) {
          composerStatus.textContent = error.message || 'Argument could not be sent.';
          composerStatus.dataset.state = 'error';
          setStatus('debate-status', error.message || 'Argument could not be sent.', true);
          input.disabled = false; submit.disabled = false; input.focus();
        }
      };
      main.appendChild(composerStatus);
      main.appendChild(form);
      window.setTimeout(() => input.focus(), 0);
    } else if (debate.status === 'open') {
      main.appendChild(makeElement('section', 'debate-chat-system-card', 'Waiting for the registered participants to mark ready.'));
    } else if (isParticipant && debate.status === 'in_progress') {
      main.appendChild(makeElement('section', 'debate-chat-system-card', 'Waiting for the other participant to respond. This conversation will refresh automatically.'));
    }

    if (debate.status === 'completed') {
      const results = makeElement('section', 'debate-chat-evaluation');
      renderDebateResults(results, scores, debate, debateArguments);
      main.appendChild(results);
      const replay = makeElement('button', 'button secondary', 'Start another debate');
      replay.type = 'button'; replay.onclick = () => { clearDebatePolling(); workspace.hidden = true; document.getElementById('debate-topic-grid')?.scrollIntoView({ behavior: 'smooth' }); };
      main.appendChild(replay);
    }

    shell.appendChild(sidebar); shell.appendChild(main); workspace.appendChild(shell);
    transcript.scrollTop = transcript.scrollHeight;
    if (debate.mode === 'student-vs-student' && debate.status === 'in_progress') state.debatePollTimer = window.setTimeout(() => openDebate(debate.id), 2500);
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    workspace.replaceChildren(makeElement('p', 'debate-error', error.message || 'Could not open this debate.'));
    setStatus('debate-status', error.message || 'Could not open this debate.', true);
  }
}

async function loadDebates() {
  const list = document.getElementById('debate-list');
  if (!list) return;
  list.replaceChildren();
  try {
    const { response, data } = await requestJson('/api/debate/list');
    if (!response.ok) throw new Error(data.error || 'Could not load debates.');
    const debates = data.debates || [];
    if (!debates.length) {
      list.appendChild(makeElement('p', '', 'No saved debates yet. Create one to begin.'));
      return;
    }
    debates.forEach((debate) => {
      const card = makeElement('article', 'debate-item');
      card.appendChild(makeElement('h4', '', debate.topic));
      card.appendChild(makeElement('p', '', `${debate.mode.replaceAll('-', ' ')} · ${debate.status.replace('_', ' ')}`));
      card.appendChild(makeElement('p', '', `Created by: ${debate.created_by}`));
      const action = makeElement('button', 'button secondary');
      action.type = 'button';
      const isCreator = debate.created_by === state.studentId;
      const canJoin = debate.mode === 'student-vs-student' && debate.status === 'open' && !isCreator;
      action.textContent = canJoin ? 'Join debate' : 'Open debate';
      action.addEventListener('click', async () => {
        if (canJoin) {
          try {
            const joined = await requestJson(`/api/debate/${debate.id}/join`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ student_id: state.studentId }),
            });
            if (!joined.response.ok) throw new Error(joined.data.error || 'Could not join this debate.');
            setStatus('debate-status', joined.data.message);
            await loadDebates();
          } catch (error) {
            setStatus('debate-status', error.message || 'Could not join this debate.', true);
            return;
          }
        }
        openDebate(debate.id);
      });
      card.appendChild(action);
      list.appendChild(card);
    });
  } catch (error) {
    list.appendChild(makeElement('p', '', error.message || 'Could not load debates.'));
  }
}

function attachDebateEvents() {
  const form = document.getElementById('create-debate-form');
  if (!form) return;
  const topicInput = document.getElementById('debate-topic');
  const customTopic = document.getElementById('debate-topic-custom');
  // The start button is never disabled at page load; a missing topic is
  // validated on submit, so a cached/failed script cannot lock the button.
  const startButton = form.querySelector('button[type="submit"]');
  if (startButton) startButton.disabled = false;
  document.querySelectorAll('.debate-topic-card[data-topic]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.debate-topic-card').forEach((item) => item.classList.remove('is-selected'));
      card.classList.add('is-selected');
      if (topicInput) topicInput.value = card.dataset.topic;
      if (customTopic) customTopic.value = '';
      setStatus('debate-status', `Topic selected: ${card.dataset.topic}`);
    });
  });
  customTopic?.addEventListener('input', () => {
    if (customTopic.value.trim() && topicInput) {
      topicInput.value = customTopic.value.trim();
      document.querySelectorAll('.debate-topic-card').forEach((item) => item.classList.remove('is-selected'));
      setStatus('debate-status', 'Your own statement is set. Choose your stance and begin.');
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus('debate-status', 'Creating debate...');
    const payload = Object.fromEntries(new FormData(form).entries());
    if (!payload.topic?.trim()) {
      setStatus('debate-status', 'Choose a topic or write a debate statement first.', true);
      submit.disabled = false;
      return;
    }
    payload.created_by = state.studentId;
    try {
      const { response, data } = await requestJson('/api/debate/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (data.existing_debate_id) {
          setStatus('debate-status', data.error, true);
          await loadDebates();
          return;
        }
        throw new Error(data.error || 'Unable to create debate.');
      }
      form.reset();
      if (topicInput) topicInput.value = '';
      if (customTopic) customTopic.value = '';
      document.querySelectorAll('.debate-topic-card').forEach((item) => item.classList.remove('is-selected'));
      if (startButton) startButton.disabled = false;
      setStatus('debate-status', `Created debate: ${data.debate.topic}`);
      await loadDebates();
      await openDebate(data.debate.id);
    } catch (error) {
      setStatus('debate-status', error.message || 'Unable to create debate.', true);
    } finally {
      submit.disabled = false;
    }
  });
  loadDebates();
}

document.addEventListener('DOMContentLoaded', () => {
  attachHomeEvents();
  attachMentorEvents();
  attachLearningEvents();
  attachDebateEvents();
});
