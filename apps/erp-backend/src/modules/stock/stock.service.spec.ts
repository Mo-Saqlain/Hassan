import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inMemoryTypeOrm } from '../../testing/test-db';
import { Item } from '../items/entities/item.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Category } from '../categories/entities/category.entity';
import { Store } from '../stores/entities/store.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { StockService } from './stock.service';

describe('StockService', () => {
  let service: StockService;
  let ds: DataSource;
  let itemId: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          inMemoryTypeOrm([Item, Brand, Category, Store, StockMovement]),
        ),
        TypeOrmModule.forFeature([Item, StockMovement]),
      ],
      providers: [StockService],
    }).compile();

    service = module.get(StockService);
    ds = module.get(DataSource);

    const item = await ds.getRepository(Item).save(
      ds.getRepository(Item).create({
        name: 'Widget',
        sku: 'W-1',
        purchasePrice: 10,
        salePrice: 20,
        unit: 'pcs',
        minStockLevel: 0,
        isActive: true,
      }),
    );
    itemId = item.id;
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('records IN movement and reports on-hand', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 10,
      referenceType: 'PURCHASE', referenceId: 'fake',
    });
    expect(await service.getOnHand(itemId)).toBe(10);
  });

  it('records OUT movement and decrements on-hand', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 10,
      referenceType: 'PURCHASE', referenceId: 'fake',
    });
    await service.recordMovement({
      itemId, type: 'OUT', quantity: 3,
      referenceType: 'SALE', referenceId: 'fake',
    });
    expect(await service.getOnHand(itemId)).toBe(7);
  });

  it('blocks OUT movement that would drive on-hand negative', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 5,
      referenceType: 'PURCHASE', referenceId: 'fake',
    });
    await expect(
      service.recordMovement({
        itemId, type: 'OUT', quantity: 10,
        referenceType: 'SALE', referenceId: 'fake',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // on-hand must be unchanged
    expect(await service.getOnHand(itemId)).toBe(5);
  });

  it('rejects zero/negative quantities', async () => {
    await expect(
      service.recordMovement({
        itemId, type: 'IN', quantity: 0,
        referenceType: 'PURCHASE', referenceId: 'fake',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound for unknown item', async () => {
    await expect(
      service.recordMovement({
        itemId: '00000000-0000-0000-0000-000000000000',
        type: 'IN', quantity: 5,
        referenceType: 'PURCHASE', referenceId: 'fake',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('manual adjust uses ADJUSTMENT reference type', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 5,
      referenceType: 'PURCHASE', referenceId: 'fake',
    });
    const adj = await service.adjust({
      itemId, type: 'OUT', quantity: 2, note: 'damaged',
    });
    expect(adj.referenceType).toBe('ADJUSTMENT');
    expect(adj.note).toBe('damaged');
    expect(await service.getOnHand(itemId)).toBe(3);
  });

  it('stockSummary aggregates all items including low-stock flag input', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 4,
      referenceType: 'PURCHASE', referenceId: 'fake',
    });
    const summary = await service.stockSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      itemId, itemName: 'Widget', sku: 'W-1', onHand: 4,
    });
  });

  it('listMovements returns all rows for the item', async () => {
    await service.recordMovement({
      itemId, type: 'IN', quantity: 4,
      referenceType: 'PURCHASE', referenceId: 'r1',
    });
    await service.recordMovement({
      itemId, type: 'OUT', quantity: 2,
      referenceType: 'SALE', referenceId: 'r2',
    });
    const movements = await service.listMovements(itemId);
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.referenceId).sort()).toEqual(['r1', 'r2']);
  });
});
