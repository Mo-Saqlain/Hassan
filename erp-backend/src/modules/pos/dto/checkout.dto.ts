import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Per-line serial bindings supplied at checkout. The salesman scans or types
 * the appliance serial for each `tracksSerials` cart line. Items in the cart
 * have unique itemIds (cart aggregates qty), so a single (itemId → serials[])
 * map is enough — the array length must equal the cart line's quantity for
 * tracksSerials items.
 */
export class CheckoutSerialBindingDto {
  @IsUUID()
  itemId: string;

  @IsArray()
  @IsString({ each: true })
  serials: string[];
}

export class CheckoutDto {
  @IsIn(['CASH', 'CARD', 'BANK', 'CREDIT'])
  @IsOptional()
  paymentMethod?: 'CASH' | 'CARD' | 'BANK' | 'CREDIT';

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  /** ISO `YYYY-MM-DD`. Forwarded to `SalesService.create()`. */
  @IsDateString()
  @IsOptional()
  expectedPaymentDate?: string;

  /**
   * Serial assignments per cart line. Required (must cover the full quantity)
   * for every cart item whose `tracksSerials` is true; ignored for the rest.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CheckoutSerialBindingDto)
  serials?: CheckoutSerialBindingDto[];
}
