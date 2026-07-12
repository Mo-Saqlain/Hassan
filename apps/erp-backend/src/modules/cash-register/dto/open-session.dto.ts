import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OpeningTransferDto {
  @IsUUID()
  fromAccountId: string;

  @IsUUID()
  toAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class OpenSessionDto {
  @IsDateString()
  @IsOptional()
  sessionDate?: string;

  @IsNumber()
  @Min(0)
  actualOpening: number;

  @ValidateNested()
  @Type(() => OpeningTransferDto)
  @IsOptional()
  transfer?: OpeningTransferDto;

  @IsString()
  @IsOptional()
  notes?: string;
}
