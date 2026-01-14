import express, { Response } from 'express';
import { matchedData, validationResult } from 'express-validator';
import { chatMessageSchema, chatHistorySchema } from '../validators/chatValidation';
import { chatController } from '../controller/chat-controller';
import { optionalAuth, AuthenticatedRequest } from '../middleware/optionalAuth';

const router = express.Router();

router.post(
    '/chat/message',
    optionalAuth,
    chatMessageSchema,
    async (req: AuthenticatedRequest, res: Response) => {
        const result = validationResult(req);
        if (result.isEmpty()) {
            const { message, sessionId } = matchedData(req);
            const userID = req.user?.userID;
            await chatController.handleMessage(req, res, message, sessionId, userID);
        } else {
            res.status(400).json({ error: 'Validation error', details: result.array() });
        }
    }
);

router.get(
    '/chat/history/:sessionId',
    optionalAuth,
    chatHistorySchema,
    async (req: AuthenticatedRequest, res: Response) => {
        const result = validationResult(req);
        if (result.isEmpty()) {
            const { sessionId } = matchedData(req);
            const userID = req.user?.userID;
            await chatController.getHistory(req, res, sessionId, userID);
        } else {
            res.status(400).json({ error: 'Validation error', details: result.array() });
        }
    }
);

router.delete(
    '/chat/session/:sessionId',
    optionalAuth,
    chatHistorySchema,
    async (req: AuthenticatedRequest, res: Response) => {
        const result = validationResult(req);
        if (result.isEmpty()) {
            const { sessionId } = matchedData(req);
            const userID = req.user?.userID;
            await chatController.clearSession(req, res, sessionId, userID);
        } else {
            res.status(400).json({ error: 'Validation error', details: result.array() });
        }
    }
);

export default router;
