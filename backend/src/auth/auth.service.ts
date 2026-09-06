import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { db } from '../prisma/db';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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
			password: dto.password,
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

		const accessToken = await this.jwtService.signAsync({
			sub: user.id,
			role: user.role,
			type: 'access',
		});

		return {
			status: 'success',
			message: 'Logged in',
			data: {
				accessToken,
				user: {
					id: user.id,
					name: user.name,
					role: user.role,
				},
			},
		};
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
