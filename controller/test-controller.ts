import { Request, Response } from 'express';
import { ProductService } from '../services/productService';

export class TestController {
    static async getProducts(_req: Request, res: Response) {
        try {
            const products = await ProductService.getAllProducts(10);

            res.status(200).json({
                count: products.length,
                products
            });
        } catch (error: any) {
            res.status(500).json({
                error: 'DB test failed',
                message: error.message
            });
        }
    }
}
