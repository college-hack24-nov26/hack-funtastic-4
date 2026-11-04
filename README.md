# MythoVerse

MythoVerse is an Indian mythology-inspired educational gaming platform. This
repository includes the project foundation, public website, authentication,
student profile onboarding, and the first learning content module for stories.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB, either installed locally or available through a MongoDB URI

## Getting started

1. Install the project dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set `MONGODB_URI` to your MongoDB
   connection string. The example uses a local MongoDB database.
3. Start the server:

   ```sh
   npm start
   ```

4. Open `http://localhost:3000` for the starter page. Check
   `http://localhost:3000/api/health` for server and database status.

The HTTP server can start when MongoDB is not configured or unavailable. In
that case, the health endpoint reports a degraded status (`503`) until the
database is connected. The server logs a clear message without printing
credentials.

## Project layout

- `public/` — Static HTML, CSS, JavaScript, reusable component and image folders.
- `public/components/` — Shared header and footer HTML fragments, loaded by
  `public/assets/js/main.js`.
- `public/assets/css/global.css` — Global MythoVerse colors, typography, layout,
  controls, responsive navigation, and reusable UI styles.
- `public/assets/js/main.js` — Loads shared layout fragments and handles the
  accessible mobile navigation.
- `public/assets/js/auth-client.js` — Shared same-origin, cookie-based API
  client and signed-in header state.
- `public/login.html` and `public/register.html` — Student login and registration.
- `public/onboarding.html` and `public/profile.html` — Protected student
  onboarding and profile management.
- `public/stories.html` and `public/story.html` — Student Story Library and
  lesson reader.
- `public/teachers.html` and `public/teachers/` — Teacher directory and six
  dedicated profile pages.
- `public/teacher-lesson.html` and `public/teacher-assessment.html` — Shared
  age-specific lesson reader and assessment experience.
- `server/src/app.js` — Express application, static file serving, and health API.
- `server/src/server.js` — Environment loading, database startup, and HTTP server.
- `server/src/config/` — Database configuration and connection helper.
- `server/src/models/user.js` — User accounts and student profile data.
- `server/src/routes/`, `controllers/`, `middleware/`, and `services/` —
  Authentication and student profile API modules.
- `server/tests/` — Isolated API, progress, CLI, and frontend contract tests.

The browser code uses HTML, CSS, and vanilla JavaScript. No frontend framework
or CSS framework is used.

Run the app through Express (`npm start`) to use the public website and account
pages. MongoDB must be configured for registration, login, onboarding, and
profile changes. New public registrations always receive the `student` role.
Authentication uses an HTTP-only cookie; tokens and passwords are not stored
in browser storage.

The authentication API is available at `/api/auth/register`, `/api/auth/login`,
`/api/auth/logout`, and `/api/auth/me`. Authenticated student profile and
onboarding endpoints are under `/api/student/profile` and
`/api/student/onboarding/`. Student pages require login; profile setup is
required before the profile page is available. The student dashboard uses the
existing authenticated profile APIs. Story and teacher progress are stored in
MongoDB and associated with the authenticated student.

## Administrator access

- Admin sign-in: `/admin-login.html`
- Basic admin dashboard: `/admin/dashboard.html`
- Story authoring: `/admin/stories.html`
- Dashboard API: `GET /api/admin/dashboard`

Admin pages use the existing email/password login and HTTP-only JWT cookie.
Admin APIs independently verify that cookie and require the database-backed
user role to be exactly `admin`. Public registration and profile updates cannot
assign that role. There is no public admin-registration or role-assignment API,
and no default admin account. The local-only `npm run admin:provision` command
creates the first administrator only. It uses the existing bcrypt
password hashing and `User` model, refuses to run if any admin role already
exists, and refuses to reuse an existing account email. It never prints supplied
credentials. The password must be at least 12 characters and no more than 72
UTF-8 bytes.

