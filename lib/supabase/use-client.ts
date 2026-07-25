'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function useSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  return useMemo(() => createBrowserClient(url, key), [url, key]);
}
