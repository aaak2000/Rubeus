import { IsBoolean, IsDateString, IsEnum, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { HebrewRecurrenceKind } from '@prisma/client';

export class CreateEventDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() location?: string;
  @IsISO8601() start!: string;
  @IsISO8601() end!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() rrule?: string;
  @IsOptional() @IsEnum(HebrewRecurrenceKind) hebrewRecurrence?: HebrewRecurrenceKind;
  /** Original Gregorian date (YYYY-MM-DD) the Hebrew recurrence anchors on. */
  @IsOptional() @IsDateString() hebrewRecurrenceDate?: string;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsISO8601() start?: string;
  @IsOptional() @IsISO8601() end?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() rrule?: string;
  @IsOptional() @IsEnum(HebrewRecurrenceKind) hebrewRecurrence?: HebrewRecurrenceKind;
  @IsOptional() @IsDateString() hebrewRecurrenceDate?: string;
}
