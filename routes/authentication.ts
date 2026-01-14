import dotenv from 'dotenv';
dotenv.config(); // Додайте це на початку файлу!

import express, { Request, Response } from 'express';
import { client } from '../data/DB';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { googleAuth } from '../controller/auth-controller';
import { signInSchema, signUpSchema, tokenSchema, googleAuthSchema, googleAuthSchemaNative } from '../validators/authenticationValidation';
import { matchedData, validationResult } from 'express-validator';

const saltRounds = 10;
const router = express.Router();
const userTable = 'users';
const JWT_EXPIRATION = '7d';

interface JwtPayload {
    userID: number;
    iat: number;
    exp: number;
}

// Функція для отримання JWT секрета з перевіркою
const getJwtSecret = (): string => {
    const secret = process.env.JWT_ENCRYPTION_KEY;
    if (!secret) {
        console.error('❌ ПОМИЛКА: JWT_ENCRYPTION_KEY не встановлено в змінних середовища');
        console.error('Значення process.env.JWT_ENCRYPTION_KEY:', process.env.JWT_ENCRYPTION_KEY);
        console.error('Всі доступні змінні середовища:', Object.keys(process.env));
        throw new Error('JWT_ENCRYPTION_KEY environment variable is not set');
    }
    return secret;
};

// Хелпер для генерації токена
const generateToken = (userID: number, expiresIn: string = JWT_EXPIRATION): string => {
    const secret = getJwtSecret();
    return jwt.sign({ userID }, secret, { expiresIn });
};

// Хелпер для верифікації токена
const verifyToken = (token: string): JwtPayload => {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as JwtPayload;
};

router.post('/user/signup/:promotional', signUpSchema, async (req: Request, res: Response) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
        try {
            const userID = Math.round(Math.random() * 1000 * 1000 * 1000);
            const { promotional } = matchedData(req);
            let dbPromotional: boolean = promotional != 'false';
            const creationIP = req.ip;
            
            const {
                userName,
                email,
                password,
                mobile_number,
                dob
            } = matchedData(req);
            
            // Check if email or mobile number already exists
            const checkQuery = `SELECT * FROM "${userTable}" WHERE email = $1 OR mobile_number = $2;`;
            const checkValues = [email, mobile_number];
            const checkResult = await client.query(checkQuery, checkValues);
    
            if (checkResult.rows.length > 0) {
                return res.status(205).json({ error: 'Email or mobile number already exists' });
            }
    
            // Hash the password
            const hash = await bcrypt.hash(password, saltRounds);
    
            // Insert the new user
            const insertQuery = `
                INSERT INTO "${userTable}" (userID, userName, email, password, mobile_number, dob, creation_ip, role, update_ip, promotional) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'customer', $7, $8);
            `;
            const insertValues = [userID, userName, email, hash, mobile_number, dob, creationIP, dbPromotional];
    
            await client.query(insertQuery, insertValues);
            
            // Generate token
            const token = generateToken(userID);
            
            return res.status(200).json({ message: 'User registered successfully', token });
        } catch (error: any) {
            console.error('Signup error:', error);
            if (error.message.includes('JWT_ENCRYPTION_KEY')) {
                return res.status(500).json({ error: 'Server configuration error. Please check .env file.' });
            }
            return res.status(500).json({ error: 'Server error' });
        }
    } else {
        return res.status(400).json({ message: 'Validation error', errors: result.array() });
    }
});

