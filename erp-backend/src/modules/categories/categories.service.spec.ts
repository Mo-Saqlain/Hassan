import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let ds: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm([Category])),
        TypeOrmModule.forFeature([Category]),
      ],
      providers: [CategoriesService],
    }).compile();
    service = module.get(CategoriesService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('creates a root category', async () => {
    const c = await service.create({ name: 'Electronics' });
    expect(c.parentId).toBeFalsy();
  });

  it('creates a sub-category under an existing parent', async () => {
    const root = await service.create({ name: 'Electronics' });
    const sub = await service.create({ name: 'Phones', parentId: root.id });
    expect(sub.parentId).toBe(root.id);
  });

  it('rejects sub-category with unknown parent', async () => {
    await expect(
      service.create({ name: 'X', parentId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tree() nests children under their parent', async () => {
    const root = await service.create({ name: 'A' });
    await service.create({ name: 'A1', parentId: root.id });
    await service.create({ name: 'A2', parentId: root.id });
    await service.create({ name: 'B' });
    const tree = await service.tree();
    expect(tree).toHaveLength(2);
    const a = tree.find((t) => t.name === 'A');
    expect(a?.children.map((c) => c.name).sort()).toEqual(['A1', 'A2']);
  });

  it('blocks self-parenting', async () => {
    const c = await service.create({ name: 'A' });
    await expect(
      service.update(c.id, { parentId: c.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks parent cycle (reparenting under a descendant)', async () => {
    const root = await service.create({ name: 'A' });
    const child = await service.create({ name: 'B', parentId: root.id });
    // Trying to make A a child of B would create a cycle
    await expect(
      service.update(root.id, { parentId: child.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove succeeds and tree updates', async () => {
    const c = await service.create({ name: 'X' });
    await service.remove(c.id);
    expect(await service.tree()).toHaveLength(0);
  });
});
