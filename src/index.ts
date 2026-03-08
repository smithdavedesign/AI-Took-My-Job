import { buildApp } from './server.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({
      host: app.config.HOST,
      port: app.config.PORT
    });
  } catch (error) {
    app.log.error(error, 'failed to start server');
    process.exit(1);
  }
}

void main();