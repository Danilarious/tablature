import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getStorageDirs } from '@/app/lib/paths';

export async function GET(req: Request, { params }: { params: { filename: string } }) {
  try {
    const filename = params.filename;
    // Security check: ensure no directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return new NextResponse('Invalid filename', { status: 400 });
    }

    const { mediaDir } = getStorageDirs();
    const filePath = path.join(mediaDir, filename);

    if (!fs.existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.ogg') contentType = 'audio/ogg';
    else if (ext === '.webm') contentType = 'audio/webm';
    else if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
