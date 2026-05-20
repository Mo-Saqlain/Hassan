import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Batch-register a list of serials against one item. Used by the Purchases
 * form when the salesman pastes the manufacturer's serial list for a line.
 * Idempotent: serials that already exist on the same item are skipped;
 * serials that exist on a *different* item throw a 409.
 */
export class RegisterSerialsDto {
  @IsUUID()
  itemId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serials: string[];

  @IsString()
  @IsOptional()
  purchaseBillNo?: string;

  @IsDateString()
  @IsOptional()
  purchasedAt?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsUUID()
  @IsOptional()
  currentStoreId?: string;
}

/** Per-line bindings shipped with a purchase create. */
export class PurchaseLineSerialsDto {
  @IsUUID()
  itemId: string;

  @IsArray()
  @IsString({ each: true })
  serials: string[];
}

/** Top-level payload accepted alongside the purchase create body. */
export class BulkRegisterDto {
  @IsString()
  @IsOptional()
  purchaseBillNo?: string;

  @IsDateString()
  @IsOptional()
  purchasedAt?: string;

  @IsUUID()
  @IsOptional()
  currentStoreId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineSerialsDto)
  lines: PurchaseLineSerialsDto[];
}
