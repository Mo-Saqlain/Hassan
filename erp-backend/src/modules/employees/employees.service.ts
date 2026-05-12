import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { deleteOrConflict } from '../../common/delete-guard';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
  ) {}

  create(dto: CreateEmployeeDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Employee ${id} not found`);
    return e;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    return this.repo.save(e);
  }

  async remove(id: string) {
    const e = await this.findOne(id);
    return deleteOrConflict(async () => {
      await this.repo.remove(e);
      return { deleted: true, id };
    }, 'employee');
  }
}
