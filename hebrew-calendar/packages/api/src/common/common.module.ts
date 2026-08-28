import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenCrypto } from './token-crypto';

export const TOKEN_CRYPTO = 'TOKEN_CRYPTO';

@Global()
@Module({
  providers: [
    {
      provide: TOKEN_CRYPTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TokenCrypto(config.getOrThrow<string>('TOKEN_ENCRYPTION_KEY')),
    },
  ],
  exports: [TOKEN_CRYPTO],
})
export class CommonModule {}
