import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { PaddleAdapter } from './paddle.adapter';

/** Express request carrying the untouched body, kept for signature checks. */
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly paddle: PaddleAdapter,
  ) {}

  /** The user's own subscription state, and what the plan costs. */
  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.billing.status(user.userId);
  }

  /**
   * What the client needs to open Paddle's overlay checkout.
   *
   * The price id and client token are public by design — Paddle validates the
   * transaction server-side, and the webhook is what actually grants anything.
   */
  @Get('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser() user: AuthUser) {
    if (!this.billing.providerConfigured) {
      throw new BadRequestException('Billing is not configured on this server');
    }
    return {
      provider: 'paddle',
      priceId: process.env.PADDLE_PRICE_ID,
      clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null,
      environment: process.env.PADDLE_ENVIRONMENT ?? 'production',
      // Prefills checkout and is how the webhook finds the account again.
      email: user.email,
    };
  }

  /**
   * Cancel the subscription, from inside the app.
   *
   * Reachable in the same place the subscription was bought, and in the same
   * number of steps — Israeli consumer law requires an ongoing transaction
   * sold online to be cancellable online, not by phone or email.
   */
  @Post('cancel')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: AuthUser) {
    return this.billing.cancel(user.userId);
  }

  /** Undo a scheduled cancellation, while the paid period is still running. */
  @Post('resume')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  resume(@CurrentUser() user: AuthUser) {
    return this.billing.resume(user.userId);
  }

  /**
   * Paddle webhook. Unauthenticated by necessity — the signature is the
   * authentication, checked against the raw bytes before anything is parsed
   * as meaningful.
   */
  @Post('webhook/paddle')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest,
    @Headers('paddle-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = req.rawBody;
    if (!raw || !this.paddle.verify(raw, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const event = this.paddle.normalize(body);
    // An event we do not model is still acknowledged: replying non-2xx would
    // make Paddle retry something we are never going to act on.
    if (!event) return { ignored: true };

    if (!(await this.billing.claimEvent(event.eventId, 'paddle', event.type))) {
      return { duplicate: true };
    }

    const userId = await this.billing.findUserByEmailOrSubscription(
      event.email,
      event.providerSubscriptionId,
    );
    if (!userId) return { unmatched: true };

    await this.billing.upsertFromProvider({
      userId,
      provider: 'paddle',
      status: event.status,
      providerCustomerId: event.providerCustomerId,
      providerSubscriptionId: event.providerSubscriptionId,
      currentPeriodEnd: event.currentPeriodEnd,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      priceCents: this.billing.plan.priceCents,
      currency: this.billing.plan.currency,
    });
    return { applied: true };
  }
}
