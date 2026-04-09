const env = import.meta.env as Record<string, string | undefined>;

const configuredApiBaseUrl = (env.VITE_API_BASE_URL || env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

export const apiBaseUrl = configuredApiBaseUrl;

export const toApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!configuredApiBaseUrl) {
    return path;
  }

  return `${configuredApiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
};

export const absolutizeUrl = (value?: string) => {
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return toApiUrl(value);
};
