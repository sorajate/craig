# Craig Multi-Component Recording System: Developer Explainer

## 1. Introduction & Overall Architecture

This document provides a detailed technical overview of the Craig project, aimed at developers looking to understand its structure, components, and how they interact.

Craig is a sophisticated multi-track voice channel recording system primarily designed for Discord. It's architected as a **monorepo** containing several distinct Node.js applications and a suite of audio processing utilities. Each application handles a specific aspect of the overall service, from the Discord bot interaction to user dashboards, download processing, and background tasks.

The primary components are:

-   **`apps/bot` (Craig Bot):** The core Discord bot that users interact with to start and manage recordings.
-   **`apps/dashboard` (Craig Dashboard):** A web-based dashboard for users to manage their settings, connected accounts (cloud storage, Patreon), and potentially view recordings.
-   **`apps/download` (Craig Horse):** A web service (API and frontend page, likely `craig.horse`) that handles the processing and downloading of completed recordings.
-   **`apps/tasks` (Craig Tasks):** A background task manager for scheduled jobs like cleaning old recordings, refreshing patron data, and other maintenance.
-   **`cook/` Utilities & `cook.sh`:** A collection of command-line tools (C programs and scripts) and a master shell script (`cook.sh`) responsible for the heavy lifting of audio post-processing, format conversion, and packaging.
-   **`prisma/`:** Contains the Prisma schema defining the PostgreSQL database structure used by all applications, along with migration files.
-   **`locale/` (Git Submodule):** Manages all internationalization (i18n) translation strings, sourced from a separate repository.

These components work together to provide a seamless recording experience. The system relies on a shared **PostgreSQL database** (accessed via Prisma) for persistent storage of user data, recording metadata, configurations, and OAuth tokens. **Redis** is also used by multiple components for caching, rate limiting, and managing transient state like maintenance mode.

The following sections will delve into the specifics of each component.

## 2. Component Interactions

The various parts of the Craig system interact in the following ways:

-   **User <> `apps/bot` (Discord Bot):**
    -   Users issue commands (slash or text) to the bot in Discord to start/stop recordings, manage settings, etc.
    -   The bot handles voice connection, receives audio, and initiates recording sessions.
    -   It writes raw recording data (likely Ogg Opus streams) and metadata to disk (e.g., in the `rec/` directory) and updates the PostgreSQL database (via Prisma) with recording details (ID, user, guild, channel, timestamps, etc.).
    -   The bot may also interact with `apps/tasks` via its tRPC API to trigger certain actions (e.g., a cloud upload after recording completion).

-   **User <> `apps/dashboard` (Web Dashboard):**
    -   Users log in to the dashboard via Discord OAuth. The dashboard backend (`pages/api/login.ts`) handles this, creating a JWT session.
    -   Users manage their preferences, connect cloud storage accounts (Google Drive, Dropbox, OneDrive via OAuth flows handled by dashboard API routes), and link Patreon accounts.
    -   These settings and OAuth tokens are stored in the PostgreSQL database via Prisma by the dashboard's backend.
    -   The dashboard may display recording history by querying the database.

-   **User <> `apps/download` (Download Service - `craig.horse`):**
    -   When a user wants to download a recording, they are typically directed to a URL handled by `apps/download` (e.g., `craig.horse/rec/:recordingId?key=accessKey`).
    -   The **`apps/download/page`** (Preact/React SPA) provides the UI for selecting download formats, containers, and processing options (like Ennuizel).
    -   The frontend page communicates with the **`apps/download/api`** (Fastify backend).
    -   The API backend:
        -   Validates access to the recording (using the recording ID and access key, likely checking against the database).
        *   Orchestrates the audio processing by invoking `cook.sh` (and thus the `cook/` utilities) using `execa`. This involves passing the recording ID and desired output parameters to `cook.sh`.
        *   Streams the processed output from `cook.sh` back to the user or makes it available for download.
        *   May use WebSockets for real-time progress updates during processing.

-   **`apps/tasks` (Background Tasks):**
    *   Operates based on cron schedules (e.g., cleaning old files from `rec/` or `apps/download/downloads/` based on expiration rules in the database or config) or via tRPC calls.
    *   Interacts heavily with the **PostgreSQL database** (via Prisma) to:
        *   Fetch recording metadata for cleanup rules.
        *   Update patron status and reward tiers by querying Patreon data (via its own Patreon API client or by accessing data synced from the dashboard).
        *   Mark recordings as expired or deleted.
    *   May interact with cloud storage provider APIs (Google Drive, Dropbox) via their SDKs to perform maintenance tasks or manage uploaded files if initiated by a task.
    *   Its tRPC API (e.g., for `driveUpload`) can be called by other services like `apps/bot/` to offload tasks.

-   **`cook/` Utilities & `cook.sh`:**
    *   These are not a standalone service but a suite of tools invoked by other components, primarily `apps/download/api/`.
    *   `cook.sh` reads raw recording data from the shared `rec/` directory (based on recording ID).
    *   It uses tools from `cook/` and `ffmpeg` for processing.
    *   It outputs the final audio file/archive to its stdout, which is then captured by the calling service (`apps/download/api/`).

-   **Shared Resources:**
    *   **PostgreSQL Database (via Prisma):** The central source of truth for user accounts, recording metadata, guild settings, autorecord configurations, Patreon data, and OAuth tokens for external services. All `apps/*` components interact with it.
    *   **Redis:** Used by `apps/bot/` and `apps/tasks/` (and potentially `apps/download/api/`) for caching, rate limiting (e.g., command cooldowns in the bot), storing temporary state (e.g., maintenance mode flags), and possibly for inter-process communication or job queues if needed (though not explicitly seen for queues).
    *   **`rec/` Directory:** A shared filesystem location where raw recording data (`.ogg.data`, `.ogg.header1`, etc.) is stored by `apps/bot/` and read by `cook.sh` (when invoked by `apps/download/api/`).
    *   **`locale/` (Git Submodule):** Provides translation strings to all components that require internationalization (`apps/bot`, `apps/download/page`).

This summary provides a high-level understanding of how the pieces fit together. The subsequent sections in this document offer a deep dive into each component.

---
## 3. `apps/bot/` (Craig Bot) Component Detail

### General Information

- **Name:** Craig Bot
- **Description:** The bot client for Craig. (Taken from package.json)
- **Version:** 2.1.1 (from package.json)
- **Main Entry Point:** `apps/bot/src/index.ts` (as per `main` in package.json being `dist/index.js` after build)

### Scripts

The `package.json` located at `apps/bot/package.json` defines the following key scripts:

- **`start`**: `dotenv -e ../../.env -c -- node dist/index.js` - Starts the bot from the compiled JavaScript code, loading environment variables from the root `.env` file.
- **`start:sharding`**: `dotenv -e ../../.env -c -- node dist/sharding/index.js` - Starts the bot with sharding enabled, typically for larger bots distributing load across multiple processes. Also loads environment variables from the root `.env`.
- **`build`**: `rimraf dist && tsc` - Cleans the `dist` directory and then compiles the TypeScript code into JavaScript.
- **`sync`**: `slash-up sync` - Synchronizes slash commands with Discord. `slash-up` is likely a CLI tool related to `slash-create`.
- **`sync:dev`**: `slash-up sync -e development` - Synchronizes slash commands specifically for the development environment.
- **`lint`**: `eslint .` - Lints the codebase for style and error checking using ESLint.
- **`lint:fix`**: `eslint . --fix` - Lints the codebase and automatically fixes fixable issues.
- **`prisma:generate`**: `prisma generate --schema=../../prisma/schema.prisma` - Generates Prisma client code based on the schema file located in the root `prisma` directory. This is used for database interactions with Prisma ORM.

*Note on Bot Scripts: Some common scripts (`dev`, `clean`, `test`) were not in `apps/bot/package.json`.*

### Dependencies (Bot)
(Summary - key categories and examples)
- **Discord Interaction**: `eris`, `slash-create`, `dexare`
- **Data Storage**: `ioredis`, `@prisma/client`
- **Internationalization**: `i18next`, `i18next-fs-backend`
- **Error Tracking**: `@sentry/node`, `@sentry/tracing`
- **Utilities**: `axios`, `config` (node-config), `winston`
- **Configuration**: `config`, `dotenv`

### Database Interaction (Prisma - Bot)
- **Initialization**: Singleton `PrismaClient` in `apps/bot/src/prisma.ts`.
- **Schema**: Root `prisma/schema.prisma` defines models. `prisma generate` creates type-safe client.
- **Usage**: Imported for type-safe queries. Connection managed via `$connect`/`$disconnect`. `DATABASE_URL` from env.

### Redis Usage (Bot)
- **Initialization**: Singleton `ioredis` client in `apps/bot/src/redis.ts` (config from `node-config`, `lazyConnect: true`, `keyPrefix: 'craig:'`).
- **Connection**: Managed in `apps/bot/src/bot.ts` (`connect`/`disconnect`).
- **Helpers**: `processCooldown`, `checkMaintenance`, `setMaintenance`, `removeMaintenance` in `apps/bot/src/redis.ts`.
- **Availability**: Raw `client` usable directly.

### Configuration (Bot)
- **Loader**: `node-config` from `apps/bot/config/`. Root `.env` file.
- **Interface**: `CraigBotConfig` used in `apps/bot/src/bot.ts`.
- **Key Options**: Tokens, DB/Redis details, Sentry, logger settings, command paths.

### Entry Point and Core Logic (Bot)
- **Startup**: `apps/bot/src/index.ts` loads env, config, connects DB/Redis, Sentry, instantiates `CraigBot`, i18n, loads modules/commands, logs into Discord.
- **Shutdown**: Disconnects DB/Redis.

### Logging (Bot)
- **Module**: `LoggerModule` in `apps/bot/src/modules/logger.ts` (uses Winston).
- **Output**: Console, configurable levels.

### Modularity and Extensibility (Bot)
- **Dexare Modules**: In `apps/bot/src/modules/`.
- **Slash Commands**: `slash-create` based, in `apps/bot/src/commands/` (or configured path).
- **Text Commands**: Dexare based, in `apps/bot/src/textCommands/` (or configured path).
- **i18n**: `i18next` with JSON files in root `locale/` dir.

---

*End of `apps/bot/` Documentation Summary.*

---
## 4. `apps/dashboard/` (Craig Dashboard) Component Detail

### 4.1. `package.json` Analysis

This section details the contents of `apps/dashboard/package.json`.

#### General Information

- **Name:** `craig-dashboard`
- **Version:** `1.0.0`
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

#### Scripts

- **`dev`**: `next dev` - Starts Next.js development server (HMR, local serving e.g., `localhost:3000`).
- **`build`**: `next build` - Builds Next.js app for production (optimizes, bundles, outputs to `.next/`).
- **`start`**: `next start` - Starts Next.js production server (serves optimized build from `.next/`).
- **`lint`**: `eslint .` - Lints codebase with ESLint for style and error checking.
- **`lint:fix`**: `eslint . --fix` - Lints and automatically fixes ESLint issues.
- **`prisma:generate`**: `prisma generate --schema=../../prisma/schema.prisma` - Generates Prisma Client from root schema for type-safe DB interactions.

#### Categorized Dependencies

