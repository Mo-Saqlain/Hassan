import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly repo: Repository<Payment>,
  ) {}

  async create(dto: CreatePaymentDto): Promise<Payment> {
    if (dto.direction === 'IN' && !dto.customerId) {
      throw new BadRequestException('Receipt voucher requires customerId');
    }
    if (dto.direction === 'OUT' && !dto.supplierId) {
      throw new BadRequestException('Payment voucher requires supplierId');
    }
    const voucherNo = dto.voucherNo ?? (await this.nextVoucherNo(dto.direction));
    return this.repo.save(this.repo.create({ ...dto, voucherNo }));
  }

  private async nextVoucherNo(direction: 'IN' | 'OUT') {
    const count = await this.repo.count({ where: { direction } });
    const prefix = direction === 'IN' ? 'RCT' : 'PMT';
    return `${prefix}-${(count + 1).toString().padStart(6, '0')}`;
  }

  findAll(direction?: 'IN' | 'OUT') {
    return this.repo.find({
      where: direction ? { direction } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Payment ${id} not found`);
    return p;
  }
}
