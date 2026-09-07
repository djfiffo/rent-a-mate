import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../prisma/db';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type AuthTokenPayload = {
	sub: number;
	role: string;
	jti: string;
	type: 'access' | 'refresh';
};

type TokenStorage = Pick<typeof db, 'orm'>;

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

@Injectable()
export class AuthService {
	constructor(private readonly jwtService: JwtService) {}

	async register(dto: RegisterDto) {
		const existingUser = await db.orm.public.User.where({ email: dto.email }).first();
		if (existingUser) {
			throw new ConflictException('Email is already registered');
		}

		const password = await bcrypt.hash(dto.password, 12);
		const user = await db.orm.public.User.create({
			name: dto.name,
			email: dto.email,
			password,
			role: dto.role,
		});

		return {
			status: 'success',
			message: 'Account created',
			data: { user: this.toPublicUser(user) },
		};
	}

	async login(dto: LoginDto) {
		const user = await db.orm.public.User.where({ email: dto.email }).first();
		if (!user || !(await bcrypt.compare(dto.password, user.password))) {
			throw new UnauthorizedException('Invalid email or password');
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

			const newJti = randomUUID();
			const rotatedTokens = await this.createTokenPair(
				tx,
				storedToken.userId,
				payload.role,
				newJti,
			);

			if (!(await this.revokeRefreshToken(tx, payload.jti, newJti))) {
				throw new UnauthorizedException('Invalid refresh token');
			}

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
				expiresIn: ACCESS_TOKEN_TTL,
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
			revokedAt: Date | null;
			expiresAt: Date;
			userId: number;
		},
		rawToken: string,
		userId: number,
	) {
		return (
			storedToken.tokenHash === this.hashToken(rawToken) &&
			!storedToken.revokedAt &&
			storedToken.expiresAt > new Date() &&
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
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		});
	}

	private revokeRefreshToken(tx: TokenStorage, jti: string, replacedByJti?: string) {
		return tx.orm.public.RefreshToken
			.where({ jti, revokedAt: null })
			.update({
				revokedAt: new Date(),
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
