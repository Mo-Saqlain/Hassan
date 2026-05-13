import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString() @IsOptional() code?: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() phone?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() address?: string;
  @IsNumber() @Min(0) @IsOptional() openingBalance?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
