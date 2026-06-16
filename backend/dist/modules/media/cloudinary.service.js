import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { createError } from '../../middleware/errorHandler.js';
import { logger } from '../../common/logger.js';
cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
});
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
function isCloudinaryConfigured() {
    return (env.CLOUDINARY_CLOUD_NAME !== '' &&
        env.CLOUDINARY_CLOUD_NAME !== 'dummy' &&
        env.CLOUDINARY_API_KEY !== '' &&
        env.CLOUDINARY_API_KEY !== 'dummy' &&
        env.CLOUDINARY_API_SECRET !== '' &&
        env.CLOUDINARY_API_SECRET !== 'dummy');
}
export class CloudinaryService {
    async uploadImage(fileBuffer, folder = 'disasteraid') {
        if (!isCloudinaryConfigured()) {
            return this._saveLocally(fileBuffer);
        }
        return this._uploadToCloudinary(fileBuffer, folder);
    }
    async _saveLocally(fileBuffer) {
        try {
            await mkdir(UPLOADS_DIR, { recursive: true });
            const filename = `${randomUUID()}.jpg`;
            const filePath = path.join(UPLOADS_DIR, filename);
            await writeFile(filePath, fileBuffer);
            const base = process.env.BASE_URL ?? `http://localhost:${env.PORT}`;
            const url = `${base}/api/media/files/${filename}`;
            logger.info('[MEDIA] Saved file locally (Cloudinary not configured)', { url });
            return url;
        }
        catch (error) {
            logger.error('[MEDIA] Local save failed', { error });
            throw createError('Image upload failed', 500);
        }
    }
    _uploadToCloudinary(fileBuffer, folder) {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({
                folder,
                resource_type: 'image',
                quality: 'auto',
                fetch_format: 'auto',
            }, (error, result) => {
                if (error) {
                    logger.error('[CLOUDINARY] Upload failed', { error });
                    return reject(createError('Image upload failed', 500));
                }
                if (!result) {
                    return reject(createError('Image upload failed: no result', 500));
                }
                resolve(result.secure_url);
            });
            uploadStream.end(fileBuffer);
        });
    }
    async deleteImage(publicId) {
        if (!isCloudinaryConfigured())
            return;
        try {
            await cloudinary.uploader.destroy(publicId);
        }
        catch (error) {
            logger.error('[CLOUDINARY] Delete failed', { publicId, error });
        }
    }
}
export const cloudinaryService = new CloudinaryService();
//# sourceMappingURL=cloudinary.service.js.map