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
  @IsString() @IsOptional() code?: string;
  @IsString() @MinLength(1) name: string;
  @IsIn(['CASH', 'BANK', 'WALLET', 'CAPITAL', 'CREDIT'])
  type: 'CASH' | 'BANK' | 'WALLET' | 'CAPITAL' | 'CREDIT';
  @IsString() @IsOptional() accountNumber?: string;
  @IsString() @IsOptional() bank?: string;
  @IsNumber() @IsOptional() openingBalance?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
