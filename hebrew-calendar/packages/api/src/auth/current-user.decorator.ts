import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './dto';

/** Injects the authenticated {@link AuthUser} attached by {@link JwtAuthGuard}. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
