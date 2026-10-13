import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { getStorageDirs } from '@/app/lib/paths';
import { getDatabase } from '@/app/db/client';
import { attachments } from '@/app/db/schema';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const parentType = formData.get('parentType') as string | null;
    const parentId = formData.get('parentId') as string | null;
    const description = (formData.get('description') as string | null) || '';

    if (!file || !parentType || !parentId) {
      return NextResponse.json(
        { error: 'file, parentType, and parentId are required.' },
        { status: 400 }
      );
    }

    const { mediaDir } = getStorageDirs();
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskFilename = `${uuidv4()}-${safeName}`;
    const targetPath = path.join(mediaDir, diskFilename);

    fs.writeFileSync(targetPath, fileBuffer);

    const { db } = getDatabase();
    const now = Date.now();
    const newAttachment = {
      id: uuidv4(),
      parentType,
      parentId,
      displayName: file.name,
      filePath: diskFilename,
      mimeType: file.type || 'application/octet-stream',
      fileSize: fileBuffer.length,
      description: description.trim() || null,
      createdAt: now,
    };

    await db.insert(attachments).values(newAttachment);
    return NextResponse.json(newAttachment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
