# `apps/bot/` Component Documentation

## General Information

- **Name:** Craig Bot
- **Description:** The bot client for Craig. (Taken from package.json)
- **Version:** 2.1.1 (from package.json)
- **Main Entry Point:** `apps/bot/src/index.ts` (as per `main` in package.json being `dist/index.js` after build)

## Scripts

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

## Dependencies (Bot)
(Summary - key categories and examples)
- **Discord Interaction**: `eris`, `slash-create`, `dexare`
- **Data Storage**: `ioredis`, `@prisma/client`
- **Internationalization**: `i18next`, `i18next-fs-backend`
- **Error Tracking**: `@sentry/node`, `@sentry/tracing`
- **Utilities**: `axios`, `config` (node-config), `winston`
- **Configuration**: `config`, `dotenv`

## Database Interaction (Prisma - Bot)
- **Initialization**: Singleton `PrismaClient` in `apps/bot/src/prisma.ts`.
- **Schema**: Root `prisma/schema.prisma` defines models. `prisma generate` creates type-safe client.
- **Usage**: Imported for type-safe queries. Connection managed via `$connect`/`$disconnect`. `DATABASE_URL` from env.

## Redis Usage (Bot)
- **Initialization**: Singleton `ioredis` client in `apps/bot/src/redis.ts` (config from `node-config`, `lazyConnect: true`, `keyPrefix: 'craig:'`).
- **Connection**: Managed in `apps/bot/src/bot.ts` (`connect`/`disconnect`).
- **Helpers**: `processCooldown`, `checkMaintenance`, `setMaintenance`, `removeMaintenance` in `apps/bot/src/redis.ts`.
- **Availability**: Raw `client` usable directly.

## Configuration (Bot)
- **Loader**: `node-config` from `apps/bot/config/`. Root `.env` file.
- **Interface**: `CraigBotConfig` used in `apps/bot/src/bot.ts`.
- **Key Options**: Tokens, DB/Redis details, Sentry, logger settings, command paths.

## Entry Point and Core Logic (Bot)
- **Startup**: `apps/bot/src/index.ts` loads env, config, connects DB/Redis, Sentry, instantiates `CraigBot`, i18n, loads modules/commands, logs into Discord.
- **Shutdown**: Disconnects DB/Redis.

## Logging (Bot)
- **Module**: `LoggerModule` in `apps/bot/src/modules/logger.ts` (uses Winston).
- **Output**: Console, configurable levels.

## Modularity and Extensibility (Bot)
- **Dexare Modules**: In `apps/bot/src/modules/`.
- **Slash Commands**: `slash-create` based, in `apps/bot/src/commands/` (or configured path).
- **Text Commands**: Dexare based, in `apps/bot/src/textCommands/` (or configured path).
- **i18n**: `i18next` with JSON files in root `locale/` dir.

---

*End of `apps/bot/` Documentation Summary.*

---
# II. Analyze `apps/dashboard/` (Craig Dashboard) in Detail:

## 1. `package.json` Analysis

This section details the contents of `apps/dashboard/package.json`.

### General Information

- **Name:** `craig-dashboard`
- **Version:** `1.0.0`
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

### Scripts

- **`dev`**: `next dev` - Starts Next.js development server (HMR, local serving e.g., `localhost:3000`).
- **`build`**: `next build` - Builds Next.js app for production (optimizes, bundles, outputs to `.next/`).
- **`start`**: `next start` - Starts Next.js production server (serves optimized build from `.next/`).
- **`lint`**: `eslint .` - Lints codebase with ESLint for style and error checking.
- **`lint:fix`**: `eslint . --fix` - Lints and automatically fixes ESLint issues.
- **`prisma:generate`**: `prisma generate --schema=../../prisma/schema.prisma` - Generates Prisma Client from root schema for type-safe DB interactions.

### Categorized Dependencies

#### Core Framework & Rendering
- **`next`**: (v12.1.6) React framework (SSR, SSG, routing, API routes).
- **`react`**: (v17.0.2) UI library.
- **`react-dom`**: (v17.0.2) React DOM renderer.
- **`preact`**: (v10.9.0) Fast React alternative (used for production optimization via `next.config.js`).
- **`preact-compat`**: (v3.19.0) Compatibility layer for Preact.

#### UI & Styling
- **`tailwindcss`**: (v3.2.4) Utility-first CSS framework.
- **`@headlessui/react`**: (v1.4.3) Unstyled, accessible UI components.
- **`sass`**: (v1.56.0) CSS preprocessor.
- **`autoprefixer`**: (v10.4.12) PostCSS plugin for vendor prefixes.
- **`postcss`**: (v8.4.14) CSS transformation tool.
- **`clsx`**: (v1.2.1) Conditional className utility.
- **`react-tippy`**: (v1.4.0) React tooltip component.
- **`@fontsource/*`**: Self-hostable fonts (`lexend`, `red-hat-text`, `roboto`).

