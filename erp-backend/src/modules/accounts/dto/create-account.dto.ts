import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAccountDto {
  @IsString() @MinLength(1) name: string;
  @IsIn(['CASH', 'BANK', 'WALLET']) type: 'CASH' | 'BANK' | 'WALLET';
  @IsString() @IsOptional() accountNumber?: string;
  @IsString() @IsOptional() bank?: string;
  @IsNumber() @Min(0) @IsOptional() openingBalance?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