An authorized operator should verify the person and approval first. Ensure
`MONGODB_URI` is configured in the local `.env`, then run
`npm run admin:provision` from the project directory in an interactive
PowerShell or VS Code terminal. The command prompts for the display name and
email and reads the password without echoing it. The password is not written to
the `.env`, source code, command history, or logs. Use a password of 12 or more
characters and no more than 72 UTF-8 bytes. This is an offline CLI utility; it
is not mounted as an HTTP route. Never promote accounts through browser tools,
public APIs, or client-supplied role values.

To securely change an existing administrator password, run
`npm run admin:change-password` in an interactive PowerShell or VS Code
terminal. The command loads `MONGODB_URI` from `.env`, prompts for the admin
email, and accepts the new password without echoing it. It verifies the account
has the `admin` role, updates only that account's bcrypt password hash, and
disconnects from MongoDB. It does not create accounts or change names, emails,
roles, or other users. Passwords must be at least 12 characters and no more
than 72 UTF-8 bytes. No password is stored in `.env`, source code, shell history,
or logs.

To reset the password for an existing student account, run
`npm run student:change-password` from the project directory in an interactive
PowerShell or VS Code terminal. The command loads `MONGODB_URI` from the local
`.env`, prompts for the registered student email, and accepts the new password
without echoing it. It verifies the account exists and has the `student` role,
then updates only that account's bcrypt password hash. It does not create an
account or change profile, role, email, or learning progress data. Use a
password of at least 12 characters and no more than 72 UTF-8 bytes. The
password is not stored in `.env`, source code, command history, or logs.

After provisioning, open `http://localhost:3000/admin-login.html` and sign in
with the administrator email and password. The dashboard is at
`http://localhost:3000/admin/dashboard.html`; select **Open story management**
or use `http://localhost:3000/admin/stories.html` to search, filter, create,
edit, and publish stories and their chapters and lessons. These pages require
an active administrator session.

The application uses `MONGODB_URI` for MongoDB, `JWT_SECRET` for signing
authentication tokens, and optional `PORT` and `NODE_ENV` settings. Keep
secrets in the ignored local `.env` or the deployment secret manager; never
commit them.

## Learning content backend

Learning items are stored separately from user accounts in the `LearningContent`
collection. Each record has a `moduleType`, title and unique slug, short and full
descriptions, mythological background, a cover image reference, category,
supported age groups, difficulty, learning objectives, estimated learning time,
publication status, and embedded chapters. Chapters have a title, summary,
order, estimated time, and embedded lessons. Lessons have a title, order, text
or Markdown content, optional objectives, and estimated time. This keeps a
story and its reading sequence in one document and avoids extra chapter or
lesson collections. The `moduleType` field currently supports `story` and
has values reserved for `sixTeachers`, `fourteenLokas`, `dharmaSituations`,
`library`, and `studyMode`, so later modules can reuse the shared content shape. Module
specific fields can be added when those modules are designed.

Stories default to `draft`; publishing requires at least one chapter and at
least one lesson in each chapter. Slugs are unique. Content has timestamps and
indexes for slug lookup, publication listings, and age-group filtering. No
sample story is seeded into the configured database.

Student content API (all routes require an authenticated student and return
published stories only):

- `GET /api/learning/stories?ageGroup=9-12&category=...&page=1&limit=20`
- `GET /api/learning/stories/:slugOrId`
- `GET /api/learning/stories/:slugOrId/chapters`
- `GET /api/learning/stories/:slugOrId/chapters/:chapterId/lessons`

Admin content API (all routes require an authenticated database-backed admin;
mutations also require a same-origin request):

- `GET /api/admin/content/stories?status=all&search=...&page=1&limit=20` — filtered story list and real total/published/draft counts
- `GET /api/admin/content/stories/:slugOrId` — read drafts or published stories
- `POST /api/admin/content/stories` — create a draft story
- `PATCH /api/admin/content/stories/:slugOrId` — update story fields
- `PATCH /api/admin/content/stories/:slugOrId/publication` — publish or unpublish
- `POST /api/admin/content/stories/:slugOrId/chapters` — add a chapter
- `PATCH /api/admin/content/stories/:slugOrId/chapters/:chapterId` — update chapter title, summary, order, or estimated time
- `POST /api/admin/content/stories/:slugOrId/chapters/:chapterId/lessons` — add a lesson
- `PATCH /api/admin/content/stories/:slugOrId/chapters/:chapterId/lessons/:lessonId` — update a lesson

