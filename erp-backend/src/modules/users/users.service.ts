import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import {
  AccessRequestStatus,
  UserAccessRequest,
} from './entities/user-access-request.entity';
import { UserLoginEvent } from './entities/user-login-event.entity';
import { hashPassword, newSessionToken, verifyPassword } from './password.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';

/** Sliding session window — refreshed on every authenticated request. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const SEED_USERNAME = 'admin';
const SEED_PASSWORD = 'Tech@123';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserAccessRequest)
    private readonly requests: Repository<UserAccessRequest>,
    @InjectRepository(UserLoginEvent)
    private readonly loginEvents: Repository<UserLoginEvent>,
  ) {}

  /** Idempotent superuser seed. Runs once per boot. */
  async onModuleInit() {
    const existing = await this.users.findOne({
      where: { username: SEED_USERNAME },
    });
    if (existing) return;
    await this.users.save(
      this.users.create({
        username: SEED_USERNAME,
        passwordHash: hashPassword(SEED_PASSWORD),
        role: 'SUPERUSER',
        fullName: 'Administrator',
        isActive: true,
      }),
    );
    this.logger.log(`Seeded superuser "${SEED_USERNAME}" (change the default password!)`);
  }

  // ─── Auth ────────────────────────────────────────────────────────────

  async login(
    username: string,
    password: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ token: string; user: PublicUser; expiresAt: Date }> {
    const u = await this.users.findOne({ where: { username } });
    if (!u || !u.isActive || !verifyPassword(password, u.passwordHash)) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    u.sessionToken = token;
    u.sessionExpiresAt = expiresAt;
    u.lastLoginAt = new Date();
    await this.users.save(u);

    await this.loginEvents.save(
      this.loginEvents.create({
        userId: u.id,
        username: u.username,
        ipAddress: meta.ipAddress?.slice(0, 60),
        userAgent: meta.userAgent?.slice(0, 500),
        // The superuser never needs to "see" their own login in the bell —
        // pre-mark it as seen so they don't get a notification for themselves.
        seenByAdmin: u.role === 'SUPERUSER',
      }),
    );

    return { token, user: toPublic(u), expiresAt };
  }

  async logout(user: User): Promise<{ ok: true }> {
    user.sessionToken = undefined;
    user.sessionExpiresAt = undefined;
    await this.users.save(user);
    return { ok: true };
  }

  /**
   * Used by AuthGuard on every request. Returns the user if the token is
   * valid + unexpired, and slides the expiry window forward; otherwise
   * returns undefined (the guard will throw 401).
   */
  async resolveSession(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    const u = await this.users.findOne({
      where: { sessionToken: token, isActive: true },
    });
    if (!u || !u.sessionExpiresAt) return undefined;
    if (u.sessionExpiresAt.getTime() < Date.now()) {
      // Expired — best-effort clear so further requests with the same
      // token fail fast.
      u.sessionToken = undefined;
      u.sessionExpiresAt = undefined;
      await this.users.save(u);
      return undefined;
    }
    // Sliding window — push expiry forward.
    const fresh = new Date(Date.now() + SESSION_TTL_MS);
    if (fresh.getTime() - u.sessionExpiresAt.getTime() > 60_000) {
      u.sessionExpiresAt = fresh;
      await this.users.save(u);
    }
    return u;
  }

  async changeOwnPassword(
    user: User,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    user.passwordHash = hashPassword(newPassword);
    // Rotate the session token so other devices are forced to re-login.
    const token = newSessionToken();
    user.sessionToken = token;
    user.sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.users.save(user);
    return { ok: true };
  }

  // ─── Users CRUD (superuser-only at the controller layer) ─────────────

  async createUser(dto: CreateUserDto): Promise<PublicUser> {
    const taken = await this.users.findOne({ where: { username: dto.username } });
    if (taken) throw new ConflictException(`Username "${dto.username}" is already taken`);
    const u = this.users.create({
      username: dto.username,
      passwordHash: hashPassword(dto.password),
      role: dto.role ?? 'USER',
      fullName: dto.fullName,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.users.save(u);
    return toPublic(saved);
  }

  async listUsers(): Promise<PublicUser[]> {
    const rows = await this.users.find({ order: { username: 'ASC' } });
    return rows.map(toPublic);
  }

  async findUserOrThrow(id: string): Promise<User> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    return u;
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: User): Promise<PublicUser> {
    const u = await this.findUserOrThrow(id);
    if (dto.username && dto.username !== u.username) {
      const taken = await this.users.findOne({ where: { username: dto.username } });
      if (taken) throw new ConflictException(`Username "${dto.username}" is already taken`);
      u.username = dto.username;
    }
    if (dto.fullName !== undefined) u.fullName = dto.fullName;
    if (dto.role && dto.role !== u.role) {
      if (u.role === 'SUPERUSER' && dto.role === 'USER') {
        await this.guardLastSuperuser(u.id);
      }
      u.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      if (u.isActive && !dto.isActive && u.role === 'SUPERUSER') {
        await this.guardLastSuperuser(u.id);
      }
      u.isActive = dto.isActive;
      if (!dto.isActive) {
        u.sessionToken = undefined;
        u.sessionExpiresAt = undefined;
      }
    }
    if (dto.password) {
      u.passwordHash = hashPassword(dto.password);
      // If the superuser resets someone's password, kick their current
      // session so they're forced to use the new credentials.
      if (u.id !== actor.id) {
        u.sessionToken = undefined;
        u.sessionExpiresAt = undefined;
      }
    }
    const saved = await this.users.save(u);
    return toPublic(saved);
  }

  async removeUser(id: string, actor: User): Promise<{ deleted: true; id: string }> {
    const u = await this.findUserOrThrow(id);
    if (u.id === actor.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    if (u.role === 'SUPERUSER') {
      await this.guardLastSuperuser(u.id);
    }
    await this.users.remove(u);
    return { deleted: true, id };
  }

  private async guardLastSuperuser(excludeId: string) {
    const remaining = await this.users.count({
      where: { role: 'SUPERUSER', isActive: true },
    });
    const target = await this.users.findOne({ where: { id: excludeId } });
    const isLast =
      target?.role === 'SUPERUSER' && target.isActive && remaining <= 1;
    if (isLast) {
      throw new ForbiddenException(
        'Cannot remove or demote the last active superuser',
      );
    }
  }

  // ─── Access requests ─────────────────────────────────────────────────

  async requestAccess(dto: RequestAccessDto): Promise<UserAccessRequest> {
    return this.requests.save(
      this.requests.create({
        requestedUsername: dto.requestedUsername.trim(),
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        email: dto.email,
        reason: dto.reason,
        status: 'PENDING',
      }),
    );
  }

  listAccessRequests(status?: AccessRequestStatus) {
    return this.requests.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  async pendingAccessRequestCount(): Promise<number> {
    return this.requests.count({ where: { status: 'PENDING' } });
  }

  async approveAccessRequest(
    id: string,
    dto: ApproveRequestDto,
    actor: User,
  ): Promise<{ request: UserAccessRequest; user: PublicUser }> {
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Access request ${id} not found`);
    if (r.status !== 'PENDING') {
      throw new BadRequestException(`Request is already ${r.status.toLowerCase()}`);
    }
    const newUser = await this.createUser({
      username: dto.username,
      password: dto.password,
      fullName: dto.fullName ?? r.fullName,
      role: 'USER',
      isActive: true,
    });
    r.status = 'APPROVED';
    r.reviewedAt = new Date();
    r.reviewerId = actor.id;
    r.createdUserId = newUser.id;
    const saved = await this.requests.save(r);
    return { request: saved, user: newUser };
  }

  async rejectAccessRequest(id: string, actor: User): Promise<UserAccessRequest> {
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Access request ${id} not found`);
    if (r.status !== 'PENDING') {
      throw new BadRequestException(`Request is already ${r.status.toLowerCase()}`);
    }
    r.status = 'REJECTED';
    r.reviewedAt = new Date();
    r.reviewerId = actor.id;
    return this.requests.save(r);
  }

  async removeAccessRequest(id: string): Promise<{ deleted: true; id: string }> {
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Access request ${id} not found`);
    await this.requests.remove(r);
    return { deleted: true, id };
  }

  // ─── Login events ────────────────────────────────────────────────────

  listLoginEvents(opts: { limit?: number; unseen?: boolean } = {}) {
    const where = opts.unseen ? { seenByAdmin: false } : {};
    return this.loginEvents.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(opts.limit ?? 200, 1000),
    });
  }

  async unseenLoginCount(): Promise<number> {
    return this.loginEvents.count({ where: { seenByAdmin: false } });
  }

  async markLoginEventsSeen(): Promise<{ updated: number }> {
    const r = await this.loginEvents
      .createQueryBuilder()
      .update()
      .set({ seenByAdmin: true })
      .where('seen_by_admin = :v', { v: false })
      .execute();
    return { updated: r.affected ?? 0 };
  }

  async clearLoginEvents(): Promise<{ cleared: true }> {
    // Keep the last 30 days for posterity; older rows go.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await this.loginEvents
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return { cleared: true };
  }
}

export interface PublicUser {
  id: string;
  username: string;
  fullName?: string;
  role: 'SUPERUSER' | 'USER';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublic(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