##### Core Framework & Rendering
- **`next`**: (v12.1.6) React framework (SSR, SSG, routing, API routes).
- **`react`**: (v17.0.2) UI library.
- **`react-dom`**: (v17.0.2) React DOM renderer.
- **`preact`**: (v10.9.0) Fast React alternative (used for production optimization via `next.config.js`).
- **`preact-compat`**: (v3.19.0) Compatibility layer for Preact.

##### UI & Styling
- **`tailwindcss`**: (v3.2.4) Utility-first CSS framework.
- **`@headlessui/react`**: (v1.4.3) Unstyled, accessible UI components.
- **`sass`**: (v1.56.0) CSS preprocessor.
- **`autoprefixer`**: (v10.4.12) PostCSS plugin for vendor prefixes.
- **`postcss`**: (v8.4.14) CSS transformation tool.
- **`clsx`**: (v1.2.1) Conditional className utility.
- **`react-tippy`**: (v1.4.0) React tooltip component.
- **`@fontsource/*`**: Self-hostable fonts (`lexend`, `red-hat-text`, `roboto`).

##### API Clients & Data Handling
- **`@prisma/client`**: (v5.12.1) Type-safe Prisma query builder.
- **`googleapis`**: (v104.0.0) Google APIs client (e.g., YouTube, Drive).
- **`dropbox`**: (v10.34.0) Dropbox API SDK.
- **`node-fetch`**: (v2.6.7) `fetch` API for Node.js (server-side requests).

##### Authentication & Cookies
- **`jsonwebtoken`**: (v8.5.1) JWT implementation for auth tokens.
- **`cookie`**: (v0.5.0) Cookie parser/serializer.

#### DevDependencies
- **`typescript`**: (v4.7.3) Static typing for JavaScript.
- **`@types/*`**: Type definitions for various libraries (cookie, jsonwebtoken, node, node-fetch, react).

#### Summary Statement
The dashboard is a **Next.js (React/Preact) TypeScript** application, styled with **Tailwind CSS**. It uses **Prisma** for database operations and integrates with **Google APIs** and **Dropbox**. Authentication relies on **JSON Web Tokens**.

*(Assuming "4.2. Configuration" for the dashboard will be detailed separately or was part of a prior step. If it needs to be added here, the numbering below will need adjustment.)*

### 4.3. Next.js Structure and Project Layout

The `apps/dashboard/` project follows a standard Next.js structure, leveraging its conventions for routing and organization.

- **`pages/` Directory**: This is the core of Next.js's file-system routing.
    - **Page Routes**: Each `.tsx` or `.jsx` file (excluding those prefixed with `_`) inside `pages/` automatically becomes a route.
        - `index.tsx`: The homepage of the dashboard (maps to `/`).
        - `login.tsx`: Likely handles the initiation of the login process or displays a login page (maps to `/login`).
        - `dashboard.tsx` (example): A protected route for displaying user-specific dashboard content (maps to `/dashboard`).
        - `_app.tsx`: A custom App component that Next.js uses to initialize pages. It allows persisting layout between page changes, injecting global CSS, and managing state.
        - `_document.tsx` (if present): Customizes the server-rendered document shell, allowing modifications to `<html>` and `<body>` tags.
    - **API Routes**: Files within `pages/api/` are treated as API endpoints instead of pages.
        - Each file maps to an `/api/*` route and exports a handler function (e.g., `export default function handler(req, res) { ... }`).
        - **Purpose**: Used for backend logic, handling authentication, database interactions, and communication with external services without needing a separate backend server.
        - **Observed API Routes Structure**:
            - `pages/api/auth/`: Contains authentication-related endpoints like `login.ts` (initiating Discord OAuth), `callback.ts` (handling Discord OAuth callback), and `logout.ts`.
            - `pages/api/user/`: Endpoints for user-specific actions like fetching user data, settings, or performing operations related to the logged-in user.
            - `pages/api/cloud/[provider]/`: Likely contains routes for OAuth and interactions with cloud storage providers (e.g., `pages/api/cloud/google/auth.ts`, `pages/api/cloud/dropbox/upload.ts`).
            - `pages/api/patreon/`: Endpoints related to Patreon integration (e.g., webhook handling, checking patron status).

- **Other Common Directories**:
    - **`components/`**: Contains reusable UI components (React components) used across various pages (e.g., buttons, modals, layout elements).
    - **`lib/`**: Often used for utility functions, helper scripts, and client-side libraries or SDKs that are not React components (e.g., Prisma client instance if not in root, specific API client wrappers, date formatters).
    - **`utils/`**: Similar to `lib/`, may contain general utility functions or hooks. The distinction between `lib/` and `utils/` can be project-specific.
    - **`public/`**: Static assets that are served directly from the root of the site (e.g., images, favicons, `robots.txt`). Files here are accessible via `/filename.ext`.
    - **`styles/`**: Global stylesheets, SASS variables, or CSS modules if not co-located with components (e.g., `globals.scss`).

- **Preact Optimization (`next.config.js`)**:
    - The `next.config.js` file includes a Webpack configuration modification to alias `react` and `react-dom` to `preact/compat` in production builds.
    - **Purpose**: This swaps React for Preact (a smaller, faster alternative with a similar API) in the production bundle, reducing the JavaScript size sent to the client, potentially improving load times.

- **Overall Project Structure Summary**:
    The project is structured as a typical Next.js application, with clear separation of pages, API routes, UI components, and static assets. It leverages file-system routing and is configured for Preact optimization in production. The `prisma/schema.prisma` at the monorepo root defines the database models used by the dashboard's Prisma client.

### 4.4. Logging

Logging in the Next.js dashboard application primarily relies on standard console output and the logging capabilities of the deployment environment.

- **Default Next.js Logging**:
    - **Development**: Next.js provides detailed logging to the console during development (`next dev`). This includes information about compilation, route handling, API requests, and errors.
    - **Production**: In production (`next start`), Next.js's logging is more minimal, focusing on request information and errors. Output is typically sent to `stdout` and `stderr`.
- **`console.*` in API Routes**:
    - Custom logging within API routes (e.g., in `pages/api/`) is generally done using standard `console.log()`, `console.warn()`, and `console.error()` statements. This is useful for debugging and tracking specific events or errors in backend logic.