Public student routes derive access from the HTTP-only cookie and never accept
a student ID. Administrators are authorized by the existing `authenticate`
and `requireAdmin` middleware. The story model stores content as text or
Markdown; it does not render HTML or make claims about historical accuracy.
Future modules can build on this content collection without mixing content
records with `User` documents.

## Student story learning

Students open the Story Library at `/stories.html`. It filters published
stories by the authenticated student's age group by default and supports title
search, category, difficulty, and age-group filters. Select **Read story** to
open `/story.html?slug=the-wisdom-of-lord-krishna`; an optional `lesson` query
parameter selects a lesson ID for resuming. The page reads the published story,
chapters, and lesson content from the learning APIs. Plain text and a safe
Markdown subset are displayed without injecting HTML.

Student story APIs require an active authenticated account whose role is
`student`. They use the HTTP-only `mythoverse_token` cookie. Published story
listing accepts `ageGroup`, `category`, `difficulty`, `search`, `page`, and
`limit`; it returns only published stories. Story reading also uses the
published story, chapter, and lesson endpoints listed above.

Learning progress is stored separately in the `LearningProgress` collection,
with one document per student and story. Completed lessons are embedded with
their chapter, lesson, and completion timestamp; the last accessed lesson and
timestamp are stored on the same record. A unique student/story index prevents
duplicate progress documents. The authenticated identity supplies the student
ID; clients cannot read or write another student's progress.

Progress endpoints (all require student authentication; POST requests also
require same-origin requests):

- `GET /api/learning/progress/summary` — available stories, started stories,
  completed lessons, total available lessons, actual completion percentage,
  and a continue-learning location.
- `GET /api/learning/progress/last-accessed` — most recently opened lesson
  with the story and chapter details needed to continue.
- `GET /api/learning/progress/stories/:slugOrId` — completion state and lesson
  counts for one published story.
- `POST /api/learning/progress/stories/:slugOrId/chapters/:chapterId/lessons/:lessonId/access`
  — records the last accessed lesson without marking it complete.
- `POST /api/learning/progress/stories/:slugOrId/chapters/:chapterId/lessons/:lessonId/complete`
  — marks that lesson complete once and records its completion time.

The student dashboard shows database-derived profile and story progress,
published teacher paths, recent published stories, the last opened lesson,
published announcements, a seven-day activity view, and the next published
teacher assessment where one exists. `GET /api/student/dashboard` requires an
active student session and accepts an optional IANA `timeZone` query parameter
for calendar grouping. Weekly activity is derived from saved story completion
timestamps, saved last-access timestamps, and teacher assessment submissions.
The source records currently retain only the most recent access per story or
teacher, so the calendar cannot reconstruct every historical study session.
`GET /api/student/announcements` returns published announcements only.

Point awards and progression are centralized in `server/src/config/progression.js`.
First-time lesson completion grants 5 Dharma points after at least 15 seconds
since the server-recorded lesson access. Correct assessment marks grant 10
Dharma points each. Reward event keys are stored with the student record so
retries cannot award points twice. Dharma cannot fall below zero; Adharma is
tracked separately. Effective Dharma for Loka thresholds is
`max(0, dharmaPoints - adharmaPoints * 2)`. Loka requirements in order are
0, 100, 250, 500, 850, 1300, 1900, 2600, 3400, 4300, 5300, 6400, 7600, and
9000 effective Dharma. Ashram requirements are 0, 500, 1500, 3500, and 6000
Dharma points. Earned unlocks are persisted and remain permanent when scores
later decrease. Existing student point values are not reset.

