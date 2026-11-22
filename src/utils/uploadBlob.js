import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } from '../constants/limits';

const tooLargeError = () => {
  const err = new Error(UPLOAD_TOO_LARGE_MESSAGE);
  err.code = 'too_large';
  err.status = 413;
  return err;
};

export function uploadBlob(blob, filename, { kind, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    // 送る前にサイズを確認（上限超えは送らずにエラー）
    if (blob && typeof blob.size === 'number' && blob.size > MAX_UPLOAD_BYTES) {
      reject(tooLargeError());
      return;
    }
    const fd = new FormData();
    if (kind) fd.append('kind', kind);
    fd.append('file', blob, filename);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    const token = localStorage.getItem('hc_token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(err);
        }
      } else if (xhr.status === 413) {
        reject(tooLargeError());
      } else {
        reject(new Error('upload ' + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(fd);
  });
}
