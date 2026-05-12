import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateFundTransferDto {
  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @IsUUID()
  fromAccountId: string;

  @IsUUID()
  toAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  transferNo?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
