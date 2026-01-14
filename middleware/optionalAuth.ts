import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_ENCRYPTION_KEY as string;

export interface AuthenticatedRequest extends Request {
    user?: any;
}

export function optionalAuth(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next(); // гість, без токена
    }

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch {
        // якщо токен битий — просто ігноруємо
    }

    next();
}
