import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) await this.ensureExists(dto.parentId);
    return this.repo.save(this.repo.create(dto));
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
    Object.assign(c, dto);
    return this.repo.save(c);
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
