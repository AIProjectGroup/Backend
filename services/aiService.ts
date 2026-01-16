import axios from 'axios';
import { Product } from './productService';
import { ConversationContext } from './contextService';

export interface ExtractedEntities {
    intent: 'search' | 'compare' | 'recommend' | 'question' | 'refine' | 'budget' | 'scenario';
    category?: string;
    mainCategory?: string;
    budget?: number;
    minPrice?: number;
    maxPrice?: number;
    rating?: number;
    searchTerm?: string;
    productIds?: number[];
    brand?: string;
    useCase?: string;
    specifications?: Record<string, any>;
    language?: 'en' | 'uk';
    needsClarification?: boolean;
    clarificationQuestion?: string;
}

export interface AIResponse {
    text: string;
    products?: Product[];
    comparisonTable?: any;
    quickReplies?: string[];
    needsProducts?: boolean;
    entities: ExtractedEntities;
}

export class AIService {
    private static getHeaders() {
        const apiKey = process.env.OPENAI_API_KEY;
        const projectId = process.env.OPENAI_PROJECT_ID;
    
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is missing');
        }
    
        return {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Project': projectId
        };
    }
    private static readonly API_URL = 'https://api.openai.com/v1/responses';
    private static readonly MODEL = 'gpt-4o-mini';
 
    static async extractIntentAndEntities(
        message: string,
        context: ConversationContext,
        availableProducts: Product[],
        categories: { categoryid: number; name: string; maincategory: string }[]
    ): Promise<ExtractedEntities> {
        try {
            const systemPrompt = this.buildSystemPrompt(context, categories);
            const userPrompt = `Analyze the following user message and extract intent and entities in JSON format:\n\n"${message}"\n\nReturn ONLY a valid JSON object with this structure:\n{\n  "intent": "search|compare|recommend|question|refine|budget|scenario",\n  "category": "string or null",\n  "mainCategory": "string or null",\n  "budget": number or null,\n  "minPrice": number or null,\n  "maxPrice": number or null,\n  "rating": number or null,\n  "searchTerm": "string or null",\n  "productIds": [numbers] or null,\n  "brand": "string or null",\n  "useCase": "string or null",\n  "specifications": {} or null,\n  "language": "en|uk",\n  "needsClarification": boolean,\n  "clarificationQuestion": "string or null"\n}\n\nIf the user's request is unclear or missing required information, set needsClarification to true and provide a clarificationQuestion.`;

            const response = await axios.post(
                this.API_URL,
                {
                    model: 'gpt-4o-mini',
                    input: [
                        {
                        role: 'system',
                        content: systemPrompt
                        },
                        {
                        role: 'user',
                        content: userPrompt
                        }
                    ],
                    temperature: 0.3
                },
                {
                   
                    headers: this.getHeaders(),
                    timeout: 7000
                }
            );

            const content = response.data.output_text;
            if (!content) {
                throw new Error('No response from AI');
            }

            const entities = JSON.parse(content) as ExtractedEntities;
            
            const detectedLanguage = this.detectLanguage(message);
            entities.language = detectedLanguage;

            return entities;

            // DEBUG
            // }catch (error: any) {
            //     console.error('extractIntentAndEntities failed');
            //     console.error(error.response?.data || error.message);
            
            //     throw error;
            // }

            } catch (error: any) {
                console.error('Error extracting intent and entities:', error);
                return this.fallbackExtraction(message, context);
            }

    }

    static async generateResponse(
        message: string,
        context: ConversationContext,
        entities: ExtractedEntities,
        products: Product[],
        userBehavior?: {
            viewedProducts: number[];
            clickedProducts: number[];
            purchasedProducts: number[];
            favoriteCategories: string[];
        }
    ): Promise<AIResponse> {
        try {
            const systemPrompt = this.buildSystemPrompt(context);
            const conversationHistory = context.messages
                .slice(-6)
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');

            let userPrompt = `User message: "${message}"\n\nExtracted entities: ${JSON.stringify(entities)}\n\n`;
            
            if (products.length > 0) {
                userPrompt += `Available products (limit to top 5-10):\n${JSON.stringify(products.slice(0, 10).map(p => ({
                    id: p.productid,
                    title: p.title,
                    price: p.discount,
                    rating: p.stars,
                    category: p.category
                })))}\n\n`;
            }

            if (userBehavior && userBehavior.favoriteCategories.length > 0) {
                userPrompt += `User's favorite categories: ${userBehavior.favoriteCategories.join(', ')}\n\n`;
            }

            userPrompt += `Generate a helpful, concise response in ${entities.language || 'en'}. `;
            userPrompt += `If products are provided, recommend them with brief justifications. `;
            userPrompt += `Use a friendly, professional tone. Keep response under 300 words.`;

            const response = await axios.post(
                'https://api.openai.com/v1/responses',
                {
                    model: 'gpt-4o-mini',
                    input: [
                        { role: 'system', content: systemPrompt },
                        ...(conversationHistory
                            ? [{ role: 'user', content: `Previous conversation:\n${conversationHistory}` }]
                            : []),
                        { role: 'user', content: userPrompt }
                    ]
                },
                {
                    
                    headers: this.getHeaders(),
                    timeout: 7000
                }
            );

            const aiText = response.data.output_text;
            
            const quickReplies = this.generateQuickReplies(entities, products);

            return {
                text: aiText,
                products: products.length > 0 ? products.slice(0, 10) : undefined,
                quickReplies,
                needsProducts: entities.intent === 'search' || entities.intent === 'recommend',
                entities
            };

            // DEBUG
            // }catch (error: any) {
            //     console.error('generateResponse failed');
            //     console.error(error.response?.data || error.message);
            //     return this.generateFallbackResponse(message, entities, products, error);
            // }

            } catch (error: any) {
                console.error('Error generating AI response:', error);
                return this.generateFallbackResponse(message, entities, products);
            }
    }

    private static buildSystemPrompt(
        context: ConversationContext,
        categories?: { categoryid: number; name: string; maincategory: string }[]
    ): string {
        let prompt = `You are a helpful AI assistant for an electronics e-commerce platform. Your role is to help users find products, compare options, get recommendations, and make informed purchasing decisions.

Guidelines:
- Be concise, helpful, and professional
- Use the user's preferred language (Ukrainian or English)
- Ask clarifying questions if the user's request is unclear
- Provide product recommendations with brief justifications
- When comparing products, highlight key differences
- Consider user preferences and budget constraints
- Suggest complementary items when appropriate

`;

        if (categories) {
            prompt += `Available categories: ${categories.map(c => c.name).join(', ')}\n\n`;
        }

        if (context.userPreferences.budget) {
            prompt += `User's mentioned budget: ${context.userPreferences.budget}\n\n`;
        }

        if (context.userPreferences.category) {
            prompt += `User's interested category: ${context.userPreferences.category}\n\n`;
        }

        return prompt;
    }

    private static generateQuickReplies(entities: ExtractedEntities, products: Product[]): string[] {
        const replies: string[] = [];
        
        if (entities.intent === 'compare' && products.length >= 2) {
            replies.push('Compare these products');
        }
        
        if (entities.intent === 'search' && products.length > 0) {
            replies.push('Show cheaper options');
            replies.push('Show higher rated');
        }
        
        if (entities.intent === 'recommend') {
            replies.push('Show more recommendations');
        }

        if (products.length > 0) {
            replies.push('Show similar products');
        }

        return replies.slice(0, 4); 
    }

    private static fallbackExtraction(message: string, context: ConversationContext): ExtractedEntities {
        const lowerMessage = message.toLowerCase();
        const language = this.detectLanguage(message);
        
        let intent: ExtractedEntities['intent'] = 'search';
        if (lowerMessage.includes('compare') || lowerMessage.includes('difference')) {
            intent = 'compare';
        } else if (lowerMessage.includes('recommend') || lowerMessage.includes('suggest')) {
            intent = 'recommend';
        } else if (lowerMessage.includes('budget') || lowerMessage.includes('price')) {
            intent = 'budget';
        }

        const budgetMatch = message.match(/(\d+)\s*(?:usd|dollars?|dol|грн|uah)/i);
        const budget = budgetMatch ? parseInt(budgetMatch[1]) : undefined;

        return {
            intent,
            searchTerm: message,
            budget,
            language,
            needsClarification: false
        };
    }

    
    private static generateFallbackResponse(
        message: string,
        entities: ExtractedEntities,
        products: Product[],
        error?: any
    ): AIResponse {
        let errorText = 'Unknown AI error';
    
        if (error?.response) {
            errorText = `OpenAI error ${error.response.status}: ${JSON.stringify(error.response.data)}`;
        } else if (error?.message) {
            errorText = error.message;
        }
    
        return {
            text: `AI ERROR: ${errorText}`,
            entities,
            quickReplies: [],
            needsProducts: false
        };
    }
    

    private static detectLanguage(message: string): 'en' | 'uk' {
        const cyrillicPattern = /[а-яёіїєґ]/i;
        return cyrillicPattern.test(message) ? 'uk' : 'en';
    }

    static formatComparison(products: Product[]): any {
        if (products.length < 2) return null;

        return {
            products: products.map(p => ({
                id: p.productid,
                title: p.title,
                price: p.discount,
                rating: p.stars,
                category: p.category,
                features: {
                    reviews: p.reviewCount,
                    isNew: p.isnew,
                    onSale: p.issale
                }
            }))
        };
    }
}

    