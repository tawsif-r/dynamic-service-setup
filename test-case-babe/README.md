# test-case-babe

Generated with `create-app`. This project has no runtime dependency on the generator.

## Stack

- **Backend:** NestJS
- **Database:** MongoDB
- **Cache:** none
- **Containerization:** Docker + Docker Compose
- **Package manager:** npm

## Components

### NestJS

Nest bootstraps in `src/main.ts`. Feature wiring (database, cache) is composed into `src/app.module.ts` by the generator based on the components you picked.

### MongoDB

`MONGODB_URI` drives the Mongoose connection. Define schemas with `@nestjs/mongoose` decorators and register them per feature module.

### Docker

`docker build -t <name> .` builds the runtime image; the Compose file uses it.

### Docker Compose

`docker compose up -d` starts the app and its dependencies.

## Getting started

```bash
npm install
docker compose up -d
npm run start:dev
```
