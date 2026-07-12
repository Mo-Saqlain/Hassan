import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  ImportResult,
  bool,
  runImport,
  str,
  validateDto,
} from '../../common/csv-import';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) await this.ensureExists(dto.parentId);
    if (dto.code) await this.ensureCodeUnique(dto.code);
    return this.repo.save(this.repo.create(dto));
  }

  /**
   * Bulk-create from parsed CSV rows. The CSV references a parent by NAME (the
   * `parent` column), not UUID — resolved against existing categories plus any
   * created earlier in the same import. So list a parent category on a line
   * above its children. See common/csv-import.ts.
   */
  async importRows(rows: Record<string, unknown>[]): Promise<ImportResult> {
    const existing = await this.repo.find();
    const idByName = new Map<string, string>(
      existing.map((c) => [c.name.trim().toLowerCase(), c.id]),
    );
    return runImport(rows, async (raw) => {
      let parentId: string | undefined;
      const parentName = str(raw.parent) ?? str(raw.parentName);
      if (parentName) {
        parentId = idByName.get(parentName.toLowerCase());
        if (!parentId) {
          throw new Error(
            `Parent category "${parentName}" not found — list it above this row or create it first`,
          );
        }
      }
      const dto: CreateCategoryDto = {
        name: str(raw.name) as string,
        code: str(raw.code)?.toUpperCase(),
        description: str(raw.description),
        parentId,
        isActive: bool(raw.isActive),
      };
      await validateDto(CreateCategoryDto, dto);
      const created = await this.create(dto);
      idByName.set(created.name.trim().toLowerCase(), created.id);
    });
  }

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  /** Returns categories as a tree (roots only; children nested). */
  async tree() {
    const all = await this.repo.find({ order: { name: 'ASC' } });
    const map = new Map<string, Category & { children: Category[] }>();
    all.forEach((c) => map.set(c.id, { ...c, children: [] }));
    const roots: (Category & { children: Category[] })[] = [];
    for (const c of map.values()) {
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.children.push(c);
      } else {
        roots.push(c);
      }
    }
    return roots;
  }

  async findOne(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    return c;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const c = await this.findOne(id);
    if (dto.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }
    if (dto.parentId) {
      await this.ensureExists(dto.parentId);
      await this.ensureNoCycle(id, dto.parentId);
    }
    if (dto.code && dto.code !== c.code) {
      await this.ensureCodeUnique(dto.code, id);
    }
    Object.assign(c, dto);
    return this.repo.save(c);
  }

  /** App-layer uniqueness on Category.code — partial unique indexes have
   *  dialect-specific syntax that we don't want to deal with. */
  private async ensureCodeUnique(code: string, exceptId?: string) {
    const existing = await this.repo.findOne({
      where: exceptId ? { code, id: Not(exceptId) } : { code },
    });
    if (existing) {
      throw new ConflictException(
        `Code "${code}" is already used by category "${existing.name}". Pick a different code.`,
      );
    }
  }

  async remove(id: string) {
    const c = await this.findOne(id);
    await this.repo.remove(c);
    return { deleted: true, id };
  }

  private async ensureExists(id: string) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Parent category ${id} not found`);
  }

  private async ensureNoCycle(id: string, newParentId: string) {
    let cursor: string | null | undefined = newParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException(
          'Reparenting would create a cycle in the category tree',
        );
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const parent = await this.repo.findOne({ where: { id: cursor } });
      cursor = parent?.parentId ?? null;
    }
  }
}
