import { ExtractedEntities } from '../services/aiService';

export function detectIntentByRules(message: string): Partial<ExtractedEntities> | null {
    const lowered = message.toLowerCase().trim();

    // ===== RECOMMEND =====
    if (/(^|\s)(порекомендуй|порадь|порекомендувати|recommend)(\s|$)/i.test(lowered)) {
        const cleaned = lowered.replace(
            /(порекомендуй|порадь|порекомендувати|recommend)/gi,
            ''
        ).trim();

        return {
            intent: 'recommend',
            searchTerm: cleaned || undefined
        };
    }

    // ===== COMPARE =====
    const ids = lowered.match(/\d+/g)?.map(Number) ?? [];

    if (
        ids.length >= 2 &&
        /(compare|vs|versus|порівняй|порівняти)/i.test(lowered)
    ) {
        return {
            intent: 'compare',
            productIds: ids.slice(0, 2)
        };
    }

    // ===== NOTHING MATCHED =====
    return null;
}