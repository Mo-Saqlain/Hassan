import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStoreDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @IsOptional() location?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
