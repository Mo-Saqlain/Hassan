import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddToCartDto {
  /** SKU or barcode of the item to add. */
  @IsString()
  code: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;
}