#### API Clients & Data Handling
- **`@prisma/client`**: (v5.12.1) Type-safe Prisma query builder.
- **`googleapis`**: (v104.0.0) Google APIs client (e.g., YouTube, Drive).
- **`dropbox`**: (v10.34.0) Dropbox API SDK.
- **`node-fetch`**: (v2.6.7) `fetch` API for Node.js (server-side requests).

#### Authentication & Cookies
- **`jsonwebtoken`**: (v8.5.1) JWT implementation for auth tokens.
- **`cookie`**: (v0.5.0) Cookie parser/serializer.

### DevDependencies
- **`typescript`**: (v4.7.3) Static typing for JavaScript.
- **`@types/*`**: Type definitions for various libraries (cookie, jsonwebtoken, node, node-fetch, react).

### Summary Statement
The dashboard is a **Next.js (React/Preact) TypeScript** application, styled with **Tailwind CSS**. It uses **Prisma** for database operations and integrates with **Google APIs** and **Dropbox**. Authentication relies on **JSON Web Tokens**.

*(Assuming "2. Configuration" for the dashboard will be detailed separately or was part of a prior step. If it needs to be added here, the numbering below will need adjustment.)*

## 3. Next.js Structure and Project Layout

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

## 4. Logging

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

## 5. Extensibility

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

## 6. Authentication Flow

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
# III. Analyze `apps/download/` (Craig Horse) in Detail:

## 1. `package.json` Analysis

This section details the contents of `apps/download/package.json`.

### General Information

- **Name:** `craig-horse`
- **Description:** API and page source of craig.horse
- **Version:** `1.1.0`
- **Main Entry Point:** `./dist/index.js` (This points to the compiled API server)
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

### Scripts

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

### Categorized Dependencies (API - `dependencies` in `package.json`)

#### API Framework & Server
- **`fastify`**: (v4.10.2) A fast and low overhead web framework for Node.js. Used as the core for the backend API.
- **`@fastify/helmet`**: (v9.1.0) Fastify plugin to set important security headers via Helmet.
- **`@fastify/rate-limit`**: (v7.0.0) Fastify plugin for rate limiting API requests.
- **`@fastify/static`**: (v6.5.0) Fastify plugin for serving static files (used to serve the bundled frontend page and assets).
- **`@fastify/websocket`**: (v7.1.2) Fastify plugin for adding WebSocket support to the server.

#### External Process Execution
- **`execa`**: ("5") A better `child_process` library for running external commands (e.g., ffmpeg, yt-dlp).

#### Data Handling & Utilities
- **`ioredis`**: (v5.0.6) Redis client, likely for caching or session management.
- **`destr`**: (v1.2.2) Fast, secure and convenient alternative to `JSON.parse`.
- **`nanoid`**: (v3.3.4) Small, secure, URL-friendly unique ID generator.
- **`dotenv`**: (v16.0.3) Loads environment variables from a `.env` file.

#### Error Tracking & Metrics
- **`@influxdata/influxdb-client`**: (v1.24.0) Client for InfluxDB, a time-series database, likely for metrics.
- **`@sentry/node`**: (v7.2.0) Sentry SDK for Node.js (error tracking for the API).
- **`@sentry/tracing`**, **`@sentry/integrations`**: Additional Sentry packages for performance tracing and integrations.

#### Scheduling
- **`cron`**: (v2.1.0) Job scheduler, for running tasks at defined intervals.

#### Fonts
- **`@fontsource/*`**: (`lexend`, `red-hat-text`, `ubuntu-mono`) Self-hostable open source fonts. While listed under `dependencies`, these are typically used by the frontend page but bundled during `build:page`. Their inclusion here might be a structural choice or for server-side rendering of some elements if that occurs.

### Categorized DevDependencies (Primarily for Frontend Page - `devDependencies` in `package.json`)

#### Frontend Framework & UI
- **`preact`**: (v10.9.0) Fast React alternative.
- **`react`**: (v17.0.2), **`react-dom`**: (v17.0.2) Used for Preact compatibility or if some components are React-specific.
- **`@headlessui/react`**: (v1.4.3) Unstyled, accessible UI components.
- **`@iconify/react`**, **`@iconify-icons/*`**: For using a wide range of icons as components.
- **`react-color`**: (v2.19.3) Color picker component.
- **`react-modal`**: (v3.15.1) Modal dialog component.
- **`react-tippy`**: (v1.4.0) Tooltip component.

#### Build Tools
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

#### Styling
- **`tailwindcss`**: (v3.2.4) Utility-first CSS framework.
- **`node-sass`**: (v9.0.0) Provides bindings for Node.js to LibSass (used by `rollup-plugin-postcss` or SASS plugins).
- **`autoprefixer`**: (v10.4.12) PostCSS plugin for vendor prefixes.
- **`postcss`**: (v8.4.14) CSS transformation tool.
- **`@fullhuman/postcss-purgecss`**: (v4.1.3) PostCSS plugin to remove unused CSS.

