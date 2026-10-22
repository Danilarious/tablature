import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createTestDb, insertInstrument, insertTuning } from '@/app/test/test-db';
const connection = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/app/db/client', () => ({ getDatabase: () => connection.value }));
import { POST } from './route';
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs(); });
it('commits multipart media without requiring a global File constructor', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'bxb-node18-file-'));
  const test=createTestDb();connection.value=test;insertInstrument(test.db);insertTuning(test.db);
  vi.stubEnv('MUSIC_NOTEBOOK_DATA_DIR',dir);
  const form=new FormData();form.set('capture',JSON.stringify({captureId:'edddbbbb-9999-4444-8888-444444444444',instrumentId:'inst-test-6',tuningId:'tuning-test-std',motif:{name:'Node18 media',tabData:[]}}));
  form.append('files',new Blob(['audio data'],{type:'audio/wav'}),'take.wav');form.append('descriptions','Named take');
  const request=new Request('http://localhost/api/quick-capture',{method:'POST',body:form});
  // Node 22's parser itself depends on its global File; Node 18 uses an internal implementation.
  // Supply the already-parsed multipart boundary, then test our handler with no global File.
  const parsed=await request.formData();vi.spyOn(request,'formData').mockResolvedValue(parsed);
  vi.stubGlobal('File',undefined);
  try { const response=await POST(request);expect(response.status).toBe(201);expect(test.sqlite.prepare('SELECT count(*) AS n FROM attachments').get()).toEqual({n:1}); }
  finally {test.sqlite.close();rmSync(dir,{recursive:true,force:true});}
});
