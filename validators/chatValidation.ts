import { checkSchema } from 'express-validator';

const chatMessageSchema = checkSchema({
    message: {
        in: ['body'],
        isString: true,
        notEmpty: true,
        isLength: { options: { min: 1, max: 1000 } },
        escape: true,
        errorMessage: 'Message must be a non-empty string between 1 and 1000 characters'
    },
    sessionId: {
        in: ['body'],
        isString: true,
        optional: true,
        isLength: { options: { min: 1, max: 100 } },
        errorMessage: 'Session ID must be a string'
    }
});

const chatHistorySchema = checkSchema({
    sessionId: {
        in: ['params'],
        isString: true,
        notEmpty: true,
        isLength: { options: { min: 1, max: 100 } },
        errorMessage: 'Session ID must be a non-empty string'
    }
});

export { chatMessageSchema, chatHistorySchema };

