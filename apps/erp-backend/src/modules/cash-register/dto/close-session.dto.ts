import { IsObject, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseSessionDto {
  @IsNumber()
  @Min(0)
  actualClosing: number;

  /**
   * Denomination breakdown `{ "5000": 4, "1000": 7, ... }`. Frontend auto-
   * sums to `actualClosing` for the cashier; backend persists the map
   * verbatim for variance investigation.
   */
  @IsObject()
  @IsOptional()
  closingDenominations?: Record<string, number>;

  @IsString()
  @IsOptional()
  notes?: string;
}
