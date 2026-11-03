# MythoVerse

MythoVerse is an Indian mythology-inspired educational gaming platform. This
repository includes the project foundation and public website pages. Student
accounts and learning modules are not implemented yet.

## Requirements

- Node.js 18 or newer
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
- `server/src/app.js` — Express application, static file serving, and health API.
- `server/src/server.js` — Environment loading, database startup, and HTTP server.
- `server/src/config/` — Database configuration and connection helper.
- `server/src/middleware/`, `models/`, `routes/`, `controllers/`, and `services/`
  — Reserved backend modules for future approved work.
- `server/tests/` — Reserved for backend tests.

The browser code uses HTML, CSS, and vanilla JavaScript. No frontend framework
or CSS framework is used.

Run the app through Express (`npm start`) to test the homepage and its shared
components. The header links to the implemented public pages. Login and Register currently
lead to an informational section because account access is not implemented.

The public website includes landing, About, How It Works, and Contact pages.
Contact form fields are validated in the browser, but submissions are disabled
until a contact service is provided; the form does not send or store messages.
