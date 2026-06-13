/**
 * Merkezi hata bildirim sözleşmesi (commit c6b05fa ile gelen davranış):
 * (a) başarısız koşu varsayılan olarak görünür hata toast'ı üretir,
 * (b) silentError:true bastırır (çağıran kendi geri bildirimini sunar),
 * (c) IPC-reddi yolu da aynı sözleşmeye tabidir,
 * (d) hata mesajı yoksa geri-düşüş metni gösterilir.
 */
import { describe, it, expect } from 'vitest';
import { scriptErrorToastText, ipcErrorText, FALLBACK_ERROR_TEXT } from './scriptRunNotify';

describe('scriptErrorToastText — varsayılan (görünür) yol', () => {
  it('başarısız koşuda hata metnini döndürür', () => {
    expect(scriptErrorToastText({ success: false, error: 'satır 3: bilinmeyen alan' })).toBe(
      'satır 3: bilinmeyen alan',
    );
  });

  it('error undefined ise geri-düşüş metnini döndürür', () => {
    expect(scriptErrorToastText({ success: false })).toBe(FALLBACK_ERROR_TEXT);
  });

  it('opts boş nesne ise varsayılan davranış korunur', () => {
    expect(scriptErrorToastText({ success: false, error: 'x' }, {})).toBe('x');
  });

  it('başarılı koşuda toast üretmez', () => {
    expect(scriptErrorToastText({ success: true })).toBeNull();
  });
});

describe('scriptErrorToastText — silentError bastırması', () => {
  it('silentError:true başarısız koşuda toastı bastırır', () => {
    expect(scriptErrorToastText({ success: false, error: 'x' }, { silentError: true })).toBeNull();
  });

  it('silentError:false açıkça verilirse toast korunur', () => {
    expect(scriptErrorToastText({ success: false, error: 'x' }, { silentError: false })).toBe('x');
  });

  it('başarılı koşuda silentError fark yaratmaz — zaten toast yok', () => {
    expect(scriptErrorToastText({ success: true }, { silentError: true })).toBeNull();
  });
});

describe('ipcErrorText — IPC reddi yolu', () => {
  it('hata değerini "IPC hatası:" önekiyle metinleştirir', () => {
    expect(ipcErrorText('connection refused')).toBe('IPC hatası: connection refused');
  });

  it('üretilen metin sözleşmeden geçer: varsayılanda gösterilir, silentError ile bastırılır', () => {
    const text = ipcErrorText(new Error('boom'));
    expect(scriptErrorToastText({ success: false, error: text })).toBe(text);
    expect(scriptErrorToastText({ success: false, error: text }, { silentError: true })).toBeNull();
  });
});
