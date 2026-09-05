import { HebrewRecurrenceKind } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsISO8601() start!: string;
  @IsISO8601() end!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() rrule?: string | null;
  @IsOptional() @IsEnum(HebrewRecurrenceKind) hebrewRecurrence?: HebrewRecurrenceKind | null;
  /** Original Gregorian date (YYYY-MM-DD) the Hebrew recurrence anchors on. */
  @IsOptional() @IsDateString() hebrewRecurrenceDate?: string | null;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsISO8601() start?: string;
  @IsOptional() @IsISO8601() end?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() rrule?: string | null;
  @IsOptional() @IsEnum(HebrewRecurrenceKind) hebrewRecurrence?: HebrewRecurrenceKind | null;
  @IsOptional() @IsDateString() hebrewRecurrenceDate?: string | null;
}
