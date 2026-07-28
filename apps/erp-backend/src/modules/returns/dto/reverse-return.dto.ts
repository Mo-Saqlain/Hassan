import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Body for `POST /returns/{sale,purchase}-returns/:id/reverse`.
 *
 * A reason is mandatory — a reversal is a correction of a mistake, and the
 * whole point of keeping the reversed row is that someone can later read why.
 */
export class ReverseReturnDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