- **Accessing Production Logs**:
    - How production logs are accessed depends heavily on the deployment environment:
        - **PM2**: If using PM2 (a process manager for Node.js) to run the Next.js application, PM2 typically captures `stdout` and `stderr` into log files (e.g., `~/.pm2/logs/craig-dashboard-out.log` and `~/.pm2/logs/craig-dashboard-error.log`).
        - **Docker**: If deployed in a Docker container, logs are usually sent to `stdout`/`stderr` and managed by the Docker logging driver (e.g., viewed with `docker logs <container_id>`).
        - **PaaS (Platform as a Service)**: Platforms like Vercel (Next.js's native platform), Heroku, or AWS Elastic Beanstalk have their own integrated logging solutions that collect and display application logs.
- **Absence of Dedicated Logging Library**:
    - The `apps/dashboard/package.json` does not list a dedicated server-side logging library like Winston or Pino as a direct dependency. This means logging is simpler and relies on basic console output, with the expectation that the runtime environment will handle log aggregation and management.

### 4.5. Extensibility

The Next.js framework provides a straightforward path for extending the dashboard's functionality.

- **Adding New Pages**:
    1. Create a new `.tsx` (or `.jsx`) file in the `pages/` directory or a subdirectory (e.g., `pages/settings/profile.tsx` would create the `/settings/profile` route).
    2. Export a React component as the default export from this file. This component will be rendered for the new route.
    3. Add links or navigation to this new page from existing parts of the application as needed.
- **Adding New API Routes**:
    1. Create a new `.ts` (or `.js`) file in the `pages/api/` directory or a subdirectory (e.g., `pages/api/billing/subscribe.ts` creates the `/api/billing/subscribe` endpoint).
    2. Export a default function (the handler) that takes `NextApiRequest` and `NextApiResponse` objects as parameters.
    3. Implement the backend logic within this handler (e.g., database interaction, calling external services, etc.).
- **Adding New UI Components**:
    1. Create a new `.tsx` file in the `components/` directory (e.g., `components/common/DataGrid.tsx`).
    2. Define and export the React component.
    3. Import and use this component in any page or other component as needed.
- **Integrating a New Cloud Storage Provider or External Service**:
    1. **Backend API Setup**:
        - Create new API routes in `pages/api/cloud/[newprovider]/` (or a similar appropriate path).
        - Implement OAuth 2.0 flow if required:
            - An endpoint to redirect to the provider's authorization URL.
            - A callback endpoint to handle the authorization code, exchange it for tokens, and store them securely (e.g., in the database, associated with the user).
        - Create API routes for interacting with the provider's service (e.g., listing files, initiating uploads/downloads), using the stored tokens for authentication.
    2. **Frontend UI**:
        - Develop new React components in `components/` for any UI elements needed to interact with the new service (e.g., buttons to connect, file pickers, status indicators).
        - Add new pages or modify existing ones in `pages/` to display these components and allow users to manage the integration.
        - Implement client-side logic to call the new backend API routes.
    3. **Database Changes (if necessary)**:
        - Update `prisma/schema.prisma` if new tables or columns are needed to store information related to the new provider (e.g., user tokens for the service, configuration settings).
        - Run `prisma generate` to update the Prisma Client.
        - Update database interaction logic in API routes to use the new schema.
    4. **Configuration**: Add any necessary API keys, secrets, or URLs to the application's configuration (e.g., environment variables, `node-config` files).

### 4.6. Authentication Flow

The dashboard uses an OAuth 2.0 flow with Discord for user authentication, ultimately issuing a JWT (JSON Web Token) stored in an HTTP-only cookie.

- **OAuth 2.0 Flow via `/api/auth/login` and `/api/auth/callback`**:
    1.  **Initial Redirect (`/api/auth/login` or frontend action)**:
        *   The user initiates login (e.g., by clicking a "Login with Discord" button).
        *   The dashboard backend (or frontend directly) redirects the user to Discord's OAuth2 authorization URL. This URL includes parameters like `client_id`, `redirect_uri` (pointing to `/api/auth/callback`), `response_type=code`, and requested `scope`s (e.g., `identify`, `guilds`).
    2.  **User Authorization on Discord**:
        *   The user is prompted by Discord to authorize the application with the requested permissions.
    3.  **Callback Handling (`/api/auth/callback`)**:
        *   If the user authorizes, Discord redirects them back to the `redirect_uri` (`/api/auth/callback`) with an `authorization_code` and the original `state` (if used).
        *   The `/api/auth/callback` endpoint receives this code.
        *   It then makes a server-to-server request to Discord's token endpoint (`/oauth2/token`) to exchange the `authorization_code` for an `access_token`, `refresh_token`, and token `expires_in` duration. This request requires the `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, and `redirect_uri`.
    4.  **Fetching User Profile**:
        *   Using the obtained `access_token`, the dashboard backend makes a request to the Discord API's `/users/@me` endpoint to fetch the user's profile information (ID, username, avatar, etc.).
    5.  **JWT Creation**:
        *   A JWT is created. The payload typically includes user identifiers (e.g., Discord user ID), session information, and potentially roles or permissions.
        *   The token is signed using a secret key (`config.jwtSecret` from `node-config`).
        *   An expiration time is set for the JWT (e.g., `config.jwtExpiresIn`).
    6.  **Setting Cookie**:
        *   The generated JWT is set as an `httpOnly` cookie.
        *   The cookie name is likely configurable (e.g., `config.cookieName`).
        *   Security attributes for the cookie are important:
            *   `httpOnly`: Prevents client-side JavaScript access to the cookie, mitigating XSS attacks.
            *   `secure`: Ensures the cookie is only sent over HTTPS (should be true in production).
            *   `path`: Typically set to `/` to be available across the site.
            *   `sameSite`: Often `lax` or `strict` for CSRF protection.
            *   `maxAge` or `expires`: Aligned with the JWT's expiration.
    7.  **Redirection**:
        *   The user is redirected to a protected page on the dashboard (e.g., the main dashboard page or their last visited page).

- **Authenticating Subsequent Requests**:
    *   For subsequent requests to protected pages or API routes, the browser automatically sends the JWT cookie.
    *   Server-side logic (e.g., in a Next.js middleware, API route handler, or `getServerSideProps`) retrieves the JWT from the cookie.
    *   The JWT is verified using the `config.jwtSecret`. Verification checks the signature and expiration.
    *   If the JWT is valid, the user is considered authenticated, and their information (from the JWT payload) can be used to process the request. Otherwise, they might be redirected to login or receive an error.

- **Logout Process (`/api/auth/logout`)**:
    *   The `/api/auth/logout` endpoint clears the JWT cookie. This is typically done by setting the cookie with the same name but an empty value and an expiration date in the past.
    *   The user is then usually redirected to the homepage or login page.

- **Role of Libraries**:
    - **`jsonwebtoken`**: Used for signing (creating) and verifying JWTs on the server-side.
    - **`cookie`**: Used for parsing cookies from incoming requests (`req.headers.cookie`) and serializing cookies to be set in outgoing responses (`res.setHeader('Set-Cookie', ...)`).

---

*End of `apps/dashboard/` Documentation Update.*

---
## 5. `apps/download/` (Craig Horse) Component Detail

### 5.1. `package.json` Analysis

This section details the contents of `apps/download/package.json`.

#### General Information

- **Name:** `craig-horse`
- **Description:** API and page source of craig.horse
- **Version:** `1.1.0`
- **Main Entry Point:** `./dist/index.js` (This points to the compiled API server)
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

#### Scripts

- **`start`**: `node ./dist/index.js`
    - **Purpose:** Runs the compiled Fastify API server.
    - **How it works:** Executes the main JavaScript file (output of TypeScript compilation) located in `./dist/`, which starts the Fastify server to handle API requests.
- **`build`**: `npm run build:api && npm run build:page`
    - **Purpose:** Builds both the API and the frontend page.
    - **How it works:** This is a compound script that first runs `build:api` then `build:page`.
- **`build:api`**: `cd api && tsc`
    - **Purpose:** Compiles the Fastify API server written in TypeScript.
    - **How it works:** Navigates into the `api/` directory and runs the TypeScript compiler (`tsc`). This transpiles TypeScript code (likely from `api/src/` or similar) into JavaScript, outputting to `api/dist/` or the main `dist/` directory as configured in `api/tsconfig.json`.
- **`build:page`**: `rollup -c`
    - **Purpose:** Bundles and builds the frontend single-page application (SPA).
    - **How it works:** Executes Rollup using its configuration file (`rollup.config.js`). Rollup processes the frontend source code (likely Preact/React with TypeScript in `page/src/` or similar), bundles it into one or more JavaScript files, handles CSS (Tailwind, SASS), and other assets, outputting them to a directory that the Fastify server can serve statically (e.g., `public/assets/` or `dist/public/assets/`).
- **`lint`**: `eslint .`
    - **Purpose:** Lints the codebase (both API and page) using ESLint.
- **`lint:fix`**: `eslint . --fix`
    - **Purpose:** Lints and automatically fixes ESLint issues.
- **`init`**: `yarn && rimraf dist && tsc && devScript --copyOnly`
    - **Purpose:** Initializes the project, likely for development setup.
    - **How it works:** Installs dependencies using `yarn`, removes the `dist` directory, compiles TypeScript (likely the API part), and then runs a custom `devScript` (from `ts-devscript` dependency) with a `copyOnly` flag, which might copy static assets or perform other setup tasks.
- **`pm2`**: `pm2 start pm2.json`
    - **Purpose:** Starts the application using PM2 process manager, using the default environment settings in `pm2.json`.
- **`pm2:prod`**: `pm2 start pm2.json --env production`
    - **Purpose:** Starts the application using PM2 in production mode.
    - **How it works:** Similar to `pm2` but specifically sets the environment to `production`, which might enable different configurations within `pm2.json` or the application itself (e.g., different logging levels, port numbers).

#### Categorized Dependencies (API - `dependencies` in `package.json`)

##### API Framework & Server
- **`fastify`**: (v4.10.2) A fast and low overhead web framework for Node.js. Used as the core for the backend API.
- **`@fastify/helmet`**: (v9.1.0) Fastify plugin to set important security headers via Helmet.
- **`@fastify/rate-limit`**: (v7.0.0) Fastify plugin for rate limiting API requests.
- **`@fastify/static`**: (v6.5.0) Fastify plugin for serving static files (used to serve the bundled frontend page and assets).
- **`@fastify/websocket`**: (v7.1.2) Fastify plugin for adding WebSocket support to the server.

##### External Process Execution
- **`execa`**: ("5") A better `child_process` library for running external commands (e.g., ffmpeg, yt-dlp).

##### Data Handling & Utilities
- **`ioredis`**: (v5.0.6) Redis client, likely for caching or session management.
- **`destr`**: (v1.2.2) Fast, secure and convenient alternative to `JSON.parse`.
- **`nanoid`**: (v3.3.4) Small, secure, URL-friendly unique ID generator.
- **`dotenv`**: (v16.0.3) Loads environment variables from a `.env` file.

##### Error Tracking & Metrics
- **`@influxdata/influxdb-client`**: (v1.24.0) Client for InfluxDB, a time-series database, likely for metrics.
- **`@sentry/node`**: (v7.2.0) Sentry SDK for Node.js (error tracking for the API).
- **`@sentry/tracing`**, **`@sentry/integrations`**: Additional Sentry packages for performance tracing and integrations.

##### Scheduling
- **`cron`**: (v2.1.0) Job scheduler, for running tasks at defined intervals.

##### Fonts
- **`@fontsource/*`**: (`lexend`, `red-hat-text`, `ubuntu-mono`) Self-hostable open source fonts. While listed under `dependencies`, these are typically used by the frontend page but bundled during `build:page`. Their inclusion here might be a structural choice or for server-side rendering of some elements if that occurs.

#### Categorized DevDependencies (Primarily for Frontend Page - `devDependencies` in `package.json`)

##### Frontend Framework & UI
- **`preact`**: (v10.9.0) Fast React alternative.
- **`react`**: (v17.0.2), **`react-dom`**: (v17.0.2) Used for Preact compatibility or if some components are React-specific.
- **`@headlessui/react`**: (v1.4.3) Unstyled, accessible UI components.
- **`@iconify/react`**, **`@iconify-icons/*`**: For using a wide range of icons as components.
- **`react-color`**: (v2.19.3) Color picker component.
- **`react-modal`**: (v3.15.1) Modal dialog component.
- **`react-tippy`**: (v1.4.0) Tooltip component.

##### Build Tools
- **`rollup`**: (v2.75.7) A module bundler for JavaScript.
- **`@rollup/plugin-alias`**: (v3.1.9) Defines aliases for module paths.
- **`@rollup/plugin-buble`**: (v0.21.3) Older, faster JS transpiler (alternative to Babel for ES2015+).
- **`@rollup/plugin-commonjs`**: (v22.0.0) Converts CommonJS modules to ES6.
- **`@rollup/plugin-node-resolve`**: (v13.3.0) Resolves Node.js modules from `node_modules`.
- **`@rollup/plugin-typescript`**: (v8.3.3) Integrates TypeScript with Rollup.
- **`rollup-plugin-inject-process-env`**: (v1.3.1) Injects environment variables into the bundle.
- **`rollup-plugin-postcss`**: (v4.0.2) Processes CSS with PostCSS plugins within Rollup.
- **`rollup-plugin-terser`**: (v7.0.2) Minifies JavaScript bundles.
- **`tslib`**: (v2.4.0) TypeScript runtime library.
- **`typescript`**: (v4.7.3) TypeScript compiler.

##### Styling
- **`tailwindcss`**: (v3.2.4) Utility-first CSS framework.
- **`node-sass`**: (v9.0.0) Provides bindings for Node.js to LibSass (used by `rollup-plugin-postcss` or SASS plugins).
- **`autoprefixer`**: (v10.4.12) PostCSS plugin for vendor prefixes.
- **`postcss`**: (v8.4.14) CSS transformation tool.
- **`@fullhuman/postcss-purgecss`**: (v4.1.3) PostCSS plugin to remove unused CSS.

##### Internationalization (i18n)
- **`i18next`**: (v21.10.0) Internationalization framework.
- **`react-i18next`**: (v11.15.3) React bindings for i18next.

##### Error Tracking (Frontend)
- **`@sentry/react`**: (v6.17.4) Sentry SDK for React applications.

#### Summary Statement
`craig-horse` is a dual-component application:
1.  A **backend API** built with **Fastify** (Node.js framework), responsible for handling core logic, external processes (like downloads via `execa`), data management (with Redis), and serving files. It includes error tracking with Sentry and metrics with InfluxDB.
2.  A **frontend single-page application (SPA)** built with **Preact/React** and **TypeScript**, styled using **Tailwind CSS** and **SASS**. This page is bundled using **Rollup** and its associated plugins. It features internationalization and its own Sentry integration for frontend error tracking.

The two parts are developed together but built separately (`build:api` and `build:page`) and then served by the Fastify server. PM2 is used for process management in deployment.

### 5.2. API Configuration (`apps/download/api/`)

Configuration for the Fastify API in `apps/download/api/` is primarily managed through environment variables, with some direct settings in the server setup.

- **`.env` File Usage**:
    - The application uses an `.env` file to store environment-specific variables.
    - The path to this `.env` file is determined at runtime when the API starts, typically expected to be in the `apps/download/` directory (i.e., `../../.env` relative to `api/src/index.ts` or a path specified by `process.env.ENV_PATH`).
- **Environment Variable Loading**:
    - In `api/src/index.ts`, the `dotenv` library is used to load these variables into `process.env`. This is usually one of the first things done when the application starts: `dotenv.config({ path: process.env.ENV_PATH || path.join(__dirname, '../../.env') });`
- **Key Environment Variables (inferred from `api/src/api.ts` and typical usage)**:
    - `NODE_ENV`: Defines the environment (e.g., `development`, `production`). Influences logging, Sentry behavior.
    - `TRUST_PROXY`: (Boolean-like string: "true"/"false") Whether to trust proxy headers (e.g., `X-Forwarded-For`). Passed to Fastify's `trustProxy` option.
    - `SENTRY_DSN`, `SENTRY_HOST`: For Sentry error tracking configuration.
    - `API_PORT`: Port number for the Fastify server to listen on (e.g., `3001`).
    - `API_HOST`: Host address for the server (e.g., `0.0.0.0` or `127.0.0.1`).
    - `API_HOMEPAGE`: URL for the homepage, used for redirects or links.
    - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS_CA`, `REDIS_TLS_CERT`, `REDIS_TLS_KEY`: For configuring the `ioredis` client connection.
    - `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET_API`, `INFLUX_BUCKET_PAGE`: For configuring the InfluxDB client.
    - `KEY_PREFIX`: A prefix for Redis keys (e.g., `craighorse:`).
    - `DL_PATH`: Filesystem path where downloadable files are stored.
    - `ENCODER_PATH`, `DECODER_PATH`, `MULTI_PATH`, `MERGER_PATH`: Paths to external Ennuizel (or similar) executables.
    - `MAX_RATE_LIMIT_LOGIN`, `MAX_RATE_LIMIT_ENCODE`, `MAX_RATE_LIMIT_WEBSOCKET`: For configuring rate limits on specific API functionalities.
- **Fastify Server Options & Plugin Configurations (`api/src/api.ts`)**:
    - **Server Options**: Directly set during Fastify instance creation:
        - `trustProxy`: Set based on `process.env.TRUST_PROXY`.
        - `logger`: Configured based on `NODE_ENV` (Pino logger options for development, disabled or minimal for production in favor of external logging like PM2/Sentry).
        - `bodyLimit`: Sets a maximum request body size.
    - **Plugin Configurations**: Options for Fastify plugins are often passed directly during registration:
        - `@fastify/helmet`: Default options are generally used.
        - `@fastify/static`: `root` option points to the directory serving static frontend files (e.g., `path.join(__dirname, '../../../page/public')`). `prefix` might be used (e.g., `/assets/`).
        - `@fastify/rate-limit`: Max requests, time window, Redis store for distributed rate limiting.
        - `@fastify/websocket`: Options for WebSocket handling.
- **Configuration Approach Summary**:
    The API configuration relies heavily on environment variables loaded via `dotenv` for runtime settings (ports, external service credentials, paths). Fastify server behavior and some plugin settings are configured programmatically within `api.ts`, often referencing these environment variables. There's no complex configuration file structure like `node-config` observed for the API part; it's more direct `process.env` access after initial loading.

### 5.3. Fastify API Structure (`apps/download/api/`)

The backend API for `craig-horse` is built using Fastify, with a modular structure for routes and clear plugin usage.

- **Fastify Instance Creation (`api/src/api.ts`)**:
    - A Fastify instance is created with specific options:
        - `logger`: Configured based on `NODE_ENV` (e.g., pretty print for development, standard for production).
        - `trustProxy`: Set based on environment variable.
        - `bodyLimit`: Defines the maximum size for request bodies.
- **Essential Plugins**:
    - **`@fastify/helmet`**: Registered to enhance security by setting various HTTP headers (e.g., Content-Security-Policy, X-XSS-Protection).
    - **`@fastify/static`**: Used to serve static files. Crucially, it serves the bundled frontend application from `apps/download/page/public/` (or a similar path like `dist/page/` after build).
    - **`@fastify/websocket`**: Enables WebSocket support, allowing for real-time bidirectional communication, likely used for progress updates during file processing or downloads.
    - **`@fastify/rate-limit`**: Implements rate limiting for API endpoints to prevent abuse. It's configured with options like maximum requests per time window and can use a Redis store for consistency across multiple instances.
- **Modular Routes (`apps/download/api/src/routes/`)**:
    - API routes are defined in separate files within the `apps/download/api/src/routes/` directory. This promotes organization and maintainability.
    - Each route file (e.g., `cook.ts`, `ennuizel.ts`, `page.ts`, `recording.ts`) typically exports one or more route definition objects or functions that define the method, URL, schema (for validation and serialization), and handler for specific endpoints.
    - These modular routes are registered with the Fastify server instance in `api/src/api.ts` likely using a loop or individual calls to `server.register()` or `server.route()` for each module.
- **Purpose of Route Modules (inferred)**:
    - `cook.ts`: Likely handles routes related to "cooking" or processing recordings using external tools (e.g., `ennuizel-cooker`). This might involve initiating processing tasks, checking status, and providing download links for processed files. It imports functions like `cookMulti`, `getCookMulti`, etc.
    - `ennuizel.ts`: May contain routes specifically for interacting with Ennuizel tools or serving Ennuizel-related data or UI elements if not covered by `cook.ts`.
    - `page.ts`: Handles routes related to serving the main frontend page or providing data specifically for it, potentially including WebSocket setup for page interactions. It imports `pageGet`, `pageMessage`, etc.
    - `recording.ts`: Likely manages routes for accessing recording metadata, status, or potentially initiating downloads directly.
- **Special Routes in `api.ts`**:
    - **Root Redirect (`/`)**: A route is defined for `/` that redirects to `process.env.API_HOMEPAGE` or a default path like `/page`.
    - **Health Check (`/health`)**: A simple endpoint (e.g., returns `200 OK`) for health monitoring services to check if the API is running.
    - **Direct Download (`/dl/:file`)**: A parameterized route for direct file downloads, likely serving files from the `DL_PATH` specified in environment variables.
- **`onRequest` Hook (Global Headers)**:
    - An `onRequest` hook is used in `api.ts` to set global HTTP headers for all responses, such as CORS headers (`Access-Control-Allow-Origin`, etc.) to allow the frontend page (served from a different conceptual origin if ports differ in dev) to communicate with the API.
- **Server Listening and Graceful Shutdown**:
    - The API starts listening for requests using `server.listen()`, configured with `API_PORT` and `API_HOST` from environment variables.
    - Graceful shutdown mechanisms are implemented (e.g., listening for `SIGINT` and `SIGTERM` signals) to close down the server, disconnect from Redis, and perform any other cleanup before exiting. This ensures pending requests are handled and resources are released properly.

### 5.4. Frontend Page Structure (`apps/download/page/`)

The `craig-horse` frontend is a Single-Page Application (SPA) built with Preact/React and TypeScript, bundled using Rollup.

- **SPA Architecture**:
    - The frontend is designed as an SPA, meaning a single HTML page (`page/public/index.html`) is loaded initially, and subsequent navigation and UI updates are handled dynamically on the client-side using JavaScript (Preact/React).
    - **Preact/React with TypeScript**: Components are written in `.tsx` files, leveraging TypeScript for static typing. Preact is used as a lightweight alternative to React.
- **Source Directory Structure (`page/src/`)**:
    - **`index.tsx`**: The main entry point for the SPA. This is where the root Preact component is rendered into the DOM (typically into an element in `page/public/index.html`). It also initializes i18n and Sentry.
    - **`index.sass`**: The main stylesheet for the application, written in SASS. It likely imports Tailwind CSS base styles, components, utilities, and any custom SASS/CSS.
    - **`components/`**: Contains reusable Preact components that make up the UI of the download page (e.g., file pickers, progress bars, option selectors, modals).
    - **`api.ts`**: Contains functions for making requests to the backend Fastify API (e.g., to initiate downloads, check status, fetch data). It uses `fetch` or a similar library.
    - **`i18n.ts`**: Configures `i18next` for internationalization, loads translation files (likely JSONs from `page/public/locales/`), and exports the `t` function for use in components.
- **Role of `page/public/`**:
    - This directory hosts static assets that are served directly by the Fastify backend using `@fastify/static`.
    - **`index.html`**: The main HTML shell for the SPA. It contains a root DOM element where the Preact application is mounted and includes the link to the bundled JavaScript (`rec.js`) and CSS.
    - **Static Assets**: May also include images, fonts (if not self-hosted via `@fontsource` in JS), and locale files for i18n (`locales/*.json`).
- **`rollup.config.js` Analysis**:
    - **Input**: `page/src/index.tsx` is specified as the entry point for the bundling process.
    - **Output**: The bundled JavaScript is output to `dist/page/rec.js` (or a similar path, likely configured to be served by Fastify from `page/public/assets/rec.js` or directly from `dist/page/`). A corresponding CSS file is also generated.
    - **Key Rollup Plugins**:
        - **`rollup-plugin-postcss`**: Processes CSS files. It's configured with:
            - `tailwindcss`: To process Tailwind utility classes.
            - `autoprefixer`: To add vendor prefixes.
            - `node-sass`: To compile SASS files (`.scss`, `.sass`).
            - `@fullhuman/postcss-purgecss` (conditionally for production): To remove unused CSS classes, reducing bundle size.
        - **`@rollup/plugin-typescript`**: Compiles TypeScript code to JavaScript.
        - **`@rollup/plugin-commonjs`**: Converts CommonJS modules (often from `node_modules`) to ES modules that Rollup can understand.
        - **`@rollup/plugin-node-resolve`**: Helps Rollup find and bundle modules from `node_modules`.
        - **`@rollup/plugin-alias`**: Configured to alias `react` and `react-dom` to `preact/compat` to ensure Preact is used.
        - **`rollup-plugin-inject-process-env`**: Injects environment variables (e.g., `SENTRY_DSN_PAGE`, `API_BASE`) and i18n locale strings directly into the frontend bundle. This allows the frontend to access these values at runtime.
        - **`@rollup/plugin-buble`**: A lightweight ES2015+ compiler, used for faster transpilation than Babel if full Babel features aren't needed.
        - **`rollup-plugin-terser`**: Minifies the output JavaScript bundle in production builds to reduce its size.
    - **`watch` Mode**:
        - When Rollup is run in `watch` mode (e.g., during development via a script like `npm run dev:page` if it existed, or through Rollup's watch API), it monitors source files for changes and automatically rebuilds the bundle, facilitating faster development cycles.

### 5.5. Logging Mechanisms (`apps/download/`)

Logging in `craig-horse` is handled differently for the API backend and the frontend page, with Sentry playing a role in both.

- **API Logging (Fastify Backend - `apps/download/api/`)**:
    - **Fastify's Built-in Logger**: Fastify includes a highly performant logger (Pino) by default.
        - In development (`NODE_ENV !== 'production'`), it's typically configured with `prettyPrint: true` for human-readable console output.
        - In production, this built-in logger might be disabled or set to a minimal level if relying on external logging tools like PM2.
    - **`console.log`/`console.error`**: Used within route handlers and other API logic for outputting specific informational messages or errors to `stdout`/`stderr`.
    - **Sentry Integration (`@sentry/node`)**:
        - Sentry is initialized in `api/src/index.ts` using `SENTRY_DSN` from environment variables.
        - It automatically captures unhandled exceptions and can be used to manually report errors (`Sentry.captureException()`).
        - Tracing and integrations (like `Http`, `Undici`) provide more detailed insights into requests and performance.
    - **Production Log Access**:
        - If deployed with PM2 (`pm2.json`), PM2 manages log files for `stdout` and `stderr` from the Fastify process.
        - If deployed with Docker, logs are typically streamed to `stdout`/`stderr` and managed by Docker's logging drivers.

- **Frontend Page Logging (Preact SPA - `apps/download/page/`)**:
    - **Browser Developer Console**: Standard `console.log()`, `console.warn()`, `console.error()` statements in the Preact components and frontend logic will output to the browser's developer console. This is the primary way to see logs during development and debugging on the client-side.
    - **Sentry Integration (`@sentry/react`)**:
        - Sentry is initialized in the frontend code (likely in `page/src/index.tsx`) using environment variables like `SENTRY_DSN_PAGE` that are injected into the bundle by Rollup (`rollup-plugin-inject-process-env`).
        - This allows capturing client-side JavaScript errors, component lifecycle issues, and performance data, reporting them to Sentry for monitoring.

### 5.6. Extensibility (`apps/download/`)

The dual nature of `craig-horse` (Fastify API + Preact SPA) means extensibility involves considering both backend and frontend aspects.

- **Extending the API (Fastify Backend)**:
    - **Adding New API Endpoints**:
        1.  Create a new TypeScript file in `apps/download/api/src/routes/` (e.g., `newfeature.ts`).
        2.  Define Fastify route schema(s) and handler function(s) within this file.
        3.  Import and register these new routes in `apps/download/api/src/api.ts` with the Fastify server instance.
    - **Adding New Processing Options/Scripts**:
        1.  If the new feature involves running external command-line tools (like Ennuizel utilities), add the new script/executable.
        2.  Update environment variables if new paths to these tools are needed.
        3.  Use `execa` within new or existing API route handlers to call these external scripts, managing input, output, and potential errors.
        4.  Consider adding new WebSocket messages for real-time progress if applicable.
- **Extending the Frontend (Preact SPA)**:
    - **Adding New UI Features/Components**:
        1.  Develop new Preact components in `apps/download/page/src/components/`.
        2.  Integrate these components into existing "pages" or create new views within the SPA structure (which might involve modifying the main application component in `page/src/index.tsx` or sub-components that handle view logic).
        3.  Update `apps/download/page/src/api.ts` if new frontend functions are needed to interact with new backend API endpoints.
    - **Adding New "Pages"/Views within the SPA**: Since it's an SPA, "pages" are typically different views rendered by client-side routing or state changes within the main Preact application. This involves creating new components that represent these views and managing the logic to display them.
    - **Adding New i18n Strings**:
        1.  Add new keys and translations to the JSON locale files in `apps/download/page/public/locales/`.
        2.  Use the `t()` function from `react-i18next` in the new UI components.
- **General Principles**:
    - **API-First**: Often, new features will start with defining or extending the backend API to support the required data or actions.
    - **Component-Based UI**: The frontend is built with reusable components, making it easier to add new UI elements consistently.
    - **Configuration Management**: New backend features might require new environment variables for paths, credentials, or behavior flags, which need to be documented and managed. Frontend configuration (like API base URLs or Sentry DSNs) is typically injected at build time.

---

*End of `apps/download/` Documentation Update.*

---
## 6. `apps/tasks/` (Craig Tasks) Component Detail

### 6.1. `package.json` Analysis

This section details the contents of `apps/tasks/package.json`.

#### General Information

- **Name:** `craig-tasks`
- **Description:** The task manager
- **Version:** `1.0.0`
- **Exports:** `./dist/index.js` (Indicates the main module entry point, likely for the tRPC router or job definitions)
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

#### Scripts

- **`start`**: `dotenv -e ../../.env -c -- node dist/index.js`
    - **Purpose:** Starts the main process for the task manager.
    - **How it works:** Loads environment variables from the root `.env` file and then executes the compiled `dist/index.js`. This script likely initializes and starts the cron job scheduler and might also start a tRPC server if one is defined to be always running.
- **`build`**: `rimraf dist && tsc`
    - **Purpose:** Compiles the TypeScript code for the task manager.
    - **How it works:** Cleans the `dist` directory and then runs the TypeScript compiler (`tsc`) to transpile `.ts` files (likely from a `src/` directory) into JavaScript in the `dist/` directory.
- **`lint`**: `eslint .`
    - **Purpose:** Lints the codebase using ESLint.
- **`lint:fix`**: `eslint . --fix`
    - **Purpose:** Lints and automatically fixes ESLint issues.
- **`prisma:generate`**: `prisma generate --schema=../../prisma/schema.prisma`
    - **Purpose:** Generates the Prisma Client based on the shared root schema.
    - **How it works:** Ensures the Prisma client used by `craig-tasks` is up-to-date with any changes in the main `prisma/schema.prisma` file.
- **`run-job`**: `node dist/runJob.js`
    - **Purpose:** Manually triggers a specific job.
    - **How it works:** Executes the `dist/runJob.js` script. This script likely takes arguments (e.g., via `process.argv`) to specify which job to run, allowing for on-demand execution outside the cron schedule, useful for testing or ad-hoc tasks.

#### Categorized Dependencies

##### Core Functionality & Scheduling
- **`cron`**: (v2.1.0) A job scheduler, used to define and run tasks at scheduled intervals (e.g., nightly cleanup, data aggregation).
- **`config`**: (v3.3.8) (`node-config`) Library for managing application configurations across different environments. Settings are likely in a `config/` directory within `apps/tasks/` or the root config.

##### Database & Data Validation
- **`@prisma/client`**: (v5.12.1) Type-safe Prisma ORM client for database interactions, using the shared schema.
- **`zod`**: (v3.19.1) TypeScript-first schema declaration and validation library. Likely used for validating input to tRPC procedures or job parameters.

##### API & Communication
- **`@trpc/server`**: (v9.20.3) Framework for creating type-safe APIs. Used to expose procedures that can be called by other services (e.g., the main bot or dashboard) or for internal communication.

##### External Service Clients
- **`axios`**: (v0.27.2) Promise-based HTTP client for making requests to external APIs.
- **`googleapis`**: (v104.0.0) Google APIs client (e.g., for YouTube Data API, Google Drive).
- **`dropbox`**: (v10.34.0) Dropbox API v2 Node.js SDK.

##### Error Tracking & Logging
- **`@sentry/node`**: (v7.2.0) Sentry SDK for Node.js error tracking. Includes `@sentry/integrations` and `@sentry/tracing` for enhanced reporting.
- **`winston`**: (v3.11.0) A versatile logging library for creating structured logs.
- **`chalk`**: ("4") Terminal string styling library, often used to improve console log readability.

##### Utilities
- **`dayjs`**: (v1.11.6) A fast and lightweight library for date and time manipulation.
- **`lodash.isequal`**: (v4.5.0) Lodash method for performing deep equality checks.

#### DevDependencies
- **`typescript`**: (v4.7.3) TypeScript compiler.
- **`@types/config`**: (v3.3.0) Type definitions for `node-config`.
- **`@types/cron`**: (v2.0.0) Type definitions for `cron`.
- **`@types/lodash.isequal`**: (v4.5.6) Type definitions for `lodash.isequal`.
- **`@types/node`**: (v18.0.0) Type definitions for Node.js.

#### Summary Statement
`craig-tasks` serves as a backend task management service. It runs scheduled **cron jobs** for routine operations and potentially exposes a **tRPC API** for type-safe communication with other parts of the Craig ecosystem. It interacts with the shared **Prisma** database, utilizes external services like **Google APIs** and **Dropbox**, and employs **Sentry** for error tracking and **Winston** for logging. The `run-job` script allows for manual triggering of specific tasks.

### 6.2. Configuration (`apps/tasks/`)

Configuration for `craig-tasks` is managed through a combination of `node-config` files and environment variables loaded via a root `.env` file.

- **`node-config` and `.env` Usage**:
    - **`node-config`**: The primary mechanism for configuration. Default values are defined in `apps/tasks/config/_default.js`. Environment-specific overrides can be placed in files like `local.js`, `development.js`, or `production.js` within the same directory. `node-config` loads these based on the `NODE_ENV` environment variable.
    - **Root `.env` File**: Sensitive credentials (API keys, database URLs) are expected to be in a `.env` file at the monorepo root (`../../.env`). This is loaded by the `dotenv` package, typically specified in the `start` script in `package.json`. Values from `.env` can be referenced in `node-config` files (e.g., using `process.env.SOME_KEY`).
- **Key Configuration Options (from `apps/tasks/config/_default.js`)**:
    - **Redis**: `redis.host`, `redis.port`, `redis.password`, `redis.tls_ca`, `redis.tls_cert`, `redis.tls_key` (though Redis is not a direct dependency of `craig-tasks`, these might be legacy or for indirect use via other services/APIs it calls).
    - **Google Drive**: `google.drive.auth`, `google.drive.upload_parent`, `google.drive.service_account_path`, `google.drive.jwt_path`. Used for authenticating and interacting with Google Drive for backups or storage.
    - **Dropbox**: `dropbox.auth`, `dropbox.refresh_token`, `dropbox.app_key`, `dropbox.app_secret`. For Dropbox integration.
    - **Microsoft OneDrive**: `microsoft.auth`, `microsoft.refresh_token`, `microsoft.client_id`. For OneDrive integration.
    - **Patreon**: `patreon.access_token`, `patreon.campaign_id`. For fetching Patreon data.
    - **Download/Recording Paths & Expirations**:
        - `paths.temp`: Temporary file storage.
        - `paths.recordings`: Where recordings are stored.
        - `paths.webRecordings`: Path for web-accessible recordings.
        - `paths.log`: Path for log files (if file logging were enabled, though current setup uses console).
        - `recordings.expire`: How long recordings are kept.
        - `recordings.deleteAfter`: Additional grace period before deletion.
    - **Cron Settings**:
        - `cron.timezone`: Timezone for cron job scheduling (e.g., `America/New_York`).
    - **Logging**:
        - `loggerLevel`: Default logging level for Winston (e.g., `info`, `debug`).
    - **Task Control**:
        - `tasks.ignore`: An array of job names to ignore/disable.
- **Development Setup**:
    - Developers should ensure the root `.env` file (`../../.env`) is populated with necessary secrets.
    - For local overrides of non-sensitive configurations, create `apps/tasks/config/local.js`. This file will take precedence over `_default.js` and is not committed to version control.

### 6.3. Core Logic (Cron Jobs & tRPC API) (`apps/tasks/`)

`craig-tasks` is primarily designed around a cron job system for scheduled tasks and also exposes a tRPC API for inter-service communication.

- **Cron Job System**:
    - **`TaskJob` Base Class (`src/types.ts`)**:
        - Provides a foundational structure for all cron jobs.
        - **Constructor**: Takes the job name, Prisma client, and configuration object. Initializes a per-job Winston logger (e.g., `tasks.jobName`).
        - **`_run()` Method**: A private wrapper method that calls the job's specific `run()` method. It includes generic error handling (logs errors using the job's logger and Sentry) and ensures the job's success/failure is logged.
        - **`run()` Method**: An abstract or placeholder method that must be overridden by individual job classes. This is where the actual logic for the task resides.
        - **Per-Job Logger**: Each job instance gets its own named logger, facilitating better log tracking.
    - **Individual Job Files (`src/jobs/`)**:
        - Each scheduled task is defined in its own file within `src/jobs/` (e.g., `cleanDownloads.ts`, `patreonRefresh.ts`, `backupMetadata.ts`).
        - These files typically export a class that extends `TaskJob`.
        - **Schedule Definition**: Each job class defines a static `schedule` property (a cron string, e.g., `0 0 * * *` for daily at midnight) and a static `jobName` property.
        - **Logic Implementation**: The core task logic is implemented in the overridden `run()` method of the job class.
    - **Dynamic Loading and Scheduling (`src/index.ts`)**:
        - The main `src/index.ts` file dynamically loads all job files from the `src/jobs/` directory.
        - It iterates through the exported members of each job file, looking for classes that extend `TaskJob` and have the static `schedule` and `jobName` properties.
        - For each valid job found (and not in `tasks.ignore` config), it instantiates the job class and creates a `CronJob` instance (from the `cron` library) using the job's schedule and its `_run` method as the tick function.
        - Each `CronJob` is then started, effectively scheduling the tasks.
- **tRPC API System**:
    - **Router Definition (`src/trpc.ts`)**:
        - An `appRouter` is defined using `@trpc/server`. This router combines all tRPC procedures (queries and mutations).
        - **Input Validation**: Zod schemas are used to define the expected input shapes for tRPC procedures, providing strong type safety and automatic validation (e.g., `z.object({ guildId: z.string() })`).
    - **Example Procedure (`driveUpload` query)**:
        - The codebase includes an example query procedure named `driveUpload` (likely in a file like `src/queries/driveUpload.ts` or directly in `trpc.ts` initially).
        - This procedure would take validated input (e.g., a recording ID) and interact with Google Drive services to perform an upload or check status, returning a typed result.
    - **Standalone HTTP Adapter (`createHTTPServer`)**:
        - The tRPC router is exposed over HTTP using `@trpc/server/adapters/standalone`.
        - `createHTTPServer` is used to create a Node.js HTTP server that listens for tRPC requests.
        - This server is started on a configured port (e.g., `2022` as mentioned in logs/analysis) from `src/index.ts`, allowing other services to call its procedures.
    - **tRPC Context**:
        - A `createContext` function is defined, which can provide context (e.g., database connections, user information if authenticated) to tRPC procedures.
        - Currently, the context is noted as being empty or minimal but can be extended as needed.

### 6.4. Logging (`apps/tasks/`)

`craig-tasks` utilizes the `winston` library for structured logging, complemented by Sentry for error tracking.

- **Winston-Based Logging (`src/logger.ts`)**:
    - The `src/logger.ts` file contains a `createLogger` function responsible for configuring and creating Winston logger instances.
    - **Log Format**: It defines a structured log format using `winston.format.combine`, `winston.format.timestamp`, `winston.format.colorize`, and `winston.format.printf`. This results in console output that includes a timestamp, log level (colorized), logger name (e.g., `tasks`, `tasks.jobName`), and the message.
    - **Configurable Log Levels**: The default log level is read from the `node-config` settings (`config.get('loggerLevel')`), allowing adjustment based on the environment (e.g., `debug` for development, `info` for production).
- **Per-Job and General Loggers**:
    - A general logger named 'tasks' is created for application-wide logging.
    - Each cron job, when initialized (in the `TaskJob` base class), gets its own named logger instance (e.g., `tasks.cleanDownloads`). This helps in filtering and identifying logs specific to a particular job.
- **Sentry Integration**:
    - Sentry (`@sentry/node`) is initialized in `src/index.ts` using the DSN from configuration.
    - It automatically captures unhandled exceptions from cron jobs or tRPC procedures.
    - Winston logs at `error` level are also configured to be captured as Sentry breadcrumbs or events, providing context to errors.
- **No Default File Logging**:
    - The default Winston transport is `Console`. There is no out-of-the-box file transport configured, meaning logs are written to `stdout`/`stderr`.
    - In production, log persistence relies on the environment capturing this console output (e.g., PM2 log files, Docker logging drivers, or PaaS log streams).

### 6.5. Extensibility (`apps/tasks/`)

The design of `craig-tasks` allows for straightforward extension with new scheduled tasks and tRPC API procedures.

- **Adding New Cron Jobs**:
    1.  **Create Job File**: Create a new TypeScript file in the `src/jobs/` directory (e.g., `myNewTask.ts`).
    2.  **Extend `TaskJob`**: Define a class that extends `TaskJob` from `src/types.ts`.
    3.  **Define Schedule & Name**: Add static `schedule` (cron string) and `jobName` (string) properties to the class.
    4.  **Implement Logic**: Override the `async run()` method with the specific logic for the new task. Utilize the `this.logger` for logging and `this.prisma` for database access.
    5.  **Automatic Loading**: The job will be automatically discovered and scheduled by the logic in `src/index.ts` when the application starts (unless its name is added to `tasks.ignore` in the configuration).
    6.  **Configuration (Optional)**: If the job requires specific configuration, add relevant settings to `config/_default.js` and access them via `this.config`.
    7.  **Testing**: Use the `npm run run-job -- myNewTask` script (adjusting `myNewTask` to the job name) to test the job manually.
- **Adding New tRPC Procedures**:
    1.  **Define Logic**: Implement the query or mutation logic, typically in a new file within a `src/queries/` or `src/mutations/` directory, or directly within `src/trpc.ts` for simpler cases. This function will receive input and context.
    2.  **Add to Router**:
        *   Import the procedure logic into `src/trpc.ts`.
        *   Add a new entry to the `appRouter` (e.g., `appRouter.query('myNewQuery', { resolve: yourQueryLogic })` or `appRouter.mutation(...)`).
        *   Define input validation using a Zod schema via the `.input()` method if the procedure expects parameters.
    3.  **Client-Side Integration**: If this tRPC procedure is to be called by another service (like the dashboard or bot), update the tRPC client in that service to include a caller for the new procedure. Type definitions will be shared automatically via the `craig-tasks` package export.
    4.  **Context Modification (Optional)**: If the new procedure requires additional information in its context (e.g., specific API clients), update the `createContext` function in `src/trpc.ts`.

---

*End of `apps/tasks/` Documentation Update.*

---
## 7. Audio Processing (`cook/` and `cook.sh`)

This section details the audio post-processing system centered around the root `cook.sh` script and the utilities within the `cook/` directory. This system is primarily invoked by `apps/download/` (Craig Horse) to convert raw Ogg Vorbis recordings into various user-requested formats.

### 7.1. Overview of `cook.sh` (Root Script)

The `cook.sh` script is the main orchestrator for all audio post-processing tasks. It takes a raw multi-track Ogg Vorbis recording and converts it into a variety of formats and containers based on user selection.

- **Purpose**: To provide a flexible and robust command-line interface for converting multi-track recordings into different audio formats and packaging them into various container types, including self-extracting archives for easier use on Windows.
- **Arguments**:
    - `<ID>`: The recording ID (basename of the input file, e.g., `c6a4d2`). The script expects an input file named `$ID.ogg.data`.
    - `<format>`: The target audio format for individual tracks (e.g., `flac`, `mp3`, `aac`, `vorbis`, `wav`).
    - `<container>`: The output container type (e.g., `zip`, `ogg`, `mka` (Matroska Audio), `mix` (single mixed file), `exe` (Windows self-extractor), `aupzip` (Audacity project zip)).
    - `[filter_options]`: Optional arguments passed to `ffmpeg` for audio filtering (e.g., `bass=g=10,treble=g=5`).
- **Workflow Highlights**:
    1.  **Argument Parsing & Setup**:
        *   Parses the ID, format, container, and filter options.
        *   Sets up encoder commands and options based on the chosen `<format>` (e.g., `FLAC_ENC`, `LAME_ENC`).
        *   Determines if specific tools like `ffmpeg` or custom utilities are available.
    2.  **Temporary Directory Management**: Creates a temporary working directory (e.g., `/tmp/cook.XXXXXX` or `$TEMP/cook.XXXXXX`) to store intermediate files. This directory is cleaned up on exit.
    3.  **Input File Locking**: Checks for an input file `$ID.ogg.data` and uses it as the source.
    4.  **Track Information Gathering**:
        *   Uses `oggtracks` (from `cook/oggtracks.c`) to identify the number of tracks and their respective Ogg stream numbers within the input file.
        *   Uses `recinfo.js` (from `cook/recinfo.js`) to get recording metadata like guild name, channel name, and start time.
    5.  **Self-Extractor/Audacity Project Preparation (Conditional)**:
        *   If `container` is `exe` or `aupzip`, prepares necessary files for these packages:
            *   For `exe`: Copies `RunMe.bat`/`RunMe.sh`, `sfx.exe` (SFX stub), and potentially a bundled `ffmpeg.exe` and related DLLs from `cook/windows/ffmpeg/`.
            *   For `aupzip`: Creates an Audacity project file (`.aup`) using `aup-header.xml` and track information.
    6.  **FIFO Usage for Streaming**: Creates named pipes (FIFOs) for each track to stream decoded audio data directly to encoders, avoiding large intermediate WAV files where possible.
    7.  **Parallel Track Encoding**:
        *   Decodes the multi-track Ogg input using `ffmpeg` (or `oggdec`), demuxing individual tracks.
        *   Pipes the decoded output for each track (PCM data) through its respective FIFO to the chosen encoder (e.g., `flac`, `lame`). This happens in parallel for all tracks.
        *   If a filter is specified, `ffmpeg` is used for filtering before encoding.
    8.  **Metadata and Notes Generation**:
        *   Generates `raw.dat` (raw PCM data for each track, used by Audacity).
        *   Generates `info.txt` containing recording metadata and track listing with user names (using `recinfo.js` and `userinfo.js`).
        *   Extracts embedded notes using `extnotes` for `notes.txt`, Audacity label track (`labels.txt`), and `notes.json`.
    9.  **Containerization Logic**: Based on the `<container>` argument:
        *   `zip`: Creates a standard ZIP archive of encoded tracks and metadata files.
        *   `ogg`, `mka`: Uses `oggmultiplexer` or `mkvmerge` (via `ffmpeg`) to create a multi-track Ogg or Matroska file.
        *   `mix`: Uses `ffmpeg` to mix all tracks into a single audio file of the specified format.
        *   `exe`: Bundles encoded tracks, metadata, RunMe scripts, and ffmpeg into a self-extracting 7-Zip archive using the `sfx.exe` stub.
        *   `aupzip`: Creates a ZIP archive containing the Audacity project file (`.aup`), `raw.dat` files for each track, and metadata.
    10. **Cleanup**: Removes the temporary working directory.
- **Key Tools Orchestrated**:
    - `ffmpeg`: Core tool for decoding, filtering, mixing, and sometimes encoding/muxing.
    - Specific Encoders: `flac` (FLAC), `lame` (MP3), `faac`/`fdk_aac` (AAC), `oggenc` (Vorbis). The script checks for their availability.
    - Custom `cook/` utilities: `oggtracks`, `oggcorrect`, `extnotes`, `recinfo.js`, `userinfo.js`, `oggmultiplexer`.
- **Supported Output Formats & Containers (Examples)**:
    - **Formats**: FLAC, MP3, AAC, Vorbis (Ogg), WAV.
    - **Containers**: ZIP, multi-track Ogg, Matroska Audio (MKA), single mixed-down file (in chosen format), Windows self-extracting archive (.exe), Audacity Project ZIP (.aupzip).

### 7.2. Key Tools in `cook/` Directory

The `cook/` directory contains a suite of custom C utilities, Node.js scripts, and helper files that are essential for the `cook.sh` audio processing pipeline.

- **C Utilities (Low-level Ogg/Audio Manipulation)**: These are small, focused tools compiled for Linux, macOS, and Windows.
    - **`oggcorrect.c`**:
        - **Purpose**: Corrects timing issues and fills gaps in Ogg Vorbis files, particularly those created from live recordings where packets might be lost or timing might be inconsistent.
        - **Functionality**: Reads an Ogg file, analyzes page granule positions and stream continuity, and writes a corrected Ogg stream to `stdout`. It can identify and attempt to fix missing pages or corrupted data to produce a smoother playback experience.
    - **`oggtracks.c`**:
        - **Purpose**: Identifies the number of logical audio tracks (streams) within an Ogg Vorbis file and their corresponding serial numbers.
        - **Functionality**: Parses Ogg page headers to detect distinct logical streams and outputs their serial numbers and count. This is crucial for demuxing individual tracks.
    - **`extnotes.c`**:
        - **Purpose**: Extracts embedded metadata (Vorbis comments, specifically "notes" or user information) from Ogg files and formats it for various uses.
        - **Functionality**: Reads Vorbis comments from an Ogg stream. It can output this data as:
            - Plain text (`notes.txt`).
            - Audacity Label Track format (`labels.txt`), allowing user names and other events to be imported into Audacity as labels.
            - JSON format (`notes.json`) for structured metadata.
    - **Briefly Mention Others**:
        - `oggduration.c`: Calculates the duration of an Ogg Vorbis file. Used by `cook.sh` to get recording length.
        - `wavduration.c`: Calculates the duration of a WAV file.
        - `oggmultiplexer.c`: A custom tool to multiplex multiple Ogg Vorbis streams (or other compatible streams) into a single multi-stream Ogg container. Used when creating multi-track `.ogg` output.
        - (Other utilities like `ennuizel-multi`, `ennuizel-encoder`, `ennuizel-decoder` are referenced by `cook.sh` but their source is not directly in the `cook/` directory itself, rather they are expected to be in the system PATH or a configured location. These are part of the Ennuizel toolset for advanced audio processing).

- **JavaScript (Node.js) Utilities**:
    - **`recinfo.js`**:
        - **Purpose**: Gathers and outputs comprehensive recording metadata in JSON or plain text format.
        - **Functionality**: Reads data from `.ogg.info` (recording session metadata like guild ID, channel ID, start/end times) and `.ogg.users` (user ID to stream ID mapping) files associated with the recording ID. It then formats this into a structured JSON output or a human-readable text summary for `info.txt`.
    - **`userinfo.js`**:
        - **Purpose**: Retrieves the username for a specific track (stream ID) within a recording.
        - **Functionality**: Takes a recording ID and a track/stream ID as input. It reads the `.ogg.users` file to find the Discord User ID associated with the stream and then (presumably, though not fully detailed in `cook.sh` analysis alone) looks up the username, possibly from a local cache or by calling an external service/database if the user data isn't directly in the `.ogg.users` file.

- **Shell Scripts & Other Files**:
    - **`info.sh`**: A helper shell script used by `cook.sh` to invoke `recinfo.js` and `userinfo.js` to generate the `info.txt` file.
    - **`ffmpeg-flags/`**: This directory contains preset flag configurations for `ffmpeg` for different quality levels (e.g., `aac`, `mp3-vbr`, `vorbis`). `cook.sh` sources these files to set encoder options.
    - **`aup-header.xml`**: An XML template file used as the header when generating Audacity project (`.aup`) files. `cook.sh` populates this template with track-specific information.
    - **SFX Stubs (`sfx.exe`, etc.)**: Self-extracting archive stubs (e.g., for 7-Zip) used when creating `.exe` containers. `cook.sh` concatenates this stub with a 7-Zip archive.
    - **Bundled FFmpeg Binaries**: The `cook/windows/ffmpeg/` and `cook/macosx/ffmpeg/` directories contain pre-compiled `ffmpeg` binaries and associated libraries (like `avcodec`, `avformat`, `avutil`) for Windows and macOS respectively. `cook.sh` uses these if a system-wide `ffmpeg` is not found or if a specific version is preferred for consistency, especially when creating self-extracting archives.

### 7.3. Development and Extensibility

Modifying or extending the `cook.sh` audio processing system involves understanding its shell script logic and the C/JavaScript utilities it orchestrates.

- **Adding New Formats/Containers to `cook.sh`**:
    1.  **Format Definition**:
        *   Add new format-specific environment variables (e.g., `NEWFORMAT_ENC` for the encoder command, `NEWFORMAT_EXT` for the file extension).
        *   Update the `case "$format"` block to recognize the new format and set these variables.
        *   Ensure the corresponding encoder binary (e.g., for Opus, AACplus) is available and its path is known or discoverable.
    2.  **Container Handling**:
        *   Add a new `elif [ "$container" = "newcontainer" ]` block in the containerization section.
        *   Implement the logic to package the encoded tracks and metadata into the new container type (e.g., using `mkvmerge` for a different Matroska profile, or another archiving tool).
    3.  **Self-Extracting Archives**: If the new container is intended to be part of a self-extracting archive, ensure any necessary helper scripts or stubs are included and the logic in the `exe` container section is adapted if needed.
    4.  **FFmpeg Flags**: If the new format uses `ffmpeg` for encoding, add a corresponding options file in `cook/ffmpeg-flags/`.
- **Modifying/Adding Tools in `cook/`**:
    - **C Utilities**:
        *   Source code for C utilities is in the `cook/` directory (e.g., `oggcorrect.c`).
        *   Compilation is handled by Makefiles located in platform-specific subdirectories: `cook/macosx/Makefile` and `cook/windows/Makefile` (which likely uses a MinGW cross-compiler environment).
        *   To add a new C utility:
            1.  Write the C source code.
            2.  Update the Makefiles in both `macosx` and `windows` directories to include compilation rules for the new tool.
            3.  Compile the tool for all target platforms (Linux, macOS, Windows).
    - **JavaScript Utilities**:
        *   Node.js scripts like `recinfo.js` and `userinfo.js` can be directly modified.
        *   New `.js` utilities can be added and then called from `cook.sh` using `node /path/to/cook/yourscript.js <args>`.
- **FFmpeg and Encoders**:
    - The script relies on `ffmpeg` and various audio encoders (e.g., `flac`, `lame`, `oggenc`, `faac`). These must be installed and available in the system's `PATH` where `cook.sh` is executed.
    - Alternatively, for self-contained `exe` packages, specific versions of `ffmpeg` are bundled within the `cook/windows/ffmpeg` and `cook/macosx/ffmpeg` directories.
- **Development Environment**:
    - A Linux-like environment (or WSL on Windows) is ideal for developing and testing `cook.sh` due to its reliance on shell features and command-line tools.
    - Required tools include:
        - A C compiler (like GCC) and Make for building C utilities.
        - Node.js for running JavaScript utilities.
        - The specific audio encoders and `ffmpeg`.
        - Standard Unix utilities (`mktemp`, `mkfifo`, `zip`, `cat`, `grep`, `sed`, `awk`, etc.).

### 7.4. Logging

The `cook.sh` script and the tools it calls primarily use standard output (`stdout`) and standard error (`stderr`) for communication and logging. There isn't a dedicated structured log file generated by `cook.sh` itself.

- **`stdout` for Primary Output**:
    - The final processed audio file or archive is typically written to `stdout` by `cook.sh`. This allows the calling application (like `apps/download/api/`) to stream the output directly to a file or an HTTP response.
- **`stderr` for Informational Messages, Warnings, and Errors**:
    - **`cook.sh` Script**: Uses `echo >&2` for its own informational messages, progress indicators (like "Starting track N..."), warnings, and error messages.
    - **Orchestrated Tools**:
        - `ffmpeg` is notoriously verbose on `stderr`, outputting detailed information about input streams, filtering, encoding progress, and any errors encountered. `cook.sh` often redirects or processes `ffmpeg`'s `stderr`.
        - Encoders (like `flac`, `lame`) also use `stderr` for their status messages and errors.
        - Custom C utilities and Node.js scripts in `cook/` use `fprintf(stderr, ...)` or `console.error()` respectively for their diagnostic output.
- **Log Capture and Persistence**:
    - The responsibility for capturing and persisting logs from `cook.sh` lies with the calling application.
    - In the context of Craig, `apps/download/api/` (Craig Horse) which invokes `cook.sh` via `execa`, would capture both `stdout` and `stderr` streams from the `cook.sh` process.
    - The `stderr` content can then be logged by the Fastify API's logging mechanism (e.g., Winston, Sentry) for debugging and monitoring purposes.
    - There's no internal mechanism within `cook.sh` for rotating log files or writing to a dedicated log file; it operates as a command-line tool expecting its environment to manage its output streams.

---

*End of V. Audio Processing (`cook/` and `cook.sh`) Documentation.*

---
## 8. Database Schema (`prisma/`)

This section details the Prisma setup used across the Craig monorepo, including the schema definition, migrations workflow, and Prisma Client usage. The schema is centrally defined in `prisma/schema.prisma` and used by various applications like `apps/bot`, `apps/dashboard`, and `apps/tasks`.

### 8.1. Schema Definition (`prisma/schema.prisma`)

The `prisma/schema.prisma` file is the single source of truth for the database schema.

- **Generator & Datasource**:
    - **Generator**: `prisma-client-js` is used to generate the Prisma Client for TypeScript/JavaScript.
        - `previewFeatures = ["interactiveTransactions"]` indicates usage of a feature for more complex, interactive database transactions.
    - **Datasource**: PostgreSQL is the database provider.
        - The connection URL is sourced from an environment variable: `env("DATABASE_URL")`.
- **Models Overview**:
    - **`User`**:
        - **Purpose**: Stores information about users, primarily Discord users who have interacted with Craig or are Patrons.
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique user identifier.
            - `discordId` (String, `@unique`): Discord user ID.
            - `username`, `discriminator`, `avatar`: Discord user details.
            - `rewardTier` (Int): Patreon reward tier level.
            - `patronId` (String, optional, `@unique`): Patreon user ID.
            - `patronStatus` (String, optional): Patreon pledge status.
            - `lastPatreonRefresh` (DateTime, optional): When Patreon status was last checked.
            - `consented` (Boolean, `@default(false)`): User consent status.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([discordId])`.
    - **`Ban`**:
        - **Purpose**: Manages bans for users or guilds.
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique ban identifier.
            - `entityId` (String): ID of the banned entity (user or guild).
            - `type` (Int): Type of ban (e.g., 0 for user, 1 for guild).
            - `reason` (String, optional): Reason for the ban.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([entityId])`.
    - **`Guild`**:
        - **Purpose**: Stores settings and information related to Discord guilds (servers).
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique guild identifier.
            - `discordId` (String, `@unique`): Discord guild ID.
            - `prefix` (String, optional): Custom command prefix for the bot in this guild.
            - `language` (String, `@default("en-US")`): Preferred language for the bot in this guild.
            - `autoRecord` (Boolean, `@default(false)`): Whether auto-recording is enabled.
            - `multiTrack` (Boolean, `@default(false)`): Default multi-track recording setting.
            - `lastRecorded` (DateTime, optional): Timestamp of the last recording.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([discordId])`.
    - **`Blessing`**:
        - **Purpose**: Manages "blessings" or special statuses/perks for users or guilds, often tied to Patreon rewards.
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique blessing identifier.
            - `entityId` (String): ID of the blessed entity (user or guild).
            - `type` (Int): Type of blessing.
            - `level` (Int): Level or tier of the blessing.
            - `blesserId` (String, optional): ID of the user who granted the blessing.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([entityId])`.
    - **`Recording`**:
        - **Purpose**: Stores metadata about each recording session.
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique recording identifier.
            - `accessKey` (String, `@unique`, `@default(cuid())`): Access key for the recording (likely for downloads/management).
            - `deleteKey` (String, `@unique`, `@default(cuid())`): Deletion key for the recording.
            - `guildId` (String): Discord guild ID where the recording took place.
            - `channelId` (String): Discord channel ID.
            - `userId` (String): Discord user ID of the person who initiated the recording.
            - `startTime` (DateTime, `@default(now())`), `endTime` (DateTime, optional): Start and end times of the recording.
            - `size` (BigInt, optional): Size of the recording file.
            - `users` (Json): JSON data mapping stream IDs to user IDs.
            - `pending` (Boolean, `@default(true)`): Whether the recording is still pending processing/completion.
            - `ip` (String, optional): IP address associated with the recording initiation.
            - `multiTrack` (Boolean, `@default(false)`): Whether this recording is multi-track.
            - `note` (String, optional): User-provided note for the recording.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([guildId])`, `@@index([userId])`, `@@index([accessKey])`, `@@index([deleteKey])`.
    - **`AutoRecord`**:
        - **Purpose**: Stores configurations for channels to be automatically recorded.
        - **Key Fields**:
            - `id` (String, `@id`, `@default(cuid())`): Unique auto-record configuration ID.
            - `channelId` (String, `@unique`): Discord channel ID to auto-record.
            - `guildId` (String): Discord guild ID of the channel.
            - `userId` (String): Discord user ID who configured auto-record.
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
        - **Indexes**: `@@index([channelId])`, `@@index([guildId])`.
    - **`GoogleDriveUser`**, **`MicrosoftUser`**, **`DropboxUser`**:
        - **Purpose**: Store OAuth tokens and user information for cloud storage integrations (Google Drive, OneDrive, Dropbox).
        - **Key Fields (common pattern)**:
            - `id` (String, `@id`, `@default(cuid())`).
            - `userId` (String, `@unique`): Foreign key linking to the `User` model's `discordId`.
            - `[provider]UserId` (String): User ID from the respective cloud provider.
            - `accessToken` (String, encrypted/sensitive), `refreshToken` (String, encrypted/sensitive), `expiryTimestamp` (BigInt, optional).
            - `createdAt` (DateTime, `@default(now())`), `updatedAt` (DateTime, `@updatedAt`).
    - **`Patreon`**: (Model name might differ, e.g., `PatreonUser` or integrated into `User`)
        - **Purpose**: Stores Patreon-specific user data if not fully integrated into the `User` model.
        - **Key Fields**: Would typically include `patronId`, `pledgeAmount`, `rewardTier`, `email`, etc., and a link to the main `User` model. (The provided schema seems to integrate most of this into the `User` model directly).
- **Relationships**:
    - While the schema doesn't use explicit `@relation` attributes for all foreign keys, relationships are implied by naming conventions (e.g., `userId` in `Recording` implies a relationship to `User` via its `discordId`). Prisma can often infer these, but explicit relations might be added for clarity or specific Prisma Client features. For example, `GoogleDriveUser`, `MicrosoftUser`, and `DropboxUser` have a clear `userId` field that links to a `User`.

### 8.2. Migrations Workflow (`prisma/migrations/`)

Prisma Migrate is used to manage database schema changes in a consistent and version-controlled manner.

- **Purpose**: To allow developers to evolve the database schema safely, track changes over time, and apply these changes reliably across different environments (development, staging, production).
- **Migration Directory Structure**:
    - Located in `prisma/migrations/`.
    - Each successful migration run creates a new subdirectory named with a timestamp and a descriptive name (e.g., `20230101120000_initial_setup`, `20230115183000_add_patreon_fields`).
    - Inside each migration folder:
        - `migration.sql`: Contains the raw SQL statements that were generated and applied for that specific migration. This provides a clear record of the changes made.
- **Development Workflow**:
    1.  **Schema Changes**: Developer modifies `prisma/schema.prisma` to add new models, fields, or change existing ones.
    2.  **Run `prisma migrate dev`**:
        *   Execute `npx prisma migrate dev --name <descriptive_migration_name>`.
        *   Prisma compares the current schema with the state of the development database.
        *   It generates the necessary SQL migration file in a new timestamped directory within `prisma/migrations/`.
        *   It then automatically applies this SQL migration to the development database.
        *   It also ensures the Prisma Client is updated by running `prisma generate`.
- **Production Workflow**:
    1.  **Commit Migrations**: Migration files generated during development (the timestamped directories with `migration.sql`) are committed to version control.
    2.  **Run `prisma migrate deploy`**:
        *   In the production environment (or CI/CD pipeline), execute `npx prisma migrate deploy`.
        *   This command applies any pending migration files (those present in `prisma/migrations/` but not yet applied to the production database according to the `_prisma_migrations` table) in chronological order.
        *   It does *not* generate new SQL; it only executes existing, committed migration scripts. This makes it safe for production environments.
- **`migration_lock.toml`**:
    - A file in the `prisma` directory used by Prisma Migrate to prevent concurrent migration attempts, ensuring that migrations are applied sequentially and avoiding potential conflicts if multiple instances or developers try to migrate the database simultaneously.

### 8.3. Prisma Client

The Prisma Client is an auto-generated, type-safe query builder that allows applications to interact with the database.

- **Purpose**:
    - Provides a programmatic and type-safe way to perform database operations (queries, mutations).
    - Abstracts away raw SQL, reducing errors and improving developer experience.
    - Auto-generated based on the models defined in `schema.prisma`, so it's always in sync with the database structure.
- **`npx prisma generate` Command**:
    - This command reads the `prisma/schema.prisma` file and generates the Prisma Client code.
    - The generated client is placed in `node_modules/.prisma/client/`.
- **When `prisma generate` is Run**:
    - **Automatically by `prisma migrate dev`**: When changes are made to the schema and `prisma migrate dev` is run, it automatically triggers `prisma generate` after applying the migration.
    - **Manually after schema changes**: If the schema is changed without running a migration (e.g., before creating the first migration for a new project or when making non-migration changes), `prisma generate` should be run manually.
    - **Via `package.json` scripts**: Each application (`apps/bot/`, `apps/dashboard/`, `apps/tasks/`) has a `prisma:generate` script in its `package.json`. This script typically points to the root `prisma/schema.prisma` (e.g., `prisma generate --schema=../../prisma/schema.prisma`) and is often included in their `build` scripts or run manually during development.
    - **Post-install hook**: Sometimes, `prisma generate` is run as a post-install hook after `npm install` or `yarn install` to ensure the client is up-to-date with any schema changes pulled from version control.
- **Singleton `PrismaClient` Instance**:
    - It's a best practice to instantiate `PrismaClient` once and reuse that instance throughout an application to avoid creating too many database connections.
    - Each application that interacts with the database (e.g., `apps/bot/src/prisma.ts`, `apps/dashboard/lib/prisma.ts`, `apps/tasks/src/prisma.ts`) typically creates a singleton instance of `PrismaClient`.
    - This instance is then exported and imported wherever database access is needed (e.g., in API route handlers, tRPC procedures, service classes, cron jobs).
    - Example (`apps/bot/src/prisma.ts`):
      ```typescript
      import { PrismaClient } from '@prisma/client';
      export const prisma = new PrismaClient();
      // Potentially with $connect and $disconnect logic for graceful startup/shutdown
      ```

---

*End of VI. Database Schema (`prisma/`) Documentation.*

---
## 9. Git Submodules (`.gitmodules`)

The Craig monorepo utilizes Git submodules to incorporate and manage external repositories, primarily for shared resources like translation files. The configuration for these submodules is defined in the `.gitmodules` file at the root of the repository.

```
[submodule "locale"]
	path = locale
	url = https://github.com/CraigChat/translations
```

### 9.1. Submodule: `locale`

-   **Name**: `locale`
-   **Local Path**: `locale` (This directory is created at the root of the monorepo to house the submodule's content)
-   **URL**: `https://github.com/CraigChat/translations`
-   **Purpose**:
    -   This submodule is responsible for managing and version-controlling all internationalization (i18n) translation files used across the various Craig applications (e.g., `apps/bot`, `apps/dashboard`, `apps/download/page`).
    -   The translation files (typically JSON or YAML containing key-value pairs for different languages) are maintained in the separate `CraigChat/translations` GitHub repository.
-   **Benefits**:
    -   **Separation of Concerns**: Keeps the translation files distinct from the main application codebases, making it easier for translators or localization teams to work on them without needing to navigate the complexities of each application.
    -   **Independent Updates**: Translations can be updated, and new languages added in the `CraigChat/translations` repository independently of the main Craig applications' development cycles. The main monorepo can then pull in these updates as needed.
    -   **Collaboration**: Facilitates easier collaboration on translations, as contributors can focus solely on the `CraigChat/translations` repository.
    -   **Versionings**: The main repository locks the submodule to a specific commit of the `CraigChat/translations` repository, ensuring that a known version of translations is used for any given version of the Craig applications.

### 9.2. Development Workflow with Submodules

Working with Git submodules requires a few specific commands:

-   **Cloning the Repository**:
    -   When cloning the main Craig monorepo for the first time, use the `--recurse-submodules` flag to automatically initialize and clone the content of all defined submodules:
        ```bash
        git clone --recurse-submodules https://github.com/CraigChat/craig.git
        ```
    -   If the repository was cloned without this flag, you can initialize and update submodules afterwards:
        ```bash
        git submodule init
        git submodule update
        ```
-   **Pulling Updates for Submodules**:
    -   To update a submodule to the latest commit from its remote repository (e.g., to get the newest translations for the `locale` submodule):
        ```bash
        git submodule update --remote locale
        ```
    -   Alternatively, navigate into the submodule directory (`cd locale`), run `git pull origin main` (or the appropriate branch), and then `cd ..` back to the main repository. The main repository will then see that the submodule has new changes, which can be committed:
        ```bash
        cd locale
        git pull origin main # Or other relevant branch
        cd ..
        git add locale
        git commit -m "Update locale submodule to latest translations"
        ```
-   **Making Changes within a Submodule**:
    -   If changes are made directly within the `locale` directory (e.g., updating a translation file), these changes are made within the context of the `CraigChat/translations` repository.
    -   These changes need to be committed and pushed from within the submodule directory:
        ```bash
        cd locale
        # Make changes to translation files
        git add .
        git commit -m "Updated French translations for XYZ feature"
        git push origin main # Or other relevant branch
        cd ..
        ```
    -   After pushing changes in the submodule, the main repository needs to be updated to point to the new commit of the submodule:
        ```bash
        git add locale
        git commit -m "Update locale submodule to include new French translations"
        ```

By using the `locale` submodule, the Craig project ensures that its translation files are managed in a modular, versioned, and collaborative way.

---

*End of VII. Git Submodules (`.gitmodules`) Documentation.*
