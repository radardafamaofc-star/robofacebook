# AUTO POST MULTIPLE FACEBOOK GROUPS V4 2021 - JERA

## Overview
This is a pre-built browser extension (Chrome/Firefox) for auto-posting to multiple Facebook groups. The repo contains only compiled/bundled static files — there is no source code to build.

## Project Structure
- `index.html` — Main entry point served by the static server
- `index.js` — Bundled extension JavaScript (5MB)
- `147.js` — Additional bundled JavaScript
- `manifest.json` — Browser extension manifest (v2)
- `server.js` — Simple Node.js HTTP server to serve the static files in development
- Various font/image/asset files at the root

## Running the Project
The project is served as a static site using a simple Node.js HTTP server:
```
node server.js
```
This serves all files at `http://0.0.0.0:5000`.

## Deployment
Configured as a **static** deployment with `publicDir: "."` (root directory).

## Notes
- This is a browser extension UI, not a traditional web app
- The `manifest.json` targets Facebook (`*://*.facebook.com/*`) for auto-posting
- No build step required — files are already compiled
