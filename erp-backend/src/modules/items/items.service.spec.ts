import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Item } from './entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { ItemsService } from './items.service';

describe('ItemsService', () => {
  let service: ItemsService;
  let ds: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(inMemoryTypeOrm([Item, Brand, Category])),
        TypeOrmModule.forFeature([Item, Category]),
      ],
      providers: [ItemsService],
    }).compile();
    service = module.get(ItemsService);
    ds = module.get(DataSource);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('creates an item with required fields', async () => {
    const item = await service.create({ name: 'TV', sku: 'TV-1' });
    expect(item.id).toBeDefined();
    expect(item.sku).toBe('TV-1');
    expect(item.isActive).toBe(true);
  });

  it('rejects duplicate SKU', async () => {
    await service.create({ name: 'TV', sku: 'TV-1' });
    await expect(
      service.create({ name: 'TV2', sku: 'TV-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate barcode', async () => {
    await service.create({ name: 'TV', sku: 'TV-1', barcode: '123' });
    await expect(
      service.create({ name: 'Radio', sku: 'R-1', barcode: '123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows multiple items without a barcode', async () => {
    await service.create({ name: 'A', sku: 'A-1' });
    const b = await service.create({ name: 'B', sku: 'B-1' });
    expect(b.id).toBeDefined();
  });

  it('lookup matches barcode first, then SKU', async () => {
    await service.create({ name: 'A', sku: 'A-1', barcode: '111' });
    await service.create({ name: 'B', sku: 'B-1' });
    expect((await service.findByCode('111')).sku).toBe('A-1');
    expect((await service.findByCode('B-1')).sku).toBe('B-1');
  });

  it('lookup throws NotFound for unknown code', async () => {
    await expect(service.findByCode('NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('attaches multiple categories on create', async () => {
    const cats = ds.getRepository(Category);
    const c1 = await cats.save(cats.create({ name: 'Electronics' }));
    const c2 = await cats.save(cats.create({ name: 'Phones' }));
    const item = await service.create({
      name: 'Phone', sku: 'P-1',
      categoryIds: [c1.id, c2.id],
    });
    const reloaded = await service.findOne(item.id);
    expect(reloaded.categories.map((c) => c.id).sort()).toEqual(
      [c1.id, c2.id].sort(),
    );
  });

  it('rejects unknown category ids', async () => {
    await expect(
      service.create({
        name: 'X', sku: 'X-1',
        categoryIds: ['00000000-0000-0000-0000-000000000000'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update can replace category set', async () => {
    const cats = ds.getRepository(Category);
    const c1 = await cats.save(cats.create({ name: 'A' }));
    const c2 = await cats.save(cats.create({ name: 'B' }));
    const item = await service.create({
      name: 'X', sku: 'X-1', categoryIds: [c1.id],
    });
    const updated = await service.update(item.id, { categoryIds: [c2.id] });
    expect(updated.categories.map((c) => c.id)).toEqual([c2.id]);
  });

  it('update blocks SKU collision with another item', async () => {
    await service.create({ name: 'A', sku: 'A-1' });
    const b = await service.create({ name: 'B', sku: 'B-1' });
    await expect(
      service.update(b.id, { sku: 'A-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
