import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { WarrantyType } from '../entities/item.entity';

const WARRANTY_TYPES: WarrantyType[] = [
  'COMPANY',
  'SHOP',
  'CHECKING_ONLY',
  'NONE',
];

export class CreateItemDto {
  /**
   * Display name. If omitted, the service copies `modelNo` here — the shop
   * treats Model No. as the item's name.
   */
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Stock Keeping Unit — unique internal code per item variant. If omitted,
   * the service derives one from `modelNo` (suffixing -2 / -3… on collision).
   */
  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  /**
   * Manufacturer's model number — the item's identifier in the shop's eyes.
   * Required unless `name` is provided as a fallback (legacy callers).
   */
  @IsString()
  @IsOptional()
  modelNo?: string;

  @IsUUID()
  @IsOptional()
  brandId?: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  @IsOptional()
  categoryIds?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  tracksSerials?: boolean;

  @IsBoolean()
  @IsOptional()
  serialRequiredOnSale?: boolean;

  @IsBoolean()
  @IsOptional()
  hasWarranty?: boolean;

  @IsIn(WARRANTY_TYPES)
  @IsOptional()
  warrantyType?: WarrantyType;

  @IsInt()
  @Min(0)
  @IsOptional()
  warrantyDays?: number;
}
