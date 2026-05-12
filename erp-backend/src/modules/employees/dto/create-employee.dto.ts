import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlySalary?: number;

  @IsNumber()
  @IsOptional()
  openingBalance?: number;

  @IsDateString()
  @IsOptional()
  joinedAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
