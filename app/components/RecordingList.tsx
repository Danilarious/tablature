import React from 'react';
export default function RecordingList({ attachments }: { attachments: { id: string; displayName: string; description: string | null; filePath: string; mimeType: string }[] }) {
  return <div className="space-y-2">{attachments.map(file => <div key={file.id} className="text-xs break-inside-avoid"><p className="font-bold">{file.description && !file.description.startsWith('Attached file:') ? file.description : file.displayName}</p>{file.mimeType.startsWith('audio/') ? <audio aria-label={file.description || file.displayName} className="max-w-full print:hidden" controls preload="metadata" src={`/api/media/${encodeURIComponent(file.filePath)}`} /> : <a href={`/api/media/${encodeURIComponent(file.filePath)}`}>{file.displayName}</a>}</div>)}</div>;
}
