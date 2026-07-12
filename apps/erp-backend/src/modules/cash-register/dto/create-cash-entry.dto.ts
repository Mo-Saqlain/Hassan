import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

const CATEGORIES = [
  'OPENING',
  'CLOSING_ADJUSTMENT',
  'WALLET_TRANSFER_IN',
  'WALLET_TRANSFER_OUT',
  'EXPENSE',
  'MISC',
  'OTHER',
] as const;

export class CreateCashEntryDto {
  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @IsIn(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @IsIn(CATEGORIES as unknown as string[])
  category: typeof CATEGORIES[number];

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsUUID()
  @IsOptional()
  counterpartyAccountId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
