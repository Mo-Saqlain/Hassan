import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class RecostDto {
  /** Limit the replay to these items. Omit to recompute the whole catalogue. */
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  itemIds?: string[];

  /**
   * Also rewrite `SaleItem.costAtSaleTime` for the sales in the replay, so past
   * COGS and margins reflect the corrected cost basis. Off by default: it
   * changes historical reports, which should be a deliberate choice.
   */
  @IsBoolean()
  @IsOptional()
  resnapshotSales?: boolean;
}
