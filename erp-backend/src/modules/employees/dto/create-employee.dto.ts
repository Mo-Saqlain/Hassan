import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsOptional()
  code?: string;

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

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  salaryDay?: number;

  @IsBoolean()
  @IsOptional()
  firstSalaryInAdvance?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
