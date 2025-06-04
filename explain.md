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

*Note: Some scripts from the initial analysis like `dev`, `clean`, `test`, `test:watch`, `coverage`, `generate-docs` were not present in the provided `apps/bot/package.json`. They might be defined in a root `package.json` or were assumed. The list above is directly from `apps/bot/package.json`.*

## Dependencies

The bot relies on several key libraries, categorized as follows:

### Discord Interaction

- **`eris`**: A powerful and flexible Node.js library for interacting with the Discord API. Used for core bot functionality, event handling, and direct API communication. (Note: `package.json` points to a specific fork: `github:CraigChat/dysnomia`)
- **`slash-create`**: Simplifies the creation and handling of Discord slash commands. Manages command registration and interaction events.
- **`dexare`**: A framework for building modular Discord bots, providing a command system, module loader, and event handling capabilities. Used for text-based commands and module organization.

### Data Storage

- **`ioredis`**: A robust and high-performance Redis client for Node.js. Used for caching and potentially other data storage needs.
- **`@prisma/client`**: The client library for Prisma ORM, used for database interactions, likely with PostgreSQL as suggested by other potential configurations, but Prisma supports multiple databases.
- **`mongoose`**: An Object Data Modeling (ODM) library for MongoDB. (Noticed this was in the initial draft, but not directly in `apps/bot/package.json` dependencies. It might be a dependency of a dependency or used in another part of the monorepo that interacts with the bot's data. Keeping for now but with a note.)
- **`knex`** & **`pg`**: Knex is a SQL query builder, and `pg` is the PostgreSQL client. (Similar to mongoose, not directly listed in `apps/bot/package.json`'s direct dependencies. These could be part of a different package or an older setup. `prisma` seems to be the more current direct dependency for SQL.)

### Internationalization (i18n)

- **`i18next`**: A popular internationalization framework. Used to support multiple languages within the bot.
- **`i18next-fs-backend`**: An i18next backend that loads translations from the file system.
- **`i18next-http-middleware`**: (Not in `apps/bot/package.json`'s direct dependencies. May be for a related web dashboard or an older feature.)

### Error Tracking

- **`@sentry/node`**: Sentry SDK for Node.js, used for real-time error tracking and reporting.
- **`@sentry/tracing`**: Provides performance monitoring and tracing capabilities for Sentry.
- **`@sentry/integrations`**: Provides additional integrations for Sentry.

### Utilities

- **`axios`**: Promise-based HTTP client for making requests to external APIs.
- **`chalk`**: Terminal string styling. (Used by `dexare` or other console tools)
- **`common-tags`**: Provides template literal tags for various string manipulations.
- **`config`**: (`node-config`) A library for managing application configurations.
- **`cron`**: Used for scheduling tasks (cron jobs).
- **`dayjs`**: A modern library for parsing, validating, manipulating, and displaying dates and times. (Alternative to `moment`)
- **`dbots`**: Library for interacting with Discord bot list APIs.
- **`eventemitter3`**: A high-performance event emitter.
- **`fastq`**: Async queue for managing tasks.
- **`just-group-by`**, **`just-range`**: Utility functions.
- **`nanoid`**: Small, secure, URL-friendly unique string ID generator.
- **`node-fetch`**: `fetch` API for Node.js.
- **`prom-client`**: Client for Prometheus monitoring system.
- **`sodium-native`**: Low-level cryptographic functions.
- **`winston`**: A versatile logging library.
- **`ws`**: WebSocket client and server library.
- **`reflect-metadata`**: (Not in `apps/bot/package.json`'s direct dependencies. Often used with IoC containers or ORMs like TypeORM, but Prisma is listed.)
- **`typescript-ioc`**: (Not in `apps/bot/package.json`'s direct dependencies. If used, it would be for dependency injection.)

### Configuration

- **`config` (`node-config` a.k.a)**: Manages application configurations across different deployment environments.
- **`dotenv`**: Loads environment variables from a `.env` file.

*Note on Dependencies: The list above primarily reflects direct dependencies from `apps/bot/package.json`. Some libraries mentioned in the initial draft (like `mongoose`, `knex`, `pg`, `i18next-http-middleware`, `reflect-metadata`, `typescript-ioc`, `tslog`, `yaml`, `encoding`, `dot-object`, `lodash`, `moment`) were not found as direct dependencies there. They might be:
- Transitive dependencies (imported by a direct dependency).
- Used in other packages within the monorepo.
- Part of an older version or a different branch of the codebase.
- Global utilities assumed to be present.
The current list is more faithful to the provided `package.json` for `apps/bot/`.*

## Configuration

Configuration management is crucial for the bot's operation.

- **`node-config` (imported as `config`)**: The primary configuration loader. It loads settings from files in the `apps/bot/config/` directory (e.g., `default.js`, `development.js`, `production.js`). The correct configuration file is chosen based on the `NODE_ENV` environment variable.
- **`.env` file**: Used to store sensitive credentials and environment-specific variables (e.g., bot token, database URLs, API keys). The `dotenv` script argument `-e ../../.env` indicates it likely uses a root-level `.env` file.
- **`CraigBotConfig` Interface**: (Assumed to be defined in `apps/bot/src/types/config.ts` or similar) This interface specifies the structure and expected types for the bot's configuration object. This provides type safety and autocompletion when accessing configuration values.
- **Key Configuration Options** (Based on common bot needs and observed dependencies):
    - `token`: The Discord bot token.
    - `applicationID`: The Discord application ID.
    - `erisOptions`: Configuration options for the Eris client.
    - `database`: Connection details for PostgreSQL (used by Prisma) and potentially MongoDB if still in use.
    - `redis`: Connection details for Redis.
    - `sentry`: Sentry DSN and configuration.
    - `logger`: Logging level and settings for Winston.
    - `developmentGuilds`: Array of guild IDs for registering slash commands during development.
- **Development Setup**:
    - Typically involves setting `NODE_ENV=development`.
    - Creating a `config/development.js` or `config/local.js` file to override default settings for local development.
    - Using a root `.env` file for local credentials.

## Entry Point and Core Logic

- **Startup Process (`apps/bot/src/index.ts`)**:
    1. **Environment Loading**: `dotenv` (via script arguments) loads environment variables.
    2. **Configuration Loading**: `node-config` loads the appropriate configuration.
    3. **Sentry Initialization**: Sentry is initialized for error tracking if a DSN is provided in config.
    4. **Bot Instantiation**: The `CraigBot` class (likely extending `DexareClient`) is instantiated. This involves:
        - Setting up Eris client options.
        - Initializing the `slash-create` `SlashCreator`.
        - Registering Dexare modules.
    5. **i18n Initialization**: `i18next` is configured with language resources and settings.
    6. **Module Loading**: Dexare modules are loaded.
    7. **Command Registration**:
        - Slash commands are registered globally or to development guilds using `SlashCreator` (often triggered by `slash-up sync`).
        - Text-based commands from Dexare modules are registered.
    8. **Event Handling**: Event listeners for Discord events and process events are set up.
    9. **Bot Login**: The bot connects to Discord using the provided token.
- **Roles of Eris & Dexare**:
    - **Eris**: Provides the low-level interface to the Discord API.
    - **Dexare**: Acts as a higher-level framework for modularity and text commands.
- **Module/Command Loading**:
    - **Dexare Modules**: Reside in `apps/bot/src/modules/`.
    - **Slash Commands**: Reside in `apps/bot/src/commands/slash/`.
    - **Text Commands (Dexare)**: Defined within Dexare modules.

## Logging

- **`LoggerModule`**: (Assumed Dexare module, e.g., `apps/bot/src/modules/logger.ts`) Standardizes logging.
- **Winston**: The underlying logging library.
- **Console Output**: Default log destination.
- **Log Levels**: Standard levels (`debug`, `info`, `warn`, `error`).
- **How to Emit Logs**: Via logger instance obtained from Dexare client or DI.

## Modularity and Extensibility

### Dexare Module System

- **Structure**: Classes extending `Dexare.Module` in `apps/bot/src/modules/`.
- **Adding New Modules**: Create class, implement logic, register in `src/bot.ts` or main client.

### Command Systems

#### Slash Commands (with `slash-create`)

- **Structure**: Classes extending `SlashCommand` from `slash-create` in `apps/bot/src/commands/slash/`.
- **Adding New Slash Commands**: Create class, define metadata & `run` method. `CommandRegisterModule` (if it exists) or `slash-up` handles registration.

#### Text Commands (with Dexare/GeneralCommand)

- **Structure**: Classes extending `GeneralCommand` (custom base) within Dexare modules.
- **Adding New Text Commands**: Create class in module's `commands/` dir, define metadata & `run`. Module loads them.

### Internationalization (i18n)

- **`i18next`**: Core framework.
- **Locale File Structure**: `apps/bot/locales/{lang}/{namespace}.json` (e.g., `apps/bot/locales/en/common.json`).
- **Adding New Languages/Strings**:
    1. **Language**: Create new lang folder, copy/translate files, update i18next config.
    2. **Strings**: Add key to all language files, use `t()` function.
---

*This document is based on automated analysis and the contents of `apps/bot/package.json`. Some assumptions were made for sections where direct code analysis was not performed in this step (e.g., specific file paths for `CraigBotConfig` or `LoggerModule` which are common patterns but would require further `ls` and `read_files` to confirm precisely).*
