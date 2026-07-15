import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One counted item on a stocktake sheet. */
export class StocktakeLineDto {
  @IsUUID()
  itemId: string;

  /** The quantity physically counted on the shelf (0 is valid — counted none). */
  @IsInt()
  @Min(0)
  countedQty: number;
}

/**
 * A physical stock count. The caller submits the counted quantity for each
 * item they checked; the service snapshots current system on-hand, computes
 * the variance per item, and posts a single ADJUSTMENT movement per non-zero
 * variance — all under one shared reference so the whole count is groupable in
 * the stock ledger. Items left off the sheet are simply not touched (partial
 * counts are fine).
 */
export class StocktakeDto {
  /** Optional store scope — omit to count global on-hand. */
  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  lines: StocktakeLineDto[];
}
