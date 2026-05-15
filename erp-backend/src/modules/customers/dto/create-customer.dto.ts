import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  openingBalance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  creditLimit?: number;

  @IsBoolean()
  @IsOptional()
  creditEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
