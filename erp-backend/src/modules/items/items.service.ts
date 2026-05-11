import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async create(dto: CreateItemDto) {
    await this.ensureUniqueCodes(dto.sku, dto.barcode);
    const item = this.repo.create(this.stripCategoryIds(dto));
    item.categories = await this.resolveCategories(dto.categoryIds);
    return this.repo.save(item);
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  /** POS-style lookup by SKU or barcode (exact match). */
  async findByCode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) throw new NotFoundException('Code is required');
    const item =
      (await this.repo.findOne({ where: { barcode: trimmed } })) ??
      (await this.repo.findOne({ where: { sku: trimmed } }));
    if (!item) throw new NotFoundException(`No item with code ${trimmed}`);
    return item;
  }

  async update(id: string, dto: UpdateItemDto) {
    const item = await this.findOne(id);
    if (dto.sku && dto.sku !== item.sku) {
      await this.ensureUniqueCodes(dto.sku, undefined, id);
    }
    if (dto.barcode && dto.barcode !== item.barcode) {
      await this.ensureUniqueCodes(undefined, dto.barcode, id);
    }
    const { categoryIds, ...rest } = dto;
    Object.assign(item, rest);
    if (categoryIds !== undefined) {
      item.categories = await this.resolveCategories(categoryIds);
    }
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    return { deleted: true, id };
  }

  private async ensureUniqueCodes(sku?: string, barcode?: string, ignoreId?: string) {
    if (sku) {
      const dup = await this.repo.findOne({ where: { sku } });
      if (dup && dup.id !== ignoreId) {
        throw new ConflictException(`SKU ${sku} already exists`);
      }
    }
    if (barcode) {
      const dup = await this.repo.findOne({ where: { barcode } });
      if (dup && dup.id !== ignoreId) {
        throw new ConflictException(`Barcode ${barcode} already exists`);
      }
    }
  }

  private stripCategoryIds(dto: CreateItemDto): Partial<Item> {
    const { categoryIds, ...rest } = dto;
    return rest;
  }

  private async resolveCategories(ids?: string[]): Promise<Category[]> {
    if (!ids || ids.length === 0) return [];
    const found = await this.categoryRepo.find({ where: { id: In(ids) } });
    if (found.length !== ids.length) {
      const missing = ids.filter((id) => !found.some((c) => c.id === id));
      throw new NotFoundException(
        `Categories not found: ${missing.join(', ')}`,
      );
    }
    return found;
  }
}