The dashboard currently reports real Dharma points, effective Dharma, all 14
Loka unlocks, Ashram stage/progress, published announcements, and a seven-day
activity calendar. The activity calendar groups stored timestamps in the
requested browser timezone and reports lesson completions, test attempts,
recorded access sessions, and Dharma earned. It cannot reconstruct older
access sessions beyond the most recent access stored per story or teacher.
The Village of Destiny module is now available as an in-browser open-world
adventure page, while the remaining Fun Mode and Dharma Situations content
remains an authored extension area for future modules.

Administrators manage announcements at `/admin/announcements.html`. The API
under `/api/admin/announcements` uses the existing admin authentication and
same-origin checks. Administrators can create and edit drafts, then publish or
unpublish them. Student-facing responses never include the creating admin ID.

## Guardian invitations

Students send a guardian invite from the dashboard. The service emails a
single-use, 24-hour verification link; only a verified email can create or
attach a `guardian` account. A guardian request remains pending until the
student approves it. Students can reject or revoke access; approved access is
checked on every read request, so revocation takes effect immediately. Guardian
reads are limited to a read-only learning summary, and guardian endpoints never
accept a student ID as authorization by itself.

Configure these variables in the local `.env` before using invitations:

- `APP_BASE_URL` — the public origin used in invitation links.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and
  `SMTP_FROM` — the mail provider connection. Keep credentials only in `.env`;
  never place them in source code or logs.

Routes include `POST /api/student/guardian-invites`,
`GET /api/student/guardian-relationships`, student-owned approve/reject at
`PATCH /api/student/guardian-relationships/:relationshipId`, and revoke at
`DELETE` on that same path. Guardian accounts accept verified invitations at
`POST /api/guardian/invites/accept`; existing guardian accounts use
`POST /api/guardian/invites/accept-existing`. Guardian summaries are available
only through `GET /api/guardian/students/:studentId/dashboard` while the
relationship is approved. `/guardian-dashboard.html` is the read-only view.
The invite token is hashed in MongoDB and is never returned by the student API.

## Six teacher learning module

The module uses the project's existing HTML, CSS, vanilla JavaScript, Express,
Mongoose, and HTTP-only JWT cookie authentication. The six approved identities
are Dharma Teacher, Bhakti Teacher, Sanskrit Teacher, Aryabhata, Saptarishi, and
Maharshi Kanad. Dharma, Bhakti, and Sanskrit are curriculum personas; Aryabhata
is presented as a historical scholar; Saptarishi is a collective whose
membership varies by textual tradition; and Kanada is a traditional
philosopher associated with Vaiśeṣika. Lessons must label and source historical,
mythological, and interpretive claims.

The `Teacher` collection stores one profile with embedded age-group syllabuses,
modules, chapters, lessons, activities, and assessments. Each syllabus is
scoped to `6-8`, `9-12`, `13-15`, `16-18`, or `18+`. Publication requires all
five age groups, at least one module and chapter per group, lessons and an
assessment in each chapter, and an administrator's explicit content-review
confirmation. Correct and accepted answers are omitted from student responses
until the server grades an attempt.

`TeacherProgress` stores lesson completion and last access for a student,
teacher, and age group. `TeacherAssessmentAttempt` stores server-calculated
scores and student answers; result routes enforce student ownership. These
models are separate from story-specific `LearningProgress`, and existing story
records are not changed.

Student pages are `/teachers.html`, `/teachers/dharma.html`,
`/teachers/bhakti.html`, `/teachers/sanskrit.html`,
`/teachers/aryabhata.html`, `/teachers/saptarishi.html`, and
`/teachers/kanada.html`. Shared lesson and assessment pages use
`/teacher-lesson.html?teacher=<slug>&ageGroup=<group>&lesson=<id>` and
`/teacher-assessment.html?teacher=<slug>&ageGroup=<group>&assessment=<id>`.
All student teacher APIs require an active authenticated student:

