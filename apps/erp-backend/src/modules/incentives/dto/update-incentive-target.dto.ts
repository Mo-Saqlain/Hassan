import { PartialType } from '@nestjs/mapped-types';
import { CreateIncentiveTargetDto } from './create-incentive-target.dto';

export class UpdateIncentiveTargetDto extends PartialType(
  CreateIncentiveTargetDto,
) {}