router.post('/user/signin/:remember', signInSchema, async (req: Request, res: Response) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
        try {
            const { email, password } = matchedData(req);
            const { remember } = matchedData(req);
            
            // Check if the email exists
            const query = `SELECT * FROM "${userTable}" WHERE email = $1;`;
            const values = [email];
            const dbResult = await client.query(query, values);

            if (dbResult.rows.length === 0) {
                return res.status(205).json({ error: 'Email does not exist' });
            }

            const user = dbResult.rows[0];

            // Check if the password matches
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(205).json({ error: 'Incorrect password' });
            }
            
            const userData = {
                userName: user.username,
                userID: user.userid,
                email: user.email,
                mobile_number: user.mobile_number,
                dob: user.dob
            };
            
            // Generate token
            let token: string;
            if (remember != 'false') {
                token = generateToken(user.userid, JWT_EXPIRATION);
            } else {
                token = generateToken(user.userid, '1d');
            }
            
            return res.status(200).json({ message: 'Sign-in successful', token, userData });
        } catch (error: any) {
            console.error('Signin error:', error);
            if (error.message.includes('JWT_ENCRYPTION_KEY')) {
                return res.status(500).json({ error: 'Server configuration error. Please check .env file.' });
            }
            return res.status(500).json({ error: 'Server error' });
        }
    } else {
        return res.status(400).json({ error: 'Validation Error', errors: result.array() });
    }
});

router.post('/user/session-check', tokenSchema, async (req: Request, res: Response) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
        try {
            const { token } = matchedData(req);
            
            // Verify token
            const decodedJWT = verifyToken(token);
            const userID = decodedJWT.userID;
            
            const query = `SELECT * FROM "${userTable}" WHERE userid = $1;`;
            const dbResult = await client.query(query, [userID]);

            const user = dbResult.rows[0];
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            const userData = {
                userName: user.username,
                userID: user.userid,
                email: user.email,
                mobile_number: user.mobile_number,
                dob: user.dob
            };

            return res.status(200).json({ message: 'Sign-in successful', userData });
        } catch (error: any) {
            console.error('Session check error:', error);
            if (error.message.includes('JWT_ENCRYPTION_KEY')) {
                return res.status(500).json({ message: 'Server configuration error. Please check .env file.' });
            }
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Invalid or expired token' });
            }
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    } else {
        return res.status(400).json({ message: 'Validation error', errors: result.array() });
    }
});

router.post('/auth/google', googleAuthSchema, async (req: Request, res: Response) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
        try {
            const { code } = matchedData(req);
            const user = await googleAuth(code);

            if (!user) {
                return res.status(205).json({ error: 'Email does not exist' });
            }
            
            const userData = {
                userName: user.username,
                userID: user.userid,
                email: user.email,
                mobile_number: user.mobile_number,
                dob: user.dob
            };
            
            // Generate token
            const token = generateToken(user.userid);
            
            return res.status(200).json({ message: 'Sign-in successful', token, userData });
        } catch (error: any) {
            console.error('Google auth error:', error);
            if (error.message.includes('JWT_ENCRYPTION_KEY')) {
                return res.status(500).json({ message: 'Server configuration error. Please check .env file.' });
            }
            return res.status(500).json({ message: 'Server Error' });
        }
    } else {
        return res.status(400).json({ message: 'Validation error', errors: result.array() });
    }
});

router.post('/native/auth/google', googleAuthSchemaNative, async (req: Request, res: Response) => {
    const result = validationResult(req);
    if (result.isEmpty()) {
        try {
            const { email } = matchedData(req);
            
            // Check if the email exists
            const query = `SELECT * FROM "${userTable}" WHERE email = $1;`;
            const values = [email];
            const dbResult = await client.query(query, values);

            if (dbResult.rows.length === 0) {
                return res.status(205).json({ error: 'Email does not exist' });
            }

            const user = dbResult.rows[0];
            
            // Generate token
            const token = generateToken(user.userid);
            
            const userData = {
                userName: user.username,
                userID: user.userid,
                email: user.email,
                mobile_number: user.mobile_number,
                dob: user.dob
            };
            
            return res.status(200).json({ message: 'Sign-in successful', token, userData });
        } catch (error: any) {
            console.error('Native Google auth error:', error);
            if (error.message.includes('JWT_ENCRYPTION_KEY')) {
                return res.status(500).json({ message: 'Server configuration error. Please check .env file.' });
            }
            return res.status(500).json({ message: 'Server Error' });
        }
    } else {
        return res.status(400).json({ message: 'Validation error', errors: result.array() });
    }
});

export default router;