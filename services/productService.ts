import { client } from '../data/DB';

export interface ProductFilters {
    category?: string;
    mainCategory?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    searchTerm?: string;
    brand?: string;
    productType?: 'phone' | 'charger' | 'case' | 'earbuds' | 'tv';
    limit?: number;
    productIds?: number[];
}

export interface Product {
    id: number;
    name: string;
    sub_category: string;
    main_category?: string;
    price: number;
    discount: number;
    rating: number;
    isnew: boolean;
    issale: boolean;
    isdiscount: boolean;
    description?: string;
    colors?: any[];
    sizes?: any[];
    rating_count: number;
    images: any;
    seller?: string;
}

export class ProductService {
    static async getAllCategories(): Promise<{ id: number; main_category: string; sub_category: string }[]> {
        try {
            const result = await client.query(
                `SELECT id AS categoryid, sub_category AS name, main_category AS maincategory FROM categories ORDER BY main_category, sub_category`
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting categories:', error);
            return [];
        }
    }

    static async getAllProducts(limit = 20): Promise<Product[]> {
        try {
            const result = await client.query(`
                SELECT ep.id, ep.name, ep.price, ep.original_price, ep.rating, ep.rating_count,
                       ep.image, ep.link, c.main_category, c.sub_category
                FROM electronics_products ep
                LEFT JOIN categories c ON ep.category_id = c.id
                LIMIT $1
            `, [limit]);

            return result.rows.map(r => ({
                id: r.id,
                name: r.name,
                sub_category: r.sub_category,
                main_category: r.main_category,
                price: parseFloat(r.price),
                discount: parseFloat(r.original_price),
                rating: parseFloat(r.rating) || 0,
                rating_count: r.rating_count || 0,
                images: [{ imglink: r.image }],
                description: '',
                isnew: false,
                issale: false,
                isdiscount: false
            }));
        } catch (error) {
            console.error('getAllProducts error:', error);
            return [];
        }
    }

    static async debugGetAnyProduct() {
        const res = await client.query(`
            SELECT id, name FROM electronics_products LIMIT 5
        `);
        console.log('DEBUG PRODUCTS:', res.rows);
        return res.rows;
    }
    

    static async getProductById(productId: number): Promise<Product | null> {
        try {
            const result = await client.query(`
                SELECT ep.id, ep.name, ep.price, ep.original_price, ep.rating, ep.rating_count,
                       ep.image, ep.link, c.main_category, c.sub_category
                FROM electronics_products ep
                LEFT JOIN categories c ON ep.category_id = c.id
                WHERE ep.id = $1
            `, [productId]);

            if (result.rows.length === 0) return null;

            const r = result.rows[0];
            return {
                id: r.id,
                name: r.name,
                sub_category: r.sub_category,
                main_category: r.main_category,
                price: parseFloat(r.price),
                discount: parseFloat(r.original_price),
                rating: parseFloat(r.rating) || 0,
                rating_count: r.rating_count || 0,
                images: [{ imglink: r.image }],
                description: '',
                isnew: false,
                issale: false,
                isdiscount: false
            };
        } catch (error) {
            console.error('Error getting product:', error);
            return null;
        }
    }

    static async searchProducts(filters: ProductFilters): Promise<Product[]> {
        try {
            let query = `
                SELECT ep.id, ep.name, ep.price, ep.original_price, ep.rating, ep.rating_count,
                       ep.image, ep.link, c.main_category, c.sub_category
                FROM electronics_products ep
                LEFT JOIN categories c ON ep.category_id = c.id
                WHERE 1=1
            `;
            const values: any[] = [];
            let paramIndex = 1;

            if (filters.productIds && filters.productIds.length > 0) {
                query += ` AND ep.id = ANY($${paramIndex})`;
                values.push(filters.productIds);
                paramIndex++;
            }

            if (filters.mainCategory === 'phone' || filters.searchTerm?.includes('phone')) {
                query += ` AND ep.name ILIKE '%GB%'`;
            }
            

            if (filters.searchTerm) {
                query += ` AND ep.name ILIKE $${paramIndex}`;
                values.push(`%${filters.searchTerm}%`);
                paramIndex++;
            }

            if (filters.productType === 'phone') {
                query += `
                    AND ep.name ILIKE '%phone%'
                    AND ep.name NOT ILIKE '%case%'
                    AND ep.name NOT ILIKE '%cover%'
                    AND ep.name NOT ILIKE '%charger%'
                `;
            }
            
 
            if (filters.category) {
                query += ` AND c.sub_category ILIKE $${paramIndex}`;
                values.push(`%${filters.category}%`);
                paramIndex++;
            }

            if (filters.mainCategory) {
                query += `AND c.main_category ILIKE $${paramIndex}`;
                values.push(`%${filters.mainCategory}%`);
                paramIndex++;
            }

            if (filters.minPrice !== undefined) {
                query +=  `AND COALESCE(ep.price, ep.original_price) >= $${paramIndex}`;
                values.push(filters.minPrice);
                paramIndex++;
            }
            
            if (filters.maxPrice !== undefined) {
                query +=  `AND COALESCE(ep.price, ep.original_price) <= $${paramIndex}`;
                values.push(filters.maxPrice);
                paramIndex++;
            }

            if (filters.minRating !== undefined) {
                query += ` AND ep.rating >= $${paramIndex}`;
                values.push(filters.minRating);
                paramIndex++;
            }

            console.log('FILTERS:', filters);

            query += ` ORDER BY ep.rating DESC`;
            const limit = filters.limit || 10;
            query += ` LIMIT $${paramIndex}`;
            values.push(limit);

            const result = await client.query(query, values);
            return result.rows.map(r => ({
                id: r.id,
                name: r.name,
                sub_category: r.sub_category,
                main_category: r.main_category,
                price: parseFloat(r.price),
                discount: parseFloat(r.original_price),
                rating: parseFloat(r.rating) || 0,
                rating_count: r.rating_count || 0,
                images: [{ imglink: r.image }],
                description: '',
                isnew: false,
                issale: false,
                isdiscount: false
            }));
        } catch (error) {
            console.error('searchProducts error:', error);
            return [];
        }
    }
}

