import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() il?: boolean;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() tzid?: string;
  @IsOptional() @IsNumber() elevation?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) candleMinutes?: number;
  @IsOptional() @IsString() locale?: string;
}
