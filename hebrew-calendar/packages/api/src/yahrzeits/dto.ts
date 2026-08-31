import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Every field carries a decorator: the global ValidationPipe runs with
// `whitelist: true` and silently drops properties that have none.

export class CreateYahrzeitDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @IsOptional() @IsString() @MaxLength(200) hebrewName?: string;

  @IsOptional() @IsString() @MaxLength(60) relation?: string;

  /** Gregorian date of death, `YYYY-MM-DD`. */
  @IsISO8601({ strict: true }) deathDate!: string;

  /**
   * Whether death occurred after sunset. This is not a detail: it moves the
   * Hebrew date, and so the observance, by a day.
   */
  @IsOptional() @IsBoolean() afterSunset?: boolean;

  @IsOptional() @IsString() @MaxLength(2000) note?: string;

  /** Days ahead to remind. Capped so one record cannot schedule hundreds. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  remindDaysBefore?: number[];
}

export class UpdateYahrzeitDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) hebrewName?: string;
  @IsOptional() @IsString() @MaxLength(60) relation?: string;
  @IsOptional() @IsISO8601({ strict: true }) deathDate?: string;
  @IsOptional() @IsBoolean() afterSunset?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  remindDaysBefore?: number[];
}
