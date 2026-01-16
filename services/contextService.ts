import { client } from '../data/DB';

const conversationContexts = new Map<string, any>();

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date;
}

export interface ConversationContext {
    sessionId: string;
    messages: ChatMessage[];
    userPreferences: {
        budget?: number;
        category?: string;
        brand?: string;
        specifications?: Record<string, any>;
    };
    selectedProducts?: number[];
    language?: 'en' | 'uk';
}

export class ContextService {
    static getContext(sessionId: string, userID?: number): ConversationContext {
        if (!conversationContexts.has(sessionId)) {
            conversationContexts.set(sessionId, {
                sessionId,
                messages: [],
                userPreferences: {},
                selectedProducts: [],
                language: 'en'
            });
        }
        return conversationContexts.get(sessionId)!;
    }

    static addMessage(sessionId: string, message: ChatMessage): void {
        const context = this.getContext(sessionId);
        context.messages.push({
            ...message,
            timestamp: new Date()
        });
        if (context.messages.length > 20) {
            context.messages = context.messages.slice(-20);
        }
    }

    static updatePreferences(sessionId: string, preferences: Partial<ConversationContext['userPreferences']>): void {
        const context = this.getContext(sessionId);
        context.userPreferences = { ...context.userPreferences, ...preferences };
    }

    static updateLanguage(sessionId: string, language: 'en' | 'uk'): void {
        const context = this.getContext(sessionId);
        context.language = language;
    }

    static addSelectedProduct(sessionId: string, productId: number): void {
        const context = this.getContext(sessionId);
        if (!context.selectedProducts) {
            context.selectedProducts = [];
        }
        if (!context.selectedProducts.includes(productId)) {
            context.selectedProducts.push(productId);
        }
    }

    static async getUserBehavior(userID: number): Promise<{
        viewedProducts: number[];
        clickedProducts: number[];
        purchasedProducts: number[];
        favoriteCategories: string[];
    }> {
        try {
            const viewedQuery = `
                SELECT DISTINCT products.productid, productparams.views
                FROM products
                INNER JOIN productparams ON products.productid = productparams.productid
                INNER JOIN categories ON products.categoryid = categories.categoryid
                WHERE productparams.views > 0
                ORDER BY productparams.views DESC
                LIMIT 50
            `;
            
            const purchasedQuery = `
                SELECT DISTINCT orderitems.productid
                FROM orders
                INNER JOIN orderitems ON orders.orderid = orderitems.orderid
                WHERE orders.userid = $1
            `;
            
            const wishlistQuery = `
                SELECT DISTINCT productid
                FROM wishlistitems
                WHERE userid = $1
            `;

            const [viewedResult, purchasedResult, wishlistResult] = await Promise.all([
                client.query(viewedQuery),
                client.query(purchasedQuery, [userID]),
                client.query(wishlistQuery, [userID])
            ]);

            const categoryQuery = `
                SELECT categories.name, COUNT(*) as count
                FROM orders
                INNER JOIN orderitems ON orders.orderid = orderitems.orderid
                INNER JOIN products ON orderitems.productid = products.productid
                INNER JOIN categories ON products.categoryid = categories.categoryid
                WHERE orders.userid = $1
                GROUP BY categories.name
                ORDER BY count DESC
                LIMIT 5
            `;
            const categoryResult = await client.query(categoryQuery, [userID]);

            return {
                viewedProducts: viewedResult.rows.map(r => r.productid),
                clickedProducts: wishlistResult.rows.map(r => r.productid),
                purchasedProducts: purchasedResult.rows.map(r => r.productid),
                favoriteCategories: categoryResult.rows.map(r => r.name)
            };
        } catch (error) {
            console.error('Error fetching user behavior:', error);
            return {
                viewedProducts: [],
                clickedProducts: [],
                purchasedProducts: [],
                favoriteCategories: []
            };
        }
    }

    static clearContext(sessionId: string): void {
        conversationContexts.delete(sessionId);
    }

    static getRecentMessages(sessionId: string, limit: number = 10): ChatMessage[] {
        const context = this.getContext(sessionId);
        return context.messages.slice(-limit);
    }
}
