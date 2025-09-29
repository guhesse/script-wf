import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	private readonly logger = new Logger(JwtAuthGuard.name);

	handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
		if (err || !user) {
			const req = context.switchToHttp().getRequest();
			// info pode ser um Error de passport-jwt: TokenExpiredError, JsonWebTokenError, etc.
			const reason = info?.message || info || err?.message || 'unknown';
			const authHeader = req.headers?.authorization || '';
			let category = 'unknown';
			if (/expired/i.test(reason)) category = 'expired';
			else if (/No auth token/i.test(reason) || !authHeader) category = 'missing';
			else if (/invalid/i.test(reason) || /malformed/i.test(reason)) category = 'invalid';
			this.logger.warn(`JWT rejeitado: category=${category} reason=${reason} path=${req.path} authHeaderPresent=${!!authHeader}`);
			throw err || new UnauthorizedException('Unauthorized');
		}
		return user;
	}
}
