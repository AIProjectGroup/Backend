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
    productType?: 'phone' | 'charger' | 'case' | 'earbuds' | 'tv';
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
    private static readonly API_URL = 'https://api.openai.com/v1/responses';
    private static readonly MODEL = 'gpt-4o-mini';
    static formatComparison(products: Product[]): { products: any[] } | null {
        if (!products || products.length < 2) return null;
    
        return {
            products: products.slice(0, 2).map(p => ({
                id: p.id,
                name: p.name,
                price: p.price ?? 'N/A',
                discount: p.discount ?? 'N/A',
                rating: p.rating,
                rating_count: p.rating_count,
                category: `${p.main_category || ''} / ${p.sub_category}`,
                image: p.images?.[0]?.imglink || ''
            }))
        };
    }
    

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

    // ================================
    // INTENT & ENTITY EXTRACTION
    // ================================
    static async extractIntentAndEntities(
        message: string,
        context: ConversationContext,
        availableProducts: Product[],
        categories: { id: number; main_category: string; sub_category: string }[]
    ): Promise<ExtractedEntities> {
        try {
            const lower = message.toLowerCase();

            let productType: ExtractedEntities['productType'] | undefined;

            if (lower.includes('phone') || lower.includes('smartphone') || lower.includes('mobile')) {
                productType = 'phone';
            } else if (lower.includes('charger')) {
                productType = 'charger';
            } else if (lower.includes('case') || lower.includes('cover')) {
                productType = 'case';
            } else if (lower.includes('earbuds') || lower.includes('headphones')) {
                productType = 'earbuds';
            } else if (lower.includes('tv')) {
                productType = 'tv';
            }

            const systemPrompt = this.buildSystemPrompt(context, categories);

            const userPrompt = `
Analyze the following user message and extract intent and entities in JSON format.

Message:
"${message}"


Return ONLY valid JSON:
{
  "intent": "search|compare|recommend|question|refine|budget|scenario",
  "category": string | null,
  "mainCategory": string | null,
  "budget": number | null,
  "minPrice": number | null,
  "maxPrice": number | null,
  "rating": number | null,
  "searchTerm": string | null,
  "productIds": number[] | null,
  "brand": string | null,
  "productType": 'phone' | 'charger' | 'case' | 'earbuds' | 'tv',
  "useCase": string | null,
  "specifications": object | null,
  "language": "en|uk",
  "needsClarification": boolean,
  "clarificationQuestion": string | null
}
`;

            const response = await axios.post(
                this.API_URL,
                {
                    model: this.MODEL,
                    input: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3
                },
                { headers: this.getHeaders(), timeout: 7000 }
            );

            console.log('Raw AI response:', response.data);
            const content = response.data.output_text;
            const entities = JSON.parse(content) as ExtractedEntities;
            entities.productType = productType;
            entities.language = this.detectLanguage(message);
            

            const compareKeywords = ['compare', 'difference', 'vs', 'versus', 'two', 'both'];
            const messageLower = message.toLowerCase();

            if (compareKeywords.some(word => messageLower.includes(word))) {
                entities.intent = 'compare';
            }

            // 🔧 HARD FIX FOR BUDGET (DEMO SAFE)
            const budgetMatch = message.match(/under\s+(\d+)|below\s+(\d+)|до\s+(\d+)/i);

            if (budgetMatch) {
                const value = Number(budgetMatch[1] || budgetMatch[2] || budgetMatch[3]);
                if (!isNaN(value)) {
                    entities.maxPrice = value;
                    entities.intent = 'budget';
                }
            }

            // console.log('EXTRACTED ENTITIES:', entities);

            return entities;
        } catch (error) {
            console.error('extractIntentAndEntities error:', error);
            return this.fallbackExtraction(message, context);
        }
    }


//     static async generateResponse(
        
//         message: string,
//         context: ConversationContext,
//         entities: ExtractedEntities,
//         products: Product[],
//         userBehavior?: any
//     ): Promise<AIResponse> {
//         console.log('🧠 AI generateResponse called');
//         console.log('🧠 Products count:', products.length);
//         console.log('🧠 Message:', message);

//         try {
//             if (products.length === 0) {
//                 return {
//                     text:
//                         entities.language === 'uk'
//                             ? 'На жаль, за вашим запитом товарів не знайдено.'
//                             : 'Unfortunately, no products were found for your request.',
//                     products: [],
//                     entities
//                 };
//             }

//             const productContext = products.slice(0, 10).map(p => `
// PRODUCT:
// - ID: ${p.id}
// - Name: ${p.name}
// - Category: ${p.main_category} / ${p.sub_category}
// - Price: ${p.price}
// - Rating: ${p.rating}
// - Reviews: ${p.rating_count}
// `).join('\n');

//             const response = await axios.post(
//                 this.API_URL,
//                 {
//                     model: this.MODEL,
//                     input: [
//                         {
//                             role: 'system',
//                             content: `
// You are an AI assistant for an electronics e-commerce platform.

