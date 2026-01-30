import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ContextService, ChatMessage } from '../services/contextService';
import { ProductService, ProductFilters, Product } from '../services/productService';
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

            const messageLower = message.toLowerCase();
            const idsInMessage = message.match(/\d+/g)?.map(Number) || [];

            if (
                idsInMessage.length >= 2 &&
                (
                    messageLower.includes('compare') ||
                    messageLower.includes('vs') ||
                    messageLower.includes('versus') ||
                    messageLower.includes('and')
                )
            ) {
                entities.intent = 'compare';
                entities.productIds = idsInMessage;
            }

            if (entities.intent === 'compare') {
                const ids = message.match(/\d+/g)?.map(Number) || [];

                entities.productIds = ids;

                delete entities.searchTerm;
            }

            if (entities.searchTerm) {
                const language = entities.language || 'en';
                const stopWords = language === 'uk' ? [
                    'порекомендуй', 'порадь', 'знайди', 'шукаю', 'покажи', 'дай',
                    'будь ласка', 'кращі', 'дешеві', 'телефон', 'телефони',
                    'два', 'порівняй', 'з', 'продукти', 'до', 'і', 'та'
                ] : [
                    'recommend', 'search', 'find', 'show', 'give', 'me',
                    'please', 'best', 'cheap', 'phone', 'phones', 
                    'two', 'compare', 'with', 'products', 'under', 'and'
                ];
            
                let normalized = entities.searchTerm.toLowerCase();
            
                stopWords.forEach(word => {
                    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
                });
            
                normalized = normalized.trim();
            
                if (normalized.length > 0) {
                    entities.searchTerm = normalized;
                }
            }
            

            console.log('ENTITIES:', JSON.stringify(entities, null, 2));


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
                productType: entities.productType,
                mainCategory: entities.mainCategory,
                minPrice: entities.minPrice,
                maxPrice: entities.maxPrice || entities.budget,
                minRating: entities.rating,
                limit: 10
            };

            let products: Product[] = [];
            let matchedProducts: Product[] = [];

            if (
                entities.intent === 'compare' && 
                Array.isArray(entities.productIds) &&
                entities.productIds.length >= 2
            ) {
                matchedProducts = await ProductService.searchProducts({
                    productIds: entities.productIds
                });
            
                if (matchedProducts.length < 2) {
                    res.status(200).json({
                        sessionId: finalSessionId,
                        message: entities.language === 'uk'
                            ? 'На жаль, недостатньо продуктів для порівняння.'
                            : 'Unfortunately, there are not enough products to compare.',
                        products: matchedProducts,
                        entities
                    });
                    return;
                }

                const phoneKeywords = [
                    'gb ram',
                    'gb storage',
                    'smartphone',
                    'mobile',
                    '5g',
                    '4g'
                ];
            
                const phoneProducts = matchedProducts.filter(p =>
                    phoneKeywords.some(k =>
                        p.name.toLowerCase().includes(k)
                    )
                );
            
                const productsToCompare =
                    phoneProducts.length >= 2
                        ? phoneProducts.slice(0, 2)
                        : matchedProducts.slice(0, 2);
            
                if (productsToCompare.length < 2) {
                    ContextService.addMessage(finalSessionId, {
                        role: 'assistant',
                        content: entities.language === 'uk'
                            ? 'На жаль, недостатньо телефонів для порівняння.'
                            : 'Unfortunately, there are not enough phones to compare.'
                    });

                    res.status(200).json({
                        sessionId: finalSessionId,
                        message: entities.language === 'uk'
                            ? 'На жаль, недостатньо продуктів для порівняння.'
                            : 'Unfortunately, there are not enough products to compare.',
                        products: matchedProducts,
                        quickReplies: [],
                        entities
                    });
                    return;
                }

    products = matchedProducts;
} else if (entities.intent === 'search' || entities.intent === 'recommend') {
    products = await ProductService.searchProducts(filters);

    if (userBehavior && products.length > 0) {
        products = this.personalizeProducts(products, userBehavior, context);
    }
}


            console.log('PRODUCTS SENT TO AI:', products.length);
            console.log('FIRST PRODUCT:', products[0]);


            const aiResponse: AIResponse = await AIService.generateResponse(
                message,
                context,
                entities,
                products
            );

            if (entities.intent === 'compare' && products.length >= 2) {
                aiResponse.comparisonTable = AIService.formatComparison(products);
            }

            

            ContextService.addMessage(finalSessionId, {
                role: 'assistant',
                content: aiResponse.text
            });

            if (products.length > 0) {
                products.forEach(p =>
                    ContextService.addSelectedProduct(finalSessionId, p.id)
                  );
                  
            }

            const response = {
                sessionId: finalSessionId,
                message: aiResponse.text,
                products: aiResponse.products || [],
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

            if (userBehavior.viewedProducts.includes(product.id)) {
                score += 5;
            }

            if (userBehavior.clickedProducts.includes(product.id)) {
                score += 8;
            }

            if (userBehavior.purchasedProducts.includes(product.id)) {
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