#### Internationalization (i18n)
- **`i18next`**: (v21.10.0) Internationalization framework.
- **`react-i18next`**: (v11.15.3) React bindings for i18next.

#### Error Tracking (Frontend)
- **`@sentry/react`**: (v6.17.4) Sentry SDK for React applications.

### Summary Statement
`craig-horse` is a dual-component application:
1.  A **backend API** built with **Fastify** (Node.js framework), responsible for handling core logic, external processes (like downloads via `execa`), data management (with Redis), and serving files. It includes error tracking with Sentry and metrics with InfluxDB.
2.  A **frontend single-page application (SPA)** built with **Preact/React** and **TypeScript**, styled using **Tailwind CSS** and **SASS**. This page is bundled using **Rollup** and its associated plugins. It features internationalization and its own Sentry integration for frontend error tracking.

The two parts are developed together but built separately (`build:api` and `build:page`) and then served by the Fastify server. PM2 is used for process management in deployment.

## 2. API Configuration (`apps/download/api/`)

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

## 3. Fastify API Structure (`apps/download/api/`)

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

## 4. Frontend Page Structure (`apps/download/page/`)

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

## 5. Logging Mechanisms (`apps/download/`)

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

## 6. Extensibility (`apps/download/`)

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
# IV. Analyze `apps/tasks/` (Craig Tasks) in Detail:

## 1. `package.json` Analysis

This section details the contents of `apps/tasks/package.json`.

### General Information

- **Name:** `craig-tasks`
- **Description:** The task manager
- **Version:** `1.0.0`
- **Exports:** `./dist/index.js` (Indicates the main module entry point, likely for the tRPC router or job definitions)
- **Author:** Snazzah (me@snazzah.com, https://snazzah.com/)

### Scripts

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

### Categorized Dependencies

#### Core Functionality & Scheduling
- **`cron`**: (v2.1.0) A job scheduler, used to define and run tasks at scheduled intervals (e.g., nightly cleanup, data aggregation).
- **`config`**: (v3.3.8) (`node-config`) Library for managing application configurations across different environments. Settings are likely in a `config/` directory within `apps/tasks/` or the root config.

#### Database & Data Validation
- **`@prisma/client`**: (v5.12.1) Type-safe Prisma ORM client for database interactions, using the shared schema.
- **`zod`**: (v3.19.1) TypeScript-first schema declaration and validation library. Likely used for validating input to tRPC procedures or job parameters.

#### API & Communication
- **`@trpc/server`**: (v9.20.3) Framework for creating type-safe APIs. Used to expose procedures that can be called by other services (e.g., the main bot or dashboard) or for internal communication.

#### External Service Clients
- **`axios`**: (v0.27.2) Promise-based HTTP client for making requests to external APIs.
- **`googleapis`**: (v104.0.0) Google APIs client (e.g., for YouTube Data API, Google Drive).
- **`dropbox`**: (v10.34.0) Dropbox API v2 Node.js SDK.

#### Error Tracking & Logging
- **`@sentry/node`**: (v7.2.0) Sentry SDK for Node.js error tracking. Includes `@sentry/integrations` and `@sentry/tracing` for enhanced reporting.
- **`winston`**: (v3.11.0) A versatile logging library for creating structured logs.
- **`chalk`**: ("4") Terminal string styling library, often used to improve console log readability.

#### Utilities
- **`dayjs`**: (v1.11.6) A fast and lightweight library for date and time manipulation.
- **`lodash.isequal`**: (v4.5.0) Lodash method for performing deep equality checks.

### DevDependencies
- **`typescript`**: (v4.7.3) TypeScript compiler.
- **`@types/config`**: (v3.3.0) Type definitions for `node-config`.
- **`@types/cron`**: (v2.0.0) Type definitions for `cron`.
- **`@types/lodash.isequal`**: (v4.5.6) Type definitions for `lodash.isequal`.
- **`@types/node`**: (v18.0.0) Type definitions for Node.js.

### Summary Statement
`craig-tasks` serves as a backend task management service. It runs scheduled **cron jobs** for routine operations and potentially exposes a **tRPC API** for type-safe communication with other parts of the Craig ecosystem. It interacts with the shared **Prisma** database, utilizes external services like **Google APIs** and **Dropbox**, and employs **Sentry** for error tracking and **Winston** for logging. The `run-job` script allows for manual triggering of specific tasks.

## 2. Configuration (`apps/tasks/`)

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

## 3. Core Logic (Cron Jobs & tRPC API) (`apps/tasks/`)

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

## 4. Logging (`apps/tasks/`)

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

## 5. Extensibility (`apps/tasks/`)

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
