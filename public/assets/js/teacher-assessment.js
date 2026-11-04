(async function initializeTeacherAssessment() {
  const status = document.querySelector('[data-assessment-status]');
  const root = document.querySelector('[data-assessment-content]');
  const query = new URLSearchParams(window.location.search);
  const teacher = query.get('teacher'); const ageGroup = query.get('ageGroup'); const assessmentId = query.get('assessment');
  if (!status || !root || !teacher || !ageGroup || !assessmentId) { if (status) status.textContent = 'This assessment link is incomplete. Return to the teacher page.'; return; }
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  function renderFeedback(result, host) {
    const panel = node('section', undefined, 'teacher-result-panel card');
    panel.append(node('p', result.passed ? 'Passed' : 'Keep learning', 'eyebrow'), node('h2', `${result.score} / ${result.totalMarks} · ${result.percentage}%`), node('p', `Submitted ${new Date(result.submittedAt).toLocaleString()}`), node('p', `${result.dharmaPointsAwarded || 0} Dharma points earned`));
    for (const item of result.feedback) {
      const answer = node('article', undefined, 'teacher-result-answer');
      answer.append(node('h3', item.correct ? 'Correct' : 'Review this answer'), node('p', `Your answer: ${typeof item.submittedAnswer === 'object' ? JSON.stringify(item.submittedAnswer) : String(item.submittedAnswer ?? 'No answer')}`), node('p', `Correct answer: ${typeof item.correctAnswer === 'object' ? JSON.stringify(item.correctAnswer) : String(item.correctAnswer)}`), node('p', item.explanation));
      panel.append(answer);
    }
    const retry = node('button', 'Try again', 'button button-secondary'); retry.type = 'button';
    retry.addEventListener('click', () => { const form = root.querySelector('form'); if (form) { form.reset(); form.hidden = false; const button = form.querySelector('[type="submit"]'); if (button) button.disabled = false; } host.replaceChildren(); });
    panel.append(retry); host.append(panel);
  }
  try {
    const user = await window.MythoVerseAuth.getCurrentUser();
    if (user.role !== 'student') { window.location.replace('/'); return; }
    const [teacherResult, syllabusResult] = await Promise.all([
      window.MythoVerseAuth.getTeacher(teacher),
      window.MythoVerseAuth.getTeacherSyllabus(teacher, ageGroup)
    ]);
    const profile = teacherResult.teacher;
    let assessment = null;
    for (const module of syllabusResult.syllabus.modules) {
      if (module.assessment?.id === assessmentId) assessment = module.assessment;
      for (const chapter of module.chapters) if (chapter.assessment?.id === assessmentId) assessment = chapter.assessment;
    }
    if (!assessment) throw new Error('Assessment not found in this syllabus.');
    document.title = `${assessment.title} · ${profile.name} | MythoVerse`;
    const header = node('header', undefined, 'teacher-lesson-heading'); header.append(node('p', `${profile.name} · ${ageGroup} years`, 'eyebrow'), node('h1', assessment.title), node('p', assessment.instructions));
    const form = document.createElement('form'); form.className = 'teacher-assessment-form card';
    for (const [index, question] of assessment.questions.entries()) {
      const fieldset = document.createElement('fieldset'); fieldset.className = 'teacher-question';
      const legend = node('legend', `${index + 1}. ${question.prompt}`); fieldset.append(legend);
      if (question.type === 'multipleChoice' || question.type === 'trueFalse') {
        const options = question.type === 'trueFalse' ? [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }] : question.options;
        for (const option of options) {
          const label = node('label', undefined, 'teacher-answer-option'); const input = document.createElement('input'); input.type = 'radio'; input.name = question.id; input.value = option.key; input.required = true; label.append(input, document.createTextNode(option.text)); fieldset.append(label);
        }
      } else if (question.type === 'matching') {
        for (const option of question.options) { const label = node('label', option.text, 'form-label'); const input = document.createElement('input'); input.className = 'form-control'; input.type = 'text'; input.name = `${question.id}:${option.key}`; input.required = true; input.maxLength = 100; fieldset.append(label, input); }
      } else {
        const input = document.createElement(question.type === 'shortAnswer' ? 'textarea' : 'input'); input.className = 'form-control'; input.name = question.id; input.required = true; input.maxLength = 500; if (input.tagName === 'INPUT') input.type = 'text'; fieldset.append(input);
      }
      form.append(fieldset);
    }
    const submit = node('button', 'Submit assessment', 'button button-primary'); submit.type = 'submit'; form.append(submit);
    const feedback = node('div'); feedback.dataset.assessmentFeedback = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        const answers = assessment.questions.map((question) => {
          if (question.type === 'multipleChoice') return { questionId: question.id, answer: form.elements[question.id].value };
          if (question.type === 'trueFalse') return { questionId: question.id, answer: form.elements[question.id].value === 'true' };
          if (question.type === 'matching') {
            const answer = {};
            for (const option of question.options) answer[option.key] = form.elements[`${question.id}:${option.key}`].value;
            return { questionId: question.id, answer };
          }
          return { questionId: question.id, answer: form.elements[question.id].value };
        });
        const result = await window.MythoVerseAuth.submitTeacherAssessment(teacher, ageGroup, assessmentId, { submissionKey: crypto.randomUUID(), answers });
        form.hidden = true;
        renderFeedback(result.result, feedback);
      } catch (error) { const message = node('p', error.message || 'Your answers could not be submitted.', 'form-status'); message.dataset.state = 'error'; feedback.replaceChildren(message); submit.disabled = false; }
    });
    root.replaceChildren(header, form, feedback); root.hidden = false; status.hidden = true;
  } catch (error) {
    if (error.status === 401) { window.location.replace(`/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    status.textContent = error.message || 'Assessment could not be loaded.'; status.dataset.state = 'error';
  }
})();