// STRICT RULES:
// - You MUST recommend ONLY products listed below.
// - You MUST NOT invent products.
// - If no products exist, say so.
// `
//                         },
//                         {
//                             role: 'system',
//                             content: `AVAILABLE PRODUCTS FROM DATABASE:\n${productContext}`
//                         },
//                         {
//                             role: 'user',
//                             content: message
//                         }
//                     ]
//                 },
//                 { headers: this.getHeaders(), timeout: 7000 }
//             );

//             const aiText =
//                 response.data?.output?.[0]?.content?.[0]?.text ??
//                 response.data?.choices?.[0]?.message?.content ??
//                 'Here are some products you might like:';

//             return {
//                 text: aiText,
//                 products: products.slice(0, 10),
//                 quickReplies: this.generateQuickReplies(entities, products),
//                 needsProducts: true,
//                 entities
//             };
//         } catch (error) {
//             console.error('generateResponse error:', error);
//             return this.generateFallbackResponse(message, entities);
//         }
//     }


static async generateResponse(
    message: string,
    context: ConversationContext,
    entities: ExtractedEntities,
    products: Product[]
): Promise<AIResponse> {

    console.log('ENTER generateResponse');

    if (products.length === 0) {
        console.log('NO PRODUCTS');
        return {
            text: 'No products',
            products: [],
            entities
        };
    }

    const productContext = products.slice(0, 3).map(p => `
ID: ${p.id}
Name: ${p.name}
Price: ${p.price}
`).join('\n');

    console.log('PRODUCT CONTEXT:', productContext);

    const payload = {
        model: this.MODEL,
        input: [
            {
                role: 'system',
                content: `
              You are a friendly and helpful AI assistant for an electronics e-commerce platform.
              
              Your task:
              - Help the user choose products.
              - Speak naturally, like a consultant in a tech store.
              - Extract intent: "search", "recommend", "compare"
              - Extract entities: product type, brand, budget, etc.
              If user wants to compare two products, set intent to "compare".
              
              Response style rules:
              - Start with a short friendly sentence (for example: "Sure! Here are the best Samsung products I can recommend.").
              - If the user asks for recommendations, clearly say that you are recommending products.
              - If a brand is mentioned, explicitly mention the brand in the response.
              - Then list or describe the products.
              - Do NOT invent products.
              - Use ONLY the products provided below.
              - If no products exist, politely say so.
              
              Tone:
              - Friendly
              - Confident
              - Clear
              `
              },

              {
                role: 'system',
                content: `
              USER INTENT: ${entities.intent}
              USER SEARCH TERM: ${entities.searchTerm || 'not specified'}
              `
              },
              
            { 
                role: 'system', 
                content: `PRODUCTS:\n${productContext}` 
            },

            { 
                role: 'user', 
                content: message 
            }
        ]
    };

    console.log('AI PAYLOAD:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
        this.API_URL,
        payload,
        { headers: this.getHeaders(), timeout: 7000 }
    );

    console.log('AI RAW RESPONSE:', JSON.stringify(response.data, null, 2));

    const aiText =
        response.data?.output?.[0]?.content?.[0]?.text ??
        response.data?.choices?.[0]?.message?.content ??
        'Here are some products you might like:';

    return {
        text: aiText,
        products: products.slice(0, 10),
        quickReplies: this.generateQuickReplies(entities, products),
        needsProducts: true,
        entities
    };
}

    private static buildSystemPrompt(
        context: ConversationContext,
        categories?: { id: number; main_category: string; sub_category: string }[]
    ): string {
        let prompt = `
You are a helpful AI assistant for an electronics store.
Use ONLY the provided product data.
Never invent products.
Use user's language.
`;

        if (categories?.length) {
            prompt += `Available categories: ${categories
                .map(c => `${c.main_category} / ${c.sub_category}`)
                .join(', ')}\n`;
        }

        return prompt;
    }

    // ================================
    // QUICK REPLIES
    // ================================
    private static generateQuickReplies(
        entities: ExtractedEntities,
        products: Product[]
    ): string[] {
        const replies: string[] = [];

        if (entities.intent === 'compare' && products.length >= 2) {
            replies.push('Compare these products');
        }

        if (entities.intent === 'search') {
            replies.push('Show cheaper options');
            replies.push('Show higher rated');
        }

        return replies.slice(0, 4);
    }

    // ================================
    // FALLBACKS
    // ================================
    private static fallbackExtraction(
        message: string,
        context: ConversationContext
    ): ExtractedEntities {
        return {
            intent: 'search',
            searchTerm: message,
            language: this.detectLanguage(message),
            needsClarification: false
            
        };
        
    }

    private static generateFallbackResponse(
        message: string,
        entities: ExtractedEntities
    ): AIResponse {
        return {
            text: 'AI ERROR: Unknown error',
            entities,
            quickReplies: []
        };
    }

    private static detectLanguage(message: string): 'en' | 'uk' {
        return /[а-яіїєґ]/i.test(message) ? 'uk' : 'en';
    }
}
