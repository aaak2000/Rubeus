import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() il?: boolean;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() tzid?: string;
  @IsOptional() @IsNumber() elevation?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) candleMinutes?: number;
  @IsOptional() @IsString() locale?: string;

  /**
   * Where the user's day starts. `sunset` is the Hebrew calendar's own
   * boundary and the default; `midnight` shows the civil day instead.
   */
  @IsOptional() @IsIn(['midnight', 'sunset']) dayBoundary?: 'midnight' | 'sunset';

  /** Reminder email on or off. Push is opted into per device instead. */
  @IsOptional() @IsBoolean() emailReminders?: boolean;

  /** Local hour reminders should arrive at, in the user's own timezone. */
  @IsOptional() @IsInt() @Min(0) @Max(23) reminderHour?: number;
}
