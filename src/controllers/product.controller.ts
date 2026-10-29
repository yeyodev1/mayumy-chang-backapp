import { Request, Response, NextFunction } from "express";
import * as productService from "../services/product.service";

/** GET /api/products — catálogo público. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.listPublic(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/products/piece-of-month — la pieza del mes o null. */
export async function pieceOfMonth(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.getPieceOfMonth());
  } catch (error) {
    next(error);
  }
}

/** GET /api/products/:slug/related */
export async function related(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.getRelated(String(req.params.slug)));
  } catch (error) {
    next(error);
  }
}

/** GET /api/products/:slug */
export async function getBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.getPublicBySlug(String(req.params.slug)));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/products — incluye no publicados. */
export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.listAdmin(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/products/:id */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.getById(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/products */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await productService.create(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/products/:id */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.update(String(req.params.id), req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/products/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await productService.remove(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/products/:id/images — multipart, campo "image". */
export async function addImage(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await productService.addImage(String(req.params.id), req.file));
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/products/:id/stock — body: { variantId, stock } */
export async function updateStock(req: Request, res: Response, next: NextFunction) {
  try {
    const { variantId, stock } = req.body ?? {};
    res.status(200).json(await productService.updateStock(String(req.params.id), variantId, stock));
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/products/:id/images/:publicId — publicId URL-encoded.
 * Para imágenes sembradas (publicId "") se manda su url, también encodeada,
 * en el mismo parámetro o en ?url=.
 */
export async function removeImage(req: Request, res: Response, next: NextFunction) {
  try {
    // Express ya decodifica los params: el %2F de "carpeta/archivo" llega como "/".
    const key = typeof req.query.url === "string" ? req.query.url : String(req.params.publicId);
    res.status(200).json(await productService.removeImage(String(req.params.id), key));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/admin/products/:id/images/order — body: { urls } (o { publicIds }) */
export async function reorderImages(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.reorderImages(String(req.params.id), req.body ?? {});
    res.status(200).json(product);
  } catch (error) {
    next(error);
  }
}
