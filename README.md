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
