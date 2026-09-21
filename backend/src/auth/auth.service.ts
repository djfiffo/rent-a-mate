import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Temporal } from '@js-temporal/polyfill';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../prisma/db.js';
import { PasswordHashService } from '../users/password.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

type AuthTokenPayload = {
	sub: number;
	role: string;
	jti: string;
	type: 'access' | 'refresh';
};

type TokenStorage = Pick<typeof db, 'orm'>;

const ACCESS_TOKEN_TTL = process.env['JWT_ACCESS_TTL'] ?? '15m';
const REFRESH_TOKEN_TTL = '30d';

@Injectable()
export class AuthService {
	constructor(
		private readonly jwtService: JwtService,
		private readonly passwordService: PasswordHashService,
	) {}

	async register(dto: RegisterDto) {
		const email = dto.email.trim().toLowerCase();
		const existingUser = await db.orm.public.User.where({ email }).first();
		if (existingUser) {
			throw new ConflictException('Email is already registered');
		}

		const password = await this.passwordService.hash(dto.password);
		let user: any;
		try {
			user = await db.orm.public.User.create({
				name: dto.name,
				email,
				password,
				role: dto.role,
			});
		} catch (error) {
			if (isUniqueConstraintError(error)) {
				throw new ConflictException('Email is already registered');
			}
			throw error;
		}

		return {
			status: 'success',
			message: 'Account created',
			data: { user: this.toPublicUser(user) },
		};
	}

	async login(dto: LoginDto) {
		const user = await db.orm.public.User.where({ email: dto.email.trim().toLowerCase() }).first();
		if (!user || !(await this.passwordService.verify(dto.password, user.password))) {
			throw new UnauthorizedException('Invalid email or password');
		}

		if (user.isBanned) {
			throw new ForbiddenException('Account is banned');
		}
		if (!user.isActive) {
			throw new ForbiddenException('Account is inactive');
		}

		const tokens = await this.issueTokenPair(user.id, user.role);

		return {
			status: 'success',
			message: 'Logged in',
			data: {
				...tokens,
				user: {
					id: user.id,
					name: user.name,
					role: user.role,
				},
			},
		};
	}

	async refresh(refreshToken: string) {
		const payload = await this.verifyRefreshToken(refreshToken);
		const tokens = await db.transaction(async (tx) => {
			const storedToken = await this.findStoredRefreshToken(tx, payload.jti);

			if (
				!storedToken ||
				!this.isRefreshTokenUsable(storedToken, refreshToken, payload.sub)
			) {
				throw new UnauthorizedException('Invalid refresh token');
			}

			const user = await tx.orm.public.User.where({ id: storedToken.userId }).first();
			if (!user || user.isBanned) {
				throw new ForbiddenException('Account is banned');
			}
			if (!user.isActive) {
				throw new ForbiddenException('Account is inactive');
			}

			const newJti = randomUUID();
			if ((await this.revokeRefreshToken(tx, payload.jti, newJti)) !== 1) {
				throw new UnauthorizedException('Invalid refresh token');
			}

			const rotatedTokens = await this.createTokenPair(
				tx,
				storedToken.userId,
				payload.role,
				newJti,
			);

			return rotatedTokens;
		});

		return {
			status: 'success',
			message: 'Token refreshed',
			data: tokens,
		};
	}

	async logout(refreshToken: string) {
		let payload: AuthTokenPayload | undefined;
		try {
			payload = await this.verifyRefreshToken(refreshToken);
		} catch {
			payload = undefined;
		}

		if (payload) {
			await this.revokeRefreshToken(db, payload.jti);
		}

		return {
			status: 'success',
			message: 'Logged out',
			data: null,
		};
	}

	async me(userId: number | undefined) {
		if (!Number.isInteger(userId) || (userId ?? 0) <= 0) {
			throw new UnauthorizedException('Authenticated user is required');
		}
		const user = await db.orm.public.User.where({ id: userId }).first();
		if (!user) throw new NotFoundException('User not found');
		return {
			status: 'success' as const,
			message: 'Current user retrieved',
			data: { user: this.toPublicUser(user) },
		};
	}

	private readonly accessSecret = process.env['JWT_ACCESS_SECRET'];

	private readonly refreshSecret = process.env['JWT_REFRESH_SECRET'];

	private async issueTokenPair(userId: number, role: string) {
		const accessJti = randomUUID();
		const refreshJti = randomUUID();
		return db.transaction((tx) =>
			this.createTokenPair(tx, userId, role, refreshJti, accessJti),
		);
	}

	private async createTokenPair(
		tx: TokenStorage,
		userId: number,
		role: string,
		refreshJti: string,
		accessJti = randomUUID(),
	) {
		const accessToken = await this.jwtService.signAsync(
			{
				sub: userId,
				role,
				jti: accessJti,
				type: 'access',
			},
			{
				secret: this.accessSecret,
				expiresIn: ACCESS_TOKEN_TTL as any,
			},
		);
		const refreshToken = await this.jwtService.signAsync(
			{
				sub: userId,
				role,
				jti: refreshJti,
				type: 'refresh',
			},
			{
				secret: this.refreshSecret,
				expiresIn: REFRESH_TOKEN_TTL,
			},
		);

		await this.saveRefreshToken(tx, userId, refreshToken, refreshJti);

		return { accessToken, refreshToken };
	}

	private async verifyRefreshToken(token: string) {
		try {
			const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
				secret: this.refreshSecret,
			});
			if (payload.type !== 'refresh' || !payload.jti) {
				throw new Error('Invalid token type');
			}
			return payload;
		} catch {
			throw new UnauthorizedException('Invalid refresh token');
		}
	}

	private hashToken(token: string) {
		return createHash('sha256').update(token).digest('hex');
	}

	private findStoredRefreshToken(tx: TokenStorage, jti: string) {
		return tx.orm.public.RefreshToken.where({ jti }).first();
	}

	private isRefreshTokenUsable(
		storedToken: {
			tokenHash: string;
			revokedAt: Temporal.Instant | null;
			expiresAt: Temporal.Instant;
			userId: number;
		},
		rawToken: string,
		userId: number,
	) {
		return (
			storedToken.tokenHash === this.hashToken(rawToken) &&
			!storedToken.revokedAt &&
			Temporal.Instant.compare(storedToken.expiresAt, Temporal.Now.instant()) > 0 &&
			storedToken.userId === userId
		);
	}

	private saveRefreshToken(
		tx: TokenStorage,
		userId: number,
		refreshToken: string,
		jti: string,
	) {
		return tx.orm.public.RefreshToken.create({
			userId,
			tokenHash: this.hashToken(refreshToken),
			jti,
			expiresAt: Temporal.Now.instant().add({
				seconds: 30 * 24 * 60 * 60,
			}),
		});
	}

	private revokeRefreshToken(tx: TokenStorage, jti: string, replacedByJti?: string) {
		return tx.orm.public.RefreshToken
			.where({ jti, revokedAt: null })
			.updateAndCount({
				revokedAt: Temporal.Now.instant(),
				replacedByJti,
			});
	}

	private toPublicUser(user: { id: number; name: string; email: string; role: string }) {
		return {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
		};
	}
}

function isUniqueConstraintError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