- `GET /api/learning/teachers?ageGroup=9-12` — published teacher cards with database-derived progress.
- `GET /api/learning/teachers/:slug` — profile; the selected-age syllabus is fetched separately.
- `GET /api/learning/teachers/:slug/age-groups/:ageGroup/syllabus` — one syllabus with answer keys removed.
- `GET /api/learning/teachers/:slug/age-groups/:ageGroup/lessons/:lessonId` — lesson and sequence navigation.
- `POST /api/learning/teachers/:slug/age-groups/:ageGroup/lessons/:lessonId/access` — records access without completion.
- `POST /api/learning/teachers/:slug/age-groups/:ageGroup/lessons/:lessonId/complete` — explicitly completes a lesson.
- `POST /api/learning/teachers/:slug/age-groups/:ageGroup/assessments/:assessmentId/submit` — validates and grades answers on the server; `submissionKey` makes retries idempotent.
- `GET /api/learning/teachers/results/:attemptId` — returns an assessment result only to its student.
- `GET /api/learning/teachers/progress` — the authenticated student's teacher progress summary.

Admin teacher APIs are under `/api/admin/teachers` and reuse `authenticate`,
`requireAdmin`, and same-origin checks for changes. They list and read drafts,
create and edit profile and syllabus content, and publish, archive, or return a
teacher to draft. `/admin/teachers.html` provides a structured JSON editor for
the nested profile and curriculum. Publishing is blocked until all five age
paths and each chapter assessment are present.

Run `npm run teachers:seed` from the project directory to add the six starter
profile shells to the configured database. This command inserts only missing
slugs and leaves existing records untouched. All six profiles are unreviewed
drafts with empty syllabuses and no progress; administrators must author and
review the age-specific curriculum before students can see them. No seed
command has been run as part of implementation.

There is no teacher artwork in `public/assets/images/`; pages use a local
monogram placeholder until reviewed artwork is available. The authoring
interface is JSON-based rather than a visual nested form. Assessment time
limits are stored but not enforced server-side, and attempt limits are not
implemented. Lesson/question content still requires subject-matter and
age-appropriateness review. Aryabhata is historical rather than mythological;
Saptarishi lists vary by source; and Vaiśeṣika paramāṇu must not be equated with
the modern atom.

