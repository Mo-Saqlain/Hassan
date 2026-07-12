import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  /**
   * Short uppercase code (up to 8 chars, A-Z 0-9) used as the segment of
   * auto-generated local serials. Uniqueness enforced in the service.
   */
  @IsString()
  @MaxLength(8)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Code must be uppercase letters and digits only (e.g. COOLER).',
  })
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
