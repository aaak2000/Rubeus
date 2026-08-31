import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request bytes, which the billing webhook needs:
  // a signature is computed over exactly what was sent, and re-serializing the
  // parsed JSON would never match it.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');
  // Swagger's UI needs inline styles/scripts, so its CSP is relaxed only when
  // the docs are actually served (development).
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.enableCors({ origin: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Finish in-flight requests and close the database pool on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('Hebrew Calendar API')
      .setDescription('Standalone Hebrew calendar with two-way sync to Google, Microsoft, CalDAV and ICS.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }

  const port = Number(config.get<string>('PORT') ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hebrew Calendar API listening on http://localhost:${port}${isProd ? '' : ' (docs at /docs)'}`);
}

void bootstrap();
