import { client } from '../data/DB';

export interface ProductFilters {
    category?: string;
    mainCategory?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    searchTerm?: string;
    brand?: string;
    limit?: number;
    productIds?: number[];
}

export interface Product {
    productid: number;
    title: string;
    category: string;
    maincategory?: string;
    price: string;
    discount: string;
    stars: number;
    isnew: boolean;
    issale: boolean;
    isdiscount: boolean;
    description?: string;
    colors?: any[];
    sizes?: any[];
    reviewCount: number;
    images: any;
    seller?: string;
}

export class ProductService {
    private static async getColors(productID: number): Promise<any[]> {
        try {
            const result = await client.query(
                `SELECT colorid, colorname, colorclass FROM productcolors WHERE productid = $1`,
                [productID]
            );
            return result.rows;
        } catch (error) {
            return [];
        }
    }

    private static async getSizes(productID: number): Promise<any[]> {
        try {
            const result = await client.query(
                `SELECT sizeid, sizename, instock FROM productsizes WHERE productid = $1`,
                [productID]
            );
            return result.rows;
        } catch (error) {
            return [];
        }
    }

    private static async getImage(productID: number): Promise<any> {
        try {
            const result = await client.query(
                `SELECT imageid, imglink, imgalt FROM productimages WHERE productid = $1 AND isprimary = true LIMIT 1`,
                [productID]
            );
            return result.rows[0] || { imageid: 0, imglink: '', imgalt: '' };
        } catch (error) {
            return { imageid: 0, imglink: '', imgalt: '' };
        }
    }

    private static async getReviewCount(productID: number): Promise<number> {
        try {
            const result = await client.query(
                `SELECT COUNT(*) as count FROM reviews WHERE productid = $1`,
                [productID]
            );
            return parseInt(result.rows[0]?.count || '0');
        } catch (error) {
            return 0;
        }
    }

    static async searchProducts(filters: ProductFilters): Promise<Product[]> {
        try {
            let query = `
                SELECT 
                    products.productid,
                    products.title,
                    products.description,
                    products.price,
                    products.discount,
                    categories.name AS category,
                    categories.maincategory,
                    productparams.stars,
                    productparams.isnew,
                    productparams.issale,
                    productparams.isdiscount,
                    sellers.company_name AS seller
                FROM products
                INNER JOIN categories ON products.categoryid = categories.categoryid
                INNER JOIN productparams ON products.productid = productparams.productid
                LEFT JOIN sellers ON products.seller_id = sellers.seller_id
                WHERE 1=1
            `;
            const values: any[] = [];
            let paramIndex = 1;

            if (filters.productIds && filters.productIds.length > 0) {
                query += ` AND products.productid = ANY($${paramIndex})`;
                values.push(filters.productIds);
                paramIndex++;
            }

            if (filters.searchTerm) {
                query += ` AND (
                    products.title ILIKE $${paramIndex}
                    OR products.description ILIKE $${paramIndex}
                    OR products.tags ILIKE $${paramIndex}
                )`;
                values.push(`%${filters.searchTerm}%`);
                paramIndex++;
            }

            if (filters.category) {
                query += ` AND categories.name ILIKE $${paramIndex}`;
                values.push(`%${filters.category}%`);
                paramIndex++;
            }

            if (filters.mainCategory) {
                query += ` AND categories.maincategory ILIKE $${paramIndex}`;
                values.push(`%${filters.mainCategory.toUpperCase()}%`);
                paramIndex++;
            }

            if (filters.minPrice !== undefined) {
                query += ` AND products.discount >= $${paramIndex}`;
                values.push(filters.minPrice);
                paramIndex++;
            }
            if (filters.maxPrice !== undefined) {
                query += ` AND products.discount <= $${paramIndex}`;
                values.push(filters.maxPrice);
                paramIndex++;
            }

            if (filters.minRating !== undefined) {
                query += ` AND productparams.stars >= $${paramIndex}`;
                values.push(filters.minRating);
                paramIndex++;
            }

            query += ` ORDER BY productparams.stars DESC, productparams.views DESC`;
            
            const limit = filters.limit || 10;
            query += ` LIMIT $${paramIndex}`;
            values.push(limit);

            const result = await client.query(query, values);

            if (result.rows.length === 0) return [];

            const products = await Promise.all(
                result.rows.map(async (product) => {
                    const productID = product.productid;
                    const [colors, sizes, images, reviewCount] = await Promise.all([
                        this.getColors(productID),
                        this.getSizes(productID),
                        this.getImage(productID),
                        this.getReviewCount(productID)
                    ]);

                    return {
                        productid: product.productid,
                        title: product.title,
                        description: product.description || '',
                        category: product.category,
                        maincategory: product.maincategory,
                        price: product.price,
                        discount: product.discount,
                        stars: parseFloat(product.stars) || 0,
                        isnew: product.isnew || false,
                        issale: product.issale || false,
                        isdiscount: product.isdiscount || false,
                        seller: product.seller,
                        colors,
                        sizes,
                        images,
                        reviewCount
                    };
                })
            );

            return products;
        } catch (error) {
            console.error('Error searching products:', error);
            return [];
        }
    }

    static async getProductById(productId: number): Promise<Product | null> {
        try {
            const query = `
                SELECT 
                    products.productid,
                    products.title,
                    products.description,
                    products.price,
                    products.discount,
                    categories.name AS category,
                    categories.maincategory,
                    productparams.stars,
                    productparams.isnew,
                    productparams.issale,
                    productparams.isdiscount,
                    sellers.company_name AS seller
                FROM products
                INNER JOIN categories ON products.categoryid = categories.categoryid
                INNER JOIN productparams ON products.productid = productparams.productid
                LEFT JOIN sellers ON products.seller_id = sellers.seller_id
                WHERE products.productid = $1
            `;
            const result = await client.query(query, [productId]);
            
            if (result.rows.length === 0) return null;

            const product = result.rows[0];
            const productID = product.productid;
            const [colors, sizes, images, reviewCount] = await Promise.all([
                this.getColors(productID),
                this.getSizes(productID),
                this.getImage(productID),
                this.getReviewCount(productID)
            ]);

            return {
                productid: product.productid,
                title: product.title,
                description: product.description || '',
                category: product.category,
                maincategory: product.maincategory,
                price: product.price,
                discount: product.discount,
                stars: parseFloat(product.stars) || 0,
                isnew: product.isnew || false,
                issale: product.issale || false,
                isdiscount: product.isdiscount || false,
                seller: product.seller,
                colors,
                sizes,
                images,
                reviewCount
            };
        } catch (error) {
            console.error('Error getting product:', error);
            return null;
        }
    }

    static async getAllCategories(): Promise<{ categoryid: number; name: string; maincategory: string }[]> {
        try {
            const result = await client.query(
                `SELECT categoryid, name, maincategory FROM categories ORDER BY maincategory, name`
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting categories:', error);
            return [];
        }
    }
}
