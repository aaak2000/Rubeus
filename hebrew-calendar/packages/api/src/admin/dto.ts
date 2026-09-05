import { AdPlacement } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Every field carries a decorator: the global ValidationPipe runs with
// `whitelist: true` and silently drops properties that have none.

/**
 * Only http(s) URLs.
 *
 * Not a formality: `targetUrl` becomes an `href` and `imageUrl` an `img src`
 * in the client, so a `javascript:` URL stored here would run in the page of
 * everyone who is shown the ad. The operator is trusted, but a stored value
 * that executes is worth refusing at the edge rather than relying on that.
 */
const HTTP_URL = /^https?:\/\/[^\s]+$/i;
const URL_MESSAGE = 'must be an http(s) URL';

export class CreateCampaignDto {
  @IsString() @MinLength(1) @MaxLength(120) advertiser!: string;

  @IsString() @MinLength(1) @MaxLength(200) title!: string;

  @IsOptional() @IsString() @MaxLength(500) body?: string;

  @IsOptional() @Matches(HTTP_URL, { message: `imageUrl ${URL_MESSAGE}` }) imageUrl?: string;

  @Matches(HTTP_URL, { message: `targetUrl ${URL_MESSAGE}` }) targetUrl!: string;

  @IsOptional() @IsEnum(AdPlacement) placement?: AdPlacement;

  /** Relative share of impressions. Capped so one campaign cannot swamp the rest. */
  @IsOptional() @IsInt() @Min(1) @Max(100) weight?: number;

  @IsOptional() @IsBoolean() active?: boolean;

  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;

  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string;
}

// `null` is meaningful in an update: it clears a picture, a description or a
// flight date. class-validator's `@IsOptional()` skips null as well as
// undefined, so these arrive intact rather than being rejected — and the
// service distinguishes "not mentioned" from "cleared".
export class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) advertiser?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(500) body?: string | null;
  @IsOptional() @Matches(HTTP_URL, { message: `imageUrl ${URL_MESSAGE}` }) imageUrl?: string | null;
  @IsOptional() @Matches(HTTP_URL, { message: `targetUrl ${URL_MESSAGE}` }) targetUrl?: string;
  @IsOptional() @IsEnum(AdPlacement) placement?: AdPlacement;
  @IsOptional() @IsInt() @Min(1) @Max(100) weight?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
}
