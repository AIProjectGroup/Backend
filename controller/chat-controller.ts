import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ContextService, ChatMessage } from '../services/contextService';
import { ProductService, ProductFilters } from '../services/productService';
import { AIService, ExtractedEntities, AIResponse } from '../services/aiService';

export class ChatController {
    static async handleMessage(
        req: Request,
        res: Response,
        message: string,
        sessionId: string | undefined,
        userID?: number
    ): Promise<void> {
        try {
            const finalSessionId = sessionId || randomUUID();

            const context = ContextService.getContext(finalSessionId, userID);
            
            const cyrillicPattern = /[а-яёіїєґ]/i;
            const language = cyrillicPattern.test(message) ? 'uk' : 'en';
            ContextService.updateLanguage(finalSessionId, language);

            ContextService.addMessage(finalSessionId, {
                role: 'user',
                content: message
            });

            let userBehavior;
            if (userID) {
                userBehavior = await ContextService.getUserBehavior(userID);
            }

            const categories = await ProductService.getAllCategories();

            const entities = await AIService.extractIntentAndEntities(
                message,
                context,
                [],
                categories
            );

            if (entities.needsClarification && entities.clarificationQuestion) {
                ContextService.addMessage(finalSessionId, {
                    role: 'assistant',
                    content: entities.clarificationQuestion
                });

                res.status(200).json({
                    sessionId: finalSessionId,
                    message: entities.clarificationQuestion,
                    needsClarification: true,
                    entities: {
                        ...entities,
                        language: entities.language || language
                    }
                });
                return;
            }

            if (entities.budget) {
                ContextService.updatePreferences(finalSessionId, { budget: entities.budget });
            }
            if (entities.category || entities.mainCategory) {
                ContextService.updatePreferences(finalSessionId, {
                    category: entities.category || entities.mainCategory
                });
            }

            const filters: ProductFilters = {
                searchTerm: entities.searchTerm,
                category: entities.category,
                mainCategory: entities.mainCategory,
                minPrice: entities.minPrice,
                maxPrice: entities.maxPrice || entities.budget,
                minRating: entities.rating,
                limit: 10
            };

            let products: any[] = [];
            
            if (entities.intent === 'compare' && entities.productIds && entities.productIds.length > 0) {
                filters.productIds = entities.productIds;
                products = await ProductService.searchProducts(filters);
            } else if (entities.intent === 'search' || entities.intent === 'recommend') {
                products = await ProductService.searchProducts(filters);
                
                if (userBehavior && products.length > 0) {
                    products = this.personalizeProducts(products, userBehavior, context);
                }
            }

            const aiResponse: AIResponse = await AIService.generateResponse(
                message,
                context,
                entities,
                products,
                userBehavior
            );

            if (entities.intent === 'compare' && products.length >= 2) {
                aiResponse.comparisonTable = AIService.formatComparison(products);
            }

            ContextService.addMessage(finalSessionId, {
                role: 'assistant',
                content: aiResponse.text
            });

            if (products.length > 0) {
                products.forEach(p => ContextService.addSelectedProduct(finalSessionId, p.productid));
            }

            const response = {
                sessionId: finalSessionId,
                message: aiResponse.text,
                products: aiResponse.products || [],
                comparisonTable: aiResponse.comparisonTable || null,
                quickReplies: aiResponse.quickReplies || [],
                entities: {
                    ...entities,
                    language: entities.language || language
                }
            };

            res.status(200).json(response);
        } catch (error: any) {
            console.error('Error handling chat message:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message || 'Failed to process chat message'
            });
        }
    }

    static async getHistory(
        req: Request,
        res: Response,
        sessionId: string,
        userID?: number
    ): Promise<void> {
        try {
            const context = ContextService.getContext(sessionId, userID);
            const messages = context.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp
            }));

            res.status(200).json({
                sessionId,
                messages,
                preferences: context.userPreferences
            });
        } catch (error: any) {
            console.error('Error getting chat history:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message || 'Failed to get chat history'
            });
        }
    }

    static async clearSession(
        req: Request,
        res: Response,
        sessionId: string,
        userID?: number
    ): Promise<void> {
        try {
            ContextService.clearContext(sessionId);
            res.status(200).json({
                message: 'Session cleared successfully',
                sessionId
            });
        } catch (error: any) {
            console.error('Error clearing session:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message || 'Failed to clear session'
            });
        }
    }

    private static personalizeProducts(
        products: any[],
        userBehavior: {
            viewedProducts: number[];
            clickedProducts: number[];
            purchasedProducts: number[];
            favoriteCategories: string[];
        },
        context: any
    ): any[] {
        const scoreProduct = (product: any): number => {
            let score = 0;

            if (userBehavior.favoriteCategories.includes(product.category)) {
                score += 10;
            }

            if (userBehavior.viewedProducts.includes(product.productid)) {
                score += 5;
            }

            if (userBehavior.clickedProducts.includes(product.productid)) {
                score += 8;
            }

            if (userBehavior.purchasedProducts.includes(product.productid)) {
                score += 3;
            }

            score += product.stars * 2;

            return score;
        };

        const scoredProducts = products.map(product => ({
            ...product,
            _score: scoreProduct(product)
        }));

        scoredProducts.sort((a, b) => b._score - a._score);

        return scoredProducts.map(({ _score, ...product }) => product);
    }
}

export const chatController = ChatController;

