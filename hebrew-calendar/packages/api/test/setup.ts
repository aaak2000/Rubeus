import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Boots the real application against the real database, mirroring the
 * bootstrap in main.ts. These tests exist because the two most damaging
 * defects found in review — the ValidationPipe stripping undecorated DTO
 * fields, breaking token refresh and ICS import — are invisible to unit tests.
 */
export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

let counter = 0;
/** A unique address per test, so runs never collide on the unique email index. */
export function uniqueEmail(prefix = 'test'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.test`;
}
