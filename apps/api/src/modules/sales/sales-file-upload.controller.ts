import { createReadStream, existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { SalesFileUploadService } from './sales-file-upload.service';
import { SalesOcrService } from './sales-ocr.service';

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

@Controller('sales/checkout/files')
export class SalesFileUploadController {
  constructor(
    private readonly uploadService: SalesFileUploadService,
    private readonly ocrService: SalesOcrService
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
      }
    })
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('orderId') orderId?: string
  ) {
    // tenantId placeholder — in production, extract from JWT / request context
    const tenantId = 'default';
    return this.uploadService.uploadFile(file, tenantId, orderId || undefined);
  }

  @Post('ocr-extract')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
      }
    })
  )
  async ocrExtract(
    @UploadedFile() file?: Express.Multer.File,
    @Body('certificateLink') certificateLink?: string,
    @Body('fileId') fileId?: string,
    @Body('tenantId') tenantId?: string,
    @Body('orderId') orderId?: string
  ) {
    if (file?.buffer && file.mimetype) {
      return this.ocrService.extractCertificateData(file.buffer, file.mimetype);
    }

    const uploadedFileId = String(fileId ?? '').trim();
    if (uploadedFileId) {
      const resolvedTenant = String(tenantId ?? '').trim() || 'default';
      const filePath = this.uploadService.resolveFilePath(uploadedFileId, resolvedTenant, orderId || undefined);
      if (!existsSync(filePath)) {
        throw new BadRequestException(`Không tìm thấy file upload: ${uploadedFileId}`);
      }
      const ext = extname(filePath).toLowerCase();
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const buffer = readFileSync(filePath);
      return this.ocrService.extractCertificateData(buffer, mimeType);
    }

    const link = String(certificateLink ?? '').trim();
    if (link) {
      return this.ocrService.extractCertificateDataFromUrl(link);
    }

    throw new BadRequestException('Vui lòng upload file, truyền fileId hoặc certificateLink.');
  }

  @Get(':fileId')
  serve(
    @Param('fileId') fileId: string,
    @Query('tenant') tenantId?: string,
    @Query('order') orderId?: string,
    @Res() res?: Response
  ) {
    const resolvedTenant = tenantId || 'default';
    const filePath = this.uploadService.resolveFilePath(fileId, resolvedTenant, orderId || undefined);

    if (!existsSync(filePath)) {
      res?.status(404).json({ message: 'File không tìm thấy.' });
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    res?.setHeader('Content-Type', contentType);
    res?.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = createReadStream(filePath);
    stream.pipe(res as unknown as NodeJS.WritableStream);
  }
}
