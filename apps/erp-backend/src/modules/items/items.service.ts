import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { deleteOrConflict } from '../../common/delete-guard';
import {
  ImportResult,
  bool,
  num,
  runImport,
  str,
  validateDto,
} from '../../common/csv-import';
import { Item } from './entities/item.entity';
import { Category } from '../categories/entities/category.entity';
import { Brand } from '../brands/entities/brand.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
  ) {}

  /**
   * Bulk-create from parsed CSV rows. The CSV references brand and categories
   * by NAME (not UUID): the `brand` column matches an existing brand, and the
   * `categories` column is a semicolon-separated list of category names. Both
   * must already exist — import Brands and Categories first. See
   * common/csv-import.ts.
   */
  async importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
    const brands = await this.brandRepo.find();
    const brandIdByName = new Map<string, string>(
      brands.map((b) => [b.name.trim().toLowerCase(), b.id]),
    );
    const cats = await this.categoryRepo.find();
    const catIdByName = new Map<string, string>(
      cats.map((c) => [c.name.trim().toLowerCase(), c.id]),
    );
    return runImport(rows, async (raw) => {
      let brandId: string | undefined;
      const brandName = str(raw.brand) ?? str(raw.brandName);
      if (brandName) {
        brandId = brandIdByName.get(brandName.toLowerCase());
        if (!brandId) {
          throw new Error(`Brand "${brandName}" not found — import/create it first`);
        }
      }
      let categoryIds: string[] | undefined;
      const catRaw = str(raw.categories) ?? str(raw.category);
      if (catRaw) {
        const names = catRaw
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        categoryIds = names.map((n) => {
          const id = catIdByName.get(n.toLowerCase());
          if (!id) throw new Error(`Category "${n}" not found — import/create it first`);
          return id;
        });
      }
      const warranty = str(raw.warrantyType)?.toUpperCase();
      const dto: CreateItemDto = {
        modelNo: str(raw.modelNo),
        name: str(raw.name),
        sku: str(raw.sku),
        barcode: str(raw.barcode),
        brandId,
        categoryIds,
        purchasePrice: num(raw.purchasePrice),
        salePrice: num(raw.salePrice),
        openingAvgCost: num(raw.openingAvgCost),
        openingCostedQty: num(raw.openingCostedQty),
        unit: str(raw.unit),
        minStockLevel: num(raw.minStockLevel),
        isActive: bool(raw.isActive),
        tracksSerials: bool(raw.tracksSerials),
        serialRequiredOnSale: bool(raw.serialRequiredOnSale),
        hasWarranty: bool(raw.hasWarranty),
        warrantyType: warranty as CreateItemDto['warrantyType'],
        warrantyDays: num(raw.warrantyDays),
        isInternalGenerated: bool(raw.isInternalGenerated),
      };
      if (!dto.modelNo && !dto.name) {
        throw new Error('Either modelNo or name is required');
      }
      await validateDto(CreateItemDto, dto);
      await this.create(dto);
    });
  }

  async create(dto: CreateItemDto) {
    // The shop uses Model No. as the item's name. Auto-derive name + sku
    // from modelNo when the caller didn't supply them. For backwards-compat,
    // if modelNo is missing but name is set, fall back to name as the modelNo.
    const modelNo = (dto.modelNo ?? dto.name ?? '').trim();
    if (!modelNo) {
      throw new ConflictException('modelNo (or name) is required');
    }
    const name = dto.name?.trim() || modelNo;
    const sku = dto.sku?.trim() || (await this.deriveSku(modelNo));
    await this.ensureUniqueCodes(sku, dto.barcode);
    const item = this.repo.create({
      ...this.stripCategoryIds(dto),
      name,
      sku,
      modelNo,
    });
    item.categories = await this.resolveCategories(dto.categoryIds);
    return this.repo.save(item);
  }

  findAll() {
    return this.repo.find({ order: { modelNo: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  /**
   * Fuzzy search across modelNo / name / sku / barcode for the quick-search
   * combobox. Case-insensitive substring match (ILIKE), capped at 25 results.
   */
  async search(q?: string, limit = 25): Promise<Item[]> {
    const term = (q ?? '').trim();
    if (!term) {
      return this.repo.find({
        order: { modelNo: 'ASC' },
        take: limit,
      });
    }
    const like = `%${term}%`;
    return this.repo.find({
      where: [
        { modelNo: ILike(like) },
        { name: ILike(like) },
        { sku: ILike(like) },
        { barcode: ILike(like) },
      ],
      order: { modelNo: 'ASC' },
      take: limit,
    });
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

  private async deriveSku(modelNo: string): Promise<string> {
    // Try the model number itself; if taken, suffix -2, -3, etc.
    const base = modelNo.trim();
    let candidate = base;
    let n = 1;
    // Bound the loop generously — collisions on the same modelNo are rare.
    while (await this.repo.findOne({ where: { sku: candidate } })) {
      n += 1;
      candidate = `${base}-${n}`;
      if (n > 1000) break;
    }
    return candidate;
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
    return deleteOrConflict(async () => {
      await this.repo.remove(item);
      return { deleted: true, id };
    }, 'item');
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
