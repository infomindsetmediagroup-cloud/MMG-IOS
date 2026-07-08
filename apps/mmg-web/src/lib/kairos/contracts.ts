export type KairosMode = 'public' | 'customer' | 'admin';
export type KairosSurface = 'website' | 'dashboard' | 'ios';

export interface KairosRuntimeRequest {
  mode: KairosMode;
  surface: KairosSurface;
  message: string;
  context?: Record<string, string>;
  conversationId?: string;
}

export interface KairosRuntimeResponse {
  reply: string;
  mode: KairosMode;
  department: string;
  status: 'ok';
  conversationId?: string;
}

export interface KairosRuntimeErrorResponse {
  status: 'error';
  code: string;
  message: string;
}
