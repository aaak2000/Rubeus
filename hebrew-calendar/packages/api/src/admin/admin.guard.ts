import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/dto';

/**
 * Restricts a route to the deployment's operators.
 *
 * Membership is an environment allowlist rather than a column, for two
 * reasons: this is a single-operator product, so a role system would be
 * ceremony around a list of one; and a privilege that lives outside the
 * database cannot be granted by anything that can write to it.
 *
 * Runs after `JwtAuthGuard`, which is what puts the user on the request.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const email = req.user?.email?.toLowerCase();
    if (!email || !adminEmails().includes(email)) {
      // Deliberately the same answer whether the account is not an admin or
      // no admin is configured at all — neither is the caller's business.
      throw new ForbiddenException('Not permitted');
    }
    return true;
  }
}

/**
 * The allowlist, read per call so it is never captured at boot.
 *
 * An unset or empty variable yields an empty list, which denies everyone.
 * Failing closed matters more here than anywhere else in the app: the
 * alternative reading — "no list configured, so allow" — would open campaign
 * management to every registered account on a fresh deployment.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
