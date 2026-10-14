import { NextRequest, NextResponse } from 'next/server';

const UPLOAD_URL = process.env.APPGEN_UPLOAD_URL || 'https://upload.appgen.com';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const appId = process.env.APP_ID;
  const uploadSecret = process.env.APP_UPLOAD_SECRET;

  if (!appId || !uploadSecret) {
    return NextResponse.json(
      { error: 'Upload not configured for this app' },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let body: BodyInit;
    let headers: Record<string, string> = {
      'x-app-id': appId,
      'x-upload-secret': uploadSecret,
    };

    if (contentType.includes('multipart/form-data')) {
      // Pass through FormData for file uploads
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });
      }

      // Rebuild FormData for the upload service
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      body = uploadFormData;
      // Don't set content-type - let fetch set it with boundary
    } else if (contentType.includes('application/json')) {
      // URL or base64 upload
      body = await req.text();
      headers['content-type'] = 'application/json';
    } else {
      // Raw buffer
      body = await req.arrayBuffer();
      headers['content-type'] = contentType;
    }

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
