import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SyncEventDto {
  @IsUUID()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  payload: Record<string, unknown>;
}

export class SyncPushDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncEventDto)
  events: SyncEventDto[];
}
