import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swagger = new DocumentBuilder()
    .setTitle('Hebrew Calendar API')
    .setDescription('Standalone Hebrew calendar with two-way sync to Google, Microsoft, CalDAV and ICS.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(config.get<string>('PORT') ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Hebrew Calendar API listening on http://localhost:${port} (docs at /docs)`);
}

void bootstrap();
