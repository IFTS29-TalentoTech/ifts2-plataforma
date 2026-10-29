import { createApp, getContext } from './app';
import { ConfigError, loadConfig } from './config';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      console.error('\nRevisá tu archivo .env (ver .env.example). La API no arrancó.');
      process.exit(1);
    }
    throw e;
  }

  const app = await createApp({ config });
  const ctx = getContext(app);
  const server = app.listen(config.port, () => {
    ctx.logger.info({ port: config.port, env: config.nodeEnv }, 'API escuchando');
  });

  const shutdown = async (signal: string) => {
    ctx.logger.info({ signal }, 'cerrando');
    server.close();
    await ctx.prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