Content authors can begin with the [IIT Kanpur Bhagavad Gita
text](https://heritage.iitk.ac.in/SBG), [IIT Kanpur Valmiki Ramayana
text](https://heritage.iitk.ac.in/VRAM), [Aryabhata I entry from the
International Study Group on Music Archaeology](https://ismi.mpiwg-berlin.mpg.de/biography/Aryabhata_I_BEA.htm), and the [Stanford Encyclopedia of Philosophy entry on ancient atomism](https://plato.stanford.edu/entries/atomism-ancient/). Each published lesson should identify the specific source, edition, and interpretive choices used.

Run the CLI validation tests with
`node --test server/tests/provisionFirstAdmin.test.js` and
`node --test server/tests/changeAdminPassword.test.js`,
`node --test server/tests/changeStudentPassword.test.js`. Run the isolated
model and API checks with `node --test server/tests/learningContent.test.js`. The
integration test requires configured `MONGODB_URI`
and `JWT_SECRET` values, creates a uniquely named temporary database, and drops
only that test database at completion. It does not use the normal application
database for fixture users or story content.

Run `node --test server/tests/teacherLearning.test.js` and
`node --test server/tests/seedTeacherProfiles.test.js` for teacher authorization,
progress, assessment, and seed checks. Both use unique disposable database
names and drop only their own test database.

The public website includes landing, About, How It Works, and Contact pages.
Contact form fields are validated in the browser, but submissions are disabled
until a contact service is provided; the form does not send or store messages.

## Student dashboard

The authenticated student dashboard at `/dashboard.html` has responsive
navigation for teacher learning paths, published assessments, saved assessment
results, learning progress, story resources, published announcements, and
account preferences. Its UI uses the existing cookie-authenticated API client;
student APIs derive the student identity from the verified session and require
the `student` role.

Dashboard endpoints are mounted under `/api/student`:

- `GET /courses`, `GET /courses/:slug`, and `GET /courses/:slug/syllabus` use
  published `Teacher` records and the student's saved `TeacherProgress`.
- `GET /assignments` lists published teacher assessments for the student's
  age group. Submission remains on the existing server-scored
  `/api/learning/teachers/:slug/age-groups/:ageGroup/assessments/:assessmentId/submit`
  endpoint; results remain private to the submitting student.
- `GET /submissions`, `/grades/gradebook`, and `/grades/progress` read only
  saved assessment attempts and teacher progress. No GPA is calculated.
- `GET /library/resources` and `/library/resources/:resourceId` expose
  published story content. Download history is explicitly unavailable because
  downloadable resources are not currently tracked.
- `GET /announcements` and `/announcements/:announcementId` return published
  announcements only.
- `GET /calendar/classes`, `/calendar/events`, and `/calendar/exams` report an
  unavailable schedule; no class times, events, or assessment deadlines are
  fabricated.
- `GET /settings`, `PUT /settings/preferences`,
  `PUT /settings/notifications`, and `PUT /settings/password` support saved
  dashboard preferences and authenticated student password changes. A
  successful password change clears the current browser's authentication
  cookie. Two-factor authentication, notification delivery, and server-side
  session history are not configured.

The dashboard adds optional `dashboardSettings` fields to the existing User
schema; no database reset, seeding, index synchronization, or migration is
required. Existing profiles, teacher records, progress, assessments, stories,
and announcement data are not recreated or changed by dashboard page loads.
MythoVerse is a Flask and SQLite learning application with three connected modules:

- Dataset Mentor
- Learning Intelligence
- Dataset Debate Room

## Local setup

The application uses the checked-in local mythology dataset and requires no API key.

    python -m pip install -r requirements.txt
    python app.py

Open http://127.0.0.1:5000/.

Optional settings can be copied from .env.example:

- SECRET_KEY controls Flask session signing.
- DATABASE_PATH selects a SQLite database location. If omitted, the application uses mythoverse.db in the project directory.

The application does not require .env, an external AI service, or network access for normal Mentor, Learning, or Debate workflows.

## Dataset

The source data is data/mythology_dataset.json plus the curated domain pack in data/mythology_dataset_expansion.json. They are JSON arrays of records. Every record must contain:

- id, title, category, and topic
- summary and detailed_content
- characters, keywords, and questions
- source_name and source_reference
- language and age_group

Records are validated when loaded. To add a record, preserve the schema, use a stable unique ID, include factual content appropriate to the listed age groups, and provide a specific source name and reference. Do not add unsourced claims or fabricated quotations.

dataset_service.py builds a TF-IDF index over weighted title/topic fields, summaries, detailed content, keywords, characters, relationships, locations, teachings, and verse references. Search normalizes aliases such as Ram/Rama and Gokul/Gokula, expands transparent intent terms such as chariot/charioteer, birthplace/parents, fought/battlefield, live/Dwarka, and wrote/author, applies exact curated-question, title, and structured-field ranking, uses a cosine-similarity floor, and can filter by age group. Follow-up questions can reuse the prior student question in the same conversation.

The dataset currently contains 102 validated records across 20 categories. It includes 18 structured Bhagavad Gita chapter records with chapter names, English meanings, standard 700-verse-recension counts, summaries, teachings, practical examples, questions, related chapters, and source references. It also includes a separately sourced and verified Bhagavad Gita 2.47 verse record with Sanskrit, transliteration, and a plain-English paraphrase, plus expanded records for epic events, Vedic and Upanishadic traditions, Puranic stories, philosophy, places, festivals, texts, symbols, and ancient knowledge traditions. The full 700-verse corpus, word-by-word commentary for every verse, and complete coverage of every Purana are not yet included.

## Dataset Mentor

POST /api/mentor/chat retrieves the best matching dataset records and returns:

- Grounded content from the selected record
- Dataset record IDs and relevance values
- Source names and source references
- A related second record when available

If no record clears the relevance threshold, the Mentor returns an honest out-of-scope response instead of inventing an answer. Conversation turns are persisted in SQLite. When a response needs more than one record, the answer includes the strongest grounded record plus related retrieved records and their sources.

## Learning Intelligence

The learning APIs are:

- GET /api/learning/quiz
- POST /api/learning/quiz/submit
- POST /api/learning/records
- GET /api/learning/summary

The Learning Intelligence dashboard uses the existing student ID and SQLite
database. It reports lessons completed, quiz attempts, question-level accuracy,
average score, activity streaks when timestamp data supports one, strongest and
weakest topics, topic trends, revision items, recent history, and actionable
recommendations. A new student receives an honest empty state.

Quiz questions and answer keys come from dataset records. The server grades submitted answers against the canonical dataset answer and ignores any client-provided correctness flag. Scored quiz submissions become real learning_records plus question-level learning_question_results. Topic accuracy is calculated from all saved question outcomes; strong and weak labels require at least two answered questions and use transparent thresholds of 80% and 60%. Trends require at least two quiz attempts. The adaptive quiz selects easy, medium, or hard records from the latest three attempts and respects the selected age group. Revision recommendations contain previously incorrect questions and existing dataset record IDs. No progress or recommendation is fabricated for an empty history.

## Dataset Debate Room

Debates are available through /api/debate/* and the Debate Room page.

Dataset Practice debates retrieve relevant dataset records and produce clearly labelled, deterministic retrieval-based practice responses for each of three rounds. They are not generative AI and include source names and references with their evidence. Arguments are checked for topic relevance and exact repetition before they are accepted, so an unrelated message does not consume a round.

An optional LLM Debate mode is available through the same provider boundary. Configure `DEBATE_PROVIDER=llm`, `DEBATE_LLM_ENDPOINT`, `DEBATE_LLM_MODEL`, and optionally `DEBATE_LLM_API_KEY` in the server environment. The endpoint must accept an OpenAI-compatible chat-completions request. If it is not configured or fails, the API returns a visible provider error and does not save the argument. No API key is required for Dataset Practice mode or for the automated test suite.

The automated rubric judge scores both participants on six criteria:

1. Relevance
2. Reasoning
3. Evidence
4. Clarity
5. Rebuttal
6. Respect

Each criterion is scored from 0 to 10. The total is the rounded mean of the six scores. Readiness checks, current-round enforcement, duplicate-submission protection, and the three-round state machine are stored in SQLite.

A completed non-draw debate awards exactly five points to the human winner through the dharma_reward_outbox table. Draws, incomplete debates, and the dataset opponent receive no reward. The reward row is unique per debate.

## Routes and frontend

The existing MythoVerse pages remain:

- /ai-mentor
- /learning-intelligence
- /debate-room

The frontend displays Mentor source references, learning progress and recommendations, clearly labelled Dataset Practice or LLM Debate responses, round status, automated rubric summaries, all six scores, and the final winner.

## Testing

Run the application tests:

    python -m unittest discover -s tests -v

Run the focused debate verification:

    python verify_debate_flows.py

Tests use temporary SQLite databases and do not modify the production database.

## Known limitations

- Student IDs are integration identifiers; authentication and authorization are not included.
- The dataset is currently English-language content.
- Retrieval is an explainable lexical TF-IDF system with aliases, intent expansion, structured relationship/location fields, and conversation context; it is not embedding-based semantic search.
- All 18 Bhagavad Gita chapters are represented, but the dataset does not yet contain every one of the approximately 700 individual verses or full verse-by-verse commentary.
- Ramayana, Mahabharata, Puranic, philosophical, location, festival, and traditional-knowledge coverage is curated but not exhaustive.
- Numerical debate scoring is deterministic heuristic rubric scoring, kept separate from optional LLM qualitative feedback.
- Dharma Points are queued locally; no external points service is connected.
- /api/search searches the SQLite learning catalog, while Mentor and quizzes use the mythology JSON dataset.

